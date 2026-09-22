#!/usr/bin/env node
/* Test exportu do Excelu: klikne na tlačítko v panelu, zachytí stažený sešit
   a přečte ho zpátky. SheetJS se v panelu tahá z cdnjs — v testu se požadavek
   přesměruje na kopii z node_modules, aby test nezávisel na síti a testoval
   přitom stejnou cestu kódu.

   Spuštění: node tests/export.test.mjs */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHEETJS = join(ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

if (!existsSync(SHEETJS)) {
  console.error('Chybí node_modules/xlsx — spusťte npm install.')
  process.exit(1)
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
await new Promise((r) => server.listen(8145, r))

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const dir = await mkdtemp(join(tmpdir(), 'pp-export-'))
const browser = await chromium.launch()
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))

// místo cdnjs poslat lokální SheetJS
const sheetjs = await readFile(SHEETJS)
await page.route('**/cdnjs.cloudflare.com/**/xlsx.full.min.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: sheetjs })
)

await page.goto('http://localhost:8145/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#export-btn')

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('#export-btn'),
])
const file = join(dir, download.suggestedFilename())
await download.saveAs(file)

console.log('Stažený sešit:')
check('název souboru', download.suggestedFilename(), 'Prescasy_2026-08_vs_2026-07.xlsx')

// ESM build SheetJS nemá readFile — čteme buffer sami
const wb = XLSX.read(await readFile(file))
check('listy', wb.SheetNames.join(', '), 'Souhrn, Střediska, Lidé, Změny lidí')

const asRows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false })

const souhrn = new Map(asRows('Souhrn').filter((r) => r.length >= 2).map((r) => [r[0], r[1]]))
console.log('\nList Souhrn:')
check('měsíc', souhrn.get('Měsíc'), 'srpen 2026')
check('lidí s přesčasem', souhrn.get('Lidí s přesčasem'), 189)
check('přesčas celkem (h)', Math.round(souhrn.get('Přesčas celkem (h)')), 4276)
check('nad 150 h ročně', souhrn.get('Nad 150 h ročně'), 44)
check('upozornění na ukázková data', String(souhrn.get('Pozor')).slice(0, 13), 'UKÁZKOVÁ DATA')

const stred = asRows('Střediska')
console.log('\nList Střediska:')
check('hlavička má sloupce srovnání', stred[0].slice(-2).join(', '), 'Δ Ø (h), Δ celkem (h)')
check('řádků (17 středisek + hlavička)', stred.length, 18)
check('největší je Warehouse', stred[1][0], 'G420 Warehouse')
check('jeho součet', Math.round(stred[1][2]), 681)

const lide = asRows('Lidé')
console.log('\nList Lidé:')
check('řádků (189 lidí + hlavička)', lide.length, 190)
check('hodiny jsou číslo', typeof lide[1][5], 'number')
check('h:mm sloupec je text', typeof lide[1][6], 'string')
const soucet = lide.slice(1).reduce((a, r) => a + r[5], 0)
check('součet sloupce Přesčas (h)', Math.round(soucet), 4276)
const pasma = new Set(lide.slice(1).map((r) => r[7]))
check('pásma', [...pasma].sort().join(', '), 'kritické, ok, sledovat')

const zmeny = asRows('Změny lidí')
const typy = zmeny.slice(1).map((r) => r[0])
const vypadli = typy.filter((t) => t === 'vypadl').length
const pribyli = typy.filter((t) => t === 'přibyl').length
const zustali = typy.filter((t) => t === 'zůstal').length

// Konkrétní počty závisí na datech, ale musí sedět do počtů obou měsíců:
// kdo byl v červenci = zůstali + vypadli; kdo je v srpnu = zůstali + přibyli.
const cervenec = await page.evaluate(() => window.PP.stats(window.PP.data.month('2026-07')).withOvertime)
const srpen = await page.evaluate(() => window.PP.stats(window.PP.data.month('2026-08')).withOvertime)

console.log('\nList Změny lidí:')
check('zůstali + vypadli = lidí v červenci', zustali + vypadli, cervenec)
check('zůstali + přibyli = lidí v srpnu', zustali + pribyli, srpen)
check('každý je právě jednou', zustali + vypadli + pribyli, zmeny.length - 1)
// Δ musí sedět: součet změn + příchody − odchody = celková změna
const dSum = zmeny.slice(1).reduce((a, r) => a + r[6], 0)
const dTotal = await page.evaluate(() => {
  const t = (k) => window.PP.stats(window.PP.data.month(k)).total
  return t('2026-08') - t('2026-07')
})
check('součet Δ = změna měsíce', Math.round(dSum), Math.round(dTotal))

console.log('\nHlášení v panelu:')
check('stav po exportu', await page.$eval('#export-status', (e) => e.textContent),
  'Prescasy_2026-08_vs_2026-07.xlsx')

await browser.close()
server.close()
await rm(dir, { recursive: true, force: true })
console.log(fails.length ? `\n${fails.length} selhalo: ${fails.join(', ')}` : '\nVšechny kontroly prošly.')
process.exit(fails.length ? 1 : 0)
