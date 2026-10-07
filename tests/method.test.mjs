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

/* V režimu „zůstatek“ roční součet u některých lidí klesá — konto jim ubylo víc,
   než se proplatilo. To je přesně ten případ, který musí panel pojmenovat:
   takové číslo není počitadlo odpracovaných hodin a na zákonný strop nestačí. */

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
    const d = window.PP.data
    const keys = d.keys()
    const cmp = window.PP.compare(d.month(keys[0]), d.month(keys[1]))
    const zari = d.month('2026-09')
    const cervenec = d.month('2026-07')
    const kdo = (rec, o) => rec.rows.find((r) => String(r.o) === String(o))
    return {
      verdict: cmp.annual.verdict,
      checked: cmp.annual.checked,
      okMove: cmp.annual.okMove,
      okBalance: cmp.annual.okBalance,
      neither: cmp.annual.neither,
      dropped: cmp.annual.dropped,
      // co panel použije jako měsíční přesčas
      method: d.method,
      zariT: kdo(zari, 1001).t,
      zariRaw: kdo(zari, 1001).tRaw,
      zariDe: kdo(zari, 1001).de,
      // nejstarší měsíc se nemá od čeho odrazit
      cervenecNeuplny: !!cervenec.methodIncomplete,
      zariNeuplny: !!zari.methodIncomplete,
      cervenecT: kdo(cervenec, 1001).t,
      // součet za závod musí jít z opravených hodnot
      zariTotal: Math.round(window.PP.stats(zari).total * 100) / 100,
      zariSoucetRadku: Math.round(zari.rows.reduce((a, r) => a + r.t, 0) * 100) / 100,
    }
  })
  out.banner = await page.$$eval('#method-banner:not([hidden])', (e) => e.length)
  // souhrny tak, jak by odešly kolegům
  out.souhrny = await page.evaluate(() => {
    const m = {}
    for (const k of window.PP.data.keys()) m[k] = window.PP.data.month(k)
    const agg = window.PP.publicMonths(m, window.PP.CFG)
    return { months: agg.months, updatedAt: new Date().toISOString() }
  })
  await page.goto('http://localhost:8141/#year', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.method-verdict')
  out.nadpis = (await page.textContent('.method-verdict strong')).trim()
  out.vyhrava = await page.$$eval('.method-row.win .method-formula', (e) => e.length ? e[0].childNodes[0].textContent.trim() : '—')
  const verdikty = await page.$$eval('.method-verdict strong', (e) => e.map((x) => x.textContent.trim()))
  out.pokles = verdikty.find((t) => /Roční součet/.test(t)) || '—'
  out.poklesText = await page.evaluate(() =>
    /nestačí/.test(document.querySelector('#panel-year').textContent))
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
// 32:00 + 41:10 — nic se nepřepočítává
check('přesčas zůstal MEZD + evidence', a.zariT, 73.17)
check('shoduje se se syrovým součtem', a.zariT, a.zariRaw)
check('žádný měsíc není označený jako neúplný', a.cervenecNeuplny || a.zariNeuplny ? 'je' : 'ne', 'ne')
check('banner se nezobrazuje', a.banner, 0)

console.log('\nVýkaz, kde evidence je ZŮSTATEK konta:')
const b = await zmer('zustatek')
const souhrny = b.souhrny
check('rozsudek', b.verdict, 'balance')
check('kontrolovaných lidí', b.checked, LIDE.length)
check('sedí „MEZD + přírůstek konta“', b.okBalance, LIDE.length)
// u nikoho se konto mezi měsíci nemění nulově, takže se varianty nesmějí potkat
check('„MEZD + evidence“ nesedí nikomu', b.okMove, 0)
check('karta ukazuje správný závěr', b.nadpis, 'Evidence je STAV konta, ne pohyb — panel přesčas nadhodnocuje')
check('zvýrazněný je správný vzorec', b.vyhrava, 'Do MEZD + přírůstek konta')

console.log('\n  …a panel podle toho přepočítá:')
check('metodika v datové vrstvě', b.method, 'balance')
// 32:00 + (41:10 − 22:39) = 50:31, ne 73:10
check('září: přesčas je MEZD + přírůstek konta', b.zariT, 50.52)
check('syrový součet zůstal k nahlédnutí', b.zariRaw, 73.17)
check('uložil se i přírůstek konta', b.zariDe, 18.52)
check('součet za závod jde z opravených hodnot', b.zariTotal, b.zariSoucetRadku)
// nejstarší měsíc nemá předchozí konto, u něj se opravit nedá
check('červenec je označený jako neúplný', b.cervenecNeuplny ? 'ano' : 'ne', 'ano')
check('září neúplné není', b.zariNeuplny ? 'je' : 'ne', 'ne')
check('červenec si nechal hodnotu z výkazu', b.cervenecT, 65.85)
check('banner to říká nahlas', b.banner, 1)

/* Klesající roční součet je zásadní zjištění: znamená, že se z něj proplacením
   ubírá, a tedy že se na něm nedá hlídat zákonný strop. */
console.log('\n  …a pozná klesající roční součet:')
check('spočítá, kolika lidem klesl', b.dropped > 0 ? 'ano' : 'ne', 'ano')
check('karta to pojmenuje', b.pokles, 'Roční součet klesl u ' + b.dropped + ' z ' + b.checked + ' lidí')
check('a varuje, že na strop nestačí', b.poklesText ? 'ano' : 'ne', 'ano')
check('u varianty „pohyb“ nikomu neklesl', a.dropped, 0)
check('a karta to potvrdí', a.pokles, 'Roční součet nikomu neklesl')

/* ---------- co z toho uvidí kolegové ----------
   Veřejná stránka dostává jen souhrny, řádky s lidmi v ní nejsou — takže si
   metodiku nemá z čeho změřit a musí ji dostat s daty. Bez toho by popisovala
   sloupce jinak než panel, ze kterého čísla vyšla. */
const verejna = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
verejna.on('pageerror', (e) => fails.push('pageerror(veřejná): ' + e.message))
await verejna.addInitScript(`window.PP_PUBLIC = true
window.PP_REMOTE_ADAPTER = { name:'t', store: ${JSON.stringify(souhrny)}, watchers: [],
  configured(){return true}, async connect(){return true},
  async load(){return this.store}, async watch(cb){this.watchers.push(cb);return function(){}},
  async signIn(){}, async signOut(){}, async currentUser(){return null}, async publish(){} }`)
await verejna.goto('http://localhost:8141/', { waitUntil: 'domcontentloaded' })
await verejna.waitForSelector('#remote-note:not([hidden])')
await verejna.waitForSelector('#method-banner:not([hidden])', { timeout: 10000 })

const kolega = await verejna.evaluate(() => ({
  metoda: window.PP.data.method,
  banner: document.querySelector('#method-banner').textContent.replace(/\s+/g, ' ').trim(),
  zahlavi: [...document.querySelectorAll('#panel-overview th')].map((t) => t.textContent.trim()),
}))

console.log('\nVeřejná stránka ze souhrnů:')
check('metodika dorazila s daty', kolega.metoda, 'balance')
check('banner to říká', /Do MEZD \+ přírůstek konta/.test(kolega.banner) ? 'ano' : 'ne: ' + kolega.banner, 'ano')
// bez naměřených lidí se nesmí chlubit kontrolou, kterou neudělala
check('netvrdí, že to sama ověřila', /ověřeno proti ročnímu součtu/.test(kolega.banner) ? 'tvrdí' : 'ne', 'ne')
check('sloupec se nejmenuje Evidence', kolega.zahlavi.includes('Evidence') ? 'jmenuje' : 'ne', 'ne')
check('ale Přírůstek konta', kolega.zahlavi.includes('Přírůstek konta') ? 'ano' : 'ne: ' + kolega.zahlavi.join('|'), 'ano')

await browser.close()
server.close()

if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
