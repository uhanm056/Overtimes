#!/usr/bin/env node
/* Test veřejného vydání (docs/index.html).
 *
 * Hlavní věc, kterou hlídá: v zveřejňovaném souboru nesmí být žádné jméno
 * ani osobní číslo. Zbytek kontrol ověřuje, že se z panelu opravdu vytratily
 * jmenné pohledy a že malá střediska nejdou ven samostatně.
 *
 * Spuštění: node tests/public.test.mjs   (vyžaduje předchozí build-public.mjs)
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs', 'index.html')

if (!existsSync(OUT)) {
  console.error('Chybí docs/index.html — spusťte nejdřív: node tools/build-public.mjs --demo')
  process.exit(1)
}

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const html = await readFile(OUT, 'utf8')

/* ---------- osobní údaje ---------- */
// zdrojová data, ze kterých se veřejné vydání staví (vzorek pro testy)
const src = {}
new Function('window', await readFile(join(ROOT, 'tests', 'fixtures', 'demo-months.js'), 'utf8'))(src)
const source = src.PP_BUILTIN_MONTHS

const names = new Set()
const ids = new Set()
for (const rec of Object.values(source)) {
  for (const r of rec.rows) { names.add(r.n); ids.add(String(r.o)) }
}

console.log('Osobní údaje ve zveřejňovaném souboru:')
check('jmen ve výstupu', [...names].filter((n) => html.includes(n)).length, 0)
check('osobních čísel ve výstupu', [...ids].filter((o) => html.includes(o)).length, 0)
check('zdroj má co prozradit (kontrola dává smysl)', names.size > 50 ? 'ano' : 'ne', 'ano')

/* ---------- co se zveřejnilo ---------- */
const m = /window\.PP_BUILTIN_MONTHS = (\{.*?\});\n/s.exec(html)
check('výstup obsahuje agregáty', m ? 'ano' : 'ne', 'ano')
const pub = JSON.parse(m[1])
const keys = Object.keys(pub).sort()
const last = pub[keys[keys.length - 1]]

console.log('\nAgregace:')
check('žádný měsíc nemá řádky s lidmi',
  Object.values(pub).some((r) => r.rows) ? 'má' : 'nemá', 'nemá')
check('každý měsíc je označený jako agregát',
  Object.values(pub).every((r) => r.aggregate) ? 'ano' : 'ne', 'ano')
check('nejmenší zveřejněné středisko má aspoň 5 lidí',
  Math.min(...last.summary.centers.map((c) => c.people)) >= 5 ? 'ano' : 'ne', 'ano')
check('tříčlenné G463 Prefix není samostatně',
  last.summary.centers.some((c) => c.name.includes('G463')) ? 'je' : 'není', 'není')
// součet za střediska nesmí být vyšší než závod — sloučení nesmí nic zdvojit
const soucetStredisek = last.summary.centers.reduce((a, c) => a + c.total, 0)
check('součet středisek ≤ součet závodu',
  soucetStredisek <= last.summary.total + 0.01 ? 'ano' : `ne (${soucetStredisek} > ${last.summary.total})`, 'ano')

/* ---------- panel v prohlížeči ---------- */
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto('file://' + OUT, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#panel-overview .kpi')

const ui = await page.evaluate(() => ({
  sekce: [...document.querySelectorAll('#nav button')].map((b) => b.dataset.section).join(','),
  sloupce: [...document.querySelectorAll('#center-table thead th')].map((t) => t.textContent.trim()).join(','),
  exportSkryty: document.querySelector('#export-btn').hidden,
}))

console.log('\nPanel:')
check('jen neosobní sekce', ui.sekce, 'overview,centers,compare,method')
check('sloupec Maximum (hodnota jednotlivce) chybí',
  ui.sloupce.includes('Maximum') ? 'je tam' : 'chybí', 'chybí')
check('export do Excelu skrytý', ui.exportSkryty, 'true')

await page.click('#nav button[data-section="compare"]')
await page.waitForSelector('#chart-plant svg')
const compare = await page.evaluate(() => ({
  clovek: !!document.querySelector('#chart-person'),
  hledaniOsob: !!document.querySelector('#person-search'),
  zmeny: !!document.querySelector('.change-list'),
  body: document.querySelectorAll('#chart-plant .chart-dot').length,
}))
check('karta jednoho člověka není', compare.clovek ? 'je' : 'není', 'není')
check('hledání osob není', compare.hledaniOsob ? 'je' : 'není', 'není')
check('seznamy kdo přibyl/vypadl nejsou', compare.zmeny ? 'jsou' : 'nejsou', 'nejsou')
check('graf vývoje funguje', compare.body > 1 ? 'ano' : 'ne', 'ano')

await page.click('#nav button[data-section="centers"]')
await page.waitForTimeout(250)
const centers = await page.evaluate(() => ({
  chipy: document.querySelectorAll('#panel-centers .chip').length,
  jmena: document.querySelectorAll('#panel-centers .link-person').length,
}))
check('výběr střediska funguje', centers.chipy > 3 ? 'ano' : 'ne', 'ano')
check('žádná prokliknutelná jména', centers.jmena, 0)

/* Karta TOP středisek zůstává i veřejně — je to nejčitelnější část přehledu —
   ale jmenné seznamy z ní musí zmizet. */
await page.click('#nav button[data-section="overview"]')
await page.waitForSelector('.topc-item')
const top = await page.evaluate(() => ({
  nadpis: document.querySelector('.card:has(.topc) h2').textContent.trim(),
  strediska: document.querySelectorAll('.topc-item').length,
  lide: document.querySelectorAll('.topc-people').length,
  jmena: document.querySelectorAll('.topc .link-person').length,
  proklik: document.querySelectorAll('.topc .link-center').length,
}))
console.log('\nTOP střediska ve veřejném vydání:')
check('karta je vidět', top.nadpis, 'TOP střediska')
check('nejmenuje se „a jejich lidé“', /jejich lidé/.test(top.nadpis) ? 'jmenuje' : 'ne', 'ne')
check('střediska se vypsala', top.strediska > 1 ? 'ano' : 'ne', 'ano')
check('seznamy lidí nejsou', top.lide, 0)
check('ani jedno jméno', top.jmena, 0)
check('proklik na detail střediska funguje', top.proklik, top.strediska)

await page.click('[data-topby="avg"]')
await page.waitForTimeout(200)
check('přepínač na Ø na osobu funguje',
  await page.$$eval('.topc-item', (e) => e.length) > 1 ? 'ano' : 'ne', 'ano')
check('ani po přepnutí tam nejsou jména',
  await page.$$eval('.topc .link-person', (e) => e.length), 0)

await browser.close()
console.log(fails.length ? `\n${fails.length} selhalo: ${fails.join(', ')}` : '\nVšechny kontroly prošly.')
process.exit(fails.length ? 1 : 0)
