#!/usr/bin/env node
/* Test vydání pro kolegy (--analyzer).
 *
 * Má to být plný panel na vlastní výkaz, ale bez čehokoli, co patří jen
 * správci: bez karty pro zveřejňování a bez připojení k databázi. Hlavní
 * kontrola je, že soubor nikam nevolá — kolega ho otevře z disku a nic
 * z jeho výkazu neodejde ven.
 *
 * Spuštění: node tests/analyzer.test.mjs
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'dist', 'prescasovy-analyzer.html')
const BEZNY = join(ROOT, 'dist', 'prescasovy-panel-plana.html')

for (const f of [FILE, BEZNY]) {
  if (!existsSync(f)) {
    console.error('Chybí ' + f + ' — spusťte nejdřív: node tools/build-single-file.mjs [--analyzer]')
    process.exit(1)
  }
}

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const html = await readFile(FILE, 'utf8')
console.log('Soubor:')
check('hlásí se jako analyzér', /window\.PP_ANALYZER = true/.test(html) ? 'ano' : 'ne', 'ano')
check('konfigurace databáze je prázdná', /window\.PP_FIREBASE = null/.test(html) ? 'ano' : 'ne', 'ano')
check('adresa databáze v souboru není', /overtimes-343aa|firebasedatabase\.app/.test(html) ? 'je' : 'ne', 'ne')
// běžné vydání ji naopak mít musí, jinak kontrola nic neznamená
check('běžné vydání ji má (kontrola dává smysl)',
  /firebasedatabase\.app/.test(await readFile(BEZNY, 'utf8')) ? 'ano' : 'ne', 'ano')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
const site = []
page.on('pageerror', (e) => errs.push(e.message))
// co by soubor chtěl stáhnout z internetu
page.on('request', (r) => { if (!r.url().startsWith('file://')) site.push(r.url()) })

await page.goto('file://' + FILE, { waitUntil: 'load' })
await page.waitForSelector('#nav button')

const stav = await page.evaluate(() => ({
  sekce: [...document.querySelectorAll('#nav button')].map((b) => b.dataset.section).join(','),
  mesicu: window.PP.data.keys().length,
}))
console.log('\nPanel:')
check('běží bez chyb', errs.length ? errs[0] : 'ano', 'ano')
check('startuje prázdný', stav.mesicu, 0)
check('všechny sekce jsou k dispozici', stav.sekce,
  'overview,period,weeks,centers,ranking,compare,year,import,method')

await page.click('#nav button[data-section="import"]')
await page.waitForSelector('#drop')
const imp = await page.evaluate(() => ({
  publikovat: !!document.querySelector('#pub-live, #pub-login'),
  karta: /Veřejná verze pro kolegy/.test(document.querySelector('#panel-import').textContent),
  diagnostika: !!document.querySelector('#pub-diag'),
  drop: !!document.querySelector('#drop'),
}))
check('patička prozradí, které vydání to je',
  /· analyzér$/.test(await page.textContent('#rail-build')) ? 'ano' : 'ne: ' + await page.textContent('#rail-build'), 'ano')

console.log('\nSekce Import:')
check('import výkazu zůstává', imp.drop ? 'ano' : 'ne', 'ano')
check('karta pro zveřejňování není', imp.karta ? 'je' : 'ne', 'ne')
check('přihlášení k publikování není', imp.publikovat ? 'je' : 'ne', 'ne')
check('kontrola spojení není', imp.diagnostika ? 'je' : 'ne', 'ne')

/* Import musí fungovat jako jinde — tohle je to jediné, co kolega dělá. */
await page.setInputFiles('#file', [join(ROOT, 'tests', 'fixtures', 'souctovy-vykaz-2026-09.xls')])
await page.waitForSelector('#log .log-item.ok', { timeout: 20000 })
const po = await page.evaluate(() => ({
  mesicu: window.PP.data.keys().length,
  hodin: Math.round(window.PP.stats(window.PP.data.month('2026-09')).total * 100) / 100,
}))
console.log('\nPo importu:')
check('měsíc se načetl', po.mesicu, 1)
check('čísla sedí', po.hodin, 140.33)

/* Nic se nesmí stahovat z internetu: písma z Google Fonts by poslala IP
   adresu každého, kdo soubor otevře. (SheetJS se dotáhne jen u .xlsx; tenhle
   výkaz je HTML tabulka, takže se nevolá.) */
console.log('\nSíť:')
check('při otevření a importu .xls nic neodešlo', site.length ? site.join(', ') : 'nic', 'nic')
check('písma se netahají z Googlu', /fonts\.(googleapis|gstatic)/.test(html) ? 'tahají' : 'ne', 'ne')
check('běžné vydání je má (kontrola dává smysl)',
  /fonts\.googleapis/.test(await readFile(BEZNY, 'utf8')) ? 'ano' : 'ne', 'ano')

await browser.close()

if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
