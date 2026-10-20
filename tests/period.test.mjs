#!/usr/bin/env node
/* Test souhrnu za celé období a odhadu nákladů.
 *
 * Přehled ukazuje jeden měsíc, tahle sekce sčítá všechny. Hlídá se, že se
 * sčítá opravdu přes měsíce (ne že se jen zopakuje poslední), že se vynechá
 * nejspolehlivější místo — nejstarší měsíc bez předchozího konta — a že
 * náklady vyjdou z hodin, sazby a příplatku.
 *
 * Spuštění: node tests/period.test.mjs
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
await new Promise((r) => server.listen(8142, r))

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

/* Konto se každému mění, takže evidence je zůstatek → panel bude počítat
   přes přírůstek konta a nejstarší měsíc označí za neúplný. */
const LIDE = [
  { n: 'Adamec Petr',  o: 3001, s: 'G210 Výroba A', mezd: 20, konto: [10, 30, 25] },
  { n: 'Brabec Jan',   o: 3002, s: 'G210 Výroba A', mezd: 10, konto: [5, 12, 40] },
  { n: 'Cibulka Ota',  o: 3003, s: 'G420 Warehouse', mezd: 32, konto: [50, 20, 35] },
]
const MESICE = [
  { key: '2026-07', od: '1.7.2026', do: '31.7.2026' },
  { key: '2026-08', od: '1.8.2026', do: '31.8.2026' },
  { key: '2026-09', od: '1.9.2026', do: '30.9.2026' },
]

function rocni(p) {
  const out = []
  let b = 200
  for (let i = 0; i < MESICE.length; i++) {
    b += p.mezd + (p.konto[i] - (i > 0 ? p.konto[i - 1] : p.konto[0]))
    out.push(Math.round(b * 100) / 100)
  }
  return out
}

function vykaz(i) {
  const m = MESICE[i]
  const r = []
  for (const p of LIDE) {
    r.push([p.n, p.o, p.s, 'Přesčas do MEZD', hm(p.mezd)])
    r.push([p.n, p.o, p.s, 'Přesčas evidence', hm(p.konto[i])])
    r.push([p.n, p.o, p.s, 'Přesčas roční součet', hm(rocni(p)[i])])
  }
  return `<html><head><meta charset="utf-8"></head><body><table>
<tr><td colspan="5">Období: ${m.od} - ${m.do}</td></tr>
<tr><th>Příjmení a jméno</th><th>Osobní číslo</th><th>Středisko</th><th>Mzdová složka</th><th>Hodiny</th></tr>
${r.map((x) => '<tr>' + x.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('\n')}
</table></body></html>`
}

const dir = await mkdtemp(join(tmpdir(), 'pp-period-'))
const files = []
for (let i = 0; i < MESICE.length; i++) {
  const f = join(dir, `m${i}.xls`)
  await writeFile(f, vykaz(i), 'utf8')
  files.push(f)
}

/* Čekané hodnoty: srpen a září (červenec se vynechá, nemá předchozí konto).
   Přesčas = do MEZD + přírůstek konta. */
let cekanyPrescas = 0
let cekaneMezdy = 0
for (const p of LIDE) {
  for (let i = 1; i < 3; i++) {
    cekanyPrescas += p.mezd + (p.konto[i] - p.konto[i - 1])
    cekaneMezdy += p.mezd
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto('http://localhost:8142/#import', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')
await page.evaluate(() => window.localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')
await page.setInputFiles('#file', files)
await page.waitForFunction(() => document.querySelectorAll('#log .log-item.ok').length === 3, null, { timeout: 20000 })

const p = await page.evaluate(() => {
  const t = window.PP.periodTotals()
  return {
    keys: t.keys.join(','),
    skipped: t.skipped.join(','),
    people: t.people,
    total: t.total,
    mezdy: t.mezdy,
    konto: t.konto,
    centers: t.centers.map((c) => `${c.name}:${c.total}`).join(' | '),
    top: t.ranking[0].n,
    topT: t.ranking[0].t,
  }
})

console.log('Součet za období:')
check('sečetly se jen měsíce, u kterých se dá počítat', p.keys, '2026-08,2026-09')
check('nejstarší měsíc se vynechal', p.skipped, '2026-07')
check('lidí', p.people, LIDE.length)
check('přesčas celkem', p.total, Math.round(cekanyPrescas * 100) / 100)
check('proplaceno celkem', p.mezdy, Math.round(cekaneMezdy * 100) / 100)
check('na konto zůstalo zbytek', p.konto, Math.round((cekanyPrescas - cekaneMezdy) * 100) / 100)
// kdyby se sčítal jen poslední měsíc, vyšlo by míň — proto kontrola proti měsíci
const zari = await page.evaluate(() => Math.round(window.PP.stats(window.PP.data.month('2026-09')).total * 100) / 100)
check('je to opravdu součet, ne poslední měsíc', p.total !== zari ? 'ano' : 'ne', 'ano')
check('střediska sedí', p.centers.split(' | ').length, 2)

/* ---------- výběr měsíců v TOP kartě ---------- */
await page.click('#nav button[data-section="overview"]')
await page.waitForSelector('.topc-item')

const jeden = await page.evaluate(() => ({
  stitek: document.querySelector('.card:has(.topc) .period-chip').textContent.trim(),
  prvni: document.querySelector('.topc-item .topc-nums strong').textContent.trim(),
  vybrano: [...document.querySelectorAll('[data-topmonth][aria-pressed=true]')].map((b) => b.dataset.topmonth).join(','),
}))
console.log('\nTOP střediska — jeden měsíc:')
check('štítek nese vybraný měsíc', /2026/.test(jeden.stitek) ? 'ano' : 'ne: ' + jeden.stitek, 'ano')
check('zvýrazněný je jen ten měsíc', jeden.vybrano, '2026-09')

// přidat srpen → karta musí sčítat oba
await page.click('[data-topmonth="2026-08"]')
await page.waitForTimeout(150)
const dva = await page.evaluate(() => {
  const p = window.PP.periodTotals(['2026-08', '2026-09'])
  return {
    stitek: document.querySelector('.card:has(.topc) .period-chip').textContent.trim(),
    vybrano: [...document.querySelectorAll('[data-topmonth][aria-pressed=true]')].map((b) => b.dataset.topmonth).sort().join(','),
    prvni: document.querySelector('.topc-item .topc-nums strong').textContent.trim(),
    cekano: window.PP.hrsU(p.centers[0].total),
    lidiVKarte: document.querySelectorAll('.topc-item:first-child .topc-people li:not(.more)').length,
  }
})
console.log('\nTOP střediska — dva měsíce:')
check('vybrané jsou oba', dva.vybrano, '2026-08,2026-09')
check('štítek ukazuje rozsah', /–/.test(dva.stitek) ? 'ano' : 'ne: ' + dva.stitek, 'ano')
check('čísla jsou součtem obou měsíců', dva.prvni, dva.cekano)
check('a není to jen jeden měsíc', dva.prvni !== jeden.prvni ? 'ano' : 'ne', 'ano')
check('lidé ve středisku se pořád vypisují', dva.lidiVKarte > 0 ? 'ano' : 'ne', 'ano')

await page.click('#topmonth-reset')
await page.waitForTimeout(150)
check('návrat na vybraný měsíc', await page.evaluate(() =>
  document.querySelector('.topc-item .topc-nums strong').textContent.trim()), jeden.prvni)

/* ---------- náklady ---------- */
await page.click('#nav button[data-section="period"]')
await page.waitForSelector('#rate-form')
// volič měsíce na kumulativní sekci nepatří — zrovna tahle záměna ji vyvolala
check('volič měsíce je schovaný',
  await page.$eval('.month-picker', (e) => e.hidden) ? 'ano' : 'ne', 'ano')
await page.click('#nav button[data-section="overview"]')
check('a v Přehledu se vrátí',
  await page.$eval('.month-picker', (e) => e.hidden) ? 'schovaný' : 'ano', 'ano')
await page.click('#nav button[data-section="period"]')
await page.waitForSelector('#rate-form')

console.log('\nNáklady:')
check('bez sazby se nic nepočítá', await page.$$eval('#panel-period .kpi', (e) => e.length), 4)

await page.fill('#rate-value', '300')
await page.fill('#rate-surcharge', '25')
await page.click('#rate-form button[type=submit]')
await page.waitForSelector('#rate-clear')

const naklady = await page.evaluate(() => ({
  dlazdic: document.querySelectorAll('#panel-period .kpi').length,
  hodnoty: [...document.querySelectorAll('#panel-period .kpi .value')].map((e) => e.textContent.trim()),
  vzorec: window.PP.cost(100),
}))
check('sazba × příplatek', naklady.vzorec, 100 * 300 * 1.25)
check('přibyly dlaždice s penězi', naklady.dlazdic > 4 ? 'ano' : 'ne', 'ano')
const ocekavanyNaklad = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })
  .format(Math.round(cekaneMezdy * 300 * 1.25)) + ' Kč'
check('vyplaceno za přesčas', naklady.hodnoty.includes(ocekavanyNaklad) ? 'ano' : 'ne: ' + naklady.hodnoty.join(' / '), 'ano')

// sazba musí přežít zavření panelu
await page.reload({ waitUntil: 'domcontentloaded' })
await page.click('#nav button[data-section="period"]')
await page.waitForSelector('#rate-form')
check('sazba se pamatuje', await page.inputValue('#rate-value'), '300')

await page.click('#rate-clear')
await page.waitForTimeout(150)
check('smazání sazby peníze schová', await page.$$eval('#panel-period .kpi', (e) => e.length), 4)

await browser.close()
server.close()

if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
