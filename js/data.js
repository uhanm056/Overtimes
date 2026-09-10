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

  /** Spočítá (a zapamatuje si) souhrn nad jedním měsícem. */
  PP.stats = function (record) {
    if (!record) return null
    if (cache.has(record)) return cache.get(record)

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
    // Kdo mezi měsíci vypadl a kdo přibyl. Porovnává se podle osobního čísla,
    // ne podle klíče s pobočkou — kdo změnil středisko, není nový člověk.
    const prevIds = new Set(previous.rows.map((r) => String(r.o)))
    const curIds = new Set(current.rows.map((r) => String(r.o)))
    const dropped = previous.rows
      .filter((r) => !curIds.has(String(r.o)))
      .sort((x, y) => y.t - x.t)
    const added = current.rows
      .filter((r) => !prevIds.has(String(r.o)))
      .sort((x, y) => y.t - x.t)

    // kdo zůstal v obou měsících, seřazený podle změny přesčasu
    const prevById = new Map(previous.rows.map((r) => [String(r.o), r]))
    const movers = current.rows
      .filter((r) => prevById.has(String(r.o)))
      .map((r) => {
        const p = prevById.get(String(r.o))
        return { r, prev: p, d: r.t - p.t }
      })
      .sort((x, y) => y.d - x.d)

    return {
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
