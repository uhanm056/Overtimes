#!/usr/bin/env node
/**
 * Postaví VEŘEJNÉ vydání panelu do docs/ pro GitHub Pages.
 *
 * Z výkazů se spočítají jen souhrny za střediska. Jména, osobní čísla ani
 * hodiny jednotlivců se do výstupu nedostanou — v souboru prostě nejsou,
 * takže je z něj nejde získat ani zobrazením zdroje.
 *
 * Střediska pod MIN_PEOPLE se slučují do „Ostatní“. U tříčlenného střediska
 * by průměr na osobu prakticky prozradil přesčasy těch tří lidí, protože
 * každý ví, kdo tam pracuje.
 *
 * Použití:
 *   node tools/build-public.mjs vykaz-07.xls vykaz-08.xls
 *   node tools/build-public.mjs --demo          # z ukázkových dat, na vyzkoušení
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'docs')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

/** Menší středisko se nezveřejňuje samostatně. */
const MIN_PEOPLE = 5

const args = process.argv.slice(2)
const useDemo = args.includes('--demo')
const files = args.filter((a) => !a.startsWith('--')).map((f) => resolve(f))

if (!useDemo && !files.length) {
  console.error('Použití: node tools/build-public.mjs <výkaz…>   nebo   --demo')
  process.exit(1)
}
for (const f of files) {
  if (!existsSync(f)) { console.error('Soubor neexistuje: ' + f); process.exit(1) }
}

const server = createServer(async (req, res) => {
  try {
    let p = join(ROOT, normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''))
    if (p.endsWith('/') || p === ROOT) p = join(p, 'index.html')
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('404') }
})
await new Promise((r) => server.listen(8156, r))

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => { console.error('Chyba v panelu:', e.message); process.exitCode = 1 })
await page.goto('http://localhost:8156/#import', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#drop')
await page.evaluate(() => {
  const input = document.createElement('input')
  input.type = 'file'
  input.id = 'pp-cli-file'
  document.body.appendChild(input)
})

/* ---------- načtení měsíců ---------- */
const months = {}

if (useDemo) {
  const demo = await page.evaluate(() => window.PP_BUILTIN_MONTHS || {})
  Object.assign(months, demo)
  console.log(`Vstup: ukázková data (${Object.keys(demo).length} měsíců)`)
} else {
  for (const file of files) {
    await page.setInputFiles('#pp-cli-file', [file])
    const out = await page.evaluate(async () => {
      const f = document.querySelector('#pp-cli-file').files[0]
      try {
        const r = await window.PP.parseReport(f)
        return { ok: true, key: r.key, kind: r.kind, record: r.record }
      } catch (err) { return { ok: false, error: err.message } }
    })
    if (!out.ok) { console.error(`✕ ${file}: ${out.error}`); process.exitCode = 1; continue }
    months[out.key] = out.record
    console.log(`✓ ${out.key}: ${out.record.rows.length} lidí načteno (${out.kind})`)
  }
}

if (!Object.keys(months).length) {
  console.error('Nic k zpracování.')
  await browser.close(); server.close(); process.exit(1)
}

/* ---------- agregace ---------- */
const CFG = await page.evaluate(() => window.PP.CFG)
await browser.close()
server.close()

const round2 = (v) => Math.round(v * 100) / 100

const HIST = [
  { to: 0, label: '≤ 0' }, { from: 0, to: 10, label: '0–10' },
  { from: 10, to: 20, label: '10–20' }, { from: 20, to: 30, label: '20–30' },
  { from: 30, to: 40, label: '30–40' }, { from: 40, to: 50, label: '40–50' },
  { from: 50, to: 60, label: '50–60' }, { from: 60, to: Infinity, label: '60+' },
]

let suppressedTotal = 0
const publicMonths = {}

for (const key of Object.keys(months).sort()) {
  const rec = months[key]
  const rows = rec.rows || []

  const byCenter = new Map()
  for (const r of rows) {
    let c = byCenter.get(r.s)
    if (!c) { c = { name: r.s, people: 0, total: 0, m: 0, e: 0 }; byCenter.set(r.s, c) }
    c.people++; c.total += r.t; c.m += r.m; c.e += r.e
  }

  // malá střediska sloučit — jinak by průměr prozradil jednotlivce
  const big = []
  const small = { name: 'Ostatní (malá střediska)', people: 0, total: 0, m: 0, e: 0 }
  let smallCount = 0
  for (const c of byCenter.values()) {
    if (c.people >= MIN_PEOPLE) big.push(c)
    else {
      small.people += c.people; small.total += c.total; small.m += c.m; small.e += c.e
      smallCount++
    }
  }
  // Sloučený zbytek by sám mohl být malý — pak se nezveřejní vůbec.
  const centers = big.map((c) => ({
    name: c.name, people: c.people,
    total: round2(c.total), m: round2(c.m), e: round2(c.e),
  }))
  if (small.people >= MIN_PEOPLE) {
    centers.push({
      name: small.name, people: small.people,
      total: round2(small.total), m: round2(small.m), e: round2(small.e),
    })
  } else if (smallCount) {
    suppressedTotal += small.people
  }

  publicMonths[key] = {
    period: rec.period,
    rawPeriod: rec.rawPeriod,
    people: rec.people,
    aggregate: true,
    // ať je i na zveřejněné stránce poznat, že jde o vzorek, ne o závod
    demo: rec.demo || undefined,
    summary: {
      withOvertime: rows.length,
      total: round2(rows.reduce((a, r) => a + r.t, 0)),
      mezdy: round2(rows.reduce((a, r) => a + r.m, 0)),
      evidence: round2(rows.reduce((a, r) => a + r.e, 0)),
      overWarn: rows.filter((r) => r.t >= CFG.person.warn).length,
      overCrit: rows.filter((r) => r.t >= CFG.person.crit).length,
      year150: rows.filter((r) => r.r > CFG.year.warn).length,
      year250: rows.filter((r) => r.r > CFG.year.crit).length,
      yearCap: rows.filter((r) => r.r >= CFG.year.cap).length,
      hist: HIST.map((b) => ({
        label: b.label,
        count: rows.filter((r) => (b.to === 0 ? r.t <= 0 : r.t > b.from && r.t <= b.to)).length,
      })),
      centers,
    },
  }

  const skryto = smallCount ? ` · ${smallCount} malých středisek sloučeno` : ''
  console.log(`  ${key}: ${centers.length} středisek zveřejněno${skryto}`)
}

/* ---------- pojistka: ve výstupu nesmí být nic jmenného ---------- */
const serialized = JSON.stringify(publicMonths)
const names = new Set()
for (const rec of Object.values(months)) {
  for (const r of rec.rows || []) { names.add(String(r.n)); names.add(String(r.o)) }
}
const leaked = [...names].filter((n) => n && serialized.includes(n))
if (leaked.length) {
  console.error(`✕ Ve výstupu se objevilo ${leaked.length} jmen nebo osobních čísel: ${leaked.slice(0, 3).join(', ')}`)
  console.error('  Nic se nezapsalo.')
  process.exit(1)
}

/* ---------- zápis ---------- */
let html = await readFile(join(ROOT, 'index.html'), 'utf8')
const safe = (code) => code.replace(/<\/(script)/gi, '<\\/$1')

const inline = (p) => readFileSync(join(ROOT, p), 'utf8').trimEnd()

html = html.replace(
  /[ \t]*<link rel="stylesheet" href="styles\.css">\n?/,
  () => '<style>\n' + inline('styles.css') + '\n</style>\n'
)

const scripts = []
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
  if (src === 'data/months.js') {
    return '\n<!-- veřejné agregáty -->\n<script>\nwindow.PP_PUBLIC = true;\n' +
      'window.PP_BUILTIN_MONTHS = ' + safe(serialized) + ';\n</script>\n'
  }
  scripts.push(src)
  return `\n<!-- ${src} -->\n<script>\n` + safe(inline(src)) + '\n</script>\n'
})

html = html.replace('</head>',
  `<meta name="robots" content="noindex">\n<meta name="generator" content="build-public.mjs · ${new Date().toISOString().slice(0, 10)}">\n</head>`)

await mkdir(OUT_DIR, { recursive: true })
await writeFile(join(OUT_DIR, 'index.html'), html, 'utf8')
await writeFile(join(OUT_DIR, '.nojekyll'), '', 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)
console.log(`\n→ docs/index.html (${kb} KiB)`)
console.log(`   ${Object.keys(publicMonths).length} měsíců, jen souhrny za střediska`)
if (suppressedTotal) console.log(`   ${suppressedTotal} lidí v příliš malých střediscích se nezveřejnilo vůbec`)
console.log('   kontrola: ve výstupu není žádné jméno ani osobní číslo ✓')
