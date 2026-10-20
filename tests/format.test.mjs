#!/usr/bin/env node
/* Test jednoho zápisu hodin.
 *
 * Panel dřív míchal „61,1 h“ a „61:05“ — tutéž hodnotu dvakrát jinak,
 * někdy v jedné tabulce vedle sebe. Teď o zápisu rozhoduje jedno nastavení
 * pro celý panel. Tenhle test hlídá, že se oba zápisy nepotkají a že
 * přepnutí opravdu přepíše všechno, ne jen část.
 *
 * Spuštění: node tests/format.test.mjs
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'dist', 'prescasovy-panel-plana.html')
if (!existsSync(FILE)) {
  console.error('Chybí ' + FILE + ' — spusťte nejdřív: node tools/build-single-file.mjs')
  process.exit(1)
}

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('file://' + FILE, { waitUntil: 'load' })
await page.waitForSelector('#nav button')

await page.click('#nav button[data-section="import"]')
await page.setInputFiles('#file', [
  join(ROOT, 'tests', 'fixtures', 'souctovy-vykaz-2026-09.xls'),
  join(ROOT, 'tests', 'fixtures', 'souctovy-vykaz-2026-10.csv'),
])
await page.waitForSelector('#log .log-item.ok')
await page.click('#nav button[data-section="overview"]')
await page.waitForSelector('#panel-overview .kpi')

/* Čísla v přehledu posbíraná z míst, kde se dřív oba zápisy potkávaly:
   hlavní dlaždice, tabulka středisek a karta TOP středisek. */
const sber = () => page.evaluate(() => {
  const txt = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim())
  return {
    hero: document.querySelector('#panel-overview .kpi.hero .value').textContent.trim(),
    bunky: txt('#center-table tbody td.num'),
    topc: txt('#panel-overview .topc-nums strong'),
  }
})

const hm = await sber()
const vse = (o) => o.bunky.concat(o.topc, [o.hero])
const jeHm = (t) => /^−?\d+:\d{2}$/.test(t)
/* V tabulce stojí holé číslo (hlavička nese jednotku), v dlaždici i s „h“.
   Za desetinný zápis se počítá desetinná čárka nebo jednotka za číslem. */
const jeDec = (t) => /^−?[\d ]+(,\d)?( h)?$/.test(t) && /,\d| h$/.test(t)

console.log('Zápis h:mm (výchozí):')
check('běží bez chyb', errs.length ? errs[0] : 'ano', 'ano')
check('hlavní číslo je h:mm', jeHm(hm.hero) ? hm.hero : 'ne: ' + hm.hero, hm.hero)
check('v přepínači stojí, který zápis platí', await page.textContent('#fmt-label'), 'Hodiny: 61:05')
check('žádná hodnota není desetinná', vse(hm).filter(jeDec).join(', ') || 'žádná', 'žádná')
check('je co kontrolovat', vse(hm).length > 10 ? 'ano' : 'jen ' + vse(hm).length, 'ano')

/* Přepnutí musí přepsat úplně všechno — i karty, které se nepřekreslují samy. */
await page.click('#fmt-toggle')
await page.waitForTimeout(250)
const dec = await sber()
console.log('\nPo přepnutí na desetinné hodiny:')
check('běží bez chyb', errs.length ? errs[0] : 'ano', 'ano')
check('přepínač se přepsal', await page.textContent('#fmt-label'), 'Hodiny: 61,1 h')
check('hlavní číslo je desetinné', jeDec(dec.hero) ? dec.hero : 'ne: ' + dec.hero, dec.hero)
check('žádná hodnota nezůstala v h:mm', vse(dec).filter(jeHm).join(', ') || 'žádná', 'žádná')
check('počet čísel se nezměnil', vse(dec).length, vse(hm).length)

/* Jde o tutéž hodnotu, jen jinak zapsanou. Srovnávají se jen buňky, které
   hodiny opravdu nesou — v tabulce jsou i počty lidí a „beze změny“. */
const prevod = (t) => {
  const m = /^(−?)(\d+):(\d{2})$/.exec(t)
  return (m[1] ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60)
}
const cislo = (t) => Number(t.replace(' h', '').replace(/ /g, '').replace(',', '.'))
const pary = vse(hm).map((t, i) => [t, vse(dec)[i]]).filter(([a, b]) => jeHm(a) && jeDec(b))
const rozdily = pary.map(([a, b]) => Math.abs(prevod(a) - cislo(b)))
check('je co porovnávat', pary.length > 10 ? 'ano' : 'jen ' + pary.length, 'ano')
check('hodnoty sedí v obou zápisech', Math.max.apply(null, rozdily) < 0.051 ? 'ano'
  : 'největší rozdíl ' + Math.max.apply(null, rozdily), 'ano')

/* Volba má přežít zavření souboru, jinak ji člověk překlápí pořád dokola. */
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('#nav button')
console.log('\nPo znovuotevření:')
check('nastavení se pamatuje', await page.textContent('#fmt-label'), 'Hodiny: 61,1 h')

await browser.close()
if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
