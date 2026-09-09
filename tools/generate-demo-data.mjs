#!/usr/bin/env node
/**
 * Generuje ukázková (SYNTETICKÁ) data pro Přesčasový panel Planá.
 *
 * Data NEJSOU reálná — jména, osobní čísla i hodiny jsou vygenerované.
 * Slouží k tomu, aby byl panel po naklonování repa hned funkční a šlo
 * ověřit chování UI. Reálné měsíce se přidávají importem Součtového výkazu
 * (sekce „Import výkazu“) nebo skriptem tools/report-to-data.mjs.
 *
 * Spuštění:  node tools/generate-demo-data.mjs
 * Výstup:    data/months.js
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------- deterministický PRNG ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260907)
const gauss = () => {
  let u = 0, v = 0
  while (u === 0) u = rnd()
  while (v === 0) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/* ---------- střediska ---------- */
const CENTERS = [
  { code: 'G100', name: 'Vedení závodu', head: 5, w: 1.2 },
  { code: 'G210', name: 'Výroba A', head: 30, w: 2.2 },
  { code: 'G220', name: 'Výroba B', head: 24, w: 2.0 },
  { code: 'G230', name: 'Výroba C', head: 18, w: 1.9 },
  { code: 'G310', name: 'Údržba', head: 12, w: 3.2 },
  { code: 'G320', name: 'Nástrojárna', head: 8, w: 2.0 },
  { code: 'G410', name: 'Quality', head: 18, w: 2.4 },
  { code: 'G420', name: 'Warehouse', head: 26, w: 2.3 },
  { code: 'G430', name: 'Logistika', head: 9, w: 1.9 },
  { code: 'G463', name: 'Prefix', head: 3, w: 5.0 },
  { code: 'G510', name: 'Technologie', head: 6, w: 1.8 },
  { code: 'G520', name: 'Projekty', head: 5, w: 1.6 },
  { code: 'G610', name: 'HR', head: 4, w: 0.6 },
  { code: 'G620', name: 'Ekonomika', head: 4, w: 0.7 },
  { code: 'G630', name: 'IT', head: 5, w: 2.0 },
  { code: 'G710', name: 'Nákup', head: 5, w: 1.0 },
  { code: 'G720', name: 'Expedice', head: 15, w: 2.4 },
]
const label = (c) => `${c.code} ${c.name}`
const HEAD = CENTERS.reduce((a, c) => a + c.head, 0)

/* ---------- měsíce ---------- */
const MONTHS = {
  '2026-07': {
    period: '1. 7. – 31. 7. 2026',
    rawPeriod: '1.7.2026 - 31.7.2026',
    file: 'Souctovy_vykaz_2026_07.xls',
    importedAt: '2026-08-04T07:12:00.000Z',
    total: 4625, paidShare: 0.63,
    counts: { G100: 4, G210: 28, G220: 22, G230: 16, G310: 11, G320: 7, G410: 17, G420: 24, G430: 8, G463: 3, G510: 5, G520: 4, G610: 4, G620: 4, G630: 5, G710: 5, G720: 15 },
    pinned: { G463: 146.95, G410: 640, G420: 590, G210: 600 },
    zeroed: 3,
  },
  '2026-08': {
    period: '1. 8. – 31. 8. 2026',
    rawPeriod: '1.8.2026 - 31.8.2026',
    file: 'Souctovy_vykaz_2026_08.xls',
    importedAt: '2026-09-03T06:48:00.000Z',
    total: 4276, paidShare: 0.59,
    counts: { G100: 4, G210: 29, G220: 23, G230: 17, G310: 12, G320: 8, G410: 18, G420: 25, G430: 9, G463: 3, G510: 6, G520: 5, G610: 3, G620: 3, G630: 5, G710: 4, G720: 15 },
    pinned: { G463: 163.45, G420: 681, G410: 610, G210: 620 },
    zeroed: 4,
  },
}

/* ---------- roster ---------- */
const SURNAMES = ['Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Marek', 'Pospíšil', 'Pokorný', 'Hájek', 'Jelínek', 'Král', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Vaněk', 'Urban', 'Blažek', 'Kříž', 'Kovář', 'Bartoš', 'Vlček', 'Polák', 'Musil', 'Štěpánek', 'Holub', 'Staněk', 'Malý', 'Šimek', 'Kratochvíl', 'Bláha', 'Havlíček', 'Soukup', 'Mareš', 'Kadlec', 'Konečný', 'Šťastný', 'Vávra', 'Dostál', '린' ]
SURNAMES.pop()
const MALE = ['Jan', 'Petr', 'Josef', 'Pavel', 'Martin', 'Tomáš', 'Jaroslav', 'Miroslav', 'Zdeněk', 'František', 'Václav', 'Michal', 'Milan', 'Lukáš', 'Jiří', 'David', 'Radek', 'Ondřej', 'Roman', 'Marek']
const FEMALE = ['Jana', 'Marie', 'Eva', 'Hana', 'Anna', 'Lenka', 'Kateřina', 'Lucie', 'Věra', 'Alena', 'Petra', 'Veronika', 'Jitka', 'Martina', 'Tereza', 'Michaela']
const TITLES = ['', '', '', '', '', '', ', Ing.', ', Bc.', ', Mgr.', ', DiS.']

/** Přechýlení příjmení. Prosté přilepení "ová" dá "Pokornýová" nebo "Bláhaová". */
const FEMININE_EXCEPTIONS = {
  'Vaněk': 'Vaňková', 'Staněk': 'Staňková', 'Kadlec': 'Kadlecová',
}
function feminine(sn) {
  if (FEMININE_EXCEPTIONS[sn]) return FEMININE_EXCEPTIONS[sn]
  if (/ý$/.test(sn)) return sn.slice(0, -1) + 'á'          // Černý → Černá
  if (/a$/.test(sn)) return sn.slice(0, -1) + 'ová'        // Bláha → Bláhová
  if (/ek$/.test(sn)) return sn.slice(0, -2) + 'ková'      // Hájek → Hájková
  if (/ec$/.test(sn)) return sn.slice(0, -2) + 'cová'      // Němec → Němcová
  return sn + 'ová'
}

const people = []
let pid = 10240
const used = new Set()
for (const c of CENTERS) {
  for (let i = 0; i < c.head; i++) {
    const female = rnd() < 0.28
    let name
    do {
      const sn = SURNAMES[Math.floor(rnd() * SURNAMES.length)]
      const fn = female
        ? FEMALE[Math.floor(rnd() * FEMALE.length)]
        : MALE[Math.floor(rnd() * MALE.length)]
      name = `${female ? feminine(sn) : sn} ${fn}`
    } while (used.has(name))
    used.add(name)
    pid += 1 + Math.floor(rnd() * 7)
    people.push({
      o: pid,
      n: name + TITLES[Math.floor(rnd() * TITLES.length)],
      s: label(c),
      code: c.code,
      // sklon k přesčasům — určuje, kdo se do výkazu dostane a s jakým objemem
      prop: Math.max(0.05, 1 + gauss() * 0.55),
    })
  }
}

/* ---------- rozdělení hodin v měsíci ---------- */
function buildMonth(spec) {
  const byCenter = new Map()
  for (const c of CENTERS) byCenter.set(c.code, [])
  for (const p of people) byCenter.get(p.code).push(p)

  // cílové součty na střediska — váha × rozptyl, aby střediska se stejnou
  // vahou nevycházela na stejný průměr
  const pinnedSum = Object.values(spec.pinned).reduce((a, b) => a + b, 0)
  const free = CENTERS.filter((c) => !(c.code in spec.pinned))
  const jitter = new Map(free.map((c) => [c.code, c.w * (0.78 + rnd() * 0.46)]))
  const wSum = free.reduce((a, c) => a + jitter.get(c.code) * c.head, 0)
  const rest = spec.total - pinnedSum
  const target = {}
  for (const c of CENTERS) {
    target[c.code] = c.code in spec.pinned
      ? spec.pinned[c.code]
      : (jitter.get(c.code) * c.head / wSum) * rest
  }

  const rows = []
  const zeroCandidates = []

  for (const c of CENTERS) {
    // Výběr kolísá měsíc od měsíce — kdo měl minule přesčas, nemusí ho mít teď
    // (dovolená, nemoc, jiné vytížení). Bez toho by se sestava lidí neměnila
    // a srovnání "kdo vypadl / kdo přibyl" by bylo prázdné.
    const pool = byCenter.get(c.code).slice()
      .map((p) => ({ p, key: p.prop * (0.55 + rnd() * 0.9) }))
      .sort((a, b) => b.key - a.key)
      .map((x) => x.p)
    const take = Math.min(spec.counts[c.code] ?? 0, pool.length)
    const sel = pool.slice(0, take)
    if (!sel.length) continue

    // syrové váhy — lognormální rozptyl kolem sklonu člověka
    const raw = sel.map((p) => Math.max(0.08, p.prop * Math.exp(gauss() * 0.42)))
    const rawSum = raw.reduce((a, b) => a + b, 0)
    const mins = sel.map((_, i) => Math.round((raw[i] / rawSum) * target[c.code] * 60))
    // dorovnání zaokrouhlení na největšího
    let diff = Math.round(target[c.code] * 60) - mins.reduce((a, b) => a + b, 0)
    let big = 0
    for (let i = 1; i < mins.length; i++) if (mins[i] > mins[big]) big = i
    mins[big] += diff

    sel.forEach((p, i) => {
      const row = { p, code: c.code, tMin: Math.max(0, mins[i]) }
      rows.push(row)
      if (mins[i] > 12 * 60 && mins[i] < 45 * 60) zeroCandidates.push(row)
    })
  }

  // pár lidí s vyplaceným kontem → záporná evidence, součet 0
  const zeroed = new Set()
  const freed = new Map()
  for (let i = 0; i < spec.zeroed && zeroCandidates.length; i++) {
    const idx = Math.floor(rnd() * zeroCandidates.length)
    const row = zeroCandidates.splice(idx, 1)[0]
    row.payout = row.tMin
    freed.set(row.code, (freed.get(row.code) ?? 0) + row.tMin)
    row.tMin = 0
    zeroed.add(row)
  }
  // uvolněné hodiny zůstávají středisku — rozpustí se mezi ostatní,
  // aby součet za středisko odpovídal výkazu
  for (const [code, min] of freed) {
    const peers = rows.filter((r) => r.code === code && !zeroed.has(r) && r.tMin > 0)
    if (!peers.length) continue
    const peerSum = peers.reduce((a, r) => a + r.tMin, 0)
    let left = min
    peers.forEach((r, i) => {
      const add = i === peers.length - 1 ? left : Math.round((r.tMin / peerSum) * min)
      r.tMin += add
      left -= add
    })
  }

  // rozpad na MEZD / evidenci
  const freeRows = rows.filter((r) => !zeroed.has(r) && r.tMin > 0)
  for (const r of freeRows) {
    r.share = Math.min(1.3, Math.max(-0.1, spec.paidShare + gauss() * 0.22))
  }
  const sumT = rows.reduce((a, r) => a + r.tMin, 0)
  const sumFixedM = [...zeroed].reduce((a, r) => a + r.payout, 0)
  const sumFreeM = freeRows.reduce((a, r) => a + r.tMin * r.share, 0)
  const wantFreeM = spec.paidShare * sumT - sumFixedM
  const scale = sumFreeM > 0 ? wantFreeM / sumFreeM : 1
  for (const r of freeRows) {
    r.mMin = Math.round(Math.min(r.tMin * 1.35, Math.max(-r.tMin * 0.15, r.tMin * r.share * scale)))
  }
  for (const r of zeroed) r.mMin = r.payout
  for (const r of rows) {
    if (r.mMin == null) r.mMin = r.tMin
    r.eMin = r.tMin - r.mMin
  }
  return rows
}

const julRows = buildMonth(MONTHS['2026-07'])
const augRows = buildMonth(MONTHS['2026-08'])

/* ---------- roční součet ---------- */
const byPerson = new Map()
for (const p of people) byPerson.set(p.o, { p, jul: 0, aug: 0 })
for (const r of julRows) byPerson.get(r.p.o).jul = r.tMin
for (const r of augRows) byPerson.get(r.p.o).aug = r.tMin
for (const e of byPerson.values()) e.jit = Math.max(0.35, 1 + gauss() * 0.3)

function annual(k) {
  for (const e of byPerson.values()) {
    const base = (e.jul + e.aug) / 2
    e.pre = Math.round(base * 6 * e.jit * k)
    e.rJul = e.pre + e.jul
    e.rAug = e.rJul + e.aug
    const cap = 410 * 60
    if (e.rAug > cap) {
      const over = e.rAug - cap
      e.pre = Math.max(0, e.pre - over)
      e.rJul = e.pre + e.jul
      e.rAug = e.rJul + e.aug
    }
  }
  return [...byPerson.values()].filter((e) => e.rAug > 150 * 60).length
}
// najdi k tak, aby v srpnu bylo ~44 lidí nad 150 h ročně
let lo = 0.2, hi = 3.5, k = 1
for (let i = 0; i < 60; i++) {
  k = (lo + hi) / 2
  if (annual(k) < 44) lo = k; else hi = k
}
// hi je nejmenší nalezené k, které dá >= 44 lidí — počet je schodovitý,
// takže přesně 44 nemusí být dosažitelné; bereme nejbližší shora
annual(hi)

/* ---------- sestavení výstupu ---------- */
const m2h = (min) => Math.round((min / 60) * 100) / 100

function record(key, spec, rows, rKey) {
  const out = rows
    .map((r) => ({
      n: r.p.n,
      o: r.p.o,
      s: r.p.s,
      m: m2h(r.mMin),
      e: m2h(r.eMin),
      t: m2h(r.tMin),
      r: m2h(byPerson.get(r.p.o)[rKey]),
    }))
    .sort((a, b) => b.t - a.t || a.n.localeCompare(b.n, 'cs'))
  return {
    period: spec.period,
    rawPeriod: spec.rawPeriod,
    people: HEAD,
    demo: true,
    importedAt: spec.importedAt,
    file: spec.file,
    rows: out,
  }
}

const data = {
  '2026-07': record('2026-07', MONTHS['2026-07'], julRows, 'rJul'),
  '2026-08': record('2026-08', MONTHS['2026-08'], augRows, 'rAug'),
}

/* ---------- kontrolní výpis ---------- */
for (const [key, rec] of Object.entries(data)) {
  const t = rec.rows.reduce((a, r) => a + r.t, 0)
  const m = rec.rows.reduce((a, r) => a + r.m, 0)
  const over150 = rec.rows.filter((r) => r.r > 150).length
  const over250 = rec.rows.filter((r) => r.r > 250).length
  const cen = new Map()
  for (const r of rec.rows) {
    const c = cen.get(r.s) ?? { n: 0, t: 0 }
    c.n++; c.t += r.t; cen.set(r.s, c)
  }
  const top = [...cen.entries()].sort((a, b) => b[1].t / b[1].n - a[1].t / a[1].n)[0]
  const topAbs = [...cen.entries()].sort((a, b) => b[1].t - a[1].t)[0]
  console.log(
    `${key}: ${rec.rows.length} lidí, ${t.toFixed(1)} h, MEZD ${((m / t) * 100).toFixed(1)} %, ` +
    `>150 h ${over150}, >250 h ${over250}, top Ø ${top[0]} ${(top[1].t / top[1].n).toFixed(2)}, ` +
    `top součet ${topAbs[0]} ${topAbs[1].t.toFixed(0)} h`
  )
}

const banner = `/*
 * UKÁZKOVÁ DATA — SYNTETICKÁ, NE REÁLNÁ.
 *
 * Vygenerováno skriptem tools/generate-demo-data.mjs (deterministicky, seed 20260907).
 * Jména, osobní čísla i hodiny jsou vymyšlené. Slouží k tomu, aby byl panel
 * po naklonování repa hned funkční. Reálné měsíce přidejte importem
 * Součtového výkazu v sekci „Import výkazu“ nebo skriptem tools/report-to-data.mjs.
 *
 * Soubor se needituje ručně — přegeneruje se skriptem.
 */
`
writeFileSync(
  join(ROOT, 'data', 'months.js'),
  banner + 'window.PP_BUILTIN_MONTHS = ' + JSON.stringify(data, null, 0) + ';\n',
  'utf8'
)
console.log('→ data/months.js')
