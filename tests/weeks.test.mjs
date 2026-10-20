#!/usr/bin/env node
/* Test týdenních výkazů.
 *
 * Mzdy umí tentýž Součtový výkaz vytisknout za týden. Panel to musí poznat
 * podle období v hlavičce, vést týdny ve vlastní řadě a nesmíchat je s měsíci
 * — sečíst týden s měsícem, který ho obsahuje, by hodiny zdvojilo.
 *
 * Spuštění: node tests/weeks.test.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  try {
    let p = join(ROOT, normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''))
    if (p.endsWith('/') || p === ROOT) p = join(p, 'index.html')
    if (p === join(ROOT, 'data', 'months.js')) p = join(ROOT, 'tests', 'fixtures', 'demo-months.js')
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('404') }
})
await new Promise((r) => server.listen(8143, r))

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}
const hm = (v) => {
  const t = Math.round(Math.abs(v) * 60)
  return (v < 0 ? '-' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
}

const LIDE = [
  { n: 'Adamec Petr', o: 7001, s: 'G210 Výroba A', mezd: 0, konto: [4, 11, 9] },
  { n: 'Brabec Jan', o: 7002, s: 'G210 Výroba A', mezd: 0, konto: [2, 3, 14] },
  { n: 'Cibulka Ota', o: 7003, s: 'G420 Warehouse', mezd: 8, konto: [10, 6, 20] },
]
/* Pondělní týdny, ať klíč z ISO sedí na období ve výkazu. */
const TYDNY = [
  { od: '31.8.2026', do: '6.9.2026', key: '2026-W36' },
  { od: '7.9.2026', do: '13.9.2026', key: '2026-W37' },
  { od: '14.9.2026', do: '20.9.2026', key: '2026-W38' },
]

function rocni(p, i) {
  let b = 120
  for (let j = 0; j <= i; j++) b += p.mezd + (p.konto[j] - (j > 0 ? p.konto[j - 1] : p.konto[0]))
  return Math.round(b * 100) / 100
}

function vykaz(od, doD, i) {
  const r = []
  for (const p of LIDE) {
    r.push([p.n, p.o, p.s, 'Přesčas do MEZD', hm(p.mezd)])
    r.push([p.n, p.o, p.s, 'Přesčas evidence', hm(p.konto[i])])
    r.push([p.n, p.o, p.s, 'Přesčas roční součet', hm(rocni(p, i))])
  }
  return `<html><head><meta charset="utf-8"></head><body><table>
<tr><td colspan="5">Období: ${od} - ${doD}</td></tr>
<tr><th>Příjmení a jméno</th><th>Osobní číslo</th><th>Středisko</th><th>Mzdová složka</th><th>Hodiny</th></tr>
${r.map((x) => '<tr>' + x.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('\n')}
</table></body></html>`
}

const dir = await mkdtemp(join(tmpdir(), 'pp-week-'))
const files = []
for (let i = 0; i < TYDNY.length; i++) {
  const f = join(dir, `t${i}.xls`)
  await writeFile(f, vykaz(TYDNY[i].od, TYDNY[i].do, i), 'utf8')
  files.push(f)
}
// měsíc obsahující tytéž týdny — nesmí se s nimi smíchat
const mesic = join(dir, 'mesic.xls')
await writeFile(mesic, vykaz('1.9.2026', '30.9.2026', 2), 'utf8')
// období, které není ani měsíc, ani týden
const divne = join(dir, 'divne.xls')
await writeFile(divne, vykaz('1.9.2026', '15.9.2026', 0), 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto('http://localhost:8143/#import', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')
await page.evaluate(() => window.localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')
await page.setInputFiles('#file', files.concat([mesic]))
await page.waitForFunction(() => document.querySelectorAll('#log .log-item').length === 4 &&
  !document.querySelector('#log .log-item.busy'), null, { timeout: 20000 })
const log = await page.$$eval('#log .log-item', (xs) =>
  xs.map((x) => (x.classList.contains('ok') ? 'ok ' : 'ERR ') + x.textContent.replace(/\s+/g, ' ').slice(0, 120)))
if (log.some((l) => l.startsWith('ERR'))) {
  console.error('Import selhal:'); log.forEach((l) => console.error('  ' + l))
}

const d = await page.evaluate(() => ({
  tydny: window.PP.data.weekKeys().join(','),
  mesice: window.PP.data.keys().filter((k) => !window.PP.data.month(k).demo).join(','),
  tydenNeniMesic: window.PP.data.keys().some((k) => /W/.test(k)),
  w37: Math.round(window.PP.stats(window.PP.data.week('2026-W37')).total * 100) / 100,
  zari: Math.round(window.PP.stats(window.PP.data.month('2026-09')).total * 100) / 100,
}))

console.log('Rozpoznání období:')
check('týdny mají vlastní klíče', d.tydny, '2026-W38,2026-W37,2026-W36')
check('měsíc zůstal měsícem', d.mesice, '2026-09')
check('týden se nemíchá mezi měsíce', d.tydenNeniMesic ? 'míchá' : 'ne', 'ne')

/* Týden 37: přesčas = do MEZD + přírůstek konta proti týdnu 36.
   Kdyby se přírůstek počítal proti měsíci, vyšlo by něco jiného. */
const cekanoW37 = LIDE.reduce((a, p) => a + p.mezd + (p.konto[1] - p.konto[0]), 0)
check('týden se počítá proti předchozímu týdnu', d.w37, Math.round(cekanoW37 * 100) / 100)
check('měsíc se počítá zvlášť a vyjde jinak', d.zari !== d.w37 ? 'ano' : 'ne', 'ano')

/* Období, které není ani měsíc, ani týden, se musí odmítnout — jinak by
   se do řady dostalo něco nesrovnatelného. */
await page.setInputFiles('#file', [divne])
await page.waitForSelector('#log .log-item.err')
const chyba = (await page.textContent('#log .log-item.err')).replace(/\s+/g, ' ')
console.log('\nPolovina měsíce:')
check('import se odmítl', /není ani celý měsíc, ani týden/.test(chyba) ? 'ano' : 'ne: ' + chyba, 'ano')
check('a nic nepřibylo', await page.evaluate(() => window.PP.data.weekKeys().length), 3)

/* ---------- sekce Týdny ---------- */
await page.click('#nav button[data-section="weeks"]')
await page.waitForSelector('[data-week]')
const ui = await page.evaluate(() => ({
  vybrany: document.querySelector('[data-week][aria-pressed=true]').dataset.week,
  tlacitek: document.querySelectorAll('[data-week]').length,
  obdobi: document.querySelector('#panel-weeks .hint').textContent.replace(/\s+/g, ' ').trim(),
  graf: !!document.querySelector('#chart-weeks svg'),
  bodu: document.querySelectorAll('#chart-weeks .chart-dot').length,
  strediska: document.querySelectorAll('#panel-weeks table tbody tr').length > 0,
}))
console.log('\nSekce Týdny:')
check('nabízí všechny týdny', ui.tlacitek, 3)
check('vybraný je nejnovější', ui.vybrany, '2026-W38')
check('ukazuje období z výkazu', /14\. 9\. – 20\. 9\. 2026/.test(ui.obdobi) ? 'ano' : 'ne: ' + ui.obdobi, 'ano')
check('graf vývoje se vykreslil', ui.graf ? 'ano' : 'ne', 'ano')
check('bod za každý týden', ui.bodu, 3)
check('tabulka středisek není prázdná', ui.strediska ? 'ano' : 'ne', 'ano')
// volič měsíce ani cedule o ukázce sem nepatří — týdny s měsícem nesouvisí
check('volič měsíce je schovaný',
  await page.$eval('.month-picker', (e) => e.hidden) ? 'ano' : 'ne', 'ano')
check('cedule o ukázkových datech se nezobrazuje',
  await page.$eval('#demo-banner', (e) => e.hidden) ? 'ano' : 'ne', 'ano')

await page.click('[data-week="2026-W36"]')
await page.waitForTimeout(150)
const prepnuto = await page.evaluate(() => ({
  vybrany: document.querySelector('[data-week][aria-pressed=true]').dataset.week,
  neuplny: /nejstarší načtený týden/.test(document.querySelector('#panel-weeks').textContent),
}))
check('přepnutí týdne funguje', prepnuto.vybrany, '2026-W36')
// nejstarší týden nemá předchozí konto, takže se u něj přesčas spočítat nedá
check('nejstarší týden je označený', prepnuto.neuplny ? 'ano' : 'ne', 'ano')

await browser.close()
server.close()

if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
