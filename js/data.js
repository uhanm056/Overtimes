/* Datová vrstva: sloučení vestavěných a importovaných měsíců + odvozené statistiky. */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  const state = {
    months: {},        // 'YYYY-MM' → record
    imported: {},      // podmnožina, kterou lze smazat
  }

  PP.data = {
    state,

    /** Načte vestavěná data a přes ně položí importované měsíce (import přepisuje). */
    async init() {
      const builtin = window.PP_BUILTIN_MONTHS || {}
      state.imported = await PP.store.loadImported()
      state.months = {}
      for (const key in builtin) state.months[key] = Object.assign({ source: 'builtin' }, builtin[key])
      for (const key in state.imported) {
        state.months[key] = Object.assign({ source: 'imported' }, state.imported[key])
      }
      return state.months
    },

    /** Klíče měsíců od nejnovějšího. */
    keys() {
      return Object.keys(state.months).sort().reverse()
    },

    month(key) {
      return state.months[key] || null
    },

    isImported(key) {
      return Object.prototype.hasOwnProperty.call(state.imported, key)
    },

    /** Obsahuje panel jen ukázková data? */
    isDemoOnly() {
      const keys = this.keys()
      return keys.length > 0 && keys.every((k) => state.months[k].demo)
    },

    async addMonth(key, record) {
      await PP.store.saveImported(key, record)
      state.imported[key] = record
      state.months[key] = Object.assign({ source: 'imported' }, record)
    },

    /** Položí přes vestavěná data to, co přišlo z webu (veřejné vydání). */
    setRemote(months) {
      if (!months || !Object.keys(months).length) return false
      for (const key in months) {
        state.months[key] = Object.assign({ source: 'remote' }, months[key])
      }
      return true
    },

    /** Smaže importovaný měsíc; pokud pro něj existují vestavěná data, vrátí se. */
    async removeMonth(key) {
      await PP.store.removeImported(key)
      delete state.imported[key]
      const builtin = window.PP_BUILTIN_MONTHS || {}
      if (builtin[key]) state.months[key] = Object.assign({ source: 'builtin' }, builtin[key])
      else delete state.months[key]
    },
  }

  /* ---------- odvozené statistiky ---------- */

  const HIST_BUCKETS = [
    { from: -Infinity, to: 0, label: '≤ 0' },
    { from: 0, to: 10, label: '0–10' },
    { from: 10, to: 20, label: '10–20' },
    { from: 20, to: 30, label: '20–30' },
    { from: 30, to: 40, label: '30–40' },
    { from: 40, to: 50, label: '40–50' },
    { from: 50, to: 60, label: '50–60' },
    { from: 60, to: Infinity, label: '60+' },
  ]

  const cache = new WeakMap()

  /**
   * Souhrn nad agregovaným měsícem — takový záznam žádné lidi neobsahuje,
   * jen předpočítaná čísla za střediska. Používá ho veřejné vydání panelu.
   */
  function aggregateStats(record) {
    const s = record.summary
    const centers = s.centers.map((c) => {
      const avg = c.people ? c.total / c.people : 0
      return Object.assign({}, c, { avg, level: PP.level(avg, PP.CFG.center), rows: [] })
    })
    return {
      key: null,
      aggregate: true,
      people: record.people,
      withOvertime: s.withOvertime,
      total: s.total,
      mezdy: s.mezdy,
      evidence: s.evidence,
      paidShare: s.total !== 0 ? s.mezdy / s.total : 0,
      avg: s.withOvertime ? s.total / s.withOvertime : 0,
      max: 0,                       // nejvyšší hodnota jednotlivce se nezveřejňuje
      overWarn: s.overWarn,
      overCrit: s.overCrit,
      centers,
      byAvg: centers.slice().sort((a, b) => b.avg - a.avg),
      byTotal: centers.slice().sort((a, b) => b.total - a.total),
      hist: s.hist,
      yearly: [],                   // jmenné pohledy v agregátu neexistují
      ranking: [],
      year150: s.year150,
      year250: s.year250,
      yearCap: s.yearCap,
    }
  }

  /** Spočítá (a zapamatuje si) souhrn nad jedním měsícem. */
  PP.stats = function (record) {
    if (!record) return null
    if (cache.has(record)) return cache.get(record)
    if (record.aggregate) {
      const agg = aggregateStats(record)
      cache.set(record, agg)
      return agg
    }

    const rows = record.rows || []
    const sum = (f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0)
    const total = sum('t')
    const mezdy = sum('m')
    const evidence = sum('e')

    const centers = new Map()
    for (const r of rows) {
      let c = centers.get(r.s)
      if (!c) {
        c = { name: r.s, people: 0, total: 0, m: 0, e: 0, max: -Infinity, rows: [] }
        centers.set(r.s, c)
      }
      c.people++
      c.total += r.t
      c.m += r.m
      c.e += r.e
      if (r.t > c.max) c.max = r.t
      c.rows.push(r)
    }
    for (const c of centers.values()) {
      c.avg = c.people ? c.total / c.people : 0
      c.level = PP.level(c.avg, PP.CFG.center)
      c.rows.sort((a, b) => b.t - a.t)
    }

    const hist = HIST_BUCKETS.map((b) => ({
      label: b.label,
      count: rows.filter((r) => (b.to === 0 ? r.t <= 0 : r.t > b.from && r.t <= b.to)).length,
    }))

    const yearly = rows.slice().sort((a, b) => b.r - a.r)

    const out = {
      key: null,
      people: record.people || rows.length,
      withOvertime: rows.length,
      total,
      mezdy,
      evidence,
      paidShare: total !== 0 ? mezdy / total : 0,
      avg: rows.length ? total / rows.length : 0,
      max: rows.length ? Math.max.apply(null, rows.map((r) => r.t)) : 0,
      overWarn: rows.filter((r) => r.t >= PP.CFG.person.warn).length,
      overCrit: rows.filter((r) => r.t >= PP.CFG.person.crit).length,
      centers: Array.from(centers.values()),
      byAvg: Array.from(centers.values()).sort((a, b) => b.avg - a.avg),
      byTotal: Array.from(centers.values()).sort((a, b) => b.total - a.total),
      hist,
      yearly,
      year150: rows.filter((r) => r.r > PP.CFG.year.warn).length,
      year250: rows.filter((r) => r.r > PP.CFG.year.crit).length,
      yearCap: rows.filter((r) => r.r >= PP.CFG.year.cap).length,
      ranking: rows.slice().sort((a, b) => b.t - a.t),
    }
    cache.set(record, out)
    return out
  }

  /**
   * Seznam všech lidí napříč měsíci — pro vyhledávání. Jméno a středisko se
   * berou z nejnovějšího měsíce, ve kterém člověk je (mohl se přeřadit).
   */
  PP.roster = function () {
    const out = new Map()
    for (const key of PP.data.keys()) {          // od nejnovějšího
      for (const r of PP.data.month(key).rows || []) {
        const id = String(r.o)
        if (!out.has(id)) out.set(id, { o: r.o, n: r.n, s: r.s, months: 0 })
        out.get(id).months++
      }
    }
    return Array.from(out.values()).sort((a, b) => String(a.n).localeCompare(String(b.n), 'cs'))
  }

  /**
   * Historie jednoho člověka přes všechny měsíce, od nejstaršího.
   * Měsíc, ve kterém ve výkazu není, má hodnoty null — ne nulu: nulový přesčas
   * a „ve výkazu vůbec není“ jsou dvě různé věci.
   */
  PP.personHistory = function (id) {
    const wanted = String(id)
    const keys = PP.data.keys().slice().reverse()
    const points = []
    let person = null
    let lastR = 0

    for (const k of keys) {
      const rec = PP.data.month(k)
      const stats = PP.stats(rec)
      const row = (rec.rows || []).find((r) => String(r.o) === wanted)
      if (row) {
        person = { o: row.o, n: row.n, s: row.s }
        lastR = row.r
      }
      points.push({
        key: k,
        period: rec.period,
        row: row || null,
        t: row ? row.t : null,
        m: row ? row.m : null,
        e: row ? row.e : null,
        // roční součet drží i v měsíci bez přesčasu — nikam neklesá
        r: row ? row.r : (points.length ? lastR : null),
        rank: row ? stats.ranking.indexOf(row) + 1 : null,
        of: stats.withOvertime,
        // rozpad na mzdové složky — ať je vidět, z čeho se součet skládá
        comps: row && row.c && rec.comps
          ? row.c.map(([i, h, n]) => ({ name: rec.comps[i] || '(bez názvu)', h, rows: n }))
          : null,
        center: row ? stats.centers.find((c) => c.name === row.s) : null,
      })
    }
    if (!person) return null

    /* Přírůstek ročního součtu proti předchozímu měsíci. Pokud mzdový systém
       počítá roční součet jako kumulaci téhož, co je v měsíčním přesčasu,
       musí `dr` vyjít stejně jako `t`. Když ne, měří ty dva sloupce něco
       jiného — a je to potřeba vidět, protože na ročním součtu stojí hlídání
       zákonného stropu. */
    for (let i = 0; i < points.length; i++) {
      const prev = i > 0 ? points[i - 1].r : null
      const cur = points[i].r
      points[i].dr = (i > 0 && prev != null && cur != null) ? Math.round((cur - prev) * 100) / 100 : null
      points[i].drMatches = points[i].dr == null || points[i].t == null
        ? null
        : Math.abs(points[i].dr - points[i].t) <= 0.02
    }

    const withOt = points.filter((p) => p.t != null)
    return {
      person,
      points,
      months: withOt.length,
      total: withOt.reduce((a, p) => a + p.t, 0),
      avg: withOt.length ? withOt.reduce((a, p) => a + p.t, 0) / withOt.length : 0,
      max: withOt.length ? Math.max.apply(null, withOt.map((p) => p.t)) : 0,
      year: lastR,
    }
  }

  /** Porovnání dvou měsíců — delta na osobu i na středisko. */
  PP.compare = function (current, previous) {
    if (!current || !previous) return null
    const a = PP.stats(current)
    const b = PP.stats(previous)
    const prevCenters = new Map(b.centers.map((c) => [c.name, c]))
    const centers = a.centers.map((c) => {
      const p = prevCenters.get(c.name)
      return {
        name: c.name,
        avg: c.avg,
        prevAvg: p ? p.avg : null,
        dAvg: p ? c.avg - p.avg : null,
        total: c.total,
        prevTotal: p ? p.total : null,
        dTotal: p ? c.total - p.total : null,
      }
    })
    // Osobní srovnání jde jen nad záznamy s řádky. Agregovaný měsíc (veřejné
    // vydání) lidi vůbec neobsahuje, takže zůstane u čísel za střediska.
    const rowsA = current.rows || []
    const rowsB = previous.rows || []
    const hasPeople = rowsA.length > 0 && rowsB.length > 0

    // Kdo mezi měsíci vypadl a kdo přibyl. Porovnává se podle osobního čísla,
    // ne podle klíče s pobočkou — kdo změnil středisko, není nový člověk.
    const prevIds = new Set(rowsB.map((r) => String(r.o)))
    const curIds = new Set(rowsA.map((r) => String(r.o)))
    const dropped = hasPeople
      ? rowsB.filter((r) => !curIds.has(String(r.o))).sort((x, y) => y.t - x.t)
      : []
    const added = hasPeople
      ? rowsA.filter((r) => !prevIds.has(String(r.o))).sort((x, y) => y.t - x.t)
      : []

    // kdo zůstal v obou měsících, seřazený podle změny přesčasu
    const prevById = new Map(rowsB.map((r) => [String(r.o), r]))
    const movers = hasPeople
      ? rowsA
          .filter((r) => prevById.has(String(r.o)))
          .map((r) => {
            const p = prevById.get(String(r.o))
            return { r, prev: p, d: r.t - p.t }
          })
          .sort((x, y) => y.d - x.d)
      : []

    /* Sedí roční součet na součet měsíců? Porovná se přírůstek ročního součtu
       s měsíčním přesčasem u každého, kdo je v obou měsících. */
    const annual = { checked: 0, mismatched: 0, examples: [] }
    for (const m of movers) {
      if (m.r.r == null || m.prev.r == null) continue
      annual.checked++
      const dr = Math.round((m.r.r - m.prev.r) * 100) / 100
      if (Math.abs(dr - m.r.t) > 0.02) {
        annual.mismatched++
        if (annual.examples.length < 10) {
          annual.examples.push({ row: m.r, dr, t: m.r.t, diff: Math.round((dr - m.r.t) * 100) / 100 })
        }
      }
    }
    annual.examples.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))

    return {
      annual,
      dTotal: a.total - b.total,
      dPeople: a.withOvertime - b.withOvertime,
      dAvg: a.avg - b.avg,
      dPaidShare: a.paidShare - b.paidShare,
      centers,
      dropped,
      added,
      movers,
    }
  }
})(window.PP)
