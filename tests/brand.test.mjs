#!/usr/bin/env node
/* Test firemní barvy.
 *
 * Celý vzhled visí na jednom tokenu --brand. Tenhle test hlídá, že to
 * tak opravdu je — že se změnou barvy přebarví rail, navigace i chipy,
 * že volba přežije zavření souboru a že se na ní naopak NEveze
 * semaforová barva: oranžová a červená musí zůstat oranžová a červená,
 * ať je firemní barva jakákoli.
 *
 * Spuštění: node tests/brand.test.mjs
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
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

/* Starší prohlížeč color-mix() zahodí. Každá taková deklarace proto musí mít
   těsně před sebou tutéž vlastnost zapsanou natvrdo, jinak by v takovém
   prohlížeči token úplně zmizel a panel by zůstal bez barev. */
const css = await readFile(join(ROOT, 'styles.css'), 'utf8')
const deklarace = css.split('\n').map((l) => l.trim())
const bezZalohy = []
deklarace.forEach((line, i) => {
  const m = /^(--[\w-]+)\s*:\s*color-mix\(/.exec(line)
  if (!m) return
  const predchozi = deklarace[i - 1] || ''
  if (!predchozi.startsWith(m[1] + ':')) bezZalohy.push(m[1])
})
console.log('Stylopis:')
check('každý color-mix má natvrdo zapsanou zálohu',
  bezZalohy.length ? 'chybí u ' + bezZalohy.join(', ') : 'ano', 'ano')
check('je co kontrolovat', /color-mix\(/.test(css) ? 'ano' : 'ne', 'ano')
check('firemní barva je na jednom místě',
  (css.match(/^\s*--brand:\s*#/gm) || []).length, 1)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('file://' + FILE, { waitUntil: 'load' })
await page.waitForSelector('#nav button')

const stav = () => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  const barva = (sel, prop) => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el)[prop] : null
  }
  return {
    brand: cs.getPropertyValue('--brand').trim(),
    nav: barva('#nav button[aria-current=true]', 'backgroundColor'),
    znacka: barva('.brand-mark', 'backgroundImage'),
    crit: cs.getPropertyValue('--crit').trim(),
    warn: cs.getPropertyValue('--warn').trim(),
    good: cs.getPropertyValue('--good').trim(),
  }
})

const pred = await stav()
console.log('\nVýchozí:')
check('běží bez chyb', errs.length ? errs[0] : 'ano', 'ano')
check('výchozí barva', pred.brand, '#0f9e91')
check('navigace ji nese', pred.nav, 'rgb(15, 158, 145)')

await page.evaluate(() => {
  const i = document.querySelector('#brand-color')
  i.value = '#c8102e'
  i.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(150)
const po = await stav()
console.log('\nPo změně na #c8102e:')
check('token se změnil', po.brand, '#c8102e')
check('navigace se přebarvila', po.nav, 'rgb(200, 16, 46)')
check('značka taky', po.znacka !== pred.znacka ? 'ano' : 'ne', 'ano')
check('semafor se nehnul: červená', po.crit, pred.crit)
check('semafor se nehnul: oranžová', po.warn, pred.warn)
check('semafor se nehnul: zelená', po.good, pred.good)

await page.reload({ waitUntil: 'load' })
await page.waitForSelector('#nav button')
console.log('\nPo znovuotevření:')
check('volba se pamatuje', (await stav()).brand, '#c8102e')
check('a je vidět i v políčku', await page.inputValue('#brand-color'), '#c8102e')

await page.click('#brand-reset')
await page.waitForTimeout(150)
console.log('\nPo resetu:')
const zpet = await stav()
check('vrátí se výchozí', zpet.brand, '#0f9e91')
check('navigace taky', zpet.nav, pred.nav)
check('pořád bez chyb', errs.length ? errs[0] : 'ano', 'ano')

/* Logo se vkládá do .brand-mark; s vloženou grafikou má barevná dlaždice
   ustoupit, aby pod cizí značkou nesvítil čtvereček. */
console.log('\nMísto pro logo:')
const logo = await page.evaluate(() => {
  const el = document.querySelector('.brand-mark')
  const pred = getComputedStyle(el).backgroundImage
  el.innerHTML = '<svg viewBox="0 0 100 20" width="100" height="20"><rect width="100" height="20"/></svg>'
  const po = getComputedStyle(el)
  return { pred, po: po.backgroundImage, radius: po.borderTopLeftRadius }
})
check('bez loga je tam barevná dlaždice', logo.pred !== 'none' ? 'ano' : 'ne', 'ano')
check('s logem dlaždice zmizí', logo.po, 'none')
check('a zaoblení taky', logo.radius, '0px')

await browser.close()
if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
