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
    // Panel se distribuuje bez dat; testům se místo nich podstrčí vzorek.
    if (p === join(ROOT, 'data', 'months.js')) p = join(ROOT, 'tests', 'fixtures', 'demo-months.js')
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
  // detail jednoho člověka má stránku sám pro sebe
  karet: document.querySelectorAll('#panel-compare > .card').length,
  grafZavodu: !!document.querySelector('#chart-plant'),
  vyberMesicu: !!document.querySelector('#cmp-a'),
  zmeny: !!document.querySelector('.change-list'),
  zpet: !!document.querySelector('#person-close'),
}))
console.log('\nProklik ze jména:')
check('nadpis stránky je jméno', po.sekce, jmeno)
check('vybraný člověk sedí', po.kdo.startsWith(jmeno) ? 'ano' : 'ne: ' + po.kdo, 'ano')
check('je vidět jen jeho karta', po.karet, 1)
check('bez grafů závodu', po.grafZavodu ? 'jsou' : 'ne', 'ne')
check('bez výběru měsíců k porovnání', po.vyberMesicu ? 'je' : 'ne', 'ne')
check('bez seznamu změn', po.zmeny ? 'je' : 'ne', 'ne')
check('nabízí návrat', po.zpet ? 'ano' : 'ne', 'ano')

// návrat musí vrátit celou sekci i její nadpis
await page.click('#person-close')
await page.waitForSelector('#chart-plant svg')
const zpet = await page.evaluate(() => ({
  sekce: document.querySelector('#section-title').textContent,
  grafZavodu: !!document.querySelector('#chart-plant'),
  hledani: !!document.querySelector('#person-search'),
}))
check('zpět se vrátí vývoj a srovnání', zpet.sekce, 'Vývoj a srovnání')
check('i s grafem závodu', zpet.grafZavodu ? 'ano' : 'ne', 'ano')
check('a s hledáním člověka', zpet.hledani ? 'ano' : 'ne', 'ano')

// odchod do jiné sekce detail zavírá
await page.click('#nav button[data-section="ranking"]')
await page.waitForSelector('.link-person')
await page.click('.link-person')
await page.waitForSelector('#person-close')
await page.click('#nav button[data-section="overview"]')
await page.click('#nav button[data-section="compare"]')
await page.waitForSelector('#chart-plant svg')
check('po odchodu jinam se detail nezjeví znovu',
  await page.$$eval('#person-close', (e) => e.length), 0)

/* ---------- proklik na středisko a shoda čísel ----------
   Karta TOP středisek a detail střediska musí ukazovat totéž. Kdyby se
   rozešly, panel by si sám odporoval a nikdo by nevěděl, čemu věřit. */
await page.click('#nav button[data-section="overview"]')
await page.waitForSelector('.topc-item')

const zKarty = await page.evaluate(() => {
  const it = document.querySelector('.topc-item')
  const nums = it.querySelector('.topc-nums')
  return {
    nazev: it.querySelector('.link-center').textContent.trim(),
    hlavni: nums.querySelector('strong').textContent.trim(),
    vedlejsi: nums.querySelector('small').textContent.trim(),
    lide: [...it.querySelectorAll('.topc-people li:not(.more)')].map((l) => ({
      jmeno: l.querySelector('.link-person').textContent.trim(),
      hodiny: l.querySelector('.amt').textContent.trim(),
    })),
  }
})

await page.click('.topc-item .link-center')
await page.waitForSelector('#panel-centers .chip[aria-pressed="true"]')

const zDetailu = await page.evaluate(() => {
  const kpi = (label) => {
    const k = [...document.querySelectorAll('#panel-centers .kpi')]
      .find((x) => x.querySelector('.label').textContent.trim() === label)
    return k ? k.querySelector('.value').textContent.trim() : null
  }
  return {
    vybrane: document.querySelector('#panel-centers .chip[aria-pressed="true"]').textContent.trim(),
    celkem: kpi('Přesčas celkem'),
    lidi: kpi('Lidí s přesčasem'),
    prumer: kpi('Ø na osobu'),
    top5: [...document.querySelectorAll('#panel-centers .bars .bar-row')].map((r) => ({
      jmeno: r.querySelector('.name').textContent.trim(),
      hodiny: r.querySelector('.val').textContent.trim(),
    })),
  }
})

console.log('\nProklik z TOP středisek na detail:')
check('otevře se sekce Střediska', await page.$eval('#section-title', (e) => e.textContent), 'Střediska')
check('vybralo se to samé středisko',
  zDetailu.vybrane.startsWith(zKarty.nazev) ? 'ano' : `ne: ${zDetailu.vybrane}`, 'ano')
// „681,0 h" v kartě vs „681,0 h" v detailu
check('součet hodin sedí', zDetailu.celkem, zKarty.hlavni)
// vedlejší řádek karty je „Ø 24:20 · 28 lidí"
const [ovKarty, lidiKarty] = zKarty.vedlejsi.split('·').map((x) => x.trim())
check('Ø na osobu sedí', zDetailu.prumer, ovKarty.replace('Ø', '').trim())
check('počet lidí sedí', zDetailu.lidi + ' lidí', lidiKarty)
check('TOP 5 lidí je stejných',
  zDetailu.top5.map((x) => x.jmeno).join(' | '), zKarty.lide.map((x) => x.jmeno).join(' | '))
check('a se stejnými hodinami',
  zDetailu.top5.map((x) => x.hodiny).join(' | '), zKarty.lide.map((x) => x.hodiny).join(' | '))

/* ---------- kontrola ročního součtu ----------
   Musí umět obojí: potvrdit, že součty sedí, a odhalit, když nesedí.
   Test, který jen projde na správných datech, nedokazuje nic. */
const annual = await page.evaluate(() => {
  const d = window.PP.data
  const keys = d.keys()
  const cur = d.month(keys[0])
  const prev = d.month(keys[1])
  const sedi = window.PP.compare(cur, prev).annual

  // rozbít: třem lidem nastavit roční součet pod jejich měsíční přesčas
  const kopie = JSON.parse(JSON.stringify(cur))
  let n = 0
  for (const r of kopie.rows) {
    if (n >= 3) break
    if (r.t > 20) { r.r = Math.round(r.t * 0.85 * 100) / 100; n++ }
  }
  const nesedi = window.PP.compare(kopie, prev).annual
  return { sedi, nesedi, rozbito: n }
})

console.log('\nKontrola ročního součtu:')
check('na správných datech nic nehlásí', annual.sedi.neither, 0)
check('kontrola opravdu něco porovnávala', annual.sedi.checked > 100 ? 'ano' : 'ne', 'ano')
// ve vzorku je evidence pohyb za měsíc, takže musí vyhrát „MEZD + evidence“
check('rozsudek na vzorku', annual.sedi.verdict, 'move')
check('sedí u všech', annual.sedi.okMove, annual.sedi.checked)
check('rozbité roční součty odhalí', annual.nesedi.neither, annual.rozbito)
check('ukáže příklady k dohledání', annual.nesedi.examples.length, annual.rozbito)
check('u příkladu sedí rozdíl',
  Math.abs(annual.nesedi.examples[0].dr - annual.nesedi.examples[0].asMove
    - annual.nesedi.examples[0].diff) < 0.02 ? 'ano' : 'ne', 'ano')
// Pár lidí mimo nesmí verdiktem pohnout — u 3 ze 175 je to pořád 98 %.
// Překlopit ho smí až systematický nesoulad, na to je tests/method.test.mjs.
check('pár rozbitých rozsudkem nehne', annual.nesedi.verdict, 'move')
check('ale vypíšou se', annual.nesedi.neither > 0 ? 'ano' : 'ne', 'ano')

await browser.close()
server.close()
console.log(fails.length ? `\n${fails.length} selhalo: ${fails.join(', ')}` : '\nVšechny kontroly prošly.')
process.exit(fails.length ? 1 : 0)
