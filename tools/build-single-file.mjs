#!/usr/bin/env node
/**
 * Slepí panel do jednoho samostatného HTML souboru.
 *
 * Rozdělení na index.html + styles.css + js/* je dobré pro práci v kódu,
 * ale k rozeslání se hodí jeden soubor: stáhnout, dvojklik, jede — žádná
 * složka, ze které nesmí nic vypadnout.
 *
 * Pořadí skriptů se bere přímo z index.html, takže se nemůže rozejít.
 *
 * Spuštění:  node tools/build-single-file.mjs [výstup.html]
 * Výchozí:   dist/prescasovy-panel-plana.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] || join(ROOT, 'dist', 'prescasovy-panel-plana.html'))

let html = readFileSync(join(ROOT, 'index.html'), 'utf8')

/* Uvnitř <script> nesmí zůstat literál "</script>" — rozsekl by tag.
   V kódu i v datech se může objevit (parser pracuje s HTML výkazy). */
const safe = (code) => code.replace(/<\/(script)/gi, '<\\/$1')

// styly
html = html.replace(
  /[ \t]*<link rel="stylesheet" href="styles\.css">\n?/,
  () => '<style>\n' + readFileSync(join(ROOT, 'styles.css'), 'utf8').trimEnd() + '\n</style>\n'
)

// skripty v pořadí, v jakém je uvádí index.html
const scripts = []
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
  scripts.push(src)
  return `\n<!-- ${src} -->\n<script>\n` +
    safe(readFileSync(join(ROOT, src), 'utf8').trimEnd()) + '\n</script>\n'
})

if (!scripts.length) throw new Error('V index.html nejsou žádné <script src>, něco se rozešlo.')

// razítko, ať je poznat, z čeho soubor vznikl
html = html.replace('</head>', `<meta name="generator" content="build-single-file.mjs · ${new Date().toISOString().slice(0, 10)}">\n</head>`)

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html, 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)
console.log(`→ ${out} (${kb} KiB)`)
console.log(`   vloženo: styles.css + ${scripts.length} skriptů (${scripts.join(', ')})`)
