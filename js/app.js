/* Přesčasový panel Planá — UI. */
;(function (PP) {
  'use strict'

  const { esc, hrs, hrsU, hrsUnit, num, pct, czk, fold, mark, level, monthName, monthShort,
    weekName, weekShort, periodName, centerName, $, $$ } = PP
  const CFG = PP.CFG

  const ICONS = {
    overview: '<path d="M3 13h5v7H3zM9.5 4h5v16h-5zM16 9h5v11h-5z"/>',
    centers: '<path d="M4 20V8l6-4 6 4v12M4 20h16M14 20v-5h-4v5M20 20V11l-4-2.6"/>',
    ranking: '<path d="M6 20v-6M12 20V4M18 20v-9"/>',
    compare: '<path d="M4 7h10M4 7l3-3M4 7l3 3M20 17H10M20 17l-3-3M20 17l-3 3"/>',
    period: '<path d="M3 20h18M7 20V9M12 20V4M17 20v-7"/>',
    weeks: '<path d="M4 7h16v13H4zM4 7V4h16v3M9 3v4M15 3v4M8 13h3M8 17h8"/>',
    year: '<path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3.2 2"/>',
    import: '<path d="M12 3v11M8 10.5l4 4 4-4M4 20h16"/>',
    method: '<path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 11v5M12 7.5v.6"/>',
  }

  const SECTIONS = [
    { id: 'overview', label: 'Přehled', title: 'Přehled', sub: 'Celkový obrázek za vybraný měsíc.' },
    { id: 'period', label: 'Souhrn období', title: 'Souhrn za celé období', sub: 'Součet přes všechny načtené měsíce — hodiny, proplacení i náklady.' },
    { id: 'weeks', label: 'Týdny', title: 'Týdny', sub: 'Přesčas po týdnech — z výkazů za týdenní období.' },
    { id: 'centers', label: 'Střediska', title: 'Střediska', sub: 'Detail jednoho střediska.' },
    { id: 'ranking', label: 'Žebříček závodu', title: 'Žebříček závodu', sub: 'Kdo v závodě odpracoval nejvíc přesčasu.' },
    { id: 'compare', label: 'Vývoj a srovnání', title: 'Vývoj a srovnání', sub: 'Jak se přesčas vyvíjí a co se změnilo mezi dvěma obdobími.' },
    { id: 'year', label: 'Roční limit', title: 'Roční limit', sub: 'Kdo se blíží zákonnému stropu 416 h/rok.' },
    { id: 'import', label: 'Import výkazu', title: 'Import výkazu', sub: 'Přidání dalšího měsíce ze Součtového výkazu.' },
    { id: 'method', label: 'Metodika', title: 'Metodika', sub: 'Jak se čísla počítají a co znamenají.' },
  ]

  /* Veřejné vydání: agregáty za střediska, nic jmenného. Nastavuje ho
     tools/build-public.mjs; interní panel běží bez něj. */
  const PUBLIC = !!window.PP_PUBLIC

  /* Vydání k rozeslání kolegům: plný panel na vlastní výkaz, ale bez karty
     pro zveřejňování. Kolega nemá do repozitáře ani do databáze co psát a
     tlačítka, která mu stejně nepatří, jen matou. */
  const ANALYZER = !!window.PP_ANALYZER

  const PUBLIC_SECTIONS = ['overview', 'period', 'centers', 'compare', 'method']
  if (PUBLIC) {
    for (let i = SECTIONS.length - 1; i >= 0; i--) {
      if (!PUBLIC_SECTIONS.includes(SECTIONS[i].id)) SECTIONS.splice(i, 1)
    }
  }

  const ui = {
    section: 'overview',
    month: null,
    center: null,
    query: '',
    sort: { key: 'total', dir: 'desc' },
    cmpSort: { key: 'dTotal', dir: 'desc' },
    metric: 'total',     // ukazatel v grafech vývoje
    topBy: 'total',      // TOP střediska: podle součtu, nebo Ø na osobu
    topOpen: {},         // rozbalená střediska v TOP přehledu
    topMonths: null,     // měsíce v TOP kartě; null = jen ten vybraný nahoře
    week: null,          // vybraný týden v sekci Týdny
    person: null,        // osobní číslo sledovaného člověka
    personMetric: 'month',
    personOpen: {},      // rozbalené měsíce v detailu člověka (rozpad složek)
    personPick: false,   // detail člověka otevřený, ale zatím nikdo nevybraný
    personQuery: '',
    cmpA: null,          // starší z porovnávaných měsíců
    cmpB: null,          // novější
    rankingLimit: 25,
    log: [],          // výsledky importů; přežijí překreslení panelu
    admin: null,      // přihlášený účet, který smí publikovat
    pubMsg: null,     // poslední hláška z publikování { kind, html }
    diag: null,       // výsledek kontroly spojení
    pubState: null,   // co je právě na webu { updatedAt, months }
  }

  /* ---------- motiv ---------- */
  const THEME_KEY = 'prescasy.theme'
  const THEMES = [
    { value: '', label: 'Motiv: systém' },
    { value: 'light', label: 'Motiv: světlý' },
    { value: 'dark', label: 'Motiv: tmavý' },
  ]
  function applyTheme(value) {
    document.documentElement.setAttribute('data-theme', value)
    const t = THEMES.find((x) => x.value === value) || THEMES[0]
    $('#theme-label').textContent = t.label
    try { window.localStorage.setItem(THEME_KEY, value) } catch (err) { /* jen preference */ }
  }
  function initTheme() {
    let saved = ''
    try { saved = window.localStorage.getItem(THEME_KEY) || '' } catch (err) { saved = '' }
    applyTheme(THEMES.some((t) => t.value === saved) ? saved : '')
    $('#theme-toggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || ''
      const idx = THEMES.findIndex((t) => t.value === cur)
      applyTheme(THEMES[(idx + 1) % THEMES.length].value)
    })
  }

  /* ---------- zápis hodin ----------
     Kdo čte výkaz, chce h:mm jako v mzdovém systému; kdo s čísly dál počítá,
     chce desetinné hodiny. Jedno nastavení pro celý panel, ať se oba zápisy
     nepotkají v jedné tabulce. */
  const FMT_KEY = 'prescasy.format.v1'
  function applyFormat(value, redraw) {
    const f = PP.setFormat(value)
    const el = $('#fmt-label')
    if (el) el.textContent = f === 'dec' ? 'Hodiny: 61,1 h' : 'Hodiny: 61:05'
    try { window.localStorage.setItem(FMT_KEY, f) } catch (err) { /* jen preference */ }
    if (redraw) render()
  }
  function initFormat() {
    let saved = ''
    try { saved = window.localStorage.getItem(FMT_KEY) || '' } catch (err) { saved = '' }
    applyFormat(saved, false)
    const btn = $('#fmt-toggle')
    if (btn) btn.addEventListener('click', () => applyFormat(PP.FMT === 'dec' ? 'hm' : 'dec', true))
  }

  /* ---------- navigace ---------- */
  function renderNav() {
    $('#nav').innerHTML = SECTIONS.map((s) => `
      <button type="button" data-section="${s.id}" aria-current="${s.id === ui.section}">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[s.id]}</svg>
        <span>${esc(s.label)}</span>
      </button>`).join('')
    $$('#nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.section)))
  }

  function go(id) {
    if (!SECTIONS.some((s) => s.id === id)) return
    // odchod jinam detail člověka zavírá, ať se po návratu nezjeví znovu
    if (id !== 'compare') { ui.person = null; ui.personPick = false }
    ui.section = id
    if (location.hash.slice(1) !== id) location.hash = id
    $$('#nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.section === id)))
    const s = SECTIONS.find((x) => x.id === id)
    $('#section-title').textContent = s.title
    $('#section-sub').textContent = s.sub
    SECTIONS.forEach((x) => { $('#panel-' + x.id).hidden = x.id !== id })
    /* Volič měsíce i export patří jen tam, kde se opravdu kouká na jeden
       měsíc. Souhrn za období sčítá všechny — a zrovna tahle záměna je důvod,
       proč sekce vznikla. V Metodice a Importu nemá co ovlivňovat. */
    const monthly = MONTH_SECTIONS.includes(id)
    const picker = document.querySelector('.month-picker')
    if (picker) picker.hidden = !monthly
    const exp = $('#export-btn')
    if (exp && !PUBLIC) exp.hidden = !monthly
    render()
  }

  /* ---------- výběr měsíce ---------- */
  function renderMonthPicker() {
    const keys = PP.data.keys()
    const sel = $('#month-select')
    sel.innerHTML = keys.map((k) => {
      const rec = PP.data.month(k)
      const flag = rec.demo ? ' · ukázka' : PP.data.isImported(k) ? ' · import' : ''
      return `<option value="${esc(k)}">${esc(monthName(k))}${esc(flag)}</option>`
    }).join('')
    if (!keys.length) sel.innerHTML = '<option value="">— žádná data —</option>'
    if (!ui.month || !keys.includes(ui.month)) ui.month = keys[0] || null
    sel.value = ui.month || ''
    sel.disabled = keys.length < 2
  }

  function currentMonth() { return ui.month ? PP.data.month(ui.month) : null }
  function currentStats() { return PP.stats(currentMonth()) }
  function previousKey() {
    const keys = PP.data.keys()
    const i = keys.indexOf(ui.month)
    return i >= 0 && i + 1 < keys.length ? keys[i + 1] : null
  }

  /* Druhá složka přesčasu se jmenuje podle toho, co znamená. Když je evidence
     zůstatek konta, je tím, co se k proplaceným hodinám přičítá, její přírůstek
     — a „Evidence“ by v záhlaví sloupce lhalo. */
  const evidenceLabel = () => (PP.data.method === 'balance' ? 'Přírůstek konta' : 'Evidence')

  /* Co který sloupec znamená. Zkratky z výkazu si nikdo neodvodí, a hádat
     se nemá — vysvětlivka proto stojí přímo pod tabulkou, ne až v Metodice.
     `cols` vybírá, které z nich tabulka opravdu má. */
  const COL_HELP = {
    m: ['Do MEZD', 'hodiny poslané do výplaty'],
    e: ['%EVID%', '%EVID_HELP%'],
    t: ['Přesčas', 'kolik hodin člověk doopravdy odpracoval navíc'],
    r: ['Ročně', 'součet od ledna, jak ho vede mzdový systém'],
    avg: ['Ø / osoba', 'průměr na jednoho člověka s přesčasem'],
    max: ['Nejvíc u jednoho', 'přesčas toho nejvytíženějšího člověka ve středisku'],
  }
  function colLegend(cols) {
    const balance = PP.data.method === 'balance'
    const items = cols.map((k) => {
      const h = COL_HELP[k]
      if (!h) return ''
      const label = h[0] === '%EVID%' ? evidenceLabel() : h[0]
      const help = h[1] !== '%EVID_HELP%' ? h[1]
        : balance ? 'o kolik za měsíc narostlo konto přesčasů'
          : 'hodiny, které zůstaly na kontě místo výplaty'
      return `<span><strong>${esc(label)}</strong> ${esc(help)}</span>`
    }).filter(Boolean)
    return items.length ? `<p class="col-legend">${items.join('')}</p>` : ''
  }

  /* ---------- jak se počítá přesčas ----------
     Když měření ukáže, že evidence je zůstatek konta, panel počítá jinak, než
     co je doslova ve výkazu. To se nesmí stát potichu — kdo si čísla
     překontroluje proti sestavě z mezd, musí vědět, proč nesedí. */
  function renderMethodBanner() {
    const box = $('#method-banner')
    if (!box) return
    const rec = currentMonth()
    if (PP.data.method !== 'balance' || !rec) { box.hidden = true; box.innerHTML = ''; return }

    box.hidden = false
    box.className = 'method-banner'
    const info = PP.data.methodInfo || {}
    const chybi = rec.methodIncomplete

    box.innerHTML = `<span aria-hidden="true">${chybi ? '⚠' : 'ⓘ'}</span><div>
      <strong>Přesčas se počítá jako Do MEZD + přírůstek konta.</strong>
      Sloupec <em>Přesčas evidence</em> ve výkazu není pohyb za měsíc, ale zůstatek
      konta ke konci měsíce${info.checked
        ? ` — ověřeno proti ročnímu součtu u ${num(info.okBalance || 0)} z ${num(info.checked)} lidí`
        : ''}. Sečíst MEZD a evidenci by přesčas nafouklo, protože by se zůstatek
      počítal každý měsíc znovu.
      ${chybi
        ? `<br><strong>${esc(monthName(ui.month))} je nejstarší naimportovaný měsíc</strong>,
           takže se u něj přírůstek konta nemá od čeho odrazit a čísla jsou nadhodnocená
           stejně jako dřív. Napraví to import o měsíc staršího výkazu${PUBLIC ? '' : ` v sekci
           <button class="btn ghost sm" type="button" data-goto="import">Import výkazu</button>`}.`
        : ''}
    </div>`
    $$('#method-banner [data-goto]').forEach((b) =>
      b.addEventListener('click', () => go(b.dataset.goto)))
  }

  /* ---------- ukázková data ---------- */
  const MONTH_SECTIONS = ['overview', 'centers', 'ranking', 'compare', 'year']

  function renderDemoBanner() {
    const rec = currentMonth()
    const box = $('#demo-banner')
    if (!rec || !rec.demo || !MONTH_SECTIONS.includes(ui.section)) {
      box.hidden = true; box.innerHTML = ''; return
    }
    box.hidden = false
    box.className = 'demo-banner'
    // Ve veřejném vydání není kam odkazovat — sekce Import tam neexistuje.
    if (PUBLIC) {
      box.innerHTML = `<span aria-hidden="true">⚠</span><div>
        <strong>Ukázková data.</strong> Tenhle přehled je postavený z vygenerovaného
        vzorku, ne ze skutečných výkazů. Čísla nic neznamenají.
      </div>`
      return
    }

    box.innerHTML = `<span aria-hidden="true">⚠</span><div>
      <strong>Ukázková data.</strong> ${esc(monthName(ui.month))} je vygenerovaný vzorek —
      jména, osobní čísla i hodiny jsou vymyšlené. Reálný měsíc přidáte v sekci
      <button class="btn ghost sm" type="button" data-goto="import">Import výkazu</button>.
    </div>`
    const btn = box.querySelector('[data-goto]')
    if (btn) btn.addEventListener('click', () => go('import'))
  }

  /* ---------- stavební kameny ---------- */
  /* Období karty přímo v nadpisu. Drobný šedý text vpravo se dá přehlédnout
     a u čísel, která platí jen pro jeden měsíc, je to ta nejdůležitější
     informace na kartě. */
  function periodChip(key) {
    const k = key || ui.month
    return k ? `<span class="period-chip">${esc(monthName(k))}</span>` : ''
  }

  /* Dlaždice s číslem. `extra` je 'hero' u hlavního čísla sekce — to má být
     na první pohled větší než ostatní, jinak se šest stejných krabiček
     přetlouká a oko nemá kde přistát. */
  function kpi(label, value, foot, tone, extra) {
    return `<div class="card kpi${tone ? ' ' + tone : ''}${extra ? ' ' + extra : ''}">
      <span class="label">${esc(label)}</span>
      <span class="value">${value}</span>
      ${foot ? `<span class="foot">${foot}</span>` : ''}
    </div>`
  }

  function barRow(name, value, maxValue, valueHtml, tone) {
    const w = maxValue > 0 ? Math.max(1, (value / maxValue) * 100) : 0
    return `<div class="bar-row">
      <span class="name" title="${esc(name)}">${esc(name)}</span>
      <span class="bar-track"><span class="bar-fill${tone ? ' ' + tone : ''}" style="width:${w.toFixed(1)}%"></span></span>
      <span class="val">${valueHtml}</span>
    </div>`
  }

  /** Delta jako odznak: +3:20 / −1:05. Barevný odznak dostane jen skutečná
      změna; „beze změny“ je šedý text, aby se dlaždice a tabulky nezaplnily
      výraznými krabičkami, které nic neříkají. */
  function delta(value, formatter) {
    if (value == null || !isFinite(value)) return ''
    const f = formatter || hrs
    if (Math.abs(value) < 0.005) return '<span class="nochg">beze změny</span>'
    const up = value > 0
    return `<span class="tag ${up ? 'crit' : 'good'}">${up ? '+' : '−'}${f(Math.abs(value))}</span>`
  }

  /** Patička dlaždice se srovnáním s minulým obdobím. */
  function vsPrev(key, value, formatter) {
    const label = esc(monthShort(key))
    if (value == null || !isFinite(value)) return 'proti ' + label
    if (Math.abs(value) < 0.005) return 'stejně jako ' + label
    return 'proti ' + label + ' ' + delta(value, formatter)
  }

  function emptyState(text) {
    return `<div class="card"><div class="empty">
      <h3>Zatím tu nic není</h3><p>${esc(text)}</p>
    </div></div>`
  }

  /* ---------- Přehled ---------- */
  function renderOverview() {
    const sub = $('#section-sub')
    if (sub && ui.month) sub.textContent = `Celkový obrázek za ${monthName(ui.month)}.`

    const el = $('#panel-overview')
    const rec = currentMonth()
    if (!rec) { el.innerHTML = emptyState('Naimportujte Součtový výkaz a panel se naplní.'); return }
    const s = currentStats()
    const prevK = previousKey()
    const cmp = prevK ? PP.compare(rec, PP.data.month(prevK)) : null

    /* Dlaždice ve dvou skupinách: nahoře co se stalo, dole koho to pálí.
       Dřív jich bylo šest stejně velkých vedle sebe a „Přesčas celkem“
       vypadal úplně stejně jako „Nad 150 h ročně“. */
    const kpis = `<div class="grid kpis">
      ${kpi('Přesčas celkem', hrsU(s.total),
        cmp ? vsPrev(prevK, cmp.dTotal, hrs) : esc(rec.period), '', 'hero')}
      ${kpi('Lidí s přesčasem', num(s.withOvertime),
        `z ${num(s.people)} osob · ${pct(s.withOvertime / s.people)}`)}
      ${kpi('Ø na osobu', hrs(s.avg),
        cmp ? vsPrev(prevK, cmp.dAvg, hrs) : 'z lidí s přesčasem',
        level(s.avg, CFG.person))}
      ${kpi('Proplaceno (MEZD)', pct(s.paidShare),
        `${hrsU(s.mezdy)} z ${hrsU(s.total)} jde do výplaty`)}
    </div>
    <div class="grid kpis alarms">
      ${kpi('Nad ' + CFG.person.crit + ' h za měsíc', num(s.overCrit),
        `nad ${CFG.person.warn} h: ${num(s.overWarn)}`, s.overCrit ? 'crit' : 'good')}
      ${kpi('Nad ' + CFG.year.warn + ' h ročně', num(s.year150),
        `nad ${CFG.year.crit} h: ${num(s.year250)}`, s.year150 ? 'warn' : 'good')}
      ${kpi('Na stropu ' + CFG.year.cap + ' h', num(s.yearCap != null ? s.yearCap : 0),
        'další přesčas už nelze nařídit', (s.yearCap || 0) ? 'crit' : 'good')}
    </div>`

    const topAvg = s.byAvg.slice(0, 10)
    const maxAvg = topAvg.length ? topAvg[0].avg : 0
    const avgChart = `<div class="card">
      <div class="card-head">
        <h2>Ø hodin na osobu podle středisek ${periodChip()}</h2>
        <span class="hint">práh ${CFG.center.warn} h / ${CFG.center.crit} h · TOP 10</span>
      </div>
      <div class="bars">
        ${topAvg.map((c) => barRow(c.name, c.avg, maxAvg,
          `${hrs(c.avg)} <small>· ${c.people} os.</small>`, c.level)).join('')}
      </div>
    </div>`

    const maxHist = Math.max.apply(null, s.hist.map((b) => b.count).concat([1]))
    const histChart = `<div class="card">
      <div class="card-head">
        <h2>Rozložení přesčasu ${periodChip()}</h2>
        <span class="hint">počet lidí v pásmu hodin</span>
      </div>
      <div class="hist">
        ${s.hist.map((b) => {
          const tone = b.label === '60+' ? 'crit' : b.label === '50–60' || b.label === '40–50' ? 'warn' : ''
          return `<div class="hist-col">
            <span class="n">${b.count || ''}</span>
            <span class="hist-bar${tone ? ' ' + tone : ''}" style="height:${(b.count / maxHist * 100).toFixed(1)}%"></span>
            <span class="lbl">${esc(b.label)}</span>
          </div>`
        }).join('')}
      </div>
    </div>`

    const absM = Math.abs(s.mezdy)
    const absE = Math.abs(s.evidence)
    const splitChart = `<div class="card">
      <div class="card-head">
        <h2>Proplaceno vs. evidence</h2>
        <span class="hint">${esc(rec.period)}</span>
      </div>
      <div class="split">
        <span class="paid" style="width:${(absM / (absM + absE) * 100).toFixed(1)}%"></span>
        <span class="konto" style="width:${(absE / (absM + absE) * 100).toFixed(1)}%"></span>
      </div>
      <div class="legend">
        <span><i class="dot" style="background:var(--accent)"></i>Do MEZD ${hrsU(s.mezdy)} · ${pct(s.paidShare)}</span>
        <span><i class="dot" style="background:var(--accent-2);opacity:.5"></i>${esc(evidenceLabel())} ${hrsU(s.evidence)} · ${pct(1 - s.paidShare)}</span>
      </div>
      <p class="hint" style="margin:12px 0 0">
        Záporná evidence znamená odečet konta po proplacení — proto může někomu vyjít součet 0
        i při desítkách vykázaných hodin.
      </p>
    </div>`

    const findings = `<div class="card">
      <div class="card-head"><h2>Zjištění</h2><span class="hint">počítáno z dat, ne psáno ručně</span></div>
      <ul class="prose" style="margin:0;padding-left:20px">${buildFindings(s, cmp, prevK).map((f) => `<li>${f}</li>`).join('')}</ul>
    </div>`

    el.innerHTML = kpis +
      topCentersCard(s) +
      `<div class="grid two">${avgChart}${histChart}</div>` +
      `<div class="grid two">${splitChart}${findings}</div>` +
      changesCard(cmp, prevK) +
      centerTable(s, cmp)
    bindCenterTable()
    bindPersonLinks('#panel-overview')
    bindCenterLinks('#panel-overview')
    $$('#panel-overview [data-topby]').forEach((b) => b.addEventListener('click', () => {
      ui.topBy = b.dataset.topby
      renderOverview()
    }))
    $$('#panel-overview [data-topmonth]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.topmonth
      const cur = new Set(ui.topMonths && ui.topMonths.length ? ui.topMonths : [ui.month])
      if (cur.has(k)) cur.delete(k)
      else cur.add(k)
      // poslední odebraný měsíc by kartu vyprázdnil — pak zpátky na vybraný
      ui.topMonths = cur.size ? Array.from(cur).sort() : null
      renderOverview()
    }))
    const reset = $('#topmonth-reset')
    if (reset) reset.addEventListener('click', () => { ui.topMonths = null; renderOverview() })
  }

  function buildFindings(s, cmp, prevK) {
    const out = []
    const top = s.byAvg[0]
    if (top) {
      const d = cmp && cmp.centers.find((c) => c.name === top.name)
      out.push(`<strong>${esc(top.name)}</strong> má nejvyšší průměr na osobu: <strong>${hrs(top.avg)}</strong>
        na ${top.people} ${top.people === 1 ? 'člověka' : top.people < 5 ? 'lidi' : 'lidí'}` +
        (d && d.dAvg != null
          /* „klesá o 0:00“ nedává smysl — beze změny se říká slovem */
          ? Math.abs(d.dAvg) < 0.005
            ? ` — stejně jako ${esc(monthShort(prevK))}.`
            : ` — proti ${esc(monthShort(prevK))} ${d.dAvg > 0 ? 'roste' : 'klesá'} o ${hrs(Math.abs(d.dAvg))}.`
          : '.'))
    }
    const abs = s.byTotal[0]
    if (abs) {
      const d = cmp && cmp.centers.find((c) => c.name === abs.name)
      const jumped = d && d.prevTotal != null && cmp.centers.some((c) => c.name !== abs.name && c.prevTotal > d.prevTotal && c.total < abs.total)
      out.push(`Objemově je největší <strong>${esc(abs.name)}</strong> s <strong>${hrsU(abs.total)}</strong>
        na ${abs.people} lidí` + (jumped ? ' — v tomto měsíci přeskočil dosud nejvytíženější středisko.' : '.') +
        ' Průměr ' + hrs(abs.avg) + ' na osobu.')
    }
    if (s.year150) {
      out.push(`<strong>${num(s.year150)} ${s.year150 === 1 ? 'člověk je' : 'lidí je'}</strong> nad ${CFG.year.warn} h ročního přesčasu` +
        (s.year250 ? `, z toho ${num(s.year250)} nad ${CFG.year.crit} h` : '') +
        ` — u nich je potřeba dohoda o práci přesčas nad nařízený rámec.`)
    }
    if (cmp) {
      const dp = Math.round(cmp.dPaidShare * 100)
      if (dp !== 0) {
        out.push(`Podíl proplácených hodin ${dp < 0 ? 'klesl' : 'vzrostl'} z ${pct(s.paidShare - cmp.dPaidShare)}
          na ${pct(s.paidShare)} — ${dp < 0 ? 'roste konto v evidenci' : 'konto se rozpouští do výplat'}.`)
      }
    }
    if (s.overCrit) {
      out.push(`${num(s.overCrit)} ${s.overCrit === 1 ? 'člověk překročil' : 'lidí překročilo'}
        ${CFG.person.crit} h v jednom měsíci` + (PUBLIC ? '.' : `; maximum je ${hrs(s.max)}.`))
    }
    return out.length ? out : ['Za tento měsíc nejsou vykázané žádné přesčasové hodiny.']
  }

  const CHANGE_LIMIT = 10

  /** Seznam lidí, kteří proti minulému měsíci ve výkazu přibyli nebo z něj zmizeli. */
  function changeList(rows, hoursLabel) {
    if (!rows.length) return '<p class="hint" style="margin:0">Nikdo.</p>'
    const shown = rows.slice(0, CHANGE_LIMIT)
    return `<ul class="change-list">${shown.map((r) => `
      <li>
        <span class="who">${esc(r.n)}<small>${esc(r.s)}</small></span>
        <span class="amt">${hrs(r.t)}<small>${esc(hoursLabel)}</small></span>
      </li>`).join('')}
      ${rows.length > shown.length
        ? `<li class="more">a další ${num(rows.length - shown.length)}</li>`
        : ''}
    </ul>`
  }

  function changesCard(cmp, keyA, keyB) {
    if (!cmp) return ''
    const { dropped, added } = cmp
    if (!dropped.length && !added.length) return ''
    const prev = monthShort(keyA)
    const cur = monthShort(keyB || ui.month)

    return `<div class="card">
      <div class="card-head">
        <h2>Kdo přibyl a kdo vypadl</h2>
        <span class="hint">proti ${esc(prev)} · porovnáno podle osobního čísla</span>
      </div>
      <div class="change-cols">
        <div>
          <h3 class="change-title">Vypadli <span class="tag good">${num(dropped.length)}</span></h3>
          <p class="hint">V ${esc(prev)} přesčas měli, v ${esc(cur)} ho ve výkazu nemají —
             typicky dovolená, nemoc nebo odchod.</p>
          ${changeList(dropped, 'v ' + prev)}
        </div>
        <div>
          <h3 class="change-title">Přibyli <span class="tag warn">${num(added.length)}</span></h3>
          <p class="hint">V ${esc(prev)} ve výkazu nebyli, v ${esc(cur)} přesčas mají.</p>
          ${changeList(added, 'v ' + cur)}
        </div>
      </div>
      <p class="hint" style="margin:14px 0 0">
        Kdo mezitím změnil středisko, se tu neobjeví — porovnává se osobní číslo, ne středisko.
      </p>
    </div>`
  }

  /* ---------- TOP střediska a jejich lidé ----------
     Přehled, ze kterého je vidět kde se přesčas hromadí a kdo ho tam dělá,
     bez proklikávání středisko po středisku. */
  const TOP_CENTERS = 6
  const TOP_PEOPLE = 5

  /* Ve veřejném vydání je to nejpřehlednější karta celého panelu, takže se
     neruší — jen se z ní vypustí jmenné seznamy. Souhrn za středisko osobní
     údaj není, žebříček lidí ano. */
  /* Které měsíce má TOP karta sčítat. Prázdný výběr znamená „ten, co je
     nahoře“ — karta pak jede přesně jako dřív. */
  function topMonthKeys() {
    const keys = PP.data.keys()
    const picked = (ui.topMonths || []).filter((k) => keys.includes(k))
    return picked.length ? picked.slice().sort() : (ui.month ? [ui.month] : [])
  }

  /* Statistika pro TOP kartu. U jednoho měsíce se bere hotová měsíční
     statistika, u víc měsíců se sčítá přes periodTotals — tam ale ukázkové
     ani neúplné měsíce nejdou, takže se vypíše, co vypadlo. */
  function topStats(s) {
    const keys = topMonthKeys()
    if (keys.length < 2) return { centers: s.centers, byTotal: s.byTotal, byAvg: s.byAvg, keys, dropped: [] }
    const p = PP.periodTotals(keys)
    if (!p) return { centers: [], byTotal: [], byAvg: [], keys, dropped: keys }
    return {
      centers: p.centers,
      byTotal: p.centers.slice().sort((a, b) => b.total - a.total),
      byAvg: p.centers.slice().sort((a, b) => b.avg - a.avg),
      keys: p.keys,
      dropped: keys.filter((k) => !p.keys.includes(k)),
    }
  }

  function topCentersCard(s) {
    const t = topStats(s)
    if (!t.centers.length) return ''

    const byTotal = ui.topBy === 'total'
    const list = (byTotal ? t.byTotal : t.byAvg).slice(0, TOP_CENTERS)
    const max = byTotal ? list[0].total : list[0].avg
    const vice = t.keys.length > 1

    const stitek = vice
      ? `<span class="period-chip">${esc(monthShort(t.keys[0]))} – ${esc(monthShort(t.keys[t.keys.length - 1]))}</span>`
      : periodChip(t.keys[0])

    /* Ve veřejném vydání jsou jen souhrny bez řádků, takže se přes víc měsíců
       sčítat nedá a výběr se nenabízí. */
    const vyber = PUBLIC || PP.data.keys().length < 2 ? '' : `
      <div class="month-pick" role="group" aria-label="Měsíce v TOP střediscích">
        <span class="month-pick-label">Měsíce:</span>
        ${PP.data.keys().slice().reverse().map((k) => `<button type="button" class="chip sm"
          data-topmonth="${esc(k)}" aria-pressed="${t.keys.includes(k)}">${esc(monthShort(k))}</button>`).join('')}
        ${ui.topMonths && ui.topMonths.length
          ? `<button type="button" class="btn ghost sm" id="topmonth-reset">Jen vybraný měsíc</button>`
          : ''}
      </div>`

    return `<div class="card">
      <div class="card-head">
        <h2>${PUBLIC ? 'TOP střediska' : 'TOP střediska a jejich lidé'}
          ${stitek}</h2>
        <span class="hint">${PUBLIC
          ? `${TOP_CENTERS} středisek s nejvyšším přesčasem`
          : `${TOP_CENTERS} středisek · u každého ${TOP_PEOPLE} lidí s nejvyšším přesčasem`}</span>
      </div>

      ${vyber}
      ${t.dropped.length
        ? `<p class="hint" style="margin:0 0 12px">Nezapočítáno:
             ${esc(t.dropped.map(monthShort).join(', '))} — ukázková data, nebo nejstarší
             měsíc bez předchozího konta.</p>`
        : ''}

      <div class="metric-switch" role="group" aria-label="Řazení středisek">
        <button type="button" class="chip" data-topby="total" aria-pressed="${byTotal}">Podle součtu hodin</button>
        <button type="button" class="chip" data-topby="avg" aria-pressed="${!byTotal}">Podle Ø na osobu</button>
      </div>

      <div class="topc">${list.map((c, i) => {
        const hodnota = byTotal ? c.total : c.avg
        const sirka = max > 0 ? Math.max(2, (hodnota / max) * 100) : 0
        const lide = PUBLIC ? [] : c.rows.slice(0, TOP_PEOPLE)
        const zbytek = PUBLIC ? 0 : c.people - lide.length
        return `<section class="topc-item">
          <header class="topc-head">
            <span class="topc-rank">${i + 1}.</span>
            <span class="topc-name"><button type="button" class="link-center" data-center="${esc(c.name)}"
                title="Otevřít detail střediska">${esc(c.name)}</button>${c.level
              ? ` <span class="tag ${c.level}">${c.level === 'crit' ? 'kritické' : 'sledovat'}</span>` : ''}</span>
            <span class="topc-nums">
              <strong>${byTotal ? hrsU(c.total) : hrs(c.avg)}</strong>
              <small>${byTotal ? `Ø ${hrs(c.avg)} · ${c.people} lidí` : `${hrsU(c.total)} · ${c.people} lidí`}</small>
            </span>
          </header>
          <div class="topc-bar"><span style="width:${sirka.toFixed(1)}%"></span></div>
          ${PUBLIC ? '' : `<ol class="topc-people">${lide.map((r) => {
            const lvl = level(r.t, CFG.person)
            return `<li>
              <button type="button" class="link-person" data-person="${esc(String(r.o))}"
                title="Zobrazit vývoj přes měsíce">${esc(r.n)}</button>
              <span class="amt">${lvl ? `<span class="tag ${lvl}">${hrs(r.t)}</span>` : hrs(r.t)}</span>
            </li>`
          }).join('')}
          ${zbytek > 0 ? `<li class="more">a dalších ${num(zbytek)} ve středisku</li>` : ''}
          </ol>`}
        </section>`
      }).join('')}</div>
    </div>`
  }

  /* Funkce, ne konstanta: popisek druhé složky závisí na naměřené metodice,
     a ta se při načtení skriptu ještě neví. */
  const centerCols = () => [
    { key: 'name', label: 'Středisko', num: false },
    { key: 'people', label: 'Lidí', num: true },
    { key: 'total', label: 'Celkem', num: true },
    { key: 'avg', label: 'Ø / osoba', num: true },
    { key: 'm', label: 'Do MEZD', num: true },
    { key: 'e', label: evidenceLabel(), num: true },
    // Maximum je přesčas jednoho konkrétního člověka — ve veřejném vydání odpadá
    { key: 'max', label: 'Nejvíc u jednoho', num: true, internal: true },
  ].filter((c) => !(c.internal && PUBLIC))

  function centerTable(s, cmp) {
    const dir = ui.sort.dir === 'asc' ? 1 : -1
    const key = ui.sort.key
    const rows = s.centers.slice().sort((a, b) =>
      key === 'name' ? dir * String(a.name).localeCompare(String(b.name), 'cs') : dir * (a[key] - b[key]))
    const dmap = new Map((cmp ? cmp.centers : []).map((c) => [c.name, c]))

    return `<div class="card">
      <div class="card-head">
        <h2>Všechna střediska</h2>
        <span class="hint">${rows.length} středisek · klikem na hlavičku se řadí</span>
      </div>
      <div class="table-wrap"><table id="center-table">
        <thead><tr>
          ${centerCols().map((c) => `<th class="sortable${c.num ? ' num' : ''}" data-key="${c.key}"
            aria-sort="${key === c.key ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"
            >${esc(c.label)}</th>`).join('')}
          ${cmp ? '<th class="num" title="Změna průměru na osobu proti minulému měsíci">Změna Ø</th>' : ''}
        </tr></thead>
        <tbody>${rows.map((c) => {
          const d = dmap.get(c.name)
          return `<tr>
            <td><button type="button" class="link-center" data-center="${esc(c.name)}"
              title="Otevřít detail střediska">${esc(c.name)}</button> ${c.level ? `<span class="tag ${c.level}">${c.level === 'crit' ? 'kritické' : 'sledovat'}</span>` : ''}</td>
            <td class="num">${num(c.people)}</td>
            <td class="num">${hrs(c.total)}</td>
            <td class="num">${hrs(c.avg)}</td>
            <td class="num">${hrs(c.m)}</td>
            <td class="num">${hrs(c.e)}</td>
            ${PUBLIC ? '' : `<td class="num">${hrs(c.max)}</td>`}
            ${cmp ? `<td class="num">${d && d.dAvg != null ? delta(d.dAvg) : '<span class="tag">nové</span>'}</td>` : ''}
          </tr>`
        }).join('')}</tbody>
      </table></div>
      ${colLegend(['avg','m','e','max'])}
    </div>`
  }

  function bindCenterTable() {
    $$('#center-table th.sortable').forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.key
      if (ui.sort.key === key) ui.sort.dir = ui.sort.dir === 'asc' ? 'desc' : 'asc'
      else ui.sort = { key, dir: key === 'name' ? 'asc' : 'desc' }
      renderOverview()
    }))
  }

  /* ---------- Střediska ---------- */
  function renderCenters() {
    const el = $('#panel-centers')
    const rec = currentMonth()
    if (!rec) { el.innerHTML = emptyState('Naimportujte Součtový výkaz a panel se naplní.'); return }
    const s = currentStats()
    if (!s.byAvg.length) { el.innerHTML = emptyState('V tomto měsíci není vykázaný žádný přesčas.'); return }

    if (!ui.center || !s.centers.some((c) => c.name === ui.center)) ui.center = s.byAvg[0].name
    const c = s.centers.find((x) => x.name === ui.center)
    const prevK = previousKey()
    const cmp = prevK ? PP.compare(rec, PP.data.month(prevK)) : null
    const d = cmp && cmp.centers.find((x) => x.name === c.name)

    const chips = `<div class="card">
      <div class="card-head"><h2>Výběr střediska</h2><span class="hint">řazeno podle Ø na osobu</span></div>
      <div class="chips">${s.byAvg.map((x) => `
        <button class="chip ${x.level}" type="button" data-center="${esc(x.name)}" aria-pressed="${x.name === ui.center}">
          <span>${esc(x.name)}</span><span class="c-avg">${hrs(x.avg)}</span>
        </button>`).join('')}</div>
    </div>`

    const share = s.total ? c.total / s.total : 0
    const kpis = `<div class="grid kpis">
      ${kpi('Přesčas celkem', hrsU(c.total), `${pct(share)} přesčasu závodu`, '', 'hero')}
      ${kpi('Lidí s přesčasem', num(c.people), PUBLIC ? 'v tomto měsíci' : `nejvíc u jednoho ${hrs(c.max)}`)}
      ${kpi('Ø na osobu', hrs(c.avg),
        d && d.dAvg != null ? vsPrev(prevK, d.dAvg) : 'práh ' + CFG.center.warn + ' / ' + CFG.center.crit + ' h',
        c.level)}
      ${kpi('Proplaceno (MEZD)', pct(c.total ? c.m / c.total : 0), `${hrsU(c.m)} z ${hrsU(c.total)}`)}
    </div>`

    const top5 = c.rows.slice(0, 5)
    const maxTop = top5.length ? top5[0].t : 0
    const topCard = `<div class="card">
      <div class="card-head"><h3>TOP 5 lidí</h3><span class="hint">${esc(c.name)}</span></div>
      <div class="bars">${top5.map((r) =>
        barRow(r.n, r.t, maxTop, hrs(r.t), level(r.t, CFG.person))).join('')}</div>
    </div>`

    const listCard = `<div class="card">
      <div class="card-head"><h3>Všichni s přesčasem</h3><span class="hint">${c.people} lidí</span></div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th class="rank">#</th><th>Jméno</th><th class="num">Os. č.</th>
          <th class="num">Do MEZD</th><th class="num">${esc(evidenceLabel())}</th>
          <th class="num">Přesčas</th><th class="num">Ročně</th>
        </tr></thead>
        <tbody>${c.rows.map((r, i) => personRow(r, i + 1)).join('')}</tbody>
      </table></div>
      ${colLegend(['m','e','t','r'])}
    </div>`

    // Ve veřejném vydání odpadá všechno jmenné — zůstanou jen čísla za středisko.
    el.innerHTML = PUBLIC ? chips + kpis : chips + kpis + topCard + listCard
    if (!PUBLIC) bindPersonLinks('#panel-centers')
    $$('#panel-centers .chip').forEach((b) => b.addEventListener('click', () => {
      ui.center = b.dataset.center
      renderCenters()
    }))
  }

  function personRow(r, rank, query) {
    const lvl = level(r.t, CFG.person)
    const ylvl = r.r >= CFG.year.crit ? 'crit' : r.r > CFG.year.warn ? 'warn' : ''
    return `<tr>
      <td class="rank">${rank}</td>
      <td class="name"><button type="button" class="link-person" data-person="${esc(String(r.o))}"
        title="Zobrazit vývoj přes měsíce">${query ? mark(r.n, query) : esc(r.n)}</button></td>
      <td class="num">${esc(String(r.o))}</td>
      <td class="num">${hrs(r.m)}</td>
      <td class="num">${hrs(r.e)}</td>
      <td class="num">${lvl ? `<span class="tag ${lvl}">${hrs(r.t)}</span>` : hrs(r.t)}</td>
      <td class="num">${ylvl ? `<span class="tag ${ylvl}">${hrs(r.r)}</span>` : hrs(r.r)}</td>
    </tr>`
  }

  /* ---------- Žebříček závodu ---------- */
  function renderRanking() {
    const el = $('#panel-ranking')
    const rec = currentMonth()
    if (!rec) { el.innerHTML = emptyState('Naimportujte Součtový výkaz a panel se naplní.'); return }
    const s = currentStats()

    const q = fold(ui.query)
    const hits = q
      ? s.ranking.filter((r) => fold(r.n).includes(q) || fold(r.s).includes(q))
      : s.ranking
    const shown = hits.slice(0, ui.rankingLimit)

    el.innerHTML = `<div class="card">
      <div class="card-head">
        <h2>Žebříček závodu</h2>
        <span class="hint">${esc(monthName(ui.month))} · ${num(hits.length)} z ${num(s.ranking.length)} lidí</span>
      </div>
      <input type="search" id="ranking-search" placeholder="Hledat jméno nebo středisko…"
             value="${esc(ui.query)}" style="width:100%;max-width:420px;margin-bottom:14px">
      <div class="table-wrap"><table>
        <thead><tr>
          <th class="rank">#</th><th>Jméno</th><th>Středisko</th>
          <th class="num">Do MEZD</th><th class="num">${esc(evidenceLabel())}</th>
          <th class="num">Přesčas</th><th class="num">Ročně</th>
        </tr></thead>
        <tbody>${shown.length
          ? shown.map((r) => {
              const rank = s.ranking.indexOf(r) + 1
              const lvl = level(r.t, CFG.person)
              const ylvl = r.r >= CFG.year.crit ? 'crit' : r.r > CFG.year.warn ? 'warn' : ''
              return `<tr>
                <td class="rank">${rank}</td>
                <td class="name"><button type="button" class="link-person" data-person="${esc(String(r.o))}"
                  title="Zobrazit vývoj přes měsíce">${mark(r.n, ui.query)}</button></td>
                <td>${mark(r.s, ui.query)}</td>
                <td class="num">${hrs(r.m)}</td>
                <td class="num">${hrs(r.e)}</td>
                <td class="num">${lvl ? `<span class="tag ${lvl}">${hrs(r.t)}</span>` : hrs(r.t)}</td>
                <td class="num">${ylvl ? `<span class="tag ${ylvl}">${hrs(r.r)}</span>` : hrs(r.r)}</td>
              </tr>`
            }).join('')
          : `<tr><td colspan="7" class="empty">Nikdo neodpovídá hledání „${esc(ui.query)}“.</td></tr>`}
        </tbody>
      </table></div>
      ${colLegend(['m','e','t','r'])}
      ${hits.length > shown.length
        ? `<p style="margin:14px 0 0"><button class="btn ghost sm" type="button" id="ranking-more">
             Zobrazit dalších ${Math.min(25, hits.length - shown.length)} (celkem ${num(hits.length)})
           </button></p>`
        : ''}
    </div>`

    const input = $('#ranking-search')
    input.addEventListener('input', () => {
      ui.query = input.value
      ui.rankingLimit = 25
      renderRanking()
      const again = $('#ranking-search')
      again.focus()
      again.setSelectionRange(again.value.length, again.value.length)
    })
    bindPersonLinks('#panel-ranking')
    const more = $('#ranking-more')
    if (more) more.addEventListener('click', () => { ui.rankingLimit += 25; renderRanking() })
  }

  /* ---------- Vývoj přes víc měsíců ---------- */
  const METRICS = {
    total: {
      label: 'Přesčas celkem',
      plant: (s) => s.total,
      center: (c) => c.total,
      format: (v) => hrsU(v),
      tick: (v) => num(v) + ' h',
    },
    avg: {
      label: 'Ø na osobu',
      plant: (s) => s.avg,
      center: (c) => c.avg,
      format: hrs,
    },
    people: {
      label: 'Lidí s přesčasem',
      plant: (s) => s.withOvertime,
      center: (c) => c.people,
      format: num,
    },
    paid: {
      label: 'Podíl proplacených',
      plant: (s) => s.paidShare,
      center: (c) => (c.total ? c.m / c.total : 0),
      format: pct,
      tick: pct,
    },
  }

  /** Měsíce od nejstaršího k nejnovějšímu — graf vývoje čte čas zleva doprava. */
  function timeline() {
    return PP.data.keys().slice().reverse()
  }

  /** Pět největších středisek podle posledního měsíce. Barva patří středisku,
      ne jeho pořadí, takže přepnutí ukazatele nepřebarví přeživší. */
  function topCenters() {
    const keys = timeline()
    if (!keys.length) return []
    const last = PP.stats(PP.data.month(keys[keys.length - 1]))
    const colors = PP.seriesColors()
    return last.byTotal.slice(0, 5).map((c, i) => ({ name: c.name, color: colors[i] }))
  }

  function metricSwitcher() {
    return `<div class="metric-switch" role="group" aria-label="Ukazatel grafu">
      ${Object.keys(METRICS).map((k) => `<button type="button" class="chip" data-metric="${k}"
        aria-pressed="${k === ui.metric}">${esc(METRICS[k].label)}</button>`).join('')}
    </div>`
  }

  /** Nakreslí oba grafy vývoje do už vykreslených karet. */
  function drawTrends() {
    const keys = timeline()
    if (keys.length < 2) return
    const M = METRICS[ui.metric] || METRICS.total
    const labels = keys.map(monthShort)

    const plantHost = $('#chart-plant')
    if (plantHost) {
      PP.lineChart(plantHost, {
        labels,
        format: M.format,
        tickFormat: M.tick,
        area: true,
        height: 250,
        ariaLabel: `Vývoj ukazatele ${M.label} za závod`,
        series: [{
          name: M.label,
          color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f9e91',
          values: keys.map((k) => M.plant(PP.stats(PP.data.month(k)))),
        }],
      })
    }

    const centerHost = $('#chart-centers')
    if (centerHost) {
      PP.lineChart(centerHost, {
        labels,
        format: M.format,
        tickFormat: M.tick,
        endLabel: true,
        height: 260,
        ariaLabel: `Vývoj ukazatele ${M.label} po střediscích`,
        series: topCenters().map((t) => ({
          name: centerName(t.name),
          color: t.color,
          values: keys.map((k) => {
            const c = PP.stats(PP.data.month(k)).centers.find((x) => x.name === t.name)
            return c ? M.center(c) : null
          }),
        })),
      })
    }
  }

  function trendCards() {
    const keys = timeline()
    if (keys.length < 2) return ''
    const M = METRICS[ui.metric] || METRICS.total
    const first = PP.stats(PP.data.month(keys[0]))
    const last = PP.stats(PP.data.month(keys[keys.length - 1]))
    const from = M.plant(first)
    const to = M.plant(last)

    return `<div class="card">
      <div class="card-head">
        <h2>Vývoj závodu</h2>
        <span class="hint">${esc(monthShort(keys[0]))} – ${esc(monthShort(keys[keys.length - 1]))} ·
          ${esc(M.label)}: ${esc(M.format(from))} → ${esc(M.format(to))}</span>
      </div>
      ${metricSwitcher()}
      <div class="chart-host" id="chart-plant"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Vývoj středisek</h2>
        <span class="hint">pět největších podle posledního měsíce · ${esc(M.label)}</span>
      </div>
      <div class="chart-host" id="chart-centers"></div>
      <div class="legend chart-legend">${topCenters().map((t) =>
        `<span><i class="dot" style="background:${t.color}"></i>${esc(t.name)}</span>`).join('')}</div>
    </div>`
  }

  /* ---------- Vývoj jednoho člověka ---------- */
  const PERSON_METRICS = {
    month: {
      label: 'Měsíční přesčas',
      value: (p) => p.t,
      refs: [
        { value: CFG.person.warn, label: CFG.person.warn + ' h', tone: 'warn' },
        { value: CFG.person.crit, label: CFG.person.crit + ' h', tone: 'crit' },
      ],
    },
    year: {
      label: 'Roční součet',
      value: (p) => p.r,
      refs: [
        { value: CFG.year.warn, label: CFG.year.warn + ' h', tone: 'warn' },
        { value: CFG.year.crit, label: CFG.year.crit + ' h', tone: 'crit' },
        { value: CFG.year.cap, label: 'strop ' + CFG.year.cap + ' h', tone: 'crit' },
      ],
    },
  }

  function drawPerson(hist) {
    const host = $('#chart-person')
    if (!host || !hist) return
    const M = PERSON_METRICS[ui.personMetric] || PERSON_METRICS.month
    PP.lineChart(host, {
      labels: hist.points.map((p) => monthShort(p.key)),
      format: hrs,
      area: ui.personMetric === 'month',
      height: 250,
      refs: M.refs,
      domainMax: ui.personMetric === 'year' ? CFG.year.cap : null,
      ariaLabel: `${M.label} — ${hist.person.n}`,
      series: [{
        name: M.label,
        color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f9e91',
        values: hist.points.map(M.value),
      }],
    })
  }

  /** Rozpad měsíce na mzdové složky — ukazuje, z čeho přesně součet vznikl. */
  function breakdownRow(x) {
    const list = x.comps || []
    return `<tr class="breakdown-row"><td colspan="7">
      <div class="breakdown">
        <h4>Z čeho se ${esc(monthName(x.key))} skládá</h4>
        <table class="mini"><thead><tr>
          <th>Mzdová složka</th><th class="num">Hodiny</th>
          <th class="num">Řádků</th><th>Počítá se do</th>
        </tr></thead><tbody>
        ${list.map((c) => {
          const where = PP.componentBucket(c.name)
          return `<tr>
            <td>${esc(c.name)}</td>
            <td class="num">${hrs(c.h)}</td>
            <td class="num">${num(c.rows)}</td>
            <td>${!where
              ? '<span class="tag">nepočítá se</span>'
              : where === 'r'
              ? '<span class="hint">jen roční součet</span>'
              : `<strong>přesčasu za měsíc</strong>`}</td>
          </tr>`
        }).join('')}
        </tbody><tfoot><tr>
          <td>Přesčas za měsíc = do MEZD + evidence</td>
          <td class="num"><strong>${hrs(x.t)}</strong></td>
          <td class="num"></td><td></td>
        </tr></tfoot></table>
        ${list.some((c) => !PP.componentBucket(c.name))
          ? `<p class="hint" style="margin:8px 0 0">Složky označené <span class="tag">nepočítá se</span>
               ve výkazu jsou, ale do měsíčního přesčasu nepatří — buď je to tatáž hodnota pod jiným
               názvem (<em>Přesčas zaplatit</em> = <em>do MEZD</em>), nebo zůstatek z minulého měsíce
               (<em>Přesčas přenesený</em>). Sečíst je by hodiny zdvojilo.</p>`
          : ''}
        ${list.some((c) => c.rows > 1)
          ? `<p class="hint" style="margin:8px 0 0">Složka, u které je víc než jeden řádek,
               byla ve výkazu vícekrát a hodiny se sečetly.</p>`
          : ''}
      </div>
    </td></tr>`
  }

  function personCard() {
    const q = fold(ui.personQuery)
    const hist = ui.person ? PP.personHistory(ui.person) : null

    let body
    if (hist) {
      const p = hist.person
      const gaps = hist.points.filter((x) => x.t == null).length
      const last = hist.points[hist.points.length - 1]
      body = `<div class="grid kpis">
        ${kpi('Přesčas za rok', hrs(hist.year),
          `zbývá ${hrs(Math.max(0, CFG.year.cap - hist.year))} do stropu`,
          level(hist.year, { warn: CFG.year.warn, crit: CFG.year.crit }))}
        ${kpi('Ø na měsíc', hrs(hist.avg), `z ${hist.months} ${hist.months === 1 ? 'měsíce' : hist.months < 5 ? 'měsíců' : 'měsíců'} s přesčasem`, level(hist.avg, CFG.person))}
        ${kpi('Nejvyšší měsíc', hrs(hist.max), '', level(hist.max, CFG.person))}
        ${kpi('Měsíců bez přesčasu', num(gaps), gaps ? 've výkazu vůbec nebyl' : 'přesčas měl každý měsíc', gaps ? '' : 'warn')}
      </div>

      <div class="person-metric">
        ${Object.keys(PERSON_METRICS).map((k) => `<button type="button" class="chip" data-pmetric="${k}"
          aria-pressed="${k === ui.personMetric}">${esc(PERSON_METRICS[k].label)}</button>`).join('')}
      </div>
      <div class="chart-host" id="chart-person"></div>

      <div class="table-wrap" style="margin-top:18px"><table>
        <thead><tr>
          <th>Měsíc</th><th class="num">Do MEZD</th><th class="num">${esc(evidenceLabel())}</th>
          <th class="num">Přesčas</th><th class="num">Pořadí v závodě</th>
          <th class="num">Ročně</th><th class="num">Δ ročně</th>
        </tr></thead>
        <tbody>${hist.points.map((x) => {
          if (x.t == null) {
            return `<tr class="muted-row"><td>${esc(monthName(x.key))}</td>
              <td colspan="4" class="hint">ve výkazu není — přesčas neměl</td>
              <td class="num">${x.r == null ? '—' : hrs(x.r)}</td>
              <td class="num">${x.dr == null ? '—' : hrs(x.dr)}</td></tr>`
          }
          const lvl = level(x.t, CFG.person)
          const open = !!ui.personOpen[x.key]
          const label = x.comps && x.comps.length
            ? `<button type="button" class="link-plain" data-pbreak="${esc(x.key)}"
                 aria-expanded="${open}" title="Ukázat, z jakých mzdových složek se součet skládá"
                 >${esc(monthName(x.key))} <span class="caret">${open ? '▾' : '▸'}</span></button>`
            : esc(monthName(x.key))
          return `<tr>
            <td>${label}</td>
            <td class="num">${hrs(x.m)}</td>
            <td class="num">${PP.data.method === 'balance'
              ? (x.de == null
                  ? `<span class="hint" title="Chybí předchozí měsíc, přírůstek se nemá od čeho odrazit">—</span>`
                  : hrs(x.de))
              : hrs(x.e)}</td>
            <td class="num">${lvl ? `<span class="tag ${lvl}">${hrs(x.t)}</span>` : hrs(x.t)}</td>
            <td class="num">${x.rank}. z ${x.of}</td>
            <td class="num">${hrs(x.r)}</td>
            <td class="num">${x.dr == null ? '—'
              : x.drMatches ? hrs(x.dr)
              : `<span class="tag crit" title="Roční součet přibyl o jinou hodnotu, než je měsíční přesčas">${hrs(x.dr)}</span>`}</td>
          </tr>${open ? breakdownRow(x) : ''}`
        }).join('')}</tbody>
      </table></div>

      <p class="hint" style="margin:14px 0 0">
        Kliknutím na měsíc se rozbalí <strong>rozpad na mzdové složky</strong> — přesně ty
        řádky výkazu, které se do součtu sečetly.
      </p>
      <p class="hint" style="margin:6px 0 0">
        <strong>Δ ročně</strong> je přírůstek ročního součtu proti předchozímu měsíci.
        Měl by se rovnat sloupci Přesčas. Když se liší (červeně), počítá mzdový systém
        do ročního součtu něco jiného než součet vykázaných přesčasů.
      </p>
      <p class="hint" style="margin:6px 0 0">
        ${esc(p.n)} · osobní číslo ${esc(String(p.o))} · ${esc(p.s)}${last.t == null
          ? ' · v posledním měsíci ve výkazu není' : ''}
      </p>`
    } else if (q) {
      const hits = PP.roster().filter((r) =>
        fold(r.n).includes(q) || String(r.o).includes(q) || fold(r.s).includes(q)).slice(0, 8)
      body = hits.length
        ? `<ul class="person-hits">${hits.map((r) => `<li>
            <button type="button" data-pick="${esc(String(r.o))}">
              <span class="who">${mark(r.n, ui.personQuery)}<small>${esc(r.s)} · ${esc(String(r.o))}</small></span>
              <span class="hint">${r.months} ${r.months === 1 ? 'měsíc' : r.months < 5 ? 'měsíce' : 'měsíců'}</span>
            </button></li>`).join('')}</ul>`
        : `<p class="hint">Nikdo neodpovídá hledání „${esc(ui.personQuery)}“.</p>`
    } else {
      body = `<p class="hint">Napište jméno, osobní číslo nebo středisko. Na jméno se dá
        kliknout i v Žebříčku závodu a ve Střediscích.</p>`
    }

    return `<div class="card">
      <div class="card-head">
        <h2>Vývoj jednoho člověka</h2>
      </div>
      <div class="person-back">
        ${ui.person || ui.personPick
          ? `<button class="btn ghost sm" type="button" id="person-close">← Zpět na vývoj a srovnání</button>`
          : ''}
        ${hist ? `<button class="btn ghost sm" type="button" id="person-clear">Vybrat jiného</button>` : ''}
      </div>
      ${hist ? '' : `<input type="search" id="person-search" placeholder="Hledat člověka…"
        value="${esc(ui.personQuery)}" style="width:100%;max-width:420px;margin-bottom:14px">`}
      ${body}
    </div>`
  }

  function bindPersonCard() {
    const input = $('#person-search')
    if (input) {
      input.addEventListener('input', () => {
        ui.personQuery = input.value
        renderCompare()
        const again = $('#person-search')
        if (again) {
          again.focus()
          again.setSelectionRange(again.value.length, again.value.length)
        }
      })
    }
    $$('#panel-compare [data-pick]').forEach((b) => b.addEventListener('click', () => {
      ui.person = b.dataset.pick
      ui.personQuery = ''
      ui.personOpen = {}
      ui.personPick = false
      renderCompare()
    }))
    const clear = $('#person-clear')
    if (clear) clear.addEventListener('click', () => {
      ui.person = null
      ui.personOpen = {}
      ui.personPick = true
      ui.personQuery = ''
      renderCompare()
      const input = $('#person-search')
      if (input) input.focus()
    })
    const close = $('#person-close')
    if (close) close.addEventListener('click', () => {
      ui.person = null
      ui.personOpen = {}
      ui.personPick = false
      ui.personQuery = ''
      go('compare')
    })
    $$('#panel-compare [data-pmetric]').forEach((b) => b.addEventListener('click', () => {
      ui.personMetric = b.dataset.pmetric
      renderCompare()
    }))
    $$('#panel-compare [data-pbreak]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.pbreak
      if (ui.personOpen[k]) delete ui.personOpen[k]
      else ui.personOpen[k] = true
      renderCompare()
    }))
  }

  /** Hodnota se znaménkem; nula je prostě nula — „−0:00“ je nesmysl. */
  function signed(value, formatter) {
    const f = formatter || hrs
    if (Math.abs(value) < 0.005) return f(0)
    return (value > 0 ? '+' : '−') + f(Math.abs(value))
  }
  /** Tón podle směru změny; beze změny žádná barva. */
  function trendTone(value, upIsBad) {
    if (Math.abs(value) < 0.005) return ''
    return (value > 0) === (upIsBad !== false) ? 'crit' : 'good'
  }

  /* ---------- Srovnání měsíců ---------- */
  const CMP_COLS = [
    { key: 'name', label: 'Středisko', num: false },
    { key: 'prevTotal', label: 'Celkem A', num: true },
    { key: 'total', label: 'Celkem B', num: true },
    { key: 'dTotal', label: 'Δ celkem', num: true },
    { key: 'prevAvg', label: 'Ø A', num: true },
    { key: 'avg', label: 'Ø B', num: true },
    { key: 'dAvg', label: 'Změna Ø', num: true },
  ]

  function renderCompare() {
    const el = $('#panel-compare')
    const keys = PP.data.keys()
    if (keys.length < 2) {
      el.innerHTML = emptyState('Vývoj a srovnání potřebují aspoň dva měsíce. Naimportujte další výkaz.')
      return
    }

    // výchozí dvojice: aktuální měsíc proti tomu předchozímu
    if (!keys.includes(ui.cmpB)) ui.cmpB = keys.includes(ui.month) ? ui.month : keys[0]
    if (!keys.includes(ui.cmpA) || ui.cmpA === ui.cmpB) {
      const i = keys.indexOf(ui.cmpB)
      ui.cmpA = keys[i + 1] != null ? keys[i + 1] : keys[i - 1]
    }

    const recA = PP.data.month(ui.cmpA)
    const recB = PP.data.month(ui.cmpB)
    const sA = PP.stats(recA)
    const sB = PP.stats(recB)
    const cmp = PP.compare(recB, recA)
    const A = monthShort(ui.cmpA)
    const B = monthShort(ui.cmpB)

    const picker = `<div class="card">
      <div class="card-head"><h2>Které měsíce porovnat</h2>
        <span class="hint">A je starší, B novější — Δ ukazuje změnu z A na B</span></div>
      <div class="cmp-picker">
        <label>A <select id="cmp-a">${keys.map((k) =>
          `<option value="${esc(k)}" ${k === ui.cmpA ? 'selected' : ''}>${esc(monthName(k))}</option>`).join('')}</select></label>
        <span class="cmp-arrow" aria-hidden="true">→</span>
        <label>B <select id="cmp-b">${keys.map((k) =>
          `<option value="${esc(k)}" ${k === ui.cmpB ? 'selected' : ''}>${esc(monthName(k))}</option>`).join('')}</select></label>
        <button class="btn ghost sm" type="button" id="cmp-swap">Prohodit</button>
      </div>
    </div>`

    const pb = (v) => Math.round(Math.abs(v) * 100) + ' p. b.'
    const kpis = `<div class="grid kpis">
      ${kpi(`Změna přesčasu ${esc(A)} → ${esc(B)}`, signed(cmp.dTotal, hrsU),
        `${hrs(sA.total)} → ${hrsU(sB.total)}`, trendTone(cmp.dTotal), 'hero')}
      ${kpi('Ø na osobu', signed(cmp.dAvg),
        `${hrs(sA.avg)} → ${hrs(sB.avg)}`, trendTone(cmp.dAvg))}
      ${kpi('Lidí s přesčasem', signed(cmp.dPeople, num),
        `${num(sA.withOvertime)} → ${num(sB.withOvertime)}`)}
      ${kpi('Podíl proplacených', signed(cmp.dPaidShare, pb),
        `${pct(sA.paidShare)} → ${pct(sB.paidShare)}`)}
    </div>
    <div class="grid kpis alarms">
      ${kpi('Přibyli', num(cmp.added.length), `v ${esc(A)} nebyli, v ${esc(B)} ano`,
        cmp.added.length ? 'warn' : 'good')}
      ${kpi('Vypadli', num(cmp.dropped.length), `byli v ${esc(A)}, v ${esc(B)} už ne`, 'good')}
    </div>`

    const dir = ui.cmpSort.dir === 'asc' ? 1 : -1
    const sk = ui.cmpSort.key
    const rows = cmp.centers.slice().sort((x, y) => {
      if (sk === 'name') return dir * String(x.name).localeCompare(String(y.name), 'cs')
      return dir * ((x[sk] == null ? -Infinity : x[sk]) - (y[sk] == null ? -Infinity : y[sk]))
    })

    const table = `<div class="card">
      <div class="card-head"><h2>Střediska</h2>
        <span class="hint">A = ${esc(monthName(ui.cmpA))} · B = ${esc(monthName(ui.cmpB))}</span></div>
      <div class="table-wrap"><table id="cmp-table">
        <thead><tr>${CMP_COLS.map((c) => `<th class="sortable${c.num ? ' num' : ''}" data-key="${c.key}"
          aria-sort="${sk === c.key ? (ui.cmpSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"
          >${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((c) => `<tr>
          <td>${esc(c.name)}</td>
          <td class="num">${c.prevTotal == null ? '—' : hrs(c.prevTotal)}</td>
          <td class="num">${hrs(c.total)}</td>
          <td class="num">${c.dTotal == null ? '<span class="tag">nové</span>' : delta(c.dTotal, hrs)}</td>
          <td class="num">${c.prevAvg == null ? '—' : hrs(c.prevAvg)}</td>
          <td class="num">${hrs(c.avg)}</td>
          <td class="num">${c.dAvg == null ? '<span class="tag">nové</span>' : delta(c.dAvg)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`

    const up = cmp.movers.filter((m) => m.d > 0).slice(0, 10)
    const down = cmp.movers.filter((m) => m.d < 0).slice(-10).reverse()
    const moverList = (list, tone) => list.length
      ? `<ul class="change-list">${list.map((m) => `<li>
          <span class="who">${esc(m.r.n)}<small>${esc(m.r.s)}</small></span>
          <span class="amt">${delta(m.d)}<small>${hrs(m.prev.t)} → ${hrs(m.r.t)}</small></span>
        </li>`).join('')}</ul>`
      : '<p class="hint" style="margin:0">Nikdo.</p>'

    const movers = `<div class="card">
      <div class="card-head"><h2>Největší změny u lidí</h2>
        <span class="hint">jen ti, kdo jsou v obou měsících — ${num(cmp.movers.length)} lidí</span></div>
      <div class="change-cols">
        <div>
          <h3 class="change-title">Nejvíc přidali <span class="tag crit">${num(cmp.movers.filter((m) => m.d > 0).length)}</span></h3>
          <p class="hint">Přesčas jim proti ${esc(A)} narostl.</p>
          ${moverList(up)}
        </div>
        <div>
          <h3 class="change-title">Nejvíc ubrali <span class="tag good">${num(cmp.movers.filter((m) => m.d < 0).length)}</span></h3>
          <p class="hint">Přesčas jim proti ${esc(A)} klesl.</p>
          ${moverList(down)}
        </div>
      </div>
    </div>`

    /* Vybraný člověk dostane stránku sám pro sebe. Dřív se jeho karta
       schovávala mezi grafy závodu a srovnáním měsíců, takže se ten detail
       musel hledat — a přitom je to to jediné, co v tu chvíli člověk chce. */
    if (!PUBLIC && (ui.person || ui.personPick)) {
      $('#section-title').textContent = ui.person
        ? (PP.personHistory(ui.person) || {}).person.n
        : 'Vývoj jednoho člověka'
      $('#section-sub').textContent = 'Jak se přesčas vyvíjí u jednoho člověka.'
      el.innerHTML = personCard()
      if (ui.person) drawPerson(PP.personHistory(ui.person))
      bindPersonCard()
      PP.watchCharts(() => { if (ui.person) drawPerson(PP.personHistory(ui.person)) })
      return
    }

    el.innerHTML = PUBLIC
      ? trendCards() + picker + kpis + table
      : trendCards() + personCard() + picker + kpis + table + movers +
        changesCard(cmp, ui.cmpA, ui.cmpB)
    drawTrends()
    if (!PUBLIC) {
      if (ui.person) drawPerson(PP.personHistory(ui.person))
      bindPersonCard()
    }
    PP.watchCharts(() => {
      drawTrends()
      if (ui.person) drawPerson(PP.personHistory(ui.person))
    })

    $$('#panel-compare [data-metric]').forEach((b) => b.addEventListener('click', () => {
      ui.metric = b.dataset.metric
      renderCompare()
    }))

    $('#cmp-a').addEventListener('change', (e) => { ui.cmpA = e.target.value; renderCompare() })
    $('#cmp-b').addEventListener('change', (e) => { ui.cmpB = e.target.value; renderCompare() })
    $('#cmp-swap').addEventListener('click', () => {
      const t = ui.cmpA; ui.cmpA = ui.cmpB; ui.cmpB = t
      renderCompare()
    })
    $$('#cmp-table th.sortable').forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.key
      if (ui.cmpSort.key === key) ui.cmpSort.dir = ui.cmpSort.dir === 'asc' ? 'desc' : 'asc'
      else ui.cmpSort = { key, dir: key === 'name' ? 'asc' : 'desc' }
      renderCompare()
    }))
  }

  /* ---------- Týdny ----------
     Mzdy umí Součtový výkaz vytisknout i za týden. Takové výkazy drží panel
     ve vlastní řadě vedle měsíců — sečíst týden s měsícem, který ho obsahuje,
     by hodiny zdvojilo. */

  const WEEK_TOP_PEOPLE = 15

  function renderWeeks() {
    const el = $('#panel-weeks')
    const keys = PP.data.weekKeys()

    if (!keys.length) {
      el.innerHTML = `<div class="card"><div class="prose">
        <h3>Zatím žádný týdenní výkaz</h3>
        <p>Týden umí panel vzít ze dvou sestav a u každé počítá jinak:</p>
        <ul>
          <li><strong>Přehledový výkaz docházky</strong> — přesčas je
              <strong>Celkem odpracováno − Fond</strong>. Tohle je pro týdny ta správná
              cesta: docházka ví, kdo kolik hodin doopravdy odstál.</li>
          <li><strong>Součtový výkaz z mezd</strong> s obdobím za jeden týden (například
              <code>12.10.2026 - 18.10.2026</code>) — počítá se stejně jako měsíce, tedy
              z mzdových složek.</li>
        </ul>
        <p class="hint">Měsíční přehled zůstává na Součtovém výkazu. Období delší než osm
        dní, které není celý kalendářní měsíc, panel odmítne; smíchat měsíce s půlměsíci
        by znamenalo sčítat nesrovnatelná období.</p>
      </div></div>`
      return
    }

    if (!ui.week || !keys.includes(ui.week)) ui.week = keys[0]
    const rec = PP.data.week(ui.week)
    const s2 = PP.stats(rec)
    const prevKey = keys[keys.indexOf(ui.week) + 1] || null
    const prev = prevKey ? PP.stats(PP.data.week(prevKey)) : null

    const vyber = `<div class="month-pick" role="group" aria-label="Výběr týdne">
      <span class="month-pick-label">Týden:</span>
      ${keys.map((k) => `<button type="button" class="chip sm" data-week="${esc(k)}"
        aria-pressed="${k === ui.week}">${esc(weekShort(k))}</button>`).join('')}
    </div>`

    const delta = (now, before, fmt) => before == null ? ''
      : `proti ${weekShort(prevKey)} ${now - before >= 0 ? '+' : '−'}${fmt(Math.abs(now - before))}`

    const kpis = `<div class="grid kpis">
      ${kpi('Přesčas celkem', hrsU(s2.total), delta(s2.total, prev && prev.total, (v) => hrsU(v)), '', 'hero')}
      ${kpi('Lidí s přesčasem', num(s2.withOvertime), `z ${num(rec.people)} osob`)}
      ${kpi('Ø na osobu', hrs(s2.avg), delta(s2.avg, prev && prev.avg, hrs), level(s2.avg, CFG.week))}
      ${s2.dochazka
        ? kpi('Odpracováno vs. fond', hrsU(s2.worked),
            `fond ${hrsU(s2.fund)}, z toho ${hrsU(s2.absence)} placené nepřítomnosti`)
        : kpi('Proplaceno (MEZD)', pct(s2.total ? s2.mezdy / s2.total : 0), `${hrsU(s2.mezdy)} z ${hrsU(s2.total)}`)}
    </div>
    <div class="grid kpis alarms">
      ${kpi('Nad ' + CFG.week.crit + ' h za týden', num(s2.ranking.filter((r) => r.t >= CFG.week.crit).length),
        `nad ${CFG.week.warn} h: ${num(s2.ranking.filter((r) => r.t >= CFG.week.warn).length)}`,
        s2.ranking.some((r) => r.t >= CFG.week.crit) ? 'crit' : 'good')}
      ${s2.dochazka
        ? kpi('Schází do fondu', hrsU(s2.under),
            `${num(s2.underPeople)} ${s2.underPeople === 1 ? 'člověk' : s2.underPeople < 5 ? 'lidé' : 'lidí'} pod fondem`,
            s2.under > 0 ? 'warn' : 'good')
        : ''}
    </div>`

    const graf = keys.length < 2 ? '' : `<div class="card">
      <div class="card-head">
        <h2>Vývoj po týdnech</h2>
        <span class="hint">${esc(weekShort(keys[keys.length - 1]))} – ${esc(weekShort(keys[0]))} · přesčas celkem</span>
      </div>
      <div class="chart-host" id="chart-weeks"></div>
    </div>`

    const strediska = `<div class="card">
      <div class="card-head">
        <h2>Střediska <span class="period-chip">${esc(weekShort(ui.week))}</span></h2>
        <span class="hint">${num(s2.centers.length)} středisek · práh ${CFG.week.warn} h / ${CFG.week.crit} h na osobu</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Středisko</th><th class="num">Lidí</th><th class="num">Přesčas</th>
          <th class="num">Ø / osoba</th>${s2.dochazka
            ? '<th class="num">Schází</th><th class="num">Odpracováno</th>' +
              '<th class="num">Fond</th><th class="num">Nepřítomnost</th>'
            : `<th class="num">Do MEZD</th><th class="num">${esc(evidenceLabel())}</th>`}</tr></thead>
        <tbody>${s2.byTotal.map((c) => {
          const lvl = level(c.avg, CFG.week)
          const sum = (f) => c.rows.reduce((a, r) => a + (Number(r[f]) || 0), 0)
          return `<tr>
            <td><button type="button" class="link-center" data-center="${esc(c.name)}"
              title="Otevřít detail střediska">${esc(c.name)}</button>
              ${lvl ? ` <span class="tag ${lvl}">${lvl === 'crit' ? 'kritické' : 'sledovat'}</span>` : ''}</td>
            <td class="num">${num(c.people)}</td>
            <td class="num">${hrs(c.total)}</td>
            <td class="num">${hrs(c.avg)}</td>
            ${s2.dochazka
              ? `<td class="num">${sum('u') ? hrs(sum('u')) : '—'}</td>
                 <td class="num">${hrs(sum('w'))}</td><td class="num">${hrs(sum('fo'))}</td>
                 <td class="num">${sum('ab') ? hrs(sum('ab')) : '—'}</td>`
              : `<td class="num">${hrs(c.m)}</td><td class="num">${hrs(c.e)}</td>`}
          </tr>`
        }).join('')}</tbody>
      </table></div>
      ${s2.dochazka ? `<p class="col-legend">
        <span><strong>Přesčas</strong> sečtený po lidech, jen hodiny nad fond</span>
        <span><strong>Schází</strong> kolik ostatním do fondu chybí</span>
        <span><strong>Nepřítomnost</strong> o tolik fond klesá (dovolená, nemoc, lékař)</span>
        <span>Přesčas − Schází = Odpracováno − (Fond − Nepřítomnost). Navzájem se
          neodečítají: odpracovaná hodina navíc nezmizí tím, že jiný člověk odešel dřív</span>
      </p>` : colLegend(['avg', 'm', 'e'])}
    </div>`

    const lide = PUBLIC ? '' : `<div class="card">
      <div class="card-head">
        <h2>Nejvíc přesčasu <span class="period-chip">${esc(weekShort(ui.week))}</span></h2>
        <span class="hint">${WEEK_TOP_PEOPLE} lidí</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th class="rank">#</th><th>Jméno</th><th>Středisko</th>
          ${s2.dochazka
            ? '<th class="num">Odpracováno</th><th class="num">Fond</th><th class="num">Nepřítomnost</th>'
            : `<th class="num">Do MEZD</th><th class="num">${esc(evidenceLabel())}</th>`}
          <th class="num">Přesčas</th></tr></thead>
        <tbody>${s2.ranking.slice(0, WEEK_TOP_PEOPLE).map((r, i) => {
          const lvl = level(r.t, CFG.week)
          return `<tr>
            <td class="rank">${i + 1}</td>
            <td class="name"><button type="button" class="link-person" data-person="${esc(String(r.o))}"
              title="Zobrazit vývoj přes měsíce">${esc(r.n)}</button></td>
            <td>${esc(r.s)}</td>
            ${s2.dochazka
              ? `<td class="num">${hrs(r.w)}</td><td class="num">${hrs(r.fo)}</td>
                 <td class="num">${r.ab ? hrs(r.ab) : '—'}</td>`
              : `<td class="num">${hrs(r.m)}</td>
                 <td class="num">${hrs(r.de != null ? r.de : r.e)}</td>`}
            <td class="num">${lvl ? `<span class="tag ${lvl}">${hrs(r.t)}</span>` : hrs(r.t)}</td>
          </tr>`
        }).join('')}</tbody>
      </table></div>
      ${s2.dochazka ? `<p class="col-legend">
        <span><strong>Odpracováno</strong> čistý odpracovaný čas, bez přestávek</span>
        <span><strong>Fond</strong> kolik měl za týden odpracovat</span>
        <span><strong>Nepřítomnost</strong> dovolená, nemoc a další placené volno — o tolik se fond snižuje</span>
        <span><strong>Přesčas</strong> odpracováno nad snížený fond</span>
      </p>` : ''}
    </div>`

    /* Výkaz nemusí začínat pondělím. Klíč se bere podle ISO týdne, ve kterém
       období začíná, ale ukázat se musí to, co je ve výkazu doopravdy. */
    const rozsah = `<p class="hint" style="margin:0 0 18px">
      ${esc(weekName(ui.week))} · ve výkazu období <strong>${esc(rec.period || '—')}</strong>
      · ${s2.dochazka
        ? 'z <strong>Přehledového výkazu docházky</strong>, přesčas = odpracováno nad fond'
        : 'ze <strong>Součtového výkazu</strong> z mezd, přesčas z mzdových složek'}${rec.methodIncomplete
        ? ' · <strong>nejstarší načtený týden</strong>, přírůstek konta se u něj nemá od čeho odrazit'
        : ''}
    </p>`

    el.innerHTML = vyber + rozsah + kpis + graf + strediska + lide

    if (keys.length > 1) drawWeekChart(keys)
    PP.watchCharts(() => { if (PP.data.weekKeys().length > 1) drawWeekChart(PP.data.weekKeys()) })
    bindCenterLinks('#panel-weeks')
    if (!PUBLIC) bindPersonLinks('#panel-weeks')
    $$('#panel-weeks [data-week]').forEach((b) => b.addEventListener('click', () => {
      ui.week = b.dataset.week
      renderWeeks()
    }))
  }

  function drawWeekChart(keys) {
    const host = $('#chart-weeks')
    if (!host) return
    const rada = keys.slice().reverse()          // od nejstaršího
    PP.lineChart(host, {
      labels: rada.map(weekShort),
      format: (v) => hrsU(v),
      tickFormat: (v) => hrs(v),
      area: true,
      height: 250,
      ariaLabel: 'Přesčas závodu po týdnech',
      series: [{
        name: 'Přesčas celkem',
        color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f9e91',
        values: rada.map((k) => PP.stats(PP.data.week(k)).total),
      }],
    })
  }

  /* ---------- Souhrn za období ----------
     Přehled ukazuje jeden měsíc. Tahle sekce sčítá všechny načtené měsíce
     dohromady a přidává to, co z hodin plyne v penězích. */

  const RATE_KEY = 'prescasy.sazba.v1'

  function loadRate() {
    try {
      const raw = window.localStorage.getItem(RATE_KEY)
      if (!raw) return
      const v = JSON.parse(raw)
      if (v && isFinite(v.rate)) CFG.cost.rate = Number(v.rate) || null
      if (v && isFinite(v.surcharge)) CFG.cost.surcharge = Number(v.surcharge)
    } catch (err) { /* sazba je pohodlí, ne data — když nejde načíst, nevadí */ }
  }

  function saveRate() {
    try {
      window.localStorage.setItem(RATE_KEY, JSON.stringify(CFG.cost))
    } catch (err) { /* privátní režim: sazba vydrží jen do zavření panelu */ }
  }

  function renderPeriod() {
    const el = $('#panel-period')
    const p = PP.periodTotals()
    if (!p) {
      el.innerHTML = emptyState(PUBLIC
        ? 'Souhrn za období tu zatím není.'
        : 'Naimportujte aspoň dva po sobě jdoucí měsíce a souhrn se spočítá.')
      return
    }

    const od = monthShort(p.keys[0])
    const doM = monthShort(p.keys[p.keys.length - 1])
    const nakladProplacene = PP.cost(p.mezdy)
    const zavazekKonto = PP.cost(p.konto)
    const nakladCelkem = PP.cost(p.total)

    const rozsah = `<p class="hint" style="margin:0 0 18px">
      Sečteno přes <strong>${num(p.keys.length)} ${p.keys.length === 1 ? 'měsíc' : p.keys.length < 5 ? 'měsíce' : 'měsíců'}</strong>
      (${esc(od)} – ${esc(doM)}) u ${num(p.people)} lidí.
      ${p.skipped.length
        ? `<br>Nezapočítán ${esc(p.skipped.map(monthShort).join(', '))} — je to nejstarší načtený měsíc
           a bez toho předchozího se u něj přesčas spočítat nedá.`
        : ''}
    </p>`

    const kpis = `<div class="grid kpis">
      ${kpi('Přesčas celkem', hrsU(p.total), `za ${num(p.keys.length)} ${p.keys.length < 5 ? 'měsíce' : 'měsíců'}`, '', 'hero')}
      ${kpi('Z toho proplaceno', hrsU(p.mezdy), pct(p.total ? p.mezdy / p.total : 0) + ' přesčasu')}
      ${kpi('Zůstalo na kontě', hrsU(p.konto),
        p.konto > 0 ? 'hodiny k pozdějšímu čerpání' : 'z konta se naopak ubralo',
        p.konto > 0 ? 'warn' : '')}
      ${kpi('Ø na osobu', hrs(p.people ? p.total / p.people : 0), 'za celé období')}
    </div>`

    const sazba = PUBLIC ? '' : `<div class="card">
      <div class="card-head">
        <h2>Náklady na přesčas</h2>
        <span class="hint">odhad z průměrné sazby</span>
      </div>
      <p class="hint" style="margin:0 0 14px">
        Skutečné mzdy panel nezná a znát nemá. Zadejte <strong>průměrnou hodinovou sazbu</strong>
        a spočítá se z ní odhad. Příplatek za práci přesčas je podle zákoníku práce
        nejméně 25 % průměrného výdělku; náhradní volno místo příplatku se sem nepromítne.
      </p>
      <form class="rate-form" id="rate-form">
        <label>Sazba <span class="unit">Kč/h</span>
          <input type="number" id="rate-value" min="0" step="1" value="${CFG.cost.rate || ''}"
            placeholder="např. 280"></label>
        <label>Příplatek <span class="unit">%</span>
          <input type="number" id="rate-surcharge" min="0" step="1" value="${num(CFG.cost.surcharge)}"></label>
        <button class="btn" type="submit">Přepočítat</button>
        ${CFG.cost.rate ? `<button class="btn ghost sm" type="button" id="rate-clear">Smazat sazbu</button>` : ''}
      </form>

      ${CFG.cost.rate ? `<div class="grid kpis" style="margin-top:18px">
        ${kpi('Vyplaceno za přesčas', czk(nakladProplacene), `${hrsU(p.mezdy)} × ${num(CFG.cost.rate)} Kč + ${num(CFG.cost.surcharge)} %`)}
        ${kpi('Závazek na kontě', czk(zavazekKonto), 'hodiny, které se teprve proplatí nebo vyberou',
          p.konto > 0 ? 'warn' : '')}
        ${kpi('Celkem za odpracovaný přesčas', czk(nakladCelkem), 'vyplacené i nevyplacené dohromady')}
      </div>
      <p class="hint" style="margin:14px 0 0">
        Je to <strong>odhad</strong>, ne účetní číslo: počítá se jednou sazbou pro všechny
        a nezahrnuje odvody zaměstnavatele.
      </p>` : ''}
    </div>`

    const maxC = p.centers.length ? p.centers[0].total : 0
    const centers = `<div class="card">
      <div class="card-head">
        <h2>Střediska za celé období</h2>
        <span class="hint">${num(p.centers.length)} středisek · ${esc(od)} – ${esc(doM)}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Středisko</th><th class="num">Lidí</th><th class="num">Přesčas</th>
          <th class="num">Ø / osoba</th><th class="num">Proplaceno</th><th class="num">Na konto</th>
          ${CFG.cost.rate && !PUBLIC ? '<th class="num">Náklad</th>' : ''}
        </tr></thead>
        <tbody>${p.centers.map((c) => `<tr>
          <td><button type="button" class="link-center" data-center="${esc(c.name)}"
            title="Otevřít detail střediska">${esc(c.name)}</button></td>
          <td class="num">${num(c.people)}</td>
          <td class="num">${hrs(c.total)}</td>
          <td class="num">${hrs(c.avg)}</td>
          <td class="num">${hrs(c.mezdy)}</td>
          <td class="num">${hrs(c.konto)}</td>
          ${CFG.cost.rate && !PUBLIC ? `<td class="num">${czk(PP.cost(c.total))}</td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`

    const lide = PUBLIC ? '' : `<div class="card">
      <div class="card-head">
        <h2>Nejvíc přesčasu za období</h2>
        <span class="hint">25 lidí · součet přes ${esc(od)} – ${esc(doM)}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th class="rank">#</th><th>Jméno</th><th>Středisko</th><th class="num">Měsíců</th>
          <th class="num">Přesčas</th><th class="num">Ø / měsíc</th>
          <th class="num">Proplaceno</th><th class="num">Na konto</th>
          ${CFG.cost.rate ? '<th class="num">Náklad</th>' : ''}
        </tr></thead>
        <tbody>${p.ranking.slice(0, 25).map((r, i) => `<tr>
          <td class="rank">${i + 1}</td>
          <td class="name"><button type="button" class="link-person" data-person="${esc(String(r.o))}"
            title="Zobrazit vývoj přes měsíce">${esc(r.n)}</button></td>
          <td>${esc(r.s)}</td>
          <td class="num">${num(r.months)}</td>
          <td class="num">${hrs(r.t)}</td>
          <td class="num">${hrs(r.months ? r.t / r.months : 0)}</td>
          <td class="num">${hrs(r.m)}</td>
          <td class="num">${hrs(r.konto)}</td>
          ${CFG.cost.rate ? `<td class="num">${czk(PP.cost(r.t))}</td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`

    el.innerHTML = rozsah + kpis + sazba + centers + lide

    bindCenterLinks('#panel-period')
    if (!PUBLIC) bindPersonLinks('#panel-period')
    const form = $('#rate-form')
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault()
      const v = Number($('#rate-value').value)
      CFG.cost.rate = isFinite(v) && v > 0 ? v : null
      const sur = Number($('#rate-surcharge').value)
      CFG.cost.surcharge = isFinite(sur) && sur >= 0 ? sur : 0
      saveRate()
      renderPeriod()
    })
    const clear = $('#rate-clear')
    if (clear) clear.addEventListener('click', () => {
      CFG.cost.rate = null
      saveRate()
      renderPeriod()
    })
  }

  /* ---------- Roční limit ---------- */
  function renderYear() {
    const el = $('#panel-year')
    const rec = currentMonth()
    if (!rec) { el.innerHTML = emptyState('Naimportujte Součtový výkaz a panel se naplní.'); return }
    const s = currentStats()
    const list = s.yearly.slice(0, 25)

    const prevK = previousKey()
    const cmp = prevK ? PP.compare(rec, PP.data.month(prevK)) : null
    const chk = cmp && cmp.annual.checked ? cmp.annual : null

    const VERDICT = {
      move: {
        tone: 'good',
        title: 'Evidence je pohyb za měsíc — výpočet panelu sedí',
        text: `Roční součet přibývá přesně o <strong>Do MEZD + Evidence</strong>, tedy
          o to, co panel ukazuje ve sloupci Přesčas. Na měsíční i roční čísla se dá
          spolehnout.`,
      },
      balance: {
        tone: 'crit',
        title: 'Evidence je STAV konta, ne pohyb — panel přesčas nadhodnocuje',
        text: `Roční součet nepřibývá o <strong>Do MEZD + Evidence</strong>, ale o
          <strong>Do MEZD + (Evidence tento měsíc − Evidence minulý měsíc)</strong>.
          Sloupec Evidence tedy není, kolik hodin do konta za měsíc přibylo, ale kolik
          jich na kontě ke konci měsíce <em>je</em>. Panel ten zůstatek připočítává
          každý měsíc znovu, takže <strong>měsíční přesčas vychází příliš vysoko</strong> —
          u člověka s velkým kontem klidně dvojnásobek. Roční součet z mzdového systému
          je naopak správně.`,
      },
      unclear: {
        tone: 'warn',
        title: 'Ani jeden výklad nesedí',
        text: `Přírůstek ročního součtu neodpovídá ani <strong>MEZD + Evidence</strong>,
          ani <strong>MEZD + přírůstek konta</strong>. Mzdový systém do ročního součtu
          počítá ještě něco dalšího.`,
      },
    }
    const v = chk ? VERDICT[chk.verdict] : null
    const pct = (n) => chk.checked ? Math.round((n / chk.checked) * 100) : 0

    const check = !chk || !v ? '' : `<div class="card">
      <div class="card-head">
        <h2>Co vlastně znamená sloupec Evidence?</h2>
        <span class="hint">${esc(monthShort(prevK))} → ${esc(monthShort(ui.month))} · ${num(chk.checked)} lidí v obou měsících</span>
      </div>

      <p class="hint" style="margin:0 0 14px">
        Rozsoudit to umí roční součet z mzdového systému: o kolik přibude mezi dvěma
        měsíci, tolik ten měsíc přesčasu doopravdy bylo. Panel to porovnal u každého,
        kdo je v obou měsících.
      </p>

      <div class="method-rows">
        <div class="method-row${chk.verdict === 'move' ? ' win' : ''}">
          <span class="method-formula">Do MEZD + Evidence <small>— evidence je pohyb za měsíc</small></span>
          <span class="method-score"><strong>${num(chk.okMove)}</strong> z ${num(chk.checked)} · ${pct(chk.okMove)} %</span>
        </div>
        <div class="method-row${chk.verdict === 'balance' ? ' win' : ''}">
          <span class="method-formula">Do MEZD + přírůstek konta <small>— evidence je zůstatek ke konci měsíce</small></span>
          <span class="method-score"><strong>${num(chk.okBalance)}</strong> z ${num(chk.checked)} · ${pct(chk.okBalance)} %</span>
        </div>
      </div>

      <div class="method-verdict ${v.tone}">
        <strong>${esc(v.title)}</strong>
        <p>${v.text}</p>
      </div>

      <div class="method-verdict ${chk.dropped ? 'warn' : 'good'}" style="margin-top:14px">
        <strong>${chk.dropped
          ? `Roční součet klesl u ${num(chk.dropped)} z ${num(chk.checked)} lidí`
          : 'Roční součet nikomu neklesl'}</strong>
        <p>${chk.dropped
          ? `Mzdový systém tedy roční součet <strong>nebere jako počitadlo odpracovaných
             hodin</strong> — ubírá z něj, když se hodiny proplatí nebo vyberou jako volno.
             Největší pokles ${hrs(Math.abs(chk.biggestDrop))}. Na hlídání zákonného stropu
             ${CFG.year.cap} h to pak <strong>nestačí</strong>: kdo si přesčasy nechá průběžně
             proplácet, strop podle téhle hodnoty nikdy nepřekročí, i kdyby jich odpracoval
             dvakrát tolik. Evidenci odpracovaných hodin je potřeba vzít odjinud.`
          : `Roční součet se mezi těmihle měsíci nikomu nesnížil, ani u lidí, kterým se
             přesčas proplácel. Chová se tedy jako <strong>počitadlo odpracovaných hodin</strong>
             — proplacení z něj neubírá — a prahy ${CFG.year.warn} / ${CFG.year.crit} /
             ${CFG.year.cap} h na něm stojí právem.`}</p>
      </div>

      ${chk.dropped ? `<div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Jméno</th><th>Středisko</th>
          <th class="num">Pokles ročního součtu</th>
          <th class="num">Proplaceno ten měsíc</th></tr></thead>
        <tbody>${chk.droppedExamples.map((e) => `<tr>
          <td class="name">${esc(e.row.n)}</td>
          <td>${esc(e.row.s)}</td>
          <td class="num"><span class="tag crit">${hrs(e.dr)}</span></td>
          <td class="num">${hrs(e.m)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="hint" style="margin:10px 0 0">
        Když se pokles rovná proplacené částce, ubírá systém z ročního součtu přesně to,
        co vyplatil.
      </p>` : ''}

      ${chk.neither ? `<p class="hint" style="margin:14px 0 0">
        U ${num(chk.neither)} lidí nesedí ani jedna varianta. Největší rozdíly:
      </p>
      <div class="table-wrap" style="margin-top:10px"><table>
        <thead><tr><th>Jméno</th><th>Středisko</th>
          <th class="num">Δ ročně</th>
          <th class="num">MEZD + evidence</th>
          <th class="num">MEZD + přírůstek</th></tr></thead>
        <tbody>${chk.examples.map((e) => `<tr>
          <td class="name">${esc(e.row.n)}</td>
          <td>${esc(e.row.s)}</td>
          <td class="num">${hrs(e.dr)}</td>
          <td class="num">${hrs(e.asMove)}</td>
          <td class="num">${hrs(e.asBalance)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>`

    el.innerHTML = `<div class="grid kpis">
      ${kpi('Nejvyšší roční součet', hrs(s.yearly.length ? s.yearly[0].r : 0),
        s.yearly.length ? `zbývá ${hrs(Math.max(0, CFG.year.cap - s.yearly[0].r))} do stropu ${CFG.year.cap} h` : '',
        s.yearly.length ? level(s.yearly[0].r, { warn: CFG.year.warn, crit: CFG.year.crit }) : '', 'hero')}
      ${kpi('Lidí v evidenci', num(s.yearly.length), 's ročním součtem ve výkazu')}
    </div>
    <div class="grid kpis alarms">
      ${kpi('Nad ' + CFG.year.warn + ' h', num(s.year150), 'nutná dohoda o práci přesčas', s.year150 ? 'warn' : 'good')}
      ${kpi('Nad ' + CFG.year.crit + ' h', num(s.year250), 'zbývá do stropu méně než ' + (CFG.year.cap - CFG.year.crit) + ' h', s.year250 ? 'crit' : 'good')}
      ${kpi('Na stropu ' + CFG.year.cap + ' h', num(s.yearCap), 'další přesčas už nelze nařídit', s.yearCap ? 'crit' : 'good')}
    </div>
    ${check}
    <div class="card">
      <div class="card-head">
        <h2>Nejblíž ročnímu stropu</h2>
        <span class="hint">stav k ${esc(rec.period)} · strop ${CFG.year.cap} h</span>
      </div>
      ${list.map((r) => {
        const lvl = r.r >= CFG.year.crit ? 'crit' : r.r > CFG.year.warn ? 'warn' : ''
        const w = Math.min(100, (r.r / CFG.year.cap) * 100)
        return `<div class="limit-row">
          <div class="limit-head">
            <span class="who">${esc(r.n)} <small>· ${esc(r.s)}</small></span>
            <span class="amt">${hrs(r.r)} <span class="hint">/ ${CFG.year.cap} h · zbývá ${hrs(Math.max(0, CFG.year.cap - r.r))}</span></span>
          </div>
          <div class="limit-track"><span class="limit-fill ${lvl}" style="width:${w.toFixed(1)}%"></span></div>
        </div>`
      }).join('')}
      <p class="hint" style="margin:14px 0 0">
        Zobrazeno 25 lidí s nejvyšším ročním součtem. Roční součet je hodnota mzdové složky
        „Přesčas roční součet“ ve výkazu, tedy stav od začátku roku.
      </p>
    </div>`
  }

  /* ---------- Import ---------- */
  function renderImport() {
    const el = $('#panel-import')
    const keys = PP.data.allKeys()

    el.innerHTML = `<div class="card">
      <div class="card-head">
        <h2>Import Součtového výkazu</h2>
        <span class="hint">ukládá se do: ${esc(PP.store.backendName)}</span>
      </div>
      <div class="drop" id="drop">
        <h3>Přetáhněte sem Součtový výkaz</h3>
        <p>Podporuje <code>.xls</code> z mezd (HTML tabulka), <code>.xlsx</code>, i <code>.csv</code>.
           Měsíc se pozná z období ve výkazu; existující měsíc se přepíše.</p>
        <button class="btn" type="button" id="pick">Vybrat soubor…</button>
        <input type="file" id="file" accept=".xls,.xlsx,.csv,.txt,.htm,.html" multiple class="visually-hidden">
      </div>
      <div class="log" id="log">${ui.log.map(logItemHtml).join('')}</div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Načtená období</h2>
        <span class="hint">${keys.length} ${keys.length === 1 ? 'období' : 'období'}</span>
      </div>

      <div class="table-wrap"><table>
        <thead><tr>
          <th>Období</th><th>Rozsah</th><th class="num">Lidí</th><th class="num">Přesčas</th>
          <th>Zdroj</th><th>Soubor</th><th></th>
        </tr></thead>
        <tbody>${keys.map((k) => {
          const rec = PP.data.record(k)
          const st = PP.stats(rec)
          const imported = PP.data.isImported(k)
          return `<tr>
            <td>${esc(periodName(k))}</td>
            <td>${esc(rec.period || '—')}</td>
            <td class="num">${num(st.withOvertime)}</td>
            <td class="num">${hrsU(st.total)}</td>
            <td>${rec.demo ? '<span class="tag warn">ukázka</span>' : imported ? '<span class="tag accent">import</span>' : '<span class="tag">vestavěné</span>'}</td>
            <td>${esc(rec.file || '—')}</td>
            <td>${imported ? `<button class="btn danger sm" type="button" data-remove="${esc(k)}">Smazat</button>` : ''}</td>
          </tr>`
        }).join('') || '<tr><td colspan="7" class="empty">Zatím žádná data.</td></tr>'}
        </tbody>
      </table></div>
    </div>

    ${ANALYZER ? '' : `<div class="card">
      <div class="card-head">
        <h2>Veřejná verze pro kolegy</h2>
        <span class="hint">jen souhrny za střediska</span>
      </div>
      <p class="hint" style="margin:0 0 18px">
        Ven jdou <strong>jen součty a průměry za střediska</strong> — žádná jména,
        žádná osobní čísla. Střediska pod ${num(PP.PUBLIC_MIN_PEOPLE)} lidí se
        slučují do „Ostatní“, aby průměr neprozradil jednotlivce.
      </p>
      ${livePublish(keys)}

      <hr class="pub-split">
      <h3 class="pub-sub">Nebo soubor ke stažení</h3>
      <p class="hint" style="margin:0 0 12px">
        Tentýž obsah jako soubor <code>index.html</code>. Nahraje se do složky
        <code>docs/</code> v repozitáři a GitHub Pages ho vystaví — funguje
        i bez databáze, jen se to musí udělat ručně po každém importu.
      </p>
      <div class="pub-actions">
        <button class="btn ghost" type="button" id="pub-build"${keys.length ? '' : ' disabled'}>
          Vygenerovat soubor</button>
        <span class="export-status" id="pub-status" role="status"></span>
      </div>
      <div id="pub-detail"></div>
    </div>`}`

    const fileInput = $('#file')
    const drop = $('#drop')
    $('#pick').addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      handleFiles(Array.prototype.slice.call(fileInput.files))
      fileInput.value = ''
    })
    ;['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('over')
    }))
    ;['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.remove('over')
    }))
    drop.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(Array.prototype.slice.call(e.dataTransfer.files))
    })
    $$('#panel-import [data-remove]').forEach((b) => b.addEventListener('click', async () => {
      const key = b.dataset.remove
      if (!window.confirm(`Opravdu smazat naimportované období ${periodName(key)}?`)) return
      await PP.data.removeMonth(key)
      log('ok', `${periodName(key)} smazáno.`)
      refreshAll()
    }))

    const pub = $('#pub-build')
    if (pub) pub.addEventListener('click', buildPublic)
    bindLivePublish()
  }

  /* Živé publikování: souhrny se pošlou do sdílené databáze a kolegové je
     vidí hned, bez nahrávání souboru. Ven jdou jen agregáty — jména zůstávají
     tady v prohlížeči. */
  function livePublish(keys) {
    if (!PP.remote.configured()) {
      return `<p class="pub-note">
        <strong>Živé sdílení zatím není nastavené.</strong> Až bude, naimportovaný
        výkaz se jedním kliknutím propíše kolegům na web a nebude se nic nahrávat
        ručně. Postup je v README (<code>window.PP_FIREBASE</code>).
      </p>`
    }
    const who = ui.admin
    const msg = ui.pubMsg
      ? `<div class="pub-${ui.pubMsg.kind}">${ui.pubMsg.html}</div>`
      : ''
    const diag = `<button class="btn ghost sm" type="button" id="pub-diag">Zkontrolovat spojení</button>`
    const diagOut = ui.diag ? diagHtml(ui.diag) : ''
    const stav = pubStateHtml()

    if (!who) {
      return `<h3 class="pub-sub">Publikovat na web</h3>
      <p class="hint" style="margin:0 0 12px">
        Zapisovat smí jen váš účet. Přihlaste se a souhrny se pošlou kolegům.
      </p>
      <form class="pub-login" id="pub-login">
        <label>E-mail <input type="email" id="pub-email" autocomplete="username" required></label>
        <label>Heslo <input type="password" id="pub-pass" autocomplete="current-password" required></label>
        <button class="btn" type="submit">Přihlásit</button>
        ${diag}
        <span class="export-status" id="pub-live-status" role="status"></span>
      </form>
      ${stav}${msg}${diagOut}`
    }

    return `<h3 class="pub-sub">Publikovat na web</h3>
    <p class="hint" style="margin:0 0 12px">
      Přihlášen <strong>${esc(who.email)}</strong>. Odejdou jen souhrny za
      střediska — jména a osobní čísla zůstanou tady.
    </p>
    <div class="pub-actions">
      <button class="btn" type="button" id="pub-live"${keys.length ? '' : ' disabled'}>
        Publikovat ${num(keys.length)} ${keys.length === 1 ? 'měsíc' : keys.length < 5 ? 'měsíce' : 'měsíců'}</button>
      <button class="btn ghost sm" type="button" id="pub-logout">Odhlásit</button>
      ${diag}
      <span class="export-status" id="pub-live-status" role="status"></span>
    </div>
    ${stav}${msg}${diagOut}`
  }

  /* Co je právě na webu a jestli to kolegům nezestárlo. Tahle informace
     v panelu chyběla, takže se dalo importovat, dívat se na opravená čísla
     a vůbec netušit, že kolegové pořád vidí ta předchozí. */
  function pubStateHtml() {
    const st = ui.pubState
    if (!st) return ''
    if (st.error) {
      return `<p class="pub-state warn">Nepodařilo se zjistit, co je na webu — ${esc(st.error)}</p>`
    }
    if (!st.updatedAt) {
      return `<p class="pub-state warn">Na webu zatím není nic — kolegové vidí jen ukázku.</p>`
    }

    /* „Zastaralé“ znamená, že se od posledního zveřejnění něco naimportovalo.
       Porovnává se čas importu, ne obsah — na to, že se mohl změnit i výpočet,
       to stejně upozornit musí. */
    const novejsi = PP.data.keys().some((k) => {
      const rec = PP.data.month(k)
      return rec && rec.importedAt && rec.importedAt > st.updatedAt
    })
    const kdy = stamp(st.updatedAt)
    const kolik = st.months
    return `<p class="pub-state${novejsi ? ' warn' : ''}">
      Na webu je ${num(kolik)} ${kolik === 1 ? 'měsíc' : kolik < 5 ? 'měsíce' : 'měsíců'},
      zveřejněno ${esc(kdy)}.${novejsi
        ? ' <strong>Od té doby jste importoval — kolegové zatím vidí starší čísla.</strong>'
        : ''}
    </p>`
  }

  async function loadPubState() {
    if (!PP.remote.configured()) return
    try {
      const data = await PP.remote.load()
      ui.pubState = data
        ? { updatedAt: data.updatedAt || null, months: data.months ? Object.keys(data.months).length : 0 }
        : { updatedAt: null, months: 0 }
    } catch (err) {
      ui.pubState = { error: (err && err.message) || String(err) }
    }
    if (ui.section === 'import') renderImport()
  }

  function diagHtml(steps) {
    const vse = steps.every((x) => x.ok)
    return `<div class="pub-diag">
      <h4>Kontrola spojení</h4>
      <ol>${steps.map((x) => `<li class="${x.ok ? 'ok' : 'err'}">
        <span aria-hidden="true">${x.ok ? '✓' : '✕'}</span>
        <span><strong>${esc(x.name)}</strong>${x.detail ? ` — ${esc(x.detail)}` : ''}</span>
      </li>`).join('')}</ol>
      ${vse
        ? `<p class="hint" style="margin:10px 0 0">
             Přihlášení samo o sobě k zápisu nestačí — povolí ho až pravidla databáze.
             <strong>UID výše se musí přesně shodovat</strong> s tím v pravidlech
             (Firebase Console → Realtime Database → Rules). Jestli se liší, publikování
             skončí na „permission denied“.
           </p>`
        : `<p class="hint" style="margin:10px 0 0">
             Pošlete tenhle výpis a půjde to doladit — každý řádek ukazuje na jiné místo:
             konfigurace je v souboru, spojení a přihlašování ve Firebase Console
             v sekci Authentication, zápis v pravidlech databáze.
           </p>`}
    </div>`
  }

  function bindLivePublish() {
    const form = $('#pub-login')
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const status = $('#pub-live-status')
        status.textContent = 'Přihlašuji…'
        try {
          ui.admin = await PP.remote.signIn($('#pub-email').value.trim(), $('#pub-pass').value)
          ui.pubMsg = null
        } catch (err) {
          ui.pubMsg = { kind: 'err', html: esc(loginError(err)) }
        }
        renderImport()
      })
    }

    const logout = $('#pub-logout')
    if (logout) logout.addEventListener('click', async () => {
      try { await PP.remote.signOut() } catch (err) { /* odhlášení nesmí zablokovat UI */ }
      ui.admin = null
      ui.pubMsg = null
      renderImport()
    })

    const diagBtn = $('#pub-diag')
    if (diagBtn) diagBtn.addEventListener('click', async () => {
      diagBtn.disabled = true
      const status = $('#pub-live-status')
      if (status) status.textContent = 'Kontroluji…'
      try {
        ui.diag = await PP.remote.diagnose()
      } catch (err) {
        ui.diag = [{ name: 'Kontrola', ok: false, detail: (err && err.message) || String(err) }]
      }
      renderImport()
    })

    const live = $('#pub-live')
    if (live) live.addEventListener('click', async () => {
      const status = $('#pub-live-status')
      live.disabled = true
      status.textContent = 'Odesílám…'
      try {
        const months = {}
        for (const k of PP.data.keys()) months[k] = PP.data.month(k)
        const res = await PP.remote.publishMonths(months)
        ui.pubState = { updatedAt: res.updatedAt, months: Object.keys(res.months).length }
        ui.pubMsg = {
          kind: 'ok',
          html: `<strong>Zveřejněno.</strong> Kolegové vidí nová čísla hned.
            <ul class="pub-log">${res.log.map((l) => `<li>${esc(l)}</li>`).join('')}
            <li><strong>Kontrola: v odeslaných datech není žádné jméno ani osobní číslo.</strong></li>
            ${res.suppressed ? `<li>${num(res.suppressed)} lidí v příliš malých střediscích se nezveřejnilo vůbec.</li>` : ''}
            </ul>`,
        }
      } catch (err) {
        ui.pubMsg = { kind: 'err', html: esc(err && err.message ? err.message : String(err)) }
      }
      renderImport()
    })
  }

  /** Firebase hlásí chyby kódem; přeložit je na něco, co se dá přečíst. */
  function loginError(err) {
    const code = (err && err.code) || ''
    if (/user-not-found|invalid-credential|wrong-password|invalid-login/.test(code)) {
      return 'Nesprávný e-mail nebo heslo.'
    }
    if (/too-many-requests/.test(code)) return 'Příliš mnoho pokusů, zkuste to za chvíli.'
    if (/network/.test(code)) return 'Nepodařilo se spojit se serverem.'
    return err && err.message ? err.message : String(err)
  }

  /* Vygeneruje veřejné vydání přímo z prohlížeče. Reálná data nikam neodcházejí
     — soubor vznikne tady a rovnou se stáhne. */
  async function buildPublic() {
    const btn = $('#pub-build')
    const status = $('#pub-status')
    const detail = $('#pub-detail')
    btn.disabled = true
    status.textContent = 'Generuji…'
    detail.innerHTML = ''
    try {
      const months = {}
      for (const k of PP.data.keys()) months[k] = PP.data.month(k)
      const res = await PP.buildPublicHtml(months)

      const blob = new Blob([res.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'index.html'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)

      const kb = Math.round(new Blob([res.html]).size / 1024)
      status.textContent = 'Hotovo — staženo jako index.html'
      detail.innerHTML = `<ul class="pub-log">
        ${res.log.map((l) => `<li>${esc(l)}</li>`).join('')}
        <li><strong>Kontrola: ve výstupu není žádné jméno ani osobní číslo.</strong></li>
        ${res.suppressed ? `<li>${num(res.suppressed)} lidí v příliš malých střediscích se nezveřejnilo vůbec.</li>` : ''}
        <li>${num(kb)} KiB · ${num(Object.keys(res.months).length)} měsíců</li>
      </ul>
      <p class="hint" style="margin:12px 0 0">
        Nahrajte ho do repozitáře jako <code>docs/index.html</code> (na GitHubu
        stačí soubor přetáhnout a potvrdit) — Pages se obnoví samy.
      </p>`
    } catch (err) {
      status.textContent = ''
      detail.innerHTML = `<p class="pub-err">${esc(err && err.message ? err.message : String(err))}</p>`
    } finally {
      btn.disabled = false
    }
  }

  const LOG_LIMIT = 20

  function logItemHtml(entry) {
    const icon = entry.kind === 'ok' ? '✓' : entry.kind === 'err' ? '✕' : '…'
    return `<div class="log-item ${entry.kind}"><span aria-hidden="true">${icon}</span><span>${entry.html}</span></div>`
  }

  function renderLog() {
    const box = $('#log')
    if (box) box.innerHTML = ui.log.map(logItemHtml).join('')
  }

  /** Přidá záznam do logu importu a vrátí ho, aby šel později přepsat. */
  function log(kind, html) {
    const entry = { kind, html }
    ui.log.unshift(entry)
    ui.log.length = Math.min(ui.log.length, LOG_LIMIT)
    renderLog()
    return entry
  }

  /* Soupis mzdových složek za naimportovaný měsíc. Je to první věc, podle které
     se pozná, že se do přesčasu počítá něco, co tam nepatří — nebo naopak nepočítá
     složka, která tam patřit má. */
  function compSummary(record) {
    /* U docházky nejde o mzdové složky, ale o sloupce výkazu: které snižují
       fond a které se do výpočtu nepletou. Kdyby přibyl sloupec, který fond
       snižovat má, musí být na importu hned vidět, že ho panel ignoruje. */
    if (record.src === 'dochazka') {
      const abs = record.comps || []
      const ign = (record.otherComps || []).map((c) => c[0])
      return `<span class="hint comp-summary">
        Fond snižuje: ${abs.length ? abs.map((c) => `<strong>${esc(c)}</strong>`).join(', ') : 'nic'}.
        ${ign.length ? `Do výpočtu nevstupuje: ${ign.map(esc).join(', ')}.` : ''}
      </span>`
    }
    // comps nese i složky, které se nepočítají — rozdělit je podle zařazení
    const used = (record.comps || []).filter((c) => PP.componentBucket(c))
    const other = record.otherComps || []
    if (!used.length) return ''
    return `<span class="hint comp-summary">
      Započítáno: ${used.map((c) => `<strong>${esc(c)}</strong>`).join(', ')}.
      ${other.length
        ? `Nezapočítáno: ${other.slice(0, 12).map((c) => esc(c[0])).join(', ')}${other.length > 12 ? ' a další' : ''}.`
        : ''}
    </span>`
  }

  async function handleFiles(files) {
    for (const file of files) {
      const busy = log('busy', `Zpracovávám <strong>${esc(file.name)}</strong>…`)
      try {
        const { key, record, kind, skipped } = await PP.parseReport(file)
        const replaced = PP.data.record(key)
        await PP.data.addMonth(key, record)
        // týden i měsíc chodí stejnou cestou, jen se ukládají jinam
        const st = PP.stats(PP.data.record(key))
        busy.kind = 'ok'
        const dochazka = record.src === 'dochazka'
        busy.html = `<strong>${esc(periodName(key))}</strong> ${replaced ? 'přepsán' : 'přidán'} —
          ${num(st.withOvertime)} lidí s přesčasem, ${hrsU(st.total)}, ${num(record.people)} osob ve výkazu.
          ${dochazka ? `<span class="hint">Docházka: odpracováno ${hrsU(st.worked)},
            fond ${hrsU(st.fund)}, placená nepřítomnost ${hrsU(st.absence)}${st.under
            ? ` · ${num(st.underPeople)} lidem schází do fondu ${hrsU(st.under)}` : ''}.</span>` : ''}
          <span class="hint">Formát: ${esc(kind)}${skipped
            ? ` · přeskočeno ${num(skipped)} ${dochazka ? 'souhrnných' : 'nepřesčasových'} řádků` : ''}</span>
          ${compSummary(record)}`
        if (PP.isWeekKey(key)) ui.week = key
        else ui.month = key
      } catch (err) {
        busy.kind = 'err'
        busy.html = `<strong>${esc(file.name)}</strong> — ${esc(err && err.message ? err.message : String(err))}`
      }
      renderLog()
    }
    refreshAll()
  }

  /* ---------- Metodika ---------- */
  /* Metodika bývala jedna dlouhá karta textu, ve které se nedalo nic najít.
     Teď je rozdělená po tématech a nahoře stojí jednou větou to, co většina
     lidí potřebuje vědět: podle čeho se číslo „Přesčas“ počítá. */
  function renderMethod() {
    const verdikt = PP.data.method === 'balance'
      ? ['Přesčas = do MEZD + (konto teď − konto minulý měsíc)',
         `Na načtených datech vyšlo, že <strong>evidence je zůstatek konta</strong>, a panel
          tak počítá. Nejstarší naimportovaný měsíc je výjimka — nemá předchozí konto, od
          kterého by se odrazil, takže u něj zůstává hodnota z výkazu a je označený. Spraví
          to import o měsíc staršího výkazu.`]
      : PP.data.method === 'move'
      ? ['Přesčas = do MEZD + evidence',
         `Na načtených datech vyšlo, že <strong>evidence je pohyb za měsíc</strong>, takže se
          obě složky prostě sčítají.`]
      : PP.data.method === 'unclear'
      ? ['Ani jeden vzorec nesedí',
         `Na načtených datech nesedí ani jeden vzorec — mzdový systém počítá do ročního součtu
          ještě něco dalšího. Panel zatím sčítá obě složky, ale ber měsíční čísla s rezervou.`]
      : ['Zatím není co měřit',
         `Dokud nejsou naimportované aspoň dva po sobě jdoucí měsíce, není co měřit a panel
          obě složky sčítá.`]

    const jak = `<div class="card">
      <div class="card-head"><h2>Co se počítá jako přesčas</h2>
        <span class="hint">panel vzorec měří, nehádá ho</span></div>
      <div class="method-headline${PP.data.method === 'unclear' ? ' warn' : PP.data.method ? '' : ' muted'}">
        <strong>${esc(verdikt[0])}</strong>
        <p>${verdikt[1]}</p>
      </div>
      <div class="prose">
        <p>Výkaz dává dvě mzdové složky: <strong>Přesčas do MEZD</strong> (hodiny poslané do výplaty)
        a <strong>Přesčas evidence</strong> (konto pracovní doby). Jak se z nich dostane měsíční
        přesčas, závisí na tom, co druhá složka znamená.</p>
        <p>Rozsoudí to roční součet z mzdového systému: o kolik přibude mezi dvěma měsíci, tolik
        ten měsíc přesčasu doopravdy bylo. Panel to porovná u každého, kdo je v obou měsících, a
        vybere vzorec, který sedí. Celé měření je vidět v sekci <strong>Roční limit</strong>.</p>
        <ul>
          <li><strong>Přesčas = do MEZD + evidence</strong> — když je evidence pohyb za měsíc.</li>
          <li><strong>Přesčas = do MEZD + (evidence teď − evidence minulý měsíc)</strong> — když je
              evidence zůstatek konta ke konci měsíce. Sečíst obě složky by přesčas nafouklo,
              protože by se zůstatek připočítal každý měsíc znovu.</li>
        </ul>
        <p>Evidence může být <strong>záporná</strong> — to je odečet konta po proplacení. Když se
        počítá přes přírůstek konta, může vyjít <strong>záporný i měsíční přesčas</strong>: konto
        kleslo víc, než kolik se ten měsíc proplatilo, protože si člověk vybral náhradní
        volno. Není to chyba, je to čerpání dřív naspořených hodin.</p>
      </div>
    </div>`

    const dvePristupy = `<div class="card">
      <div class="card-head"><h2>Dvě sestavy, dvě metodiky</h2>
        <span class="hint">měsíce z mezd, týdny z docházky</span></div>
      <div class="prose">
        <p>Panel čte dvě různé sestavy a u každé počítá jinak, protože každá ví
        o něčem jiném.</p>
        <ul>
          <li><strong>Součtový výkaz</strong> z mezd → <strong>měsíce</strong>. Mluví
              mzdovými složkami a jako jediný zná konto a roční součet, takže na něm
              stojí přehled, žebříčky i hlídání ročního stropu.</li>
          <li><strong>Přehledový výkaz docházky</strong> → <strong>týdny</strong>.
              O mzdových složkách neví nic, zato ví, kdo kolik hodin doopravdy odstál:
              <strong>přesčas = Celkem odpracováno − Fond</strong>.</li>
        </ul>
        <p>Fond ale platí jen za dny, kdy měl člověk být v práci. Kdo si vybral týden
        dovolené, má odpracováno 0 a fond 37,5 — holý rozdíl by u něj ukázal −37,5 h
        přesčasu, což není přesčas, ale dovolená. <strong>Placená nepřítomnost proto
        fond snižuje</strong> (dovolená, nemoc, lékař, placené překážky). Oprava umí
        jen zrušit nesmyslné minus; komu přesčas opravdu vznikl, tomu se nesáhne.
        Holý rozdíl zůstává vidět ve vlastním sloupci.</p>
        <p><strong>Služební cesta</strong> se nepřičítá — je už uvnitř „Celkem
        odpracováno“ (kdo byl na cestě celý týden, má odpracováno plný fond).
        <strong>Přestávka</strong> se do odpracované doby nepočítá vůbec.</p>
        <p>Za závod se přesčas <strong>sčítá po lidech a jen kladný</strong>. Kdo odešel
        dřív, nikomu jinému odpracovanou hodinu neodečte — čas, který lidem do fondu
        schází, se proto vede jako samostatné číslo.</p>
      </div>
    </div>`

    const prahy = `<div class="card">
      <div class="card-head"><h2>Prahové hodnoty</h2>
        <span class="hint">provozní, ne zákonné</span></div>
      <div class="prose">
        <ul>
          <li><strong>Jednotlivec za měsíc:</strong> ${CFG.person.warn} h oranžová, ${CFG.person.crit} h červená.</li>
          <li><strong>Středisko, Ø na osobu:</strong> ${CFG.center.warn} h oranžová, ${CFG.center.crit} h červená.</li>
          <li><strong>Roční součet:</strong> ${CFG.year.warn} h oranžová, ${CFG.year.crit} h červená,
              <strong>${CFG.year.cap} h</strong> zákonný strop.</li>
        </ul>
        <p>Prahy slouží k tomu, aby se v tabulce dalo rychle najít, kde se hromadí zátěž.
        Jediné tvrdé číslo je roční strop.</p>
      </div>
    </div>`

    const zakon = `<div class="card">
      <div class="card-head"><h2>Co na to zákoník práce</h2></div>
      <div class="prose">
        <p>Zákoník práce omezuje <em>nařízený</em> přesčas na 150 h za kalendářní rok a v průměru
        8 h týdně za vyrovnávací období. Nad rámec nařízeného přesčasu lze pracovat jen po
        <strong>dohodě se zaměstnancem</strong>, celkem však nejvýše v průměru 8 h týdně, tedy
        zhruba <strong>${CFG.year.cap} h ročně</strong>. Proto panel odděluje pásmo nad ${CFG.year.warn} h
        (od kdy je potřeba dohoda) od pásma nad ${CFG.year.crit} h (kde už zbývá malá rezerva).</p>
      </div>
    </div>`

    const prumer = `<div class="card">
      <div class="card-head"><h2>Jak se počítá Ø na osobu</h2></div>
      <div class="prose">
        <p>Průměr se počítá <strong>jen z lidí, kteří v daném měsíci přesčas vykázali</strong>, ne
        z celého stavu střediska. Malé středisko se třemi lidmi tak vyjde vysoko, i když je v objemu
        hodin zanedbatelné — proto je vedle žebříčku průměrů i tabulka s absolutními součty.</p>
      </div>
    </div>`

    const ulozeni = `<div class="card">
      <div class="card-head"><h2>Kde data leží</h2></div>
      <div class="prose">
        <p>Importované měsíce se ukládají do: <strong>${esc(PP.store.backendName)}</strong>.
        Vestavěná data jsou součástí souboru <code>data/months.js</code> a importem se
        pro daný měsíc přebijí; po smazání importu se zase objeví.</p>
      </div>
    </div>`

    const cteni = `<div class="card">
      <div class="card-head"><h2>Jak panel čte Součtový výkaz</h2>
        <span class="hint">pro případ, že by import něco nepobral</span></div>
      <div class="prose">
        <ul>
          <li>Formát se pozná z prvních bajtů: <code>PK</code> → <code>.xlsx</code>,
              <code>D0CF</code> → starší binární <code>.xls</code>, jinak text.</li>
          <li>Výkaz z mezd má sice příponu <code>.xls</code>, ale je to <strong>HTML tabulka</strong> —
              parsuje se přes DOMParser a bere se <code>&lt;table&gt;</code> s nejvíc řádky.</li>
          <li>Hlavička se hledá do 40. řádku podle sloupců <em>Příjmení a jméno</em>,
              <em>Osobní číslo</em>, <em>Středisko</em>, <em>Mzdová složka</em> a <em>Hodiny</em>.</li>
          <li>Období se bere z řádku nad hlavičkou začínajícího <em>Období:</em>, jinak z prvního
              výskytu <code>d.m.rrrr - d.m.rrrr</code>.</li>
          <li>Hodiny se čtou ve formátu <code>h:mm</code> i jako desetinné číslo, včetně znaménka.</li>
          <li>Řádky se agregují na klíč <code>osobní číslo | středisko</code>.</li>
        </ul>
      </div>
    </div>`

    $('#panel-method').innerHTML = jak +
      dvePristupy +
      `<div class="grid two">${prahy}${zakon}</div>` +
      `<div class="grid two">${prumer}${ulozeni}</div>` +
      cteni
  }

  /* ---------- export do Excelu ---------- */
  async function doExport() {
    const btn = $('#export-btn')
    const status = $('#export-status')
    if (!ui.month || btn.disabled) return
    const label = btn.textContent
    btn.disabled = true
    btn.textContent = 'Exportuji…'
    status.textContent = ''
    status.className = 'export-status'
    try {
      const out = await PP.exportExcel(ui.month, previousKey())
      status.textContent = out.name
      status.className = 'export-status ok'
    } catch (err) {
      status.textContent = err && err.message ? err.message : String(err)
      status.className = 'export-status err'
    } finally {
      btn.disabled = false
      btn.textContent = label
    }
  }

  /** Proklik z názvu střediska na jeho detail. */
  function bindCenterLinks(root) {
    $$(root + ' .link-center').forEach((b) => b.addEventListener('click', () => {
      ui.center = b.dataset.center
      go('centers')
    }))
  }

  /** Proklik ze jména na vývoj toho člověka. */
  function bindPersonLinks(root) {
    $$(root + ' [data-person]').forEach((b) => b.addEventListener('click', () => {
      if (PP.data.keys().length < 2) return
      ui.person = b.dataset.person
      ui.personQuery = ''
      ui.personOpen = {}
      ui.personPick = false
      go('compare')
    }))
  }

  /* ---------- překreslení ---------- */
  function render() {
    renderDemoBanner()
    renderMethodBanner()
    switch (ui.section) {
      case 'overview': return renderOverview()
      case 'centers': return renderCenters()
      case 'ranking': return renderRanking()
      case 'compare': return renderCompare()
      case 'weeks': return renderWeeks()
      case 'period': return renderPeriod()
      case 'year': return renderYear()
      case 'import': {
        renderImport()
        // jen jednou za načtení panelu, ať se při každém překreslení nechodí na síť
        if (ui.pubState === null) { ui.pubState = undefined; loadPubState() }
        return
      }
      case 'method': return renderMethod()
    }
  }

  function refreshAll() {
    renderMonthPicker()
    updateRailNote()
    render()
  }

  /* Verze sestavení, viditelně. Bez ní se nedá poznat, jestli se člověk dívá
     na čerstvou stránku, nebo na kopii, kterou mu drží cache — a ta otázka
     se jinak vrací pokaždé, když něco nesedí. */
  function updateBuildNote() {
    const el = $('#rail-build')
    if (!el) return
    const meta = document.querySelector('meta[name="generator"]')
    const stamp = meta ? (/(\d{4}-\d{2}-\d{2})/.exec(meta.content) || [])[1] : null
    if (!stamp) { el.hidden = true; return }
    const [y, m, d] = stamp.split('-')
    el.hidden = false
    el.textContent = `verze ${Number(d)}. ${Number(m)}. ${y}` + (ANALYZER ? ' · analyzér' : '')
  }

  function updateRailNote() {
    const keys = PP.data.keys()
    const weeks = PP.data.weekKeys()
    const note = $('#rail-note')
    const parts = []
    if (keys.length) {
      parts.push(`${keys.length} ${keys.length === 1 ? 'měsíc' : keys.length < 5 ? 'měsíce' : 'měsíců'} · ` +
        `${monthShort(keys[keys.length - 1])} – ${monthShort(keys[0])}`)
    }
    // týdny jsou vlastní řada, takže patří do přehledu zvlášť
    if (weeks.length) {
      parts.push(`${weeks.length} ${weeks.length === 1 ? 'týden' : weeks.length < 5 ? 'týdny' : 'týdnů'} · ` +
        `${weekShort(weeks[weeks.length - 1])} – ${weekShort(weeks[0])}`)
    }
    note.textContent = parts.length ? parts.join('\n') : 'Zatím bez dat.'
  }

  /* Na veřejné stránce se čísla berou ze sdílené databáze, aby kolegové viděli
     to, co je právě naimportované, a ne stav z doby, kdy se stránka stavěla.
     Když se spojení nepovede, zůstanou data zapečená v souboru — stránka
     nesmí zůstat prázdná jen proto, že je síť mimo. */
  async function loadRemote() {
    if (!PP.remote.configured()) return
    const note = $('#remote-note')
    try {
      const data = await PP.remote.load()
      if (data && data.months && PP.data.setRemote(data.months)) {
        ui.month = null
        refreshAll()
        if (note) {
          note.hidden = false
          note.textContent = 'Aktuální data z ' + stamp(data.updatedAt) + '.'
        }
      }
      PP.remote.watch((fresh) => {
        if (!fresh || !fresh.months) return
        if (!PP.data.setRemote(fresh.months)) return
        refreshAll()
        if (note) {
          note.hidden = false
          note.textContent = 'Aktuální data z ' + stamp(fresh.updatedAt) + '.'
        }
      }).catch(() => {})
    } catch (err) {
      if (note) {
        note.hidden = false
        note.className = 'remote-note warn'
        note.textContent = 'Nepodařilo se načíst aktuální data, zobrazena jsou poslední známá.'
      }
    }
  }

  /** ISO čas na „2. 10. 2026 v 13:45“. */
  function stamp(iso) {
    const d = new Date(iso)
    if (isNaN(d)) return 'neznámého času'
    return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} v ` +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }

  /* ---------- start ---------- */
  async function init() {
    initTheme()
    initFormat()
    renderNav()
    loadRate()
    await PP.data.init()
    renderMonthPicker()
    updateRailNote()
    updateBuildNote()

    $('#month-select').addEventListener('change', (e) => {
      ui.month = e.target.value
      ui.center = null
      render()
    })
    const exportBtn = $('#export-btn')
    if (PUBLIC) exportBtn.hidden = true
    else exportBtn.addEventListener('click', doExport)
    window.addEventListener('hashchange', () => {
      const id = location.hash.slice(1)
      if (id && id !== ui.section) go(id)
    })

    const initial = location.hash.slice(1)
    go(SECTIONS.some((s) => s.id === initial) ? initial : 'overview')

    if (PUBLIC) loadRemote()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})(window.PP)
