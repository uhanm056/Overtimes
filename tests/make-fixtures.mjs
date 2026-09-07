#!/usr/bin/env node
/* Vytvoří vzorové Součtové výkazy pro test parseru.
   Napodobuje výstup mzdového systému: přípona .xls, uvnitř HTML tabulka
   v kódování windows-1250, hodiny ve tvaru h:mm. */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const PEOPLE = [
  { n: 'Zeman Karel',          o: 20101, s: 'G210 Výroba A',   m: '18:30', e: '4:15',   r: '96:45' },
  { n: 'Nováková Petra, Ing.', o: 20102, s: 'G410 Quality',    m: '41:00', e: '-6:30',  r: '188:20' },
  { n: 'Bláha Tomáš',          o: 20103, s: 'G420 Warehouse',  m: '27:45', e: '33:20',  r: '265:10' },
  { n: 'Šimek Ivan',           o: 20104, s: 'G463 Prefix',     m: '30:00', e: '-30:00', r: '212:00' },
  { n: 'Horáková Jana, Bc.',   o: 20105, s: 'G310 Údržba',     m: '12:20', e: '9:40',   r: '77:05' },
]

/* Řádek bez přesčasové složky — musí se přeskočit, ale člověk se počítá do stavu. */
const NOISE = { n: 'Malý Pavel', o: 20106, s: 'G610 HR', c: 'Dovolená', h: '160:00' }

function htmlReport() {
  const rows = []
  for (const p of PEOPLE) {
    rows.push([p.n, p.o, p.s, 'Přesčas do MEZD', p.m])
    rows.push([p.n, p.o, p.s, 'Přesčas evidence', p.e])
    rows.push([p.n, p.o, p.s, 'Přesčas roční součet', p.r])
    rows.push([p.n, p.o, p.s, 'Základní mzda', '168:00'])
  }
  rows.push([NOISE.n, NOISE.o, NOISE.s, NOISE.c, NOISE.h])
  rows.push(['Celkem', '', '', '', '740:00'])

  return `<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1250"></head>
<body>
<table border="0"><tr><td>Sestava: Součtový výkaz mzdových složek</td></tr></table>
<table border="1">
<tr><td colspan="5">Závod Planá</td></tr>
<tr><td colspan="5">Období: 1.9.2026 - 30.9.2026</td></tr>
<tr><td colspan="5">&nbsp;</td></tr>
<tr><th>Příjmení a jméno</th><th>Osobní číslo</th><th>Středisko</th><th>Mzdová složka</th><th>Hodiny</th></tr>
${rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('\n')}
</table>
</body></html>`
}

function csvReport() {
  const lines = ['Součtový výkaz mzdových složek', 'Období: 1.10.2026 - 31.10.2026', '']
  lines.push('Příjmení a jméno;Osobní číslo;Středisko;Mzdová složka;Hodiny')
  for (const p of PEOPLE) {
    // v CSV chodí hodiny jako desetinné číslo s čárkou
    const dec = (hm) => {
      const neg = hm.startsWith('-')
      const [h, m] = hm.replace('-', '').split(':').map(Number)
      return (neg ? '-' : '') + String(h + m / 60).replace('.', ',').slice(0, 7)
    }
    lines.push(`"${p.n}";${p.o};${p.s};Přesčas do MEZD;${dec(p.m)}`)
    lines.push(`"${p.n}";${p.o};${p.s};Přesčas evidence;${dec(p.e)}`)
    lines.push(`"${p.n}";${p.o};${p.s};Přesčas roční součet;${dec(p.r)}`)
  }
  return lines.join('\r\n')
}

// windows-1250 kvůli otestování fallbacku dekodéru
const CP1250 = new Map()
for (const [ch, byte] of Object.entries({
  'Á': 0xC1, 'á': 0xE1, 'Č': 0xC8, 'č': 0xE8, 'Ď': 0xCF, 'ď': 0xEF, 'É': 0xC9, 'é': 0xE9,
  'Ě': 0xCC, 'ě': 0xEC, 'Í': 0xCD, 'í': 0xED, 'Ň': 0xD2, 'ň': 0xF2, 'Ó': 0xD3, 'ó': 0xF3,
  'Ř': 0xD8, 'ř': 0xF8, 'Š': 0x8A, 'š': 0x9A, 'Ť': 0x8D, 'ť': 0x9D, 'Ú': 0xDA, 'ú': 0xFA,
  'Ů': 0xD9, 'ů': 0xF9, 'Ý': 0xDD, 'ý': 0xFD, 'Ž': 0x8E, 'ž': 0x9E,
})) CP1250.set(ch, byte)

function toCp1250(text) {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = ch.charCodeAt(0)
    out[i] = CP1250.has(ch) ? CP1250.get(ch) : code < 256 ? code : 0x3F
  }
  return out
}

writeFileSync(join(DIR, 'souctovy-vykaz-2026-09.xls'), toCp1250(htmlReport()))
writeFileSync(join(DIR, 'souctovy-vykaz-2026-10.csv'), toCp1250(csvReport()))
console.log('Vzorové výkazy zapsány do tests/fixtures/')
