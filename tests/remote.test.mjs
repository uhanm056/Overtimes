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
  async authState() { return this.user ? { uid: this.user.uid, email: this.user.email, anonymous: false } : null },
  async load() { return this.store },
  async watch(cb) { this.watchers.push(cb); return function () {} },
  async publish(payload) {
    if (!this.user) { const e = new Error('nepřihlášen'); e.code = 'auth/permission-denied'; throw e }
    // Firebase na undefined zápis odmítne; ať to test pozná stejně.
    var bad = []
    ;(function walk(v, path) {
      if (v === undefined) { bad.push(path); return }
      if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { walk(v[k], path + '.' + k) })
    })(payload, '')
    if (bad.length) throw new Error('undefined v ' + bad.slice(0, 3).join(', '))
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

/* ---------- kontrola spojení ----------
   Když uživatel napíše „nefunguje to“, musí panel sám říct kde. */
await page.click('#pub-diag')
await page.waitForSelector('.pub-diag li')
const diagAnon = await page.$$eval('.pub-diag li', (li) =>
  li.map((x) => (x.classList.contains('ok') ? 'ok' : 'ERR') + ' ' + x.querySelector('strong').textContent))

console.log('Kontrola spojení bez přihlášení:')
check('zkontroluje konfiguraci', diagAnon[0], 'ok Konfigurace databáze')
check('zkontroluje spojení', diagAnon[1], 'ok Spojení a anonymní přihlášení')
check('zkontroluje čtení', diagAnon[2], 'ok Čtení zveřejněných dat')
check('a najde, že chybí přihlášení k zápisu', diagAnon[3], 'ERR Přihlášení k zápisu')

console.log('\nBez přihlášení:')
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
// po přihlášení musí kontrola projít celá a ukázat UID, které patří do pravidel
await page.click('#pub-diag')
await page.waitForSelector('.pub-diag li.ok:nth-child(4)', { timeout: 10000 })
const diagAdmin = await page.$$eval('.pub-diag li', (li) =>
  li.map((x) => (x.classList.contains('ok') ? 'ok' : 'ERR') + ' ' + x.textContent.replace(/\s+/g, ' ').trim()))
console.log('\nKontrola spojení po přihlášení:')
check('projde celá', diagAdmin.filter((x) => x.startsWith('ERR')).length, 0)
check('ukáže účet i UID', /sef@zavod\.cz · UID u1/.test(diagAdmin[3]) ? 'ano' : 'ne: ' + diagAdmin[3], 'ano')

await page.click('#pub-live')
// čekat na kterýkoli výsledek, ať se u chyby nečeká zbytečně do timeoutu
await page.waitForSelector('.pub-ok, .pub-err', { timeout: 15000 })
const chyba = await page.$('.pub-err')
if (chyba) {
  console.error(' FAIL  publikování selhalo: ' + (await chyba.textContent()).trim())
  fails.push('publikování selhalo')
}

const odeslano = await page.evaluate(() => window.PP_REMOTE_ADAPTER.store)
if (!odeslano) {
  console.error('\nBez zapsaných dat nemá smysl pokračovat.')
  await browser.close(); server.close(); process.exit(1)
}
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
// Adaptér napodobuje Firebase a na undefined zápis odmítne; kdyby se do
// agregátů nějaké dostalo (třeba `demo` u neukázkových měsíců), spadlo by to
// už výš a místo .pub-ok by tu byla chybová hláška.
check('publikování neskončilo chybou', chyba ? 'skončilo' : 'ne', 'ne')
// ukázkové měsíce se nepublikují, odejde jen naimportovaný výkaz
check('odeslaly se jen skutečné měsíce', Object.keys(odeslano.months).join(','), '2026-09')
check('ukázkové se vynechaly', await page.evaluate(
  () => window.PP.data.keys().filter((k) => window.PP.data.month(k).demo).length) > 0 ? 'ano' : 'ne', 'ano')
// Do MEZD + druhá složka musí dávat Celkem, jinak si tabulka odporuje
const nesedi = Object.entries(odeslano.months).filter(([, m]) =>
  Math.abs(m.summary.mezdy + m.summary.evidence - m.summary.total) > 0.02)
check('Do MEZD + zbytek dává Celkem', nesedi.length ? nesedi[0][0] : 0, 0)
const stredNesedi = Object.values(odeslano.months).flatMap((m) =>
  m.summary.centers.filter((c) => Math.abs(c.m + c.e - c.total) > 0.02).map((c) => c.name))
check('a sedí to i po střediscích', stredNesedi.length ? stredNesedi[0] : 0, 0)

check('souhrny sedí na to, co spočítá PP.publicMonths', await page.evaluate((sent) => {
  const months = {}
  for (const k of window.PP.data.keys()) {
    const r = window.PP.data.month(k)
    if (!r.demo) months[k] = r
  }
  return JSON.stringify(window.PP.publicMonths(months, window.PP.CFG).months) === JSON.stringify(sent)
}, odeslano.months) ? 'ano' : 'ne', 'ano')

await page.click('#pub-logout')
await page.waitForSelector('#pub-login')
/* Po publikování musí karta říct, co je na webu — a hlavně se ozvat, až to
   kolegům zestárne. Právě tahle informace v panelu chyběla. */
await page.waitForSelector('.pub-state')
const stavPo = (await page.textContent('.pub-state')).replace(/\s+/g, ' ').trim()
console.log('\nStav zveřejnění:')
check('karta říká, co je na webu', /^Na webu je 1 měsíc, zveřejněno/.test(stavPo) ? 'ano' : 'ne: ' + stavPo, 'ano')
check('a nehlásí zastarání hned po publikování',
  /starší čísla/.test(stavPo) ? 'hlásí' : 'ne', 'ne')

// nový import = kolegové vidí starší čísla
await page.evaluate(() => {
  const k = window.PP.data.keys()[0]
  window.PP.data.month(k).importedAt = new Date(Date.now() + 60000).toISOString()
})
await page.click('#nav button[data-section="overview"]')
await page.click('#nav button[data-section="import"]')
await page.waitForSelector('.pub-state.warn')
check('po novém importu upozorní',
  /Od té doby jste importoval/.test(await page.textContent('.pub-state.warn')) ? 'ano' : 'ne', 'ano')

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
  ukazka: window.PP.data.keys().filter((k) => window.PP.data.month(k).demo).join(','),
  zapecenych: Object.keys(window.PP_BUILTIN_MONTHS || {}).length,
}))
console.log('\nVeřejná stránka:')
check('hlásí, odkud jsou data', /^Aktuální data z \d+\. \d+\. \d{4} v \d\d:\d\d\.$/.test(stav.note) ? 'ano' : 'ne: ' + stav.note, 'ano')
check('září přišlo z webu', stav.mesice.includes('2026-09') ? 'ano' : 'ne', 'ano')
check('měsíc z webu přebil vestavěný', stav.zdroje.includes('remote') ? 'ano' : 'ne', 'ano')
check('souhrn září sedí', stav.zari, odeslano.months['2026-09'].summary.total)
check('řádky s lidmi tam nejsou', stav.lidi ? 'jsou' : 'ne', 'ne')
/* Zapečený vzorek je jen záloha pro výpadek databáze. Kdyby se s živými daty
   smíchal, viděli by kolegové vedle skutečných měsíců i vymyšlené. */
check('v souboru vzorek opravdu je (kontrola dává smysl)', stav.zapecenych > 0 ? 'ano' : 'ne', 'ano')
check('žádný ukázkový měsíc se nezobrazuje', stav.ukazka || 'žádný', 'žádný')
check('zobrazují se jen měsíce z webu', stav.zdroje, 'remote')
check('a jen ty, co v databázi jsou', stav.mesice, Object.keys(odeslano.months).join(','))

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
