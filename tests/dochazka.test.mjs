#!/usr/bin/env node
/* Test Přehledového výkazu docházky — druhá sestava, druhá metodika.
 *
 * Měsíce stojí na mzdových složkách ze Součtového výkazu, týdny na
 * odpracovaném čase proti fondu. Tenhle test hlídá hlavně to, co se na
 * skutečném výkazu ukázalo jako zrádné:
 *
 *   • hodnoty nejsou v textu buňky, ale v atributu x:num jako podíl dne,
 *   • fond platí jen za dny, kdy měl člověk být v práci — dovolená ho snižuje,
 *     jinak by týden dovolené vyšel jako −37,5 h přesčasu,
 *   • služební cesta je už uvnitř „Celkem odpracováno“ a nesmí se přičíst,
 *   • za závod se sčítá jen kladný přesčas; kdo odešel dřív, nikomu jinému
 *     odpracovanou hodinu neodečte.
 *
 * Spuštění: node tests/dochazka.test.mjs
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
await page.setInputFiles('#file', [join(ROOT, 'tests', 'fixtures', 'dochazka-2026-W42.xls')])
await page.waitForSelector('#log .log-item.ok', { timeout: 20000 })

const d = await page.evaluate(() => {
  const k = window.PP.data.weekKeys()[0]
  const rec = window.PP.data.week(k)
  const st = window.PP.stats(rec)
  const by = {}
  for (const r of rec.rows) by[r.o] = r
  return { k, src: rec.src, period: rec.period, mesicu: window.PP.data.keys().length,
    lidi: rec.rows.length, sPrescasem: st.withOvertime, people: rec.people,
    total: st.total, worked: st.worked, fund: st.fund, absence: st.absence,
    under: st.under, underPeople: st.underPeople, stredisek: st.centers.length,
    by, comps: rec.comps, other: (rec.otherComps || []).map((c) => c[0]) }
})

console.log('Import:')
check('běží bez chyb', errs.length ? errs[0] : 'ano', 'ano')
check('uloží se jako týden, ne měsíc', d.k, '2026-W42')
check('mezi měsíci nepřistál', d.mesicu, 0)
check('pozná se, odkud čísla jsou', d.src, 'dochazka')
check('období z výkazu', d.period, '12. 10. – 18. 10. 2026')
check('všichni lidé z výkazu', d.lidi, 6)
check('souhrnné řádky se nepočítají jako lidé', d.people, 6)
check('středisek', d.stredisek, 3)

console.log('\nJednotliví lidé:')
// 44 odpracováno proti fondu 37,5 → 6,5 h přesčasu
check('běžný přesčas', d.by['30201'].t, 6.5)
// celý týden dovolené: holý rozdíl −37,5, ale přesčas žádný
check('týden dovolené není −37,5 h přesčasu', d.by['30202'].t, 0)
check('holý rozdíl zůstává vidět', d.by['30202'].rd, -37.5)
check('a ani nechybí do fondu', d.by['30202'].u, 0)
// 3 dny nemoc (15 h), fond klesá na 22,5, odpracoval 18 → schází 4,5
check('nemoc snižuje fond', d.by['30203'].u, 4.5)
check('a přesčas mu z toho nevznikne', d.by['30203'].t, 0)
// odešel dřív, nic vykázaného
check('nevykázaná absence je schodek, ne přesčas', d.by['30204'].t, 0)
check('a je vidět jako schodek', d.by['30204'].u, 6.5)
// služební cesta je uvnitř odpracováno
check('služební cesta se nepřičítá', d.by['30205'].t, 0)
check('odpracováno u ní zůstává', d.by['30205'].w, 40)
// zkrácený úvazek má vlastní fond
check('zkrácený úvazek má vlastní fond', d.by['30206'].fo, 20)
check('a přesčas se měří proti němu', d.by['30206'].t, 3)

console.log('\nZa závod:')
check('odpracováno celkem', d.worked, 156)
check('fond celkem', d.fund, 210)
check('placená nepřítomnost', d.absence, 52.5)
// 6,5 + 3 — jen kladné; schodky se neodečítají
check('přesčas je součet kladných', d.total, 9.5)
check('lidí s přesčasem', d.sPrescasem, 2)
check('schází do fondu', d.under, 11)
check('lidí pod fondem', d.underPeople, 2)
/* Kdyby se sčítalo netto, vyšlo by 156 − (192,5 − 52,5) = 16 a odpracované
   hodiny navíc by se smazaly schodky jiných lidí. Kontrola, že se to neděje. */
check('netto by dalo jiné číslo (kontrola dává smysl)',
  d.worked - (d.fund - d.absence), -1.5)
check('přesčas minus schodek sedí na netto',
  Math.round((d.total - d.under) * 100) / 100, -1.5)

console.log('\nSloupce výkazu:')
check('fond snižuje dovolená, nemoc, lékař', d.comps.join(', '), 'Lékař, Dovolená, Nemoc')
check('služební cesta a přestávka se ignorují',
  d.other.includes('Služební cesta') && d.other.includes('Přestávka') ? 'ano' : 'ne: ' + d.other, 'ano')

/* Tabulka středisek musí jít dopočítat. Bez sloupce Nepřítomnost to vypadá
   jako chyba: Odpracováno − Fond nedává Přesčas, protože fond je snížený. */
const ident = await page.evaluate(() => {
  const st = window.PP.stats(window.PP.data.week('2026-W42'))
  const bad = []
  for (const c of st.centers) {
    const s = (f) => c.rows.reduce((a, x) => a + (Number(x[f]) || 0), 0)
    const vlevo = s('t') - s('u')
    const vpravo = s('w') - (s('fo') - s('ab'))
    if (Math.abs(vlevo - vpravo) > 0.02) bad.push(c.name)
  }
  return bad
})
check('Přesčas − Schází = Odpracováno − (Fond − Nepřítomnost) u každého střediska',
  ident.length ? 'nesedí: ' + ident.join(', ') : 'sedí', 'sedí')

console.log('\nSekce Týdny:')
await page.click('#nav button[data-section="weeks"]')
await page.waitForSelector('#panel-weeks .kpi')
const ui = await page.evaluate(() => ({
  hero: document.querySelector('#panel-weeks .kpi.hero .value').textContent.trim(),
  zdroj: /Přehledového výkazu docházky/.test(document.querySelector('#panel-weeks p.hint').textContent),
  hlavicky: [...document.querySelectorAll('#panel-weeks table')][0]
    ? [...document.querySelectorAll('#panel-weeks table th')].map((t) => t.textContent.trim()).join('|') : '',
  mezd: /Do MEZD/.test(document.querySelector('#panel-weeks').textContent),
}))
check('hlavní číslo je přesčas', ui.hero, '9:30')
check('je vidět, ze které sestavy čísla jsou', ui.zdroj ? 'ano' : 'ne', 'ano')
check('tabulka ukazuje odpracováno, fond i nepřítomnost',
  ['Odpracováno', 'Fond', 'Nepřítomnost', 'Schází'].every((h) => ui.hlavicky.includes(h))
    ? 'ano' : 'ne: ' + ui.hlavicky, 'ano')
check('o mzdových složkách docházka nemluví', ui.mezd ? 'mluví' : 'ne', 'ne')

console.log('\nMěsíc v tomhle formátu:')
await page.click('#nav button[data-section="import"]')
await page.setInputFiles('#file', [join(ROOT, 'tests', 'fixtures', 'dochazka-mesic.xls')])
await page.waitForSelector('#log .log-item.err', { timeout: 20000 })
const err = await page.textContent('#log .log-item.err')
check('panel ho odmítne', /jen za jeden týden/.test(err) ? 'ano' : 'ne: ' + err.trim(), 'ano')
check('a pošle pro Součtový výkaz', /Součtového výkazu/.test(err) ? 'ano' : 'ne', 'ano')

console.log('\nSoučtový výkaz tím netrpí:')
await page.setInputFiles('#file', [join(ROOT, 'tests', 'fixtures', 'souctovy-vykaz-2026-09.xls')])
await page.waitForTimeout(2500)
const spolu = await page.evaluate(() => ({
  mesicu: window.PP.data.keys().length,
  tydnu: window.PP.data.weekKeys().length,
  zari: Math.round(window.PP.stats(window.PP.data.month('2026-09')).total * 100) / 100,
  tyden: Math.round(window.PP.stats(window.PP.data.week('2026-W42')).total * 100) / 100,
}))
check('měsíc se načetl vedle týdne', spolu.mesicu, 1)
check('týden zůstal', spolu.tydnu, 1)
check('měsíční čísla beze změny', spolu.zari, 140.33)
check('týdenní čísla beze změny', spolu.tyden, 9.5)
check('pořád bez chyb', errs.length ? errs[0] : 'ano', 'ano')

await browser.close()
if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
