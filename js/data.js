/* Datová vrstva: sloučení vestavěných a importovaných měsíců + odvozené statistiky. */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  const state = {
    months: {},        // 'YYYY-MM' → record
    imported: {},      // podmnožina, kterou lze smazat
    method: null,      // 'move' | 'balance' | 'unclear' | null — co znamená sloupec evidence
    methodInfo: null,  // čím se to rozhodlo
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
      applyMethodology()
      return state.months
    },

    /** Co vyšlo z měření: 'move', 'balance', 'unclear', nebo null když není co měřit. */
    get method() { return state.method },
    get methodInfo() { return state.methodInfo },

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
      applyMethodology()
    },

    /** Položí přes vestavěná data to, co přišlo z webu (veřejné vydání). */
    /* Data z webu NAHRAZUJÍ všechno zapečené, nepřekládají se přes něj.
       V souboru je vzorek jen pro případ, že by databáze byla nedostupná;
       kdyby se s živými čísly smíchal, viděli by kolegové vedle skutečných
       měsíců i vymyšlené a nepoznali by, které je které. */
    setRemote(months) {
      if (!months || !Object.keys(months).length) return false
      state.months = {}
      for (const key in months) {
        state.months[key] = Object.assign({ source: 'remote' }, months[key])
      }
      applyMethodology()
      return true
    },

    /** Smaže importovaný měsíc; pokud pro něj existují vestavěná data, vrátí se. */
    async removeMonth(key) {
      await PP.store.removeImported(key)
      delete state.imported[key]
      const builtin = window.PP_BUILTIN_MONTHS || {}
      if (builtin[key]) state.months[key] = Object.assign({ source: 'builtin' }, builtin[key])
      else delete state.months[key]
      applyMethodology()
    },
  }

  /* ---------- co znamená sloupec „Přesčas evidence“ ----------
     Mzdový systém tiskne dva údaje, které se dají sečíst dvěma způsoby:

       A) evidence je POHYB za měsíc      → přesčas = MEZD + evidence
       B) evidence je STAV konta na konci → přesčas = MEZD + (konto teď − konto minule)

     Rozdíl není kosmetický: u člověka s velkým kontem je A klidně dvojnásobek
     skutečnosti, protože se zůstatek připočte každý měsíc znovu. Hádat se to
     nemusí — roční součet z mzdového systému říká, o kolik ten měsíc přesčasu
     doopravdy přibylo, a podle něj se obě varianty změří na všech lidech
     a všech dvojicích měsíců, které panel má. */

  const PAIR_TOLERANCE = 0.02      // dvě minuty, kvůli zaokrouhlení h:mm
  const CONFIDENCE = 0.95          // kolik lidí musí variantě odpovídat

  /* Ukázkové měsíce se do měření nepočítají a nepřepočítávají. Je to
     vygenerovaný vzorek a nemá rozhodovat, jak se čtou reálné výkazy —
     ani se jím nechat přepsat. */
  function realKeys() {
    return Object.keys(state.months)
      .filter((k) => state.months[k] && !state.months[k].demo && state.months[k].rows)
      .sort()
  }

  function measureMethod(keys) {
    let checked = 0
    let okMove = 0
    let okBalance = 0

    for (let i = 1; i < keys.length; i++) {
      const cur = state.months[keys[i]]
      const prev = state.months[keys[i - 1]]
      if (!cur || !prev || !cur.rows || !prev.rows) continue
      const prevById = new Map(prev.rows.map((r) => [String(r.o), r]))
      for (const row of cur.rows) {
        const p = prevById.get(String(row.o))
        if (!p || row.r == null || p.r == null) continue
        checked++
        const dr = round2(row.r - p.r)
        if (Math.abs(dr - round2(row.m + row.e)) <= PAIR_TOLERANCE) okMove++
        if (Math.abs(dr - round2(row.m + (row.e - p.e))) <= PAIR_TOLERANCE) okBalance++
      }
    }

    const share = (n) => (checked ? n / checked : 0)
    const verdict = !checked ? null
      : share(okBalance) >= CONFIDENCE && okBalance > okMove ? 'balance'
      : share(okMove) >= CONFIDENCE && okMove > okBalance ? 'move'
      : 'unclear'
    return { verdict, checked, okMove, okBalance }
  }

  /** Dosadí do každého řádku `t` podle toho, co měření ukázalo. */
  function applyMethodology() {
    const keys = realKeys()
    const info = measureMethod(keys)
    state.method = info.verdict
    state.methodInfo = info

    /* Agregáty z webu řádky s lidmi nemají, takže se v nich nedá nic změřit.
       Metodiku s sebou nesou od toho, kdo je zveřejnil — bez ní by veřejná
       stránka popisovala sloupce jinak než panel, ze kterého čísla vyšla. */
    if (!info.checked) {
      for (const k of Object.keys(state.months).sort().reverse()) {
        const rec = state.months[k]
        if (rec && rec.aggregate && rec.method) { state.method = rec.method; break }
      }
    }

    // ukázkové měsíce zůstávají, jak jsou
    for (const k of Object.keys(state.months)) {
      const rec = state.months[k]
      if (!rec || !rec.rows || !rec.demo) continue
      rec.methodIncomplete = false
      for (const row of rec.rows) {
        if (row.tRaw === undefined) row.tRaw = round2(row.m + row.e)
        row.t = row.tRaw
        row.de = null
      }
    }

    for (let i = 0; i < keys.length; i++) {
      const rec = state.months[keys[i]]
      if (!rec || !rec.rows) continue
      const prev = i > 0 ? state.months[keys[i - 1]] : null
      const prevById = prev && prev.rows
        ? new Map(prev.rows.map((r) => [String(r.o), r]))
        : null

      /* Nejstarší měsíc nemá s čím porovnat konto, takže se u něj skutečný
         přesčas spočítat nedá. Zůstává v něm hodnota z výkazu a měsíc se
         označí — stačí naimportovat o měsíc starší výkaz a dopočítá se. */
      rec.methodIncomplete = state.method === 'balance' && !prevById

      for (const row of rec.rows) {
        if (row.tRaw === undefined) row.tRaw = round2(row.m + row.e)
        if (state.method !== 'balance' || !prevById) { row.t = row.tRaw; row.de = null; continue }
        const p = prevById.get(String(row.o))
        // kdo minulý měsíc ve výkazu nebyl, nemá se od čeho odrazit
        row.de = p ? round2(row.e - p.e) : null
        row.t = p ? round2(row.m + row.de) : row.tRaw
      }
    }
    cache = new WeakMap()
  }

  PP.measureMethod = measureMethod

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

  let cache = new WeakMap()

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
    /* Druhá složka je to, co k proplaceným hodinám zbývá do celku — ne syrový
       sloupec evidence. Když se počítá přes přírůstek konta, je zbytek právě
       ten přírůstek; sečíst syrové zůstatky by dalo číslo, které k součtu
       nepasuje, a v tabulce by Do MEZD + Evidence nedávalo Celkem. */
    const evidence = round2(total - mezdy)

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
      c.e += r.t - r.m
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
        de: row ? row.de : null,
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
  /* Který výklad sloupce „Přesčas evidence“ odpovídá mzdovému systému?
     Jsou v úvaze dva:

       A) evidence je POHYB za měsíc      → přesčas = MEZD + evidence
       B) evidence je STAV konta na konci → přesčas = MEZD + (evidence − evidence předchozího měsíce)

     Rozsoudit to umí roční součet: o kolik přibude mezi dvěma měsíci, tolik
     ten měsíc přesčasu bylo. Porovná se tedy přírůstek ročního součtu s oběma
     variantami u každého, kdo je v obou měsících. Rozdíl mezi A a B není
     kosmetický — u člověka s velkým kontem je A klidně dvojnásobek. */
  const round2 = (v) => Math.round(v * 100) / 100

  function methodCheck(movers) {
    const out = {
      checked: 0,
      okMove: 0,        // varianta A
      okBalance: 0,     // varianta B
      neither: 0,
      examples: [],
    }
    for (const m of movers) {
      if (m.r.r == null || m.prev.r == null || m.prev.e == null) continue
      out.checked++
      const dr = round2(m.r.r - m.prev.r)
      // pozor: m.r.t už může být opravené, porovnávat se musí syrový součet
      const asMove = m.r.tRaw !== undefined ? m.r.tRaw : round2(m.r.m + m.r.e)
      const asBalance = round2(m.r.m + (m.r.e - m.prev.e))
      const fitsMove = Math.abs(dr - asMove) <= 0.02
      const fitsBalance = Math.abs(dr - asBalance) <= 0.02
      if (fitsMove) out.okMove++
      if (fitsBalance) out.okBalance++
      if (!fitsMove && !fitsBalance) {
        out.neither++
        if (out.examples.length < 10) {
          out.examples.push({ row: m.r, dr, asMove, asBalance, diff: round2(dr - asMove) })
        }
      }
    }
    out.examples.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))

    /* Vyhrává ta varianta, která sedí aspoň u 95 % lidí a zároveň výrazně líp
       než ta druhá. Když ani jedna, měří mzdový systém něco dalšího a je lepší
       to přiznat, než si vybrat. */
    const share = (n) => (out.checked ? n / out.checked : 0)
    out.verdict = !out.checked ? null
      : share(out.okBalance) >= 0.95 && out.okBalance > out.okMove ? 'balance'
      : share(out.okMove) >= 0.95 && out.okMove > out.okBalance ? 'move'
      : 'unclear'
    // zpětná kompatibilita se starou kartou
    out.mismatched = out.checked - out.okMove
    return out
  }

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

    const annual = methodCheck(movers)

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
