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
const SEED = 20260907
let next = mulberry32(SEED)
const rnd = () => next()
/** Vrátí generátor na začátek, aby šlo hledání parametrů opakovat se stejnými čísly. */
function resetRnd() { next = mulberry32(SEED) }
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

/* ---------- měsíce ----------
   Leden až srpen. Červenec a srpen mají čísla ze zadání, zbytek je dopsaná
   historie tak, aby dávala smysl dohromady: přesčas přes rok roste, podíl
   proplacených hodin klesá (roste konto) a Warehouse se postupně propracuje
   na první místo.

   Roční součet NENÍ zvlášť vymyšlené číslo — je to skutečný kumulativní součet
   měsíců od ledna. Kdo si v panelu sečte měsíční sloupce, musí dostat přesně
   hodnotu ve sloupci „Ročně“. */
const MONTHS = {
  '2026-01': { total: 1100, otPeople: 118, paidShare: 0.72, zeroed: 1,
    pinned: { G463: 27, G420: 96, G410: 175, G210: 150 } },
  '2026-02': { total: 1450, otPeople: 128, paidShare: 0.71, zeroed: 1,
    pinned: { G463: 39, G420: 132, G410: 225, G210: 195 } },
  '2026-03': { total: 1900, otPeople: 140, paidShare: 0.70, zeroed: 2,
    pinned: { G463: 54, G420: 180, G410: 300, G210: 260 } },
  '2026-04': { total: 2450, otPeople: 152, paidShare: 0.68, zeroed: 2,
    pinned: { G463: 78, G420: 260, G410: 380, G210: 330 } },
  '2026-05': { total: 3050, otPeople: 163, paidShare: 0.67, zeroed: 3,
    pinned: { G463: 99, G420: 350, G410: 450, G210: 420 } },
  '2026-06': { total: 3800, otPeople: 176, paidShare: 0.65, zeroed: 3,
    pinned: { G463: 123, G420: 480, G410: 560, G210: 520 } },
  '2026-07': { total: 4625, otPeople: 182, paidShare: 0.63, zeroed: 3,
    counts: { G100: 4, G210: 28, G220: 22, G230: 16, G310: 11, G320: 7, G410: 17, G420: 24, G430: 8, G463: 3, G510: 5, G520: 4, G610: 4, G620: 4, G630: 5, G710: 5, G720: 15 },
    pinned: { G463: 146.95, G410: 640, G420: 590, G210: 600 } },
  '2026-08': { total: 4276, otPeople: 189, paidShare: 0.59, zeroed: 4,
    counts: { G100: 4, G210: 29, G220: 23, G230: 17, G310: 12, G320: 8, G410: 18, G420: 25, G430: 9, G463: 3, G510: 6, G520: 5, G610: 3, G620: 3, G630: 5, G710: 4, G720: 15 },
    pinned: { G463: 163.45, G420: 681, G410: 610, G210: 620 } },
}

const MONTH_KEYS = Object.keys(MONTHS).sort()
const DAYS = { '01': 31, '02': 28, '03': 31, '04': 30, '05': 31, '06': 30, '07': 31, '08': 31 }

for (const key of MONTH_KEYS) {
  const m = Number(key.slice(5))
  const last = DAYS[key.slice(5)]
  Object.assign(MONTHS[key], {
    period: `1. ${m}. – ${last}. ${m}. 2026`,
    rawPeriod: `1.${m}.2026 - ${last}.${m}.2026`,
    file: `Souctovy_vykaz_2026_${key.slice(5)}.xls`,
    importedAt: `2026-${String(m + 1).padStart(2, '0')}-04T07:12:00.000Z`,
  })
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
      // z-skóre sklonu k přesčasům; na `prop` se převede až v build(),
      // kde se hledá rozptyl odpovídající zadanému počtu lidí nad 150 h
      z: gauss(),
    })
  }
}

/* ---------- rozdělení hodin v měsíci ---------- */
/** Nejvyšší měsíční přesčas jednotlivce. Víc už není reálné odpracovat. */
const MONTH_CAP = 90 * 60

/**
 * Ořeže hodnoty na MONTH_CAP a přebytek rozpustí mezi ostatní ve skupině.
 * Součet pole zůstává stejný, takže sedí i součet za středisko.
 */
function capWithinGroup(mins) {
  for (let pass = 0; pass < 12; pass++) {
    let excess = 0
    for (let i = 0; i < mins.length; i++) {
      if (mins[i] > MONTH_CAP) { excess += mins[i] - MONTH_CAP; mins[i] = MONTH_CAP }
    }
    if (!excess) return
    const room = mins.map((v) => Math.max(0, MONTH_CAP - v))
    const roomSum = room.reduce((a, b) => a + b, 0)
    if (!roomSum) return          // skupina je celá na stropu, víc rozpustit nejde
    let left = excess
    for (let i = 0; i < mins.length && left > 0; i++) {
      const add = Math.min(left, room[i], Math.round((room[i] / roomSum) * excess))
      mins[i] += add
      left -= add
    }
    for (let i = 0; i < mins.length && left > 0; i++) {
      const add = Math.min(left, MONTH_CAP - mins[i])
      mins[i] += add
      left -= add
    }
  }
}

function buildMonth(spec, counts) {
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
    const take = Math.min(counts[c.code] ?? 0, pool.length)
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

    capWithinGroup(mins)

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

  // rozpuštění uvolněných hodin mohlo někoho dostat nad strop — ořezat znovu
  for (const c of CENTERS) {
    const grp = rows.filter((r) => r.code === c.code && !zeroed.has(r))
    if (!grp.length) continue
    const mins = grp.map((r) => r.tMin)
    capWithinGroup(mins)
    grp.forEach((r, i) => { r.tMin = mins[i] })
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

/* ---------- počty lidí s přesčasem na střediska ----------
   Červenec a srpen mají počty ze zadání; zbytku se dopočítají podle stavu.
   G463 Prefix má vždy všechny tři — jeho průměr na osobu je zafixovaný. */
function monthCounts(spec) {
  if (spec.counts) return spec.counts
  const out = {}
  const rest = CENTERS.filter((c) => c.code !== 'G463')
  const restHead = rest.reduce((a, c) => a + c.head, 0)
  out.G463 = 3
  let sum = 3
  for (const c of rest) {
    out[c.code] = Math.max(1, Math.min(c.head, Math.round(c.head * (spec.otPeople - 3) / restHead)))
    sum += out[c.code]
  }
  // dorovnání na přesný počet — po jednom, od největších středisek
  const order = rest.slice().sort((a, b) => b.head - a.head)
  let guard = 0
  while (sum !== spec.otPeople && guard++ < 500) {
    for (const c of order) {
      if (sum === spec.otPeople) break
      if (sum < spec.otPeople && out[c.code] < c.head) { out[c.code]++; sum++ }
      else if (sum > spec.otPeople && out[c.code] > 1) { out[c.code]--; sum-- }
    }
  }
  return out
}

/* ---------- sestavení všech měsíců ----------
   `spread` je rozptyl sklonu k přesčasům. Čím vyšší, tím delší pravý chvost
   a tím víc lidí se přes rok dostane nad roční prahy. Hledá se tak, aby
   v srpnu vyšlo 44 lidí nad 150 h — což je číslo ze zadání. */
function build(spread) {
  for (const p of people) p.prop = Math.max(0.05, Math.exp(p.z * spread))

  const months = {}
  for (const key of MONTH_KEYS) {
    const spec = MONTHS[key]
    months[key] = buildMonth(spec, monthCounts(spec))
  }

  // roční součet = skutečný kumulativní součet měsíců od ledna
  const cum = new Map()
  for (const key of MONTH_KEYS) {
    for (const row of months[key]) {
      const prev = cum.get(row.p.o) || 0
      const now = prev + row.tMin
      cum.set(row.p.o, now)
      row.rMin = now
    }
    // kdo v měsíci přesčas nemá, jeho součet se nemění — nic neděláme
  }
  return months
}

// rnd je sdílený, takže každý běh build() posune sekvenci; pro porovnatelnost
// se pro každý pokus resetuje na stejný seed
function attempt(spread) {
  resetRnd()
  const months = build(spread)
  const aug = months['2026-08']
  return { months, over150: aug.filter((r) => r.rMin > 150 * 60).length }
}

let best = null
for (let i = 0; i <= 60; i++) {
  const spread = 0.10 + (i / 60) * 1.00
  const a = attempt(spread)
  const dist = Math.abs(a.over150 - 44)
  if (!best || dist < best.dist) best = { dist, spread, ...a }
  if (dist === 0) break
}
const months = best.months
if (best.dist !== 0) {
  console.warn(`Pozor: nad 150 h vyšlo ${best.over150}, cíl byl 44 (rozptyl ${best.spread.toFixed(3)}).`)
}

/* ---------- sestavení výstupu ---------- */
const m2h = (min) => Math.round((min / 60) * 100) / 100

function record(key, rows) {
  const spec = MONTHS[key]
  const out = rows
    .map((r) => ({
      n: r.p.n,
      o: r.p.o,
      s: r.p.s,
      m: m2h(r.mMin),
      e: m2h(r.eMin),
      t: m2h(r.tMin),
      r: r.rExact,
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

// Roční součet se skládá z už zaokrouhlených měsíčních hodnot, ne z minut —
// kdo si v panelu sečte měsíční sloupce, musí dostat přesně hodnotu ve sloupci
// „Ročně“, bez minutové odchylky ze zaokrouhlování.
const running = new Map()
for (const key of MONTH_KEYS) {
  for (const row of months[key]) {
    const acc = Math.round(((running.get(row.p.o) || 0) + m2h(row.tMin)) * 100) / 100
    running.set(row.p.o, acc)
    row.rExact = acc
  }
}

const data = {}
for (const key of MONTH_KEYS) data[key] = record(key, months[key])

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
