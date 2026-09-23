#!/usr/bin/env node
/* Test vývojových pohledů: historie jednoho člověka a grafy.
   Spuštění: node tests/trend.test.mjs */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
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
await new Promise((r) => server.listen(8147, r))

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto('http://localhost:8147/#compare', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#chart-plant svg')

/* ---------- grafy závodu a středisek ---------- */
const trends = await page.evaluate(() => ({
  mesicu: window.PP.data.keys().length,
  bodyZavod: document.querySelectorAll('#chart-plant .chart-dot').length,
  carySt: document.querySelectorAll('#chart-centers .chart-line').length,
  legenda: document.querySelectorAll('#panel-compare .chart-legend span').length,
}))
console.log('Grafy vývoje:')
check('bodů za závod = počet měsíců', trends.bodyZavod, trends.mesicu)
check('čar za střediska', trends.carySt, 5)
check('legenda má položku ke každé čáře', trends.legenda, trends.carySt)

/* ---------- historie jednoho člověka ---------- */
// vybere se někdo, komu aspoň jeden měsíc chybí — tam se pozná, že se díra
// neplete s nulou a že roční součet přes ni drží
// Hledá se někdo, kdo má díru až po prvním měsíci (aby šlo ověřit, že roční
// součet přes ni drží) a zároveň někdy překročil měsíční práh (aby se v grafu
// měly kreslit prahové čáry).
const target = await page.evaluate(() => {
  const keys = window.PP.data.keys()
  let fallback = null
  for (const p of window.PP.roster()) {
    if (p.months < 2 || p.months >= keys.length) continue
    const h = window.PP.personHistory(String(p.o))
    const gap = h.points.findIndex((x) => x.t == null)
    if (gap < 1) continue
    if (!fallback) fallback = String(p.o)
    if (h.max >= window.PP.CFG.person.crit) return String(p.o)
  }
  return fallback || String(window.PP.roster()[0].o)
})

const hist = await page.evaluate((id) => {
  const h = window.PP.personHistory(id)
  const withOt = h.points.filter((p) => p.t != null)
  return {
    id,
    klice: h.points.map((p) => p.key),
    mesicu: h.points.length,
    sPrescasem: withOt.length,
    dira: h.points.findIndex((p) => p.t == null),
    soucetMesicu: Math.round(withOt.reduce((a, p) => a + p.t, 0) * 100) / 100,
    rocni: h.points[h.points.length - 1].r,
    max: h.max,
  }
}, target)

console.log('\nHistorie člověka:')
// regrese: klíče bodů musí být klíče měsíců, ne osobní číslo
check('klíče bodů jsou měsíce', /^\d{4}-\d{2}$/.test(hist.klice[0]) ? 'ano' : 'ne: ' + hist.klice[0], 'ano')
check('klíče nejsou osobní číslo', hist.klice.includes(hist.id) ? 'jsou' : 'nejsou', 'nejsou')
check('seřazeno od nejstaršího', hist.klice.join(',') === [...hist.klice].sort().join(',') ? 'ano' : 'ne', 'ano')
check('bodů = počet měsíců', hist.mesicu, trends.mesicu)
check('aspoň jeden měsíc chybí', hist.sPrescasem < hist.mesicu ? 'ano' : 'ne', 'ano')
// klíčová vlastnost dat: roční součet je součet měsíců
check('součet měsíců = roční součet', hist.soucetMesicu, hist.rocni)

const gap = await page.evaluate((id) => {
  const h = window.PP.personHistory(id)
  const i = h.points.findIndex((p) => p.t == null)
  return { t: h.points[i].t, r: h.points[i].r, rPred: i > 0 ? h.points[i - 1].r : null }
}, target)
console.log('\nMěsíc, kdy člověk ve výkazu není:')
check('přesčas je null, ne nula', gap.t === null ? 'null' : gap.t, 'null')
check('roční součet drží na předchozí hodnotě', gap.r, gap.rPred)

/* ---------- vykreslení a proklik ---------- */
await page.fill('#person-search', target)
await page.waitForSelector(`[data-pick="${target}"]`)
await page.click(`[data-pick="${target}"]`)
await page.waitForSelector('#chart-person svg')

const drawn = await page.evaluate(() => ({
  body: document.querySelectorAll('#chart-person .chart-dot').length,
  prahy: [...document.querySelectorAll('#chart-person .chart-ref-label')].map((t) => t.textContent).join(','),
  mesicVTabulce: document.querySelector('#panel-compare tr.muted-row td').textContent.trim(),
}))
console.log('\nGraf člověka:')
check('bodů = měsíců s přesčasem (díra se nekreslí)', drawn.body, hist.sPrescasem)
// Prahová čára se kreslí jen když spadá do rozsahu osy — u člověka, který se
// k 40 h nikdy nepřiblížil, by graf zbytečně zplacatila.
const ocekavanePrahy = [40, 60].filter((v) => v <= hist.max * 1.02).map((v) => v + ' h').join(',')
check('prahy odpovídají rozsahu dat (max ' + hist.max + ' h)', drawn.prahy, ocekavanePrahy)
check('chybějící měsíc má v tabulce název měsíce', /^[a-záčďéěíňóřšťúůýž]+ \d{4}$/.test(drawn.mesicVTabulce) ? 'ano' : 'ne: ' + drawn.mesicVTabulce, 'ano')

await page.click('[data-pmetric=year]')
await page.waitForTimeout(200)
const year = await page.evaluate(() => ({
  prahy: [...document.querySelectorAll('#chart-person .chart-ref-label')].map((t) => t.textContent).join(','),
  osaMax: [...document.querySelectorAll('#chart-person .chart-tick')]
    .map((t) => t.textContent).filter((t) => /^\d+:\d\d$/.test(t)).pop(),
}))
check('roční pohled ukazuje i strop', year.prahy, '150 h,250 h,strop 416 h')

// proklik ze jména v žebříčku
await page.click('#nav button[data-section="ranking"]')
await page.waitForSelector('.link-person')
const jmeno = await page.$eval('.link-person', (e) => e.textContent.trim())
await page.click('.link-person')
await page.waitForSelector('#chart-person svg')
const po = await page.evaluate(() => ({
  sekce: document.querySelector('#section-title').textContent,
  kdo: document.querySelector('#panel-compare .card:has(#chart-person) .hint:last-child').textContent.trim(),
}))
console.log('\nProklik ze jména:')
check('otevře se vývoj a srovnání', po.sekce, 'Vývoj a srovnání')
check('vybraný člověk sedí', po.kdo.startsWith(jmeno) ? 'ano' : 'ne: ' + po.kdo, 'ano')

await browser.close()
server.close()
console.log(fails.length ? `\n${fails.length} selhalo: ${fails.join(', ')}` : '\nVšechny kontroly prošly.')
process.exit(fails.length ? 1 : 0)
