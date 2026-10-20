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
    /* Výkaz tiskne i přesčasové složky, které se nesmí přičíst: „zaplatit“ je
       tatáž hodnota jako do MEZD pod jiným názvem, „přenesený“ je zůstatek
       z minulého měsíce. Jsou tu proto, aby se hlídalo, že je parser nesečte. */
    rows.push([p.n, p.o, p.s, 'Přesčas zaplatit', p.m])
    rows.push([p.n, p.o, p.s, 'Přesčas přenesený', '63:01'])
    rows.push([p.n, p.o, p.s, 'Základní mzda', '168:00'])
    // mezisoučet nadepsaný jménem, ale bez osobního čísla — nesmí se počítat
    // jako další osoba ani jako přesčasová složka
    rows.push([p.n, '', '', 'Celkem za osobu', '168:00'])
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

/* Varianta, kde se jméno, osobní číslo a středisko tisknou jen na prvním řádku
   skupiny — běžné rozvržení sestav z mezd. Navazující řádky musí identitu zdědit,
   jinak se ztratí evidence i roční součet. */
function mergedReport() {
  const rows = []
  for (const p of PEOPLE) {
    rows.push([p.n, p.o, p.s, 'Přesčas do MEZD', p.m])
    rows.push(['', '', '', 'Přesčas evidence', p.e])
    rows.push(['', '', '', 'Přesčas roční součet', p.r])
    rows.push(['', '', '', 'Základní mzda', '168:00'])
    // past: mezisoučet pojmenovaný jako přesčasová složka. Kdyby se započetl,
    // měl by člověk hodiny dvakrát — přesně tak vznikne nesmyslně vysoký měsíc.
    rows.push(['', '', '', 'Celkem přesčas do MEZD', p.m])
  }
  rows.push([NOISE.n, NOISE.o, NOISE.s, NOISE.c, NOISE.h])
  rows.push(['Celkem', '', '', '', '740:00'])

  return `<html><head><meta charset="utf-8"></head><body>
<table>
<tr><td colspan="5">Období: 1.11.2026 - 30.11.2026</td></tr>
<tr><th>Příjmení a jméno</th><th>Osobní číslo</th><th>Středisko</th><th>Mzdová složka</th><th>Hodiny</th></tr>
${rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('\n')}
</table></body></html>`
}

/* ---------- Přehledový výkaz docházky ----------
   Druhá sestava, druhá metodika. Formát je svérázný a právě ten se testuje:
   hodnoty nejsou v textu buňky, ale v atributu x:num jako podíl dne
   (1.5625 = 37,5 h), a kolik je to hodin, říká formát čísla ve stylopisu.
   Hlavička má nad každou dvojicí sloupců colspan="2".

   Lidé jsou vymyšlení, ale každý zachycuje jednu past: */
const DOCHAZKA = [
  // běžný přesčas — fond 37,5, odpracováno 44
  { p: 'Dvořák', j: 'Michal', t: 'TL', o: 30201, s: 'Lisovna', w: 44, f: 37.5 },
  // celý týden dovolené: holý rozdíl by ukázal −37,5 h „přesčasu“
  { p: 'Marková', j: 'Lenka', t: '', o: 30202, s: 'Lisovna', w: 0, f: 37.5, dov: 37.5 },
  // tři dny nemoc, dva dny odpracoval přes fond → přesčas mu vzniknout má
  { p: 'Kříž', j: 'Ondřej', t: 'operátor', o: 30203, s: 'Montáž', w: 18, f: 37.5, nem: 15 },
  // odešel dřív a nikde to není vykázané → není to přesčas, ale schází do fondu
  { p: 'Horák', j: 'Pavel', t: '', o: 30204, s: 'Montáž', w: 31, f: 37.5 },
  // služební cesta celý týden — je už uvnitř odpracováno, nesmí se přičíst
  { p: 'Benešová', j: 'Klára', t: 'ME', o: 30205, s: 'Engineering', w: 40, f: 40, sc: 40 },
  // zkrácený úvazek: fond 20 h, odpracoval 23
  { p: 'Urban', j: 'Josef', t: '', o: 30206, s: 'Engineering', w: 23, f: 20 },
]

const DOCH_COLS = [
  ['Celkem odpracováno', 'w'], ['Fond', 'f'], ['Rozdíl', null],
  ['Služební cesta', 'sc'], ['Přestávka', 'pre'], ['Lékař', 'lek'],
  ['Dovolená', 'dov'], ['Nemoc', 'nem'],
]

function dochazkaReport() {
  // hodiny → podíl dne, jak to píše generátor sestavy
  const tv = (h) => (h == null ? '' : String(h / 24))
  const cell = (h) => `<td class="d5TV" x:num="${tv(h)}"/><td class="d6" x:num=""/>`
  const body = []
  let stred = null
  const soucet = {}
  const flush = () => {
    if (!stred) return
    body.push('<TR class="hsums"><TD colspan="4" class="d1">Součet za středisko:</TD>' +
      `<TD class="d3">${stred}</TD><TD></TD>` +
      DOCH_COLS.map(([, k]) => cell(k ? soucet[k] || 0 : 0)).join('') + '</TR>')
    for (const k of Object.keys(soucet)) delete soucet[k]
  }
  for (const r of DOCHAZKA) {
    if (r.s !== stred) { flush(); stred = r.s }
    body.push('<tr>' +
      `<td class="d1">${r.p}</td><td class="d1">${r.j}</td><td class="d1">${r.t}</td>` +
      `<td class="d2">${r.o}</td><td class="d3">${r.s}</td><td class="d4" x:str=""/>` +
      DOCH_COLS.map(([, k]) => cell(k ? r[k] : null)).join('') + '</tr>')
    for (const [, k] of DOCH_COLS) if (k && r[k]) soucet[k] = (soucet[k] || 0) + r[k]
  }
  flush()

  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style><!--
.d5, .d5TV { border-left:0.5pt solid black; }
.d5TV, .s5TV { mso-number-format:"\\[h\\]\\:mm\\;\\[Red\\]\\\\-\\[h\\]\\:mm\\;\\;"; }
--></style></head>
<body>
<table>
<tr><td class="repname">07 Přehledový výkaz na šířku</td><td class="created">Vytvořeno: 20.10.2026 10:31:49</td></tr>
<tr><td>Období: 12.10.2026 - 18.10.2026</td></tr>
<tr class="z1"><td class="h1">Příjmení</td><td class="h1">Jméno</td><td class="h1">Titul</td>
<td class="h2">Osobní číslo</td><td class="h3">Středisko</td><td class="h4">Poznámka2</td>
${DOCH_COLS.map(([l]) => `<td colspan="2" class="h5">${l}</td>`).join('')}</tr>
${body.join('\n')}
</table></body></html>`
}

/* Tentýž formát, ale za celý měsíc — panel ho musí odmítnout a poslat
   uživatele pro Součtový výkaz. */
function dochazkaMesic() {
  return dochazkaReport().replace('Období: 12.10.2026 - 18.10.2026', 'Období: 1.10.2026 - 31.10.2026')
}

writeFileSync(join(DIR, 'dochazka-2026-W42.xls'), Buffer.from(dochazkaReport(), 'utf8'))
writeFileSync(join(DIR, 'dochazka-mesic.xls'), Buffer.from(dochazkaMesic(), 'utf8'))
writeFileSync(join(DIR, 'souctovy-vykaz-2026-09.xls'), toCp1250(htmlReport()))
writeFileSync(join(DIR, 'souctovy-vykaz-2026-11-slouceny.xls'), Buffer.from(mergedReport(), 'utf8'))
writeFileSync(join(DIR, 'souctovy-vykaz-2026-10.csv'), toCp1250(csvReport()))
console.log('Vzorové výkazy zapsány do tests/fixtures/')
