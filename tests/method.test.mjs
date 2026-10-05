#!/usr/bin/env node
/* Test rozsouzení, co znamená sloupec „Přesčas evidence“.
 *
 * Vyrobí dvě trojice výkazů z týchž lidí:
 *   A) evidence = pohyb za měsíc      → roční součet přibývá o MEZD + evidence
 *   B) evidence = zůstatek konta      → roční součet přibývá o MEZD + přírůstek konta
 *
 * Panel musí u každé z nich ukázat na tu správnou. Kdyby to spletl, tvrdil by
 * o měsíčním přesčasu něco, co neplatí — u člověka s velkým kontem je rozdíl
 * mezi oběma výklady klidně dvojnásobek.
 *
 * Spuštění: node tests/method.test.mjs
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
await new Promise((r) => server.listen(8141, r))

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const hm = (v) => {
  const neg = v < 0
  const t = Math.round(Math.abs(v) * 60)
  return (neg ? '-' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
}

/* Osm lidí s různě velkým kontem, ať se obě varianty nemůžou shodou okolností
   potkat. Kdyby měli konto konstantní, vyšly by A i B stejně. */
const LIDE = [
  { n: 'Obšilová Jana', o: 1001, s: 'G410 Quality',   mezd: 32,   konto: [33.85, 22.65, 41.17] },
  { n: 'Dvořák Petr',   o: 1002, s: 'G210 Výroba A',  mezd: 10.5, konto: [4.0, 9.5, 2.25] },
  { n: 'Růžička Jan',   o: 1003, s: 'G420 Warehouse', mezd: 0,    konto: [60.0, 48.5, 70.25] },
  { n: 'Malá Eva',      o: 1004, s: 'G310 Údržba',    mezd: 18.25, konto: [0, 12.5, 6.0] },
  { n: 'Konečný Aleš',  o: 1005, s: 'G420 Warehouse', mezd: 5,    konto: [12.0, 30.75, 19.5] },
  { n: 'Beneš Karel',   o: 1006, s: 'G210 Výroba A',  mezd: 40,   konto: [8.5, 3.25, 15.0] },
  { n: 'Horák Tomáš',   o: 1007, s: 'G410 Quality',   mezd: 22,   konto: [25.0, 41.5, 33.75] },
  { n: 'Vlková Lucie',  o: 1008, s: 'G310 Údržba',    mezd: 7.5,  konto: [16.25, 10.0, 28.5] },
]
const MESICE = [
  { key: '2026-07', od: '1.7.2026', do: '31.7.2026' },
  { key: '2026-08', od: '1.8.2026', do: '31.8.2026' },
  { key: '2026-09', od: '1.9.2026', do: '30.9.2026' },
]

/** Roční součty podle toho, co evidence znamená. Začíná se od nenulového stavu. */
function rocni(p, rezim) {
  const out = []
  let bezi = 100
  for (let i = 0; i < MESICE.length; i++) {
    const prirustek = rezim === 'pohyb'
      ? p.mezd + p.konto[i]
      : p.mezd + (p.konto[i] - (i > 0 ? p.konto[i - 1] : p.konto[0]))
    // první měsíc nemá s čím porovnávat, roční součet se u něj nekontroluje
    bezi += i === 0 ? p.mezd + p.konto[0] : prirustek
    out.push(Math.round(bezi * 100) / 100)
  }
  return out
}

function vykaz(rezim, i) {
  const m = MESICE[i]
  const radky = []
  for (const p of LIDE) {
    radky.push([p.n, p.o, p.s, 'Přesčas do MEZD', hm(p.mezd)])
    radky.push([p.n, p.o, p.s, 'Přesčas evidence', hm(p.konto[i])])
    radky.push([p.n, p.o, p.s, 'Přesčas roční součet', hm(rocni(p, rezim)[i])])
  }
  return `<html><head><meta charset="utf-8"></head><body><table>
<tr><td colspan="5">Období: ${m.od} - ${m.do}</td></tr>
<tr><th>Příjmení a jméno</th><th>Osobní číslo</th><th>Středisko</th><th>Mzdová složka</th><th>Hodiny</th></tr>
${radky.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('\n')}
</table></body></html>`
}

const dir = await mkdtemp(join(tmpdir(), 'pp-method-'))
const soubory = {}
for (const rezim of ['pohyb', 'zustatek']) {
  soubory[rezim] = []
  for (let i = 0; i < MESICE.length; i++) {
    const f = join(dir, `${rezim}-${MESICE[i].key}.xls`)
    await writeFile(f, vykaz(rezim, i), 'utf8')
    soubory[rezim].push(f)
  }
}

const browser = await chromium.launch()

async function zmer(rezim) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (e) => fails.push(`pageerror(${rezim}): ` + e.message))
  await page.goto('http://localhost:8141/#import', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#drop')
  // každý režim do svého prohlížeče, ať se importy nemíchají
  await page.evaluate(() => window.localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#drop')
  await page.setInputFiles('#file', soubory[rezim])
  await page.waitForFunction(() => document.querySelectorAll('#log .log-item.ok').length === 3, null, { timeout: 20000 })
  const out = await page.evaluate(() => {
    const keys = window.PP.data.keys()
    const cmp = window.PP.compare(window.PP.data.month(keys[0]), window.PP.data.month(keys[1]))
    return {
      verdict: cmp.annual.verdict,
      checked: cmp.annual.checked,
      okMove: cmp.annual.okMove,
      okBalance: cmp.annual.okBalance,
      neither: cmp.annual.neither,
    }
  })
  await page.goto('http://localhost:8141/#year', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.method-verdict')
  out.nadpis = (await page.textContent('.method-verdict strong')).trim()
  out.vyhrava = await page.$$eval('.method-row.win .method-formula', (e) => e.length ? e[0].childNodes[0].textContent.trim() : '—')
  await page.close()
  return out
}

console.log('Výkaz, kde evidence je POHYB za měsíc:')
const a = await zmer('pohyb')
check('rozsudek', a.verdict, 'move')
// porovnává se poslední dvojice měsíců, tedy každý člověk jednou
check('kontrolovaných lidí', a.checked, LIDE.length)
check('sedí „MEZD + evidence“', a.okMove, LIDE.length)
check('nesedí ani jedna u nikoho', a.neither, 0)
check('karta ukazuje správný závěr', a.nadpis, 'Evidence je pohyb za měsíc — výpočet panelu sedí')
check('zvýrazněný je správný vzorec', a.vyhrava, 'Do MEZD + Evidence')

console.log('\nVýkaz, kde evidence je ZŮSTATEK konta:')
const b = await zmer('zustatek')
check('rozsudek', b.verdict, 'balance')
check('kontrolovaných lidí', b.checked, LIDE.length)
check('sedí „MEZD + přírůstek konta“', b.okBalance, LIDE.length)
// u nikoho se konto mezi měsíci nemění nulově, takže se varianty nesmějí potkat
check('„MEZD + evidence“ nesedí nikomu', b.okMove, 0)
check('karta ukazuje správný závěr', b.nadpis, 'Evidence je STAV konta, ne pohyb — panel přesčas nadhodnocuje')
check('zvýrazněný je správný vzorec', b.vyhrava, 'Do MEZD + přírůstek konta')

await browser.close()
server.close()

if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
