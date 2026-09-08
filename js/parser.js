/* Parser Součtového výkazu z mzdového systému.
 *
 * Podporované vstupy:
 *   • .xlsx  (ZIP, začíná "PK")            → SheetJS, lazy-load z cdnjs
 *   • .xls   (legacy BIFF, začíná D0 CF)   → SheetJS
 *   • .xls   (ve skutečnosti HTML tabulka) → DOMParser  ← tohle chodí z mezd
 *   • .csv / .txt                          → oddělovač ; , nebo tab
 *
 * Výstupem je záznam měsíce v datovém modelu panelu:
 *   { period, rawPeriod, people, rows: [{ n, o, s, m, e, t, r }], importedAt, file }
 */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  const HEADER_SCAN_ROWS = 40

  /* ---------- načtení SheetJS na požádání ---------- */
  let sheetJsPromise = null
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX)
    if (sheetJsPromise) return sheetJsPromise
    sheetJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SHEETJS_URL
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJS se načetl, ale není dostupný.')))
      s.onerror = () => reject(new Error('Nepodařilo se načíst SheetJS z cdnjs — zkontrolujte připojení k síti.'))
      document.head.appendChild(s)
    })
    return sheetJsPromise
  }

  /* ---------- čtení souboru ---------- */
  function readArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'))
      fr.readAsArrayBuffer(file)
    })
  }

  /** Text z bufferu — respektuje deklarovaný charset, jinak UTF-8 s fallbackem na windows-1250. */
  function decodeText(buffer) {
    const bytes = new Uint8Array(buffer)
    const ascii = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
    const declared = /charset\s*=\s*["']?\s*([\w-]+)/i.exec(ascii)
    const tryDecode = (enc) => {
      try { return new TextDecoder(enc, { fatal: false }).decode(bytes) } catch (err) { return null }
    }
    if (declared) {
      const text = tryDecode(declared[1].toLowerCase())
      if (text) return text
    }
    const utf8 = tryDecode('utf-8')
    // U+FFFD = špatně dekódované bajty → výkaz je nejspíš v středoevropském kódování
    if (utf8 && !/�/.test(utf8)) return utf8
    return tryDecode('windows-1250') || utf8 || ''
  }

  /* ---------- převod vstupu na matici buněk ---------- */
  async function toMatrix(file) {
    const buffer = await readArrayBuffer(file)
    const head = new Uint8Array(buffer.slice(0, 8))
    const isZip = head[0] === 0x50 && head[1] === 0x4b            // "PK" → xlsx
    const isBiff = head[0] === 0xd0 && head[1] === 0xcf            // OLE2 → legacy .xls

    if (isZip || isBiff) {
      const XLSX = await loadSheetJS()
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, raw: true })
      // list s nejvíc řádky — výkaz bývá první, ale ne vždy
      let best = null
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, raw: true, defval: '' })
        if (!best || rows.length > best.length) best = rows
      }
      return { matrix: (best || []).map((r) => r.map(cellText)), kind: isZip ? 'xlsx' : 'xls (BIFF)' }
    }

    const text = decodeText(buffer)
    if (/<\s*table/i.test(text)) return { matrix: htmlToMatrix(text), kind: 'HTML tabulka (.xls z mezd)' }
    return { matrix: csvToMatrix(text), kind: 'CSV' }
  }

  function cellText(v) {
    if (v == null) return ''
    if (typeof v === 'number') return String(v)
    return String(v)
  }

  /** Vybere <table> s nejvíc řádky a převede ji na matici textů. */
  function htmlToMatrix(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const tables = Array.prototype.slice.call(doc.querySelectorAll('table'))
    if (!tables.length) throw new Error('V souboru není žádná tabulka.')
    let best = tables[0]
    for (const t of tables) if (t.rows.length > best.rows.length) best = t
    return Array.prototype.map.call(best.rows, (tr) =>
      Array.prototype.map.call(tr.cells, (td) =>
        td.textContent.replace(/\u00a0/g, ' ').trim()
      )
    )
  }

  /** CSV s automatickou detekcí oddělovače, respektuje uvozovky. */
  function csvToMatrix(text) {
    const sample = text.slice(0, 8192)
    const counts = { ';': 0, ',': 0, '\t': 0 }
    for (const ch of sample) if (ch in counts) counts[ch]++
    const delim = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ';')

    const rows = []
    let row = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
        } else cell += ch
        continue
      }
      if (ch === '"') { quoted = true; continue }
      if (ch === delim) { row.push(cell.trim()); cell = ''; continue }
      if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; continue }
      if (ch === '\r') continue
      cell += ch
    }
    if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
    return rows.filter((r) => r.some((c) => c !== ''))
  }

  /* ---------- hlavička ---------- */
  const COLUMN_TESTS = {
    name: (c) => c.includes('prijmeni') && c.includes('jmeno'),
    id: (c) => c.includes('osobni'),
    center: (c) => c.includes('stredisko'),
    component: (c) => c.includes('mzdova') && c.includes('slozka'),
    hours: (c) => c.includes('hodiny'),
  }

  function findHeader(matrix) {
    const limit = Math.min(matrix.length, HEADER_SCAN_ROWS)
    for (let r = 0; r < limit; r++) {
      const cells = matrix[r].map(PP.fold)
      const cols = {}
      for (const key in COLUMN_TESTS) {
        const idx = cells.findIndex(COLUMN_TESTS[key])
        if (idx >= 0) cols[key] = idx
      }
      if (cols.name != null && cols.id != null && cols.center != null &&
          cols.component != null && cols.hours != null) {
        return { row: r, cols }
      }
    }
    throw new Error(
      'Nenašel jsem hlavičku výkazu. Očekávám sloupce Příjmení a jméno, Osobní číslo, ' +
      'Středisko, Mzdová složka a Hodiny v prvních ' + HEADER_SCAN_ROWS + ' řádcích.'
    )
  }

  /* ---------- období ---------- */
  const DATE_RANGE = /(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\s*[-–—]\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/

  function findPeriod(matrix, headerRow) {
    // 1) řádek nad hlavičkou začínající "Období:"
    for (let r = headerRow; r >= 0; r--) {
      for (const cell of matrix[r]) {
        if (/^obdobi\s*:/.test(PP.fold(cell))) {
          const m = DATE_RANGE.exec(cell)
          if (m) return m
        }
      }
    }
    // 2) první výskyt d.m.yyyy - d.m.yyyy kdekoli nad hlavičkou
    for (let r = 0; r <= headerRow; r++) {
      for (const cell of matrix[r]) {
        const m = DATE_RANGE.exec(cell)
        if (m) return m
      }
    }
    return null
  }

  /** "1.8.2026 - 31.8.2026" → { key: '2026-08', period: '1. 8. – 31. 8. 2026', rawPeriod } */
  function describePeriod(m) {
    const [, d1, m1, y1, d2, m2, y2] = m.map(String)
    const key = y1 + '-' + String(Number(m1)).padStart(2, '0')
    const left = Number(y1) === Number(y2) && Number(m1) === Number(m2)
      ? `${Number(d1)}. ${Number(m1)}.`
      : `${Number(d1)}. ${Number(m1)}. ${y1}`
    const period = `${left} – ${Number(d2)}. ${Number(m2)}. ${y2}`
    return { key, period, rawPeriod: m[0].trim() }
  }

  /* ---------- hodnoty ---------- */
  /** "54:29", "-2:30", "1 234,50", "48.98" → číslo hodin. Prázdno → 0. */
  function parseHours(raw) {
    let s = String(raw == null ? '' : raw).replace(/\u00a0/g, ' ').trim()
    if (!s) return 0
    let sign = 1
    if (/^[-−]/.test(s)) { sign = -1; s = s.slice(1).trim() }
    else if (/[-−]$/.test(s)) { sign = -1; s = s.slice(0, -1).trim() }   // 12:30-
    if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1).trim() }     // (12:30)

    const hm = /^(\d+)\s*:\s*(\d{1,2})$/.exec(s)
    if (hm) return sign * (Number(hm[1]) + Number(hm[2]) / 60)

    const num = Number(s.replace(/\s/g, '').replace(',', '.'))
    return isFinite(num) ? sign * num : 0
  }

  /** Zařazení mzdové složky: 'm' = do MEZD, 'e' = evidence, 'r' = roční součet, null = nezajímá nás. */
  function classify(component) {
    const c = PP.fold(component)
    if (!c.includes('prescas')) return null
    if (c.includes('rocni') || c.includes('soucet')) return 'r'
    if (c.includes('eviden') || c.includes('konto')) return 'e'
    if (c.includes('mezd') || c.includes('proplac')) return 'm'
    return null
  }

  /* ---------- hlavní vstupní bod ---------- */
  /**
   * Rozparsuje soubor na záznam měsíce.
   * @returns {Promise<{key: string, record: object, kind: string, skipped: number}>}
   */
  PP.parseReport = async function (file) {
    const { matrix, kind } = await toMatrix(file)
    if (!matrix.length) throw new Error('Soubor je prázdný.')

    const header = findHeader(matrix)
    const cols = header.cols

    const periodMatch = findPeriod(matrix, header.row)
    if (!periodMatch) {
      throw new Error('Nenašel jsem období výkazu (řádek „Období: d.m.rrrr - d.m.rrrr“).')
    }
    const period = describePeriod(periodMatch)

    const byPerson = new Map()      // osobní číslo|středisko → agregovaný řádek
    const everyone = new Set()      // všichni lidé ve výkazu, i bez přesčasu
    let skipped = 0

    // Sestavy z mezd tisknou jméno, osobní číslo a středisko často jen na prvním
    // řádku skupiny a další mzdové složky nechávají tyhle sloupce prázdné.
    // Takový řádek proto přebírá identitu z předchozího, jinak by se ztratil.
    let last = null

    for (let r = header.row + 1; r < matrix.length; r++) {
      const row = matrix[r]
      if (!row || !row.length) continue

      const id = String(row[cols.id] || '').trim()
      const name = String(row[cols.name] || '').trim()
      const center = String(row[cols.center] || '').trim()

      // souhrnné řádky "Celkem …" ukončují skupinu, identita se dál nedědí
      if (/^(celkem|soucet|mezisoucet)/.test(PP.fold(name))) { last = null; continue }

      let who
      if (!name && !id) {
        // pokračovací řádek — bez předchozí identity ho zahodit musíme
        if (!last) continue
        who = last
      } else if (!id && last && PP.fold(last.n) === PP.fold(name)) {
        // jméno se opakuje, ale číslo je vyplněné jen jednou
        who = { n: last.n, o: last.o, s: center || last.s }
        last = who
      } else {
        who = { n: name, o: id, s: center }
        last = who
        // Do stavu osob počítáme jen řádky s osobním číslem. Sestavy mívají
        // mezisoučty nadepsané jménem bez čísla a ty nejsou další člověk.
        if (id) everyone.add(id + '|' + center)
      }
      if (!who.o && !who.n) continue

      const bucket = classify(row[cols.component])
      if (!bucket) { skipped++; continue }

      const key = (who.o || who.n) + '|' + who.s
      const hours = parseHours(row[cols.hours])
      let rec = byPerson.get(key)
      if (!rec) {
        rec = {
          n: who.n,
          o: /^\d+$/.test(String(who.o)) ? Number(who.o) : who.o,
          s: who.s, m: 0, e: 0, t: 0, r: 0,
        }
        byPerson.set(key, rec)
      }
      rec[bucket] += hours
    }

    const round2 = (v) => Math.round(v * 100) / 100
    const rows = Array.from(byPerson.values())
      .map((rec) => {
        rec.m = round2(rec.m)
        rec.e = round2(rec.e)
        rec.r = round2(rec.r)
        rec.t = round2(rec.m + rec.e)
        return rec
      })
      .sort((a, b) => b.t - a.t || String(a.n).localeCompare(String(b.n), 'cs'))

    if (!rows.length) {
      throw new Error('Ve výkazu nejsou žádné přesčasové mzdové složky.')
    }

    return {
      key: period.key,
      kind,
      skipped,
      record: {
        period: period.period,
        rawPeriod: period.rawPeriod,
        // pojistka pro výkazy bez osobních čísel — stav nesmí být menší
        // než počet lidí, kteří v něm mají přesčas
        people: Math.max(everyone.size, rows.length),
        rows,
        importedAt: new Date().toISOString(),
        file: file.name,
      },
    }
  }

  // vystaveno kvůli testům a případnému CLI použití
  PP.parserInternals = { parseHours, classify, csvToMatrix, htmlToMatrix, findHeader, describePeriod, DATE_RANGE }
})(window.PP)
