#!/usr/bin/env node
/* Test živého sdílení souhrnů.
 *
 * Firebase se v testu nevolá — místo něj se podstrčí window.PP_REMOTE_ADAPTER,
 * který si zápisy pamatuje v paměti. Ověřuje se to, co je na celé věci
 * riskantní: že do databáze odejdou výhradně agregáty, že se bez přihlášení
 * nepublikuje a že veřejná stránka to, co přišlo z webu, opravdu zobrazí.
 *
 * Spuštění: node tests/remote.test.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
await new Promise((r) => server.listen(8140, r))

const fails = []
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${actual}${ok ? '' : ` (čekáno ${expected})`}`)
  if (!ok) fails.push(name)
}

/* Náhrada Firebase: pamatuje si zápis, hlídá přihlášení, umí živou změnu. */
const ADAPTER = `
window.PP_REMOTE_ADAPTER = {
  name: 'test',
  store: null,
  user: null,
  watchers: [],
  configured() { return true },
  async connect() { return true },
  async signIn(email, password) {
    if (email !== 'sef@zavod.cz' || password !== 'tajne') {
      const e = new Error('špatné heslo'); e.code = 'auth/invalid-credential'; throw e
    }
    this.user = { email: email, uid: 'u1' }
    return this.user
  },
  async signOut() { this.user = null },
  async currentUser() { return this.user },
  async load() { return this.store },
  async watch(cb) { this.watchers.push(cb); return function () {} },
  async publish(payload) {
    if (!this.user) { const e = new Error('nepřihlášen'); e.code = 'auth/permission-denied'; throw e }
    this.store = payload
    this.watchers.forEach(function (cb) { cb(payload) })
  },
}`

const browser = await chromium.launch()

/* ---------- panel: přihlášení a publikování ---------- */
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message))
await page.addInitScript(ADAPTER)
await page.goto('http://localhost:8140/#import', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')
await page.setInputFiles('#file', [join(FIX, 'souctovy-vykaz-2026-09.xls')])
await page.waitForSelector('#log .log-item.ok')

console.log('Bez přihlášení:')
check('tlačítko Publikovat není', await page.$$eval('#pub-live', (e) => e.length), 0)
check('nabízí se přihlášení', await page.$$eval('#pub-login', (e) => e.length), 1)
check('v databázi nic není', await page.evaluate(() => window.PP_REMOTE_ADAPTER.store), 'null')

await page.fill('#pub-email', 'sef@zavod.cz')
await page.fill('#pub-pass', 'spatne')
await page.click('#pub-login button[type=submit]')
await page.waitForSelector('.pub-err')
console.log('\nŠpatné heslo:')
check('hláška je čitelná', (await page.textContent('.pub-err')).trim(), 'Nesprávný e-mail nebo heslo.')
check('pořád se nepublikovalo', await page.evaluate(() => window.PP_REMOTE_ADAPTER.store), 'null')

await page.fill('#pub-email', 'sef@zavod.cz')
await page.fill('#pub-pass', 'tajne')
await page.click('#pub-login button[type=submit]')
await page.waitForSelector('#pub-live')
await page.click('#pub-live')
await page.waitForSelector('.pub-ok')

const odeslano = await page.evaluate(() => window.PP_REMOTE_ADAPTER.store)
const jmena = await page.evaluate(() => {
  const o = []
  for (const k of window.PP.data.keys()) for (const r of window.PP.data.month(k).rows || []) o.push(r.n, String(r.o))
  return [...new Set(o)].filter(Boolean)
})
const text = JSON.stringify(odeslano)

console.log('\nPo publikování:')
check('něco se odeslalo', odeslano ? 'ano' : 'ne', 'ano')
check('zdroj má co prozradit (kontrola dává smysl)', jmena.length > 5 ? 'ano' : 'ne', 'ano')
check('jmen a osobních čísel v odeslaných datech', jmena.filter((n) => text.includes(n)).length, 0)
check('žádný měsíc nemá řádky s lidmi',
  Object.values(odeslano.months).some((m) => m.rows) ? 'má' : 'nemá', 'nemá')
check('každý měsíc je označený jako agregát',
  Object.values(odeslano.months).every((m) => m.aggregate === true) ? 'ano' : 'ne', 'ano')
check('nese čas zveřejnění', /^\d{4}-\d{2}-\d{2}T/.test(odeslano.updatedAt || '') ? 'ano' : 'ne', 'ano')
check('odeslalo se tolik měsíců, kolik jich panel má',
  Object.keys(odeslano.months).length, await page.evaluate(() => window.PP.data.keys().length))
check('souhrny sedí na to, co spočítá PP.publicMonths', await page.evaluate((sent) => {
  const months = {}
  for (const k of window.PP.data.keys()) months[k] = window.PP.data.month(k)
  return JSON.stringify(window.PP.publicMonths(months, window.PP.CFG).months) === JSON.stringify(sent)
}, odeslano.months) ? 'ano' : 'ne', 'ano')

await page.click('#pub-logout')
await page.waitForSelector('#pub-login')
console.log('\nPo odhlášení:')
check('zase se nedá publikovat', await page.$$eval('#pub-live', (e) => e.length), 0)

/* ---------- veřejná stránka: čte živá data ---------- */
const verejna = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
verejna.on('pageerror', (e) => fails.push('pageerror(veřejná): ' + e.message))
await verejna.addInitScript(ADAPTER + `
window.PP_PUBLIC = true
window.PP_REMOTE_ADAPTER.store = ${JSON.stringify(odeslano)}
`)
await verejna.goto('http://localhost:8140/', { waitUntil: 'domcontentloaded' })
await verejna.waitForSelector('#remote-note:not([hidden])', { timeout: 10000 })

const stav = await verejna.evaluate(() => ({
  note: document.querySelector('#remote-note').textContent.trim(),
  mesice: window.PP.data.keys().join(','),
  zdroje: [...new Set(window.PP.data.keys().map((k) => window.PP.data.month(k).source))].join(','),
  zari: window.PP.data.month('2026-09') ? window.PP.data.month('2026-09').summary.total : null,
  lidi: window.PP.data.keys().some((k) => (window.PP.data.month(k).rows || []).length > 0),
}))
console.log('\nVeřejná stránka:')
check('hlásí, odkud jsou data', /^Aktuální data z \d+\. \d+\. \d{4} v \d\d:\d\d\.$/.test(stav.note) ? 'ano' : 'ne: ' + stav.note, 'ano')
check('září přišlo z webu', stav.mesice.includes('2026-09') ? 'ano' : 'ne', 'ano')
check('měsíc z webu přebil vestavěný', stav.zdroje.includes('remote') ? 'ano' : 'ne', 'ano')
check('souhrn září sedí', stav.zari, odeslano.months['2026-09'].summary.total)
check('řádky s lidmi tam nejsou', stav.lidi ? 'jsou' : 'ne', 'ne')

/* živá změna bez reloadu */
await verejna.evaluate(() => {
  const s = JSON.parse(JSON.stringify(window.PP_REMOTE_ADAPTER.store))
  s.months['2026-09'].summary.total = 999
  s.updatedAt = new Date().toISOString()
  window.PP_REMOTE_ADAPTER.store = s
  window.PP_REMOTE_ADAPTER.watchers.forEach((cb) => cb(s))
})
await verejna.waitForFunction(() => window.PP.data.month('2026-09').summary.total === 999, null, { timeout: 5000 })
check('změna v databázi se projeví bez načtení stránky',
  await verejna.evaluate(() => window.PP.data.month('2026-09').summary.total), 999)

/* ---------- výpadek spojení ---------- */
const offline = await browser.newPage()
offline.on('pageerror', (e) => fails.push('pageerror(offline): ' + e.message))
await offline.addInitScript(`
window.PP_PUBLIC = true
window.PP_REMOTE_ADAPTER = {
  name: 'rozbitý', configured() { return true },
  async connect() { throw new Error('síť mimo') },
  async load() { throw new Error('síť mimo') },
  async watch() { throw new Error('síť mimo') },
  async signIn() { throw new Error('síť mimo') },
  async signOut() {}, async currentUser() { return null }, async publish() { throw new Error('síť mimo') },
}`)
await offline.goto('http://localhost:8140/', { waitUntil: 'domcontentloaded' })
await offline.waitForSelector('#remote-note:not([hidden])', { timeout: 10000 })
console.log('\nKdyž je databáze nedostupná:')
check('stránka to řekne', (await offline.textContent('#remote-note')).trim(),
  'Nepodařilo se načíst aktuální data, zobrazena jsou poslední známá.')
check('ale pořád něco ukazuje', await offline.$$eval('#panel-overview .kpi', (e) => e.length) > 0 ? 'ano' : 'ne', 'ano')

await browser.close()
server.close()

if (fails.length) {
  console.error(`\n${fails.length} selhalo: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nVšechny kontroly prošly.')
