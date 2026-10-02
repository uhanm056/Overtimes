#!/usr/bin/env node
/* Test importu: nahraje vzorové výkazy přes reálné UI a ověří výsledek.
   Spuštění: node tests/import.test.mjs   (potřebuje playwright + chromium) */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIX = join(ROOT, 'tests', 'fixtures')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  try {
    let p = join(ROOT, normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''))
    if (p.endsWith('/') || p === ROOT) p = join(p, 'index.html')
    // Panel se distribuuje bez dat; testům se místo nich podstrčí vzorek.
    if (p === join(ROOT, 'data', 'months.js')) p = join(ROOT, 'tests', 'fixtures', 'demo-months.js')
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('404') }
})
await new Promise((r) => server.listen(8138, r))

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto('http://localhost:8138/#import', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')

await page.setInputFiles('#file', [
  join(FIX, 'souctovy-vykaz-2026-09.xls'),
  join(FIX, 'souctovy-vykaz-2026-10.csv'),
  join(FIX, 'souctovy-vykaz-2026-11-slouceny.xls'),
])
await page.waitForFunction(() => document.querySelectorAll('#log .log-item.ok').length === 3, null, { timeout: 20000 })

const res = await page.evaluate(() => {
  const rec = window.PP.data.month('2026-09')
  const s = window.PP.stats(rec)
  const csv = window.PP.stats(window.PP.data.month('2026-10'))
  const byName = (n) => rec.rows.find((r) => r.n === n)
  return {
    period: rec.period,
    rawPeriod: rec.rawPeriod,
    people: rec.people,
    rows: rec.rows.length,
    total: Math.round(s.total * 100) / 100,
    // Nováková: 41:00 do MEZD, -6:30 evidence → 34:30
    novakovaT: byName('Nováková Petra, Ing.').t,
    novakovaR: byName('Nováková Petra, Ing.').r,
    // Šimek: proplacené konto 30:00 / -30:00 → součet 0
    simekT: byName('Šimek Ivan').t,
    simekM: byName('Šimek Ivan').m,
    diacritics: byName('Šimek Ivan').s,
    csvTotal: Math.round(csv.total * 100) / 100,
    csvRows: csv.withOvertime,
    // sloučené buňky: jméno jen na prvním řádku skupiny
    merged: (() => {
      const m = window.PP.data.month('2026-11')
      const st = window.PP.stats(m)
      const nov = m.rows.find((r) => r.n === 'Nováková Petra, Ing.')
      return {
        rows: st.withOvertime,
        people: m.people,
        total: Math.round(st.total * 100) / 100,
        novakovaE: nov.e,
        novakovaM: nov.m,
        novakovaR: nov.r,
        novakovaT: nov.t,
      }
    })(),
    months: window.PP.data.keys().join(','),
    comps: rec.comps,
    otherComps: rec.otherComps,
    // rozpad Novákové tak, jak ho uvidí detail člověka
    novakovaComps: window.PP.personHistory(String(byName('Nováková Petra, Ing.').o))
      .points.find((x) => x.key === '2026-09').comps
      .map((c) => ({ ...c, bucket: window.PP.componentBucket(c.name) })),
  }
})

console.log('\nHTML .xls z mezd (windows-1250, h:mm):')
check('období', res.period, '1. 9. – 30. 9. 2026')
check('surové období', res.rawPeriod, '1.9.2026 - 30.9.2026')
check('osob ve výkazu (vč. řádku bez přesčasu)', res.people, 6)
check('lidí s přesčasem', res.rows, 5)
// 22:45 + 34:30 + 61:05 + 0:00 + 22:00
check('celkem hodin', res.total, 140.33)
check('Nováková součet (41:00 + -6:30)', res.novakovaT, 34.5)
check('Nováková roční součet', res.novakovaR, 188.33)
check('Šimek součet (30:00 + -30:00)', res.simekT, 0)
check('Šimek do MEZD', res.simekM, 30)
check('diakritika z windows-1250', res.diacritics, 'G463 Prefix')

console.log('\nRozpad na mzdové složky:')
check('započítané složky', res.comps.join(' | '),
  'Přesčas do MEZD | Přesčas evidence | Přesčas roční součet')
check('nezapočítané složky', res.otherComps.map((c) => `${c[0]}×${c[1]}`).join(' | '),
  'Základní mzda×5 | Dovolená×1')
// řazeno podle velikosti, ať je nahoře to, co součet tvoří nejvíc
check('Nováková — složky', res.novakovaComps.map((c) => c.name).join(' | '),
  'Přesčas roční součet | Přesčas do MEZD | Přesčas evidence')
check('Nováková — hodiny', res.novakovaComps.map((c) => c.h).join(' | '), '188.33 | 41 | -6.5')
check('Nováková — řádků na složku', res.novakovaComps.map((c) => c.rows).join(' | '), '1 | 1 | 1')
// do měsíčního přesčasu patří jen MEZD + evidence, roční součet ne
check('Nováková — zařazení složek', res.novakovaComps.map((c) => c.bucket).join(' | '), 'r | m | e')
check('Nováková — do měsíce se počítá jen MEZD a evidence',
  res.novakovaComps.filter((c) => c.bucket !== 'r').reduce((a, c) => a + c.h, 0), 34.5)

console.log('\nCSV (oddělovač ;, desetinné hodiny s čárkou):')
check('lidí s přesčasem', res.csvRows, 5)
check('celkem hodin', res.csvTotal, 140.33)

console.log('\nSloučené buňky (jméno jen na prvním řádku skupiny):')
check('lidí s přesčasem', res.merged.rows, 5)
check('osob ve výkazu', res.merged.people, 6)
check('celkem hodin', res.merged.total, 140.33)
check('Nováková evidence (-6:30 z navazujícího řádku)', res.merged.novakovaE, -6.5)
check('Nováková roční součet (z navazujícího řádku)', res.merged.novakovaR, 188.33)
check('Nováková součet', res.merged.novakovaT, 34.5)
// kdyby se "Celkem přesčas do MEZD" započetlo, bylo by tu 75:30 místo 34:30
check('Nováková do MEZD se nezdvojila mezisoučtem', res.merged.novakovaM, 41)

console.log('\nSloučení měsíců:')
// naimportované měsíce se vsunou na správné místo mezi vestavěné, řazeno od nejnovějšího
const months = res.months.split(',')
check('nejnovější čtyři', months.slice(0, 4).join(','), '2026-11,2026-10,2026-09,2026-08')
check('nejstarší je vestavěný leden', months[months.length - 1], '2026-01')
check('seřazeno sestupně', String(months.join(',') === [...months].sort().reverse().join(',')), 'true')

/* Rozpad v UI — kvůli tomuhle to celé je: u člověka musí jít kliknutím
   na měsíc zobrazit řádky výkazu, ze kterých se jeho součet sečetl. */
await page.click('#nav button[data-section="compare"]')
await page.fill('#person-search', '20102')
await page.waitForSelector('[data-pick="20102"]')
await page.click('[data-pick="20102"]')
await page.waitForSelector('[data-pbreak="2026-09"]')
const zavreno = await page.$$eval('tr.breakdown-row', (r) => r.length)
await page.click('[data-pbreak="2026-09"]')
await page.waitForSelector('tr.breakdown-row')
const rozpad = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('tr.breakdown-row table.mini tbody tr')]
  return {
    pocet: rows.length,
    slozky: rows.map((r) => r.cells[0].textContent.trim()).join(' | '),
    hodiny: rows.map((r) => r.cells[1].textContent.trim()).join(' | '),
    kam: rows.map((r) => r.cells[3].textContent.trim()).join(' | '),
    soucet: document.querySelector('tr.breakdown-row table.mini tfoot td.num').textContent.trim(),
  }
})

console.log('\nRozpad v detailu člověka:')
check('zavřený rozpad se nekreslí', zavreno, 0)
check('rozbalí se tři složky', rozpad.pocet, 3)
check('složky', rozpad.slozky, 'Přesčas roční součet | Přesčas do MEZD | Přesčas evidence')
// hm() sází typografické minus U+2212
check('hodiny v h:mm', rozpad.hodiny, '188:20 | 41:00 | \u22126:30')
check('roční součet je označený jako nepočítaný do měsíce', rozpad.kam,
  'jen roční součet | přesčasu za měsíc | přesčasu za měsíc')
check('patička ukazuje měsíční přesčas', rozpad.soucet, '34:30')

await page.click('[data-pbreak="2026-09"]')
await page.waitForFunction(() => document.querySelectorAll('tr.breakdown-row').length === 0)
check('druhé kliknutí rozpad zavře', await page.$$eval('tr.breakdown-row', (r) => r.length), 0)

await page.click('#nav button[data-section="import"]')
await page.waitForSelector('[data-remove="2026-09"]')

// smazání importu vrátí panel do původního stavu
await page.click('[data-remove="2026-09"]').catch(() => {})
const months2 = await page.evaluate(async () => {
  const d = window.PP.data
  for (const k of d.keys().filter((x) => d.isImported(x))) await d.removeMonth(k)
  return d.keys().join(',')
})
const after = months2.split(',')
check('po smazání importů zmizel 2026-09', after.includes('2026-09') ? 'je tam' : 'není', 'není')
check('vestavěné měsíce zůstaly', after.length, months.length - 3)
check('zbyly jen vestavěné', after.every((k) => !['2026-09', '2026-10', '2026-11'].includes(k)) ? 'ano' : 'ne', 'ano')

await browser.close()
server.close()
console.log(fails.length ? `\n${fails.length} selhalo: ${fails.join(', ')}` : '\nVšechny kontroly prošly.')
process.exit(fails.length ? 1 : 0)
