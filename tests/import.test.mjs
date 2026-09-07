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
])
await page.waitForFunction(() => document.querySelectorAll('#log .log-item.ok').length === 2, null, { timeout: 15000 })

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
    months: window.PP.data.keys().join(','),
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

console.log('\nCSV (oddělovač ;, desetinné hodiny s čárkou):')
check('lidí s přesčasem', res.csvRows, 5)
check('celkem hodin', res.csvTotal, 140.33)

console.log('\nSloučení měsíců:')
check('pořadí měsíců', res.months, '2026-10,2026-09,2026-08,2026-07')

// smazání importu vrátí panel do původního stavu
await page.click('[data-remove="2026-09"]').catch(() => {})
const months = await page.evaluate(async () => {
  await window.PP.data.removeMonth('2026-09')
  return window.PP.data.keys().join(',')
})
check('po smazání importu', months, '2026-10,2026-08,2026-07')

await browser.close()
server.close()
console.log(fails.length ? `\n${fails.length} selhalo: ${fails.join(', ')}` : '\nVšechny kontroly prošly.')
process.exit(fails.length ? 1 : 0)
