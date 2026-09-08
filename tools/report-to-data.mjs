#!/usr/bin/env node
/**
 * Převede reálné Součtové výkazy na vestavěná data panelu (data/months.js).
 *
 * Nepřepisuje parser znovu v Node — pustí headless Chromium, načte do něj
 * samotný panel a nechá soubory rozparsovat úplně stejným kódem, jaký běží
 * v prohlížeči (js/parser.js). Co projde tímhle skriptem, projde i importem
 * v UI a naopak.
 *
 * Použití:
 *   node tools/report-to-data.mjs vykaz-07.xls vykaz-08.xls
 *   node tools/report-to-data.mjs --keep vykaz-09.xls    # přidá k existujícím
 *
 * Bez --keep se data/months.js přepíše jen zadanými měsíci (tedy i zahodí
 * ukázková data, což je při přechodu na ostrý provoz obvykle to, co chcete).
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', 'months.js')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const files = args.filter((a) => !a.startsWith('--')).map((f) => resolve(f))

if (!files.length) {
  console.error('Použití: node tools/report-to-data.mjs [--keep] <výkaz…>')
  process.exit(1)
}
for (const f of files) {
  if (!existsSync(f)) { console.error('Soubor neexistuje: ' + f); process.exit(1) }
}

const server = createServer(async (req, res) => {
  try {
    let p = join(ROOT, normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''))
    if (p.endsWith('/') || p === ROOT) p = join(p, 'index.html')
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('404') }
})
const port = 8151
await new Promise((r) => server.listen(port, r))

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => { console.error('Chyba v panelu:', e.message); process.exitCode = 1 })
await page.goto(`http://localhost:${port}/#import`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')

// vlastní vstup — na ten v UI visí posluchač, který po importu files vyprázdní,
// takže bychom soubor už nepřečetli (a zbytečně bychom spouštěli import v panelu)
await page.evaluate(() => {
  const input = document.createElement('input')
  input.type = 'file'
  input.id = 'pp-cli-file'
  document.body.appendChild(input)
})

const months = {}
if (keep) {
  const existing = await page.evaluate(() => window.PP_BUILTIN_MONTHS || {})
  for (const k in existing) if (!existing[k].demo) months[k] = existing[k]
}

for (const file of files) {
  await page.setInputFiles('#pp-cli-file', [file])
  const out = await page.evaluate(async () => {
    const f = document.querySelector('#pp-cli-file').files[0]
    try {
      const r = await window.PP.parseReport(f)
      return { ok: true, key: r.key, kind: r.kind, skipped: r.skipped, record: r.record }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  if (!out.ok) {
    console.error(`✕ ${file}: ${out.error}`)
    process.exitCode = 1
    continue
  }
  const hours = Math.round(out.record.rows.reduce((a, r) => a + r.t, 0) * 10) / 10
  months[out.key] = out.record
  console.log(`✓ ${out.key}: ${out.record.rows.length} lidí s přesčasem, ${hours} h, ` +
    `${out.record.people} osob ve výkazu (${out.kind})`)
}

await browser.close()
server.close()

if (!Object.keys(months).length) {
  console.error('Nic k zápisu.')
  process.exit(1)
}

const ordered = {}
for (const k of Object.keys(months).sort()) ordered[k] = months[k]

const banner = `/*
 * Vestavěná data panelu — vygenerováno skriptem tools/report-to-data.mjs
 * ze Součtových výkazů. Needitujte ručně.
 *
 * Pozor: soubor obsahuje osobní údaje zaměstnanců (jméno, osobní číslo,
 * středisko, odpracované přesčasy). Než repozitář nebo publikovaný panel
 * zpřístupníte dál, ověřte, komu tato data smí být vidět.
 */
`
await writeFile(OUT, banner + 'window.PP_BUILTIN_MONTHS = ' + JSON.stringify(ordered) + ';\n', 'utf8')
console.log(`→ data/months.js (${Object.keys(ordered).length} měsíců)`)
