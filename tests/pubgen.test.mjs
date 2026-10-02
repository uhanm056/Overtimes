#!/usr/bin/env node
/* Test generátoru veřejné verze přímo v panelu.
 *
 * Milan nemá na závodním počítači Node ani Playwright, takže veřejné vydání
 * musí jít vyrobit kliknutím v prohlížeči. Tenhle test proto nejdřív
 * naimportuje výkaz s reálně vypadajícími jmény, klikne na tlačítko, zachytí
 * stažený soubor a ověří dvě věci: že v něm není ani jedno jméno nebo osobní
 * číslo, a že to pořád je funkční panel, ne mrtvá stránka.
 *
 * Spuštění: node tests/pubgen.test.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIX = join(ROOT, 'tests', 'fixtures')
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
await new Promise((r) => server.listen(8139, r))

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.goto('http://localhost:8139/#import', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')
await page.setInputFiles('#file', [join(FIX, 'souctovy-vykaz-2026-09.xls')])
await page.waitForSelector('#log .log-item.ok')

/* ---------- vygenerování ---------- */
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('#pub-build'),
])
const saved = join(tmpdir(), 'pp-public-' + Date.now() + '.html')
await download.saveAs(saved)
const html = await readFile(saved, 'utf8')

console.log('Stažený soubor:')
check('jmenuje se index.html', download.suggestedFilename(), 'index.html')
check('je to celý dokument', /^<!doctype html>/i.test(html) ? 'ano' : 'ne', 'ano')
check('hlásí se jako veřejná verze', /window\.PP_PUBLIC\s*=\s*true/.test(html) ? 'ano' : 'ne', 'ano')
check('nemá se indexovat', /name="robots" content="noindex"/.test(html) ? 'ano' : 'ne', 'ano')

/* ---------- osobní údaje ---------- */
const zdroj = await page.evaluate(() => {
  const out = []
  for (const k of window.PP.data.keys()) {
    for (const r of window.PP.data.month(k).rows || []) out.push([r.n, String(r.o)])
  }
  return out
})
const jmena = [...new Set(zdroj.flat())].filter(Boolean)
const unikla = jmena.filter((n) => html.includes(n))

console.log('\nOsobní údaje:')
check('zdroj má co prozradit (kontrola dává smysl)', jmena.length > 5 ? 'ano' : 'ne: ' + jmena.length, 'ano')
check('jmen a osobních čísel ve výstupu', unikla.length, 0)
// Značky jako link-person se v souboru vyskytnou i tak — je v něm zdroják
// panelu. Hledá se proto jen ve vykresleném markupu, tedy mimo skripty a styly.
const markup = html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
check('nezůstal vykreslený obsah panelů',
  /class="(card|kpi|tag)\b|data-pick=|link-person/.test(markup) ? 'zůstal' : 'ne', 'ne')
check('prázdné panely', (markup.match(/<section class="panel"[^>]*><\/section>/g) || []).length, 7)

/* ---------- výstup je funkční panel ---------- */
const page2 = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page2.on('pageerror', (e) => errs.push(e.message))
await page2.goto('file://' + saved, { waitUntil: 'load' })
await page2.waitForSelector('#panel-overview .card')
const verejny = await page2.evaluate(() => ({
  sekce: [...document.querySelectorAll('#nav button')].map((b) => b.dataset.section).join(','),
  mesice: window.PP.data.keys().length,
  agregat: window.PP.data.keys().every((k) => window.PP.data.month(k).aggregate === true),
  lidi: window.PP.data.keys().some((k) => (window.PP.data.month(k).rows || []).length > 0),
  dlazdice: document.querySelectorAll('#panel-overview .kpi').length,
  styl: getComputedStyle(document.body).backgroundColor,
}))

console.log('\nVygenerovaná stránka:')
check('běží bez chyb', errs.length ? errs[0] : 'ano', 'ano')
check('jen neosobní sekce', verejny.sekce, 'overview,centers,compare,method')
check('měsíce se načetly', verejny.mesice > 0 ? 'ano' : 'ne', 'ano')
check('všechny měsíce jsou agregáty', verejny.agregat ? 'ano' : 'ne', 'ano')
check('řádky s lidmi tam nejsou', verejny.lidi ? 'jsou' : 'ne', 'ne')
check('přehled se vykreslil', verejny.dlazdice > 0 ? 'ano' : 'ne', 'ano')
// styly se musely vložit dovnitř — soubor běží z disku, vedle něj nic není
check('styly fungují i z disku', verejny.styl === 'rgba(0, 0, 0, 0)' ? 'ne' : 'ano', 'ano')

/* ---------- shoda s verzí z příkazové řádky ---------- */
const stejne = await page.evaluate(() => {
  const months = {}
  for (const k of window.PP.data.keys()) months[k] = window.PP.data.month(k)
  return JSON.stringify(window.PP.publicMonths(months, window.PP.CFG).months)
})
const vlozene = /window\.PP_BUILTIN_MONTHS = (\{[\s\S]*?\});\n/.exec(html)
console.log('\nShoda agregace:')
check('ve stránce jsou tytéž agregáty, jaké spočítá PP.publicMonths',
  vlozene && vlozene[1] === stejne ? 'ano' : 'ne', 'ano')

await browser.close()
server.close()

if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
