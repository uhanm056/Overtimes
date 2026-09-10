/* Export do Excelu.
 *
 * Používá stejný SheetJS, jaký se stahuje kvůli importu .xlsx — načte se
 * až při prvním exportu, ne při startu panelu.
 *
 * Hodiny jsou v sešitu jako desetinná čísla, aby se daly sčítat a filtrovat.
 * Klíčové sloupce mají vedle sebe i tvar h:mm, protože v tom je výkaz čitelný.
 * Časový formát Excelu se schválně nepoužívá — evidence bývá záporná a záporný
 * čas Excel neumí zobrazit (ukáže ####).
 */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  const CFG = PP.CFG

  /** Pásmo pro sloupec v sešitu — ať jde v Excelu filtrovat. */
  function band(value, th) {
    const lvl = PP.level(value, th)
    return lvl === 'crit' ? 'kritické' : lvl === 'warn' ? 'sledovat' : 'ok'
  }

  const round2 = (v) => Math.round(v * 100) / 100

  function sheetFrom(XLSX, rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }))
    if (rows.length > 1) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length - 1, c: rows[0].length - 1 },
      }) }
    }
    return ws
  }

  /* ---------- jednotlivé listy ---------- */

  function souhrn(rec, key, s, cmp, prevKey) {
    const rows = [
      ['Ukazatel', 'Hodnota'],
      ['Měsíc', PP.monthName(key)],
      ['Období', rec.period || ''],
      ['Osob ve výkazu', s.people],
      ['Lidí s přesčasem', s.withOvertime],
      ['Přesčas celkem (h)', round2(s.total)],
      ['Do MEZD (h)', round2(s.mezdy)],
      ['Evidence (h)', round2(s.evidence)],
      ['Podíl proplacených', round2(s.paidShare)],
      ['Ø na osobu (h)', round2(s.avg)],
      ['Ø na osobu (h:mm)', PP.hm(s.avg)],
      ['Maximum (h)', round2(s.max)],
      ['Nad ' + CFG.person.warn + ' h za měsíc', s.overWarn],
      ['Nad ' + CFG.person.crit + ' h za měsíc', s.overCrit],
      ['Nad ' + CFG.year.warn + ' h ročně', s.year150],
      ['Nad ' + CFG.year.crit + ' h ročně', s.year250],
      ['Na stropu ' + CFG.year.cap + ' h', s.yearCap],
    ]
    if (cmp) {
      rows.push([], ['Proti měsíci', PP.monthName(prevKey)])
      rows.push(['Δ přesčas celkem (h)', round2(cmp.dTotal)])
      rows.push(['Δ lidí s přesčasem', cmp.dPeople])
      rows.push(['Δ Ø na osobu (h)', round2(cmp.dAvg)])
      rows.push(['Δ podíl proplacených', round2(cmp.dPaidShare)])
      rows.push(['Vypadli', cmp.dropped.length])
      rows.push(['Přibyli', cmp.added.length])
    }
    rows.push([], ['Zdroj', rec.file || ''])
    if (rec.demo) rows.push(['Pozor', 'UKÁZKOVÁ DATA — jména i hodiny jsou vymyšlené'])
    return rows
  }

  function strediska(s, cmp) {
    const dmap = new Map((cmp ? cmp.centers : []).map((c) => [c.name, c]))
    const head = ['Středisko', 'Lidí', 'Celkem (h)', 'Ø na osobu (h)', 'Ø (h:mm)',
      'Do MEZD (h)', 'Evidence (h)', 'Maximum (h)', 'Pásmo']
    if (cmp) head.push('Δ Ø (h)', 'Δ celkem (h)')
    const rows = [head]
    for (const c of s.byTotal) {
      const r = [c.name, c.people, round2(c.total), round2(c.avg), PP.hm(c.avg),
        round2(c.m), round2(c.e), round2(c.max), band(c.avg, CFG.center)]
      if (cmp) {
        const d = dmap.get(c.name)
        r.push(d && d.dAvg != null ? round2(d.dAvg) : '', d && d.dTotal != null ? round2(d.dTotal) : '')
      }
      rows.push(r)
    }
    return rows
  }

  function lide(s) {
    const rows = [['Jméno', 'Osobní číslo', 'Středisko', 'Do MEZD (h)', 'Evidence (h)',
      'Přesčas (h)', 'Přesčas (h:mm)', 'Pásmo', 'Roční součet (h)', 'Roční (h:mm)',
      'Zbývá do ' + CFG.year.cap + ' h', 'Pásmo ročně']]
    for (const r of s.ranking) {
      rows.push([r.n, r.o, r.s, round2(r.m), round2(r.e), round2(r.t), PP.hm(r.t),
        band(r.t, CFG.person), round2(r.r), PP.hm(r.r),
        round2(Math.max(0, CFG.year.cap - r.r)),
        band(r.r, { warn: CFG.year.warn, crit: CFG.year.crit })])
    }
    return rows
  }

  function zmeny(cmp, keyA, keyB) {
    const rows = [['Typ', 'Jméno', 'Osobní číslo', 'Středisko',
      PP.monthShort(keyA) + ' (h)', PP.monthShort(keyB) + ' (h)', 'Δ (h)']]
    for (const r of cmp.dropped) {
      rows.push(['vypadl', r.n, r.o, r.s, round2(r.t), 0, round2(-r.t)])
    }
    for (const r of cmp.added) {
      rows.push(['přibyl', r.n, r.o, r.s, 0, round2(r.t), round2(r.t)])
    }
    for (const m of cmp.movers) {
      rows.push(['zůstal', m.r.n, m.r.o, m.r.s, round2(m.prev.t), round2(m.r.t), round2(m.d)])
    }
    return rows
  }

  /* ---------- vstupní bod ---------- */

  /**
   * Sestaví a stáhne sešit za jeden měsíc. Když existuje předchozí měsíc,
   * přidá i listy se srovnáním.
   * @param {string} key klíč měsíce YYYY-MM
   * @param {string|null} prevKey klíč měsíce k porovnání, nebo null
   */
  PP.exportExcel = async function (key, prevKey) {
    const rec = PP.data.month(key)
    if (!rec) throw new Error('Měsíc ' + key + ' není načtený.')
    const XLSX = await PP.loadSheetJS()

    const s = PP.stats(rec)
    const prev = prevKey ? PP.data.month(prevKey) : null
    const cmp = prev ? PP.compare(rec, prev) : null

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, souhrn(rec, key, s, cmp, prevKey), [30, 46]), 'Souhrn')
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, strediska(s, cmp), [24, 7, 12, 14, 11, 12, 12, 12, 11, 10, 12]), 'Střediska')
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, lide(s), [30, 13, 22, 12, 12, 12, 14, 10, 15, 12, 16, 12]), 'Lidé')
    if (cmp) {
      XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, zmeny(cmp, prevKey, key), [10, 30, 13, 22, 12, 12, 10]), 'Změny lidí')
    }

    const name = 'Prescasy_' + key + (cmp ? '_vs_' + prevKey : '') + '.xlsx'
    XLSX.writeFile(wb, name)
    return { name, sheets: wb.SheetNames }
  }
})(window.PP)
