#!/usr/bin/env node
/**
 * Postaví VEŘEJNÉ vydání panelu do docs/ pro GitHub Pages.
 *
 * Z výkazů se spočítají jen souhrny za střediska. Jména, osobní čísla ani
 * hodiny jednotlivců se do výstupu nedostanou — v souboru prostě nejsou,
 * takže je z něj nejde získat ani zobrazením zdroje.
 *
 * Střediska pod pěti lidmi se slučují do „Ostatní“. U tříčlenného střediska
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
  // panel se distribuuje bez dat, vzorek leží u testů
  const fixture = join(ROOT, 'tests', 'fixtures', 'demo-months.js')
  if (!existsSync(fixture)) {
    console.error('Chybí ' + fixture + ' — spusťte: node tools/generate-demo-data.mjs')
    await browser.close(); server.close(); process.exit(1)
  }
  const sandbox = {}
  new Function('window', await readFile(fixture, 'utf8'))(sandbox)
  Object.assign(months, sandbox.PP_BUILTIN_MONTHS || {})
  console.log(`Vstup: ukázková data (${Object.keys(months).length} měsíců)`)
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

/* ---------- agregace ----------
   Počítá js/public.js, tedy přesně tentýž kód, jaký použije panel, když si
   veřejnou verzi vygeneruje sám. Dvě implementace by se dřív nebo později
   rozešly a nikdo by nevěděl, která z nich platí. */
const agg = await page.evaluate((m) => {
  const r = window.PP.publicMonths(m, window.PP.CFG)
  return { months: r.months, suppressed: r.suppressed, log: r.log }
}, months)

const publicMonths = agg.months
const suppressedTotal = agg.suppressed
for (const line of agg.log) console.log('  ' + line)

/* ---------- pojistka: ve výstupu nesmí být nic jmenného ---------- */
const serialized = JSON.stringify(publicMonths)
const leaked = await page.evaluate(
  ([text, m]) => window.PP.publicLeaks(text, m), [serialized, months])
if (leaked.length) {
  console.error(`✕ Ve výstupu se objevilo ${leaked.length} jmen nebo osobních čísel: ${leaked.slice(0, 3).join(', ')}`)
  console.error('  Nic se nezapsalo.')
  await browser.close(); server.close()
  process.exit(1)
}

await browser.close()
server.close()

/* ---------- zápis ---------- */
let html = await readFile(join(ROOT, 'index.html'), 'utf8')
const safe = (code) => code.replace(/<\/(script)/gi, '<\\/$1')

const inline = (p) => readFileSync(join(ROOT, p), 'utf8').trimEnd()

html = html.replace(
  /[ \t]*<link rel="stylesheet" href="styles\.css">\n?/,
  () => '<style>\n' + inline('styles.css') + '\n</style>\n'
)

const scripts = []
html = html.replace(/[ \t]*<script(?: id="([\w-]+)")? src="([^"]+)"><\/script>\n?/g, (_, id, src) => {
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
