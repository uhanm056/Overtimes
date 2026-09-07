/* Přesčasový panel Planá — UI. */
;(function (PP) {
  'use strict'

  const { esc, hm, h1, num, pct, fold, mark, level, monthName, monthShort, centerName, $, $$ } = PP
  const CFG = PP.CFG

  const ICONS = {
    overview: '<path d="M3 13h5v7H3zM9.5 4h5v16h-5zM16 9h5v11h-5z"/>',
    centers: '<path d="M4 20V8l6-4 6 4v12M4 20h16M14 20v-5h-4v5M20 20V11l-4-2.6"/>',
    ranking: '<path d="M6 20v-6M12 20V4M18 20v-9"/>',
    year: '<path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3.2 2"/>',
    import: '<path d="M12 3v11M8 10.5l4 4 4-4M4 20h16"/>',
    method: '<path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 11v5M12 7.5v.6"/>',
  }

  const SECTIONS = [
    { id: 'overview', label: 'Přehled', title: 'Přehled', sub: 'Celkový obrázek za vybraný měsíc.' },
    { id: 'centers', label: 'Střediska', title: 'Střediska', sub: 'Detail jednoho střediska a jeho lidí.' },
    { id: 'ranking', label: 'Žebříček závodu', title: 'Žebříček závodu', sub: 'Kdo v závodě odpracoval nejvíc přesčasu.' },
    { id: 'year', label: 'Roční limit', title: 'Roční limit', sub: 'Kdo se blíží zákonnému stropu 416 h/rok.' },
    { id: 'import', label: 'Import výkazu', title: 'Import výkazu', sub: 'Přidání dalšího měsíce ze Součtového výkazu.' },
    { id: 'method', label: 'Metodika', title: 'Metodika', sub: 'Jak se čísla počítají a co znamenají.' },
  ]

  const ui = {
    section: 'overview',
    month: null,
    center: null,
    query: '',
    sort: { key: 'total', dir: 'desc' },
    rankingLimit: 25,
    log: [],          // výsledky importů; přežijí překreslení panelu
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
    ui.section = id
    if (location.hash.slice(1) !== id) location.hash = id
    $$('#nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.section === id)))
    const s = SECTIONS.find((x) => x.id === id)
    $('#section-title').textContent = s.title
    $('#section-sub').textContent = s.sub
    SECTIONS.forEach((x) => { $('#panel-' + x.id).hidden = x.id !== id })
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

  /* ---------- ukázková data ---------- */
  function renderDemoBanner() {
    const rec = currentMonth()
    const box = $('#demo-banner')
    if (!rec || !rec.demo) { box.hidden = true; box.innerHTML = ''; return }
    box.hidden = false
    box.className = 'demo-banner'
    box.innerHTML = `<span aria-hidden="true">⚠</span><div>
      <strong>Ukázková data.</strong> ${esc(monthName(ui.month))} je vygenerovaný vzorek —
      jména, osobní čísla i hodiny jsou vymyšlené. Reálný měsíc přidáte v sekci
      <button class="btn ghost sm" type="button" data-goto="import">Import výkazu</button>.
    </div>`
    const btn = box.querySelector('[data-goto]')
    if (btn) btn.addEventListener('click', () => go('import'))
  }

  /* ---------- stavební kameny ---------- */
  function kpi(label, value, foot, tone) {
    return `<div class="card kpi${tone ? ' ' + tone : ''}">
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

  /** Delta jako odznak: +3:20 / −1:05. */
  function delta(value, formatter) {
    if (value == null || !isFinite(value)) return ''
    const f = formatter || hm
    if (Math.abs(value) < 0.005) return '<span class="tag">beze změny</span>'
    const up = value > 0
    return `<span class="tag ${up ? 'crit' : 'good'}">${up ? '+' : '−'}${f(Math.abs(value))}</span>`
  }

  function emptyState(text) {
    return `<div class="card"><div class="empty">
      <h3>Zatím tu nic není</h3><p>${esc(text)}</p>
    </div></div>`
  }

  /* ---------- Přehled ---------- */
  function renderOverview() {
    const el = $('#panel-overview')
    const rec = currentMonth()
    if (!rec) { el.innerHTML = emptyState('Naimportujte Součtový výkaz a panel se naplní.'); return }
    const s = currentStats()
    const prevK = previousKey()
    const cmp = prevK ? PP.compare(rec, PP.data.month(prevK)) : null

    const kpis = `<div class="grid kpis">
      ${kpi('Přesčas celkem', h1(s.total) + ' h',
        cmp ? `proti ${esc(monthShort(prevK))} ${delta(cmp.dTotal, h1)}` : esc(rec.period))}
      ${kpi('Lidí s přesčasem', num(s.withOvertime),
        `z ${num(s.people)} osob · ${pct(s.withOvertime / s.people)}`)}
      ${kpi('Ø na osobu', hm(s.avg),
        cmp ? `proti ${esc(monthShort(prevK))} ${delta(cmp.dAvg)}` : 'z lidí s přesčasem',
        level(s.avg, CFG.person))}
      ${kpi('Proplaceno (MEZD)', pct(s.paidShare),
        cmp ? `zbytek do konta ${delta(-cmp.dPaidShare, (v) => Math.round(v * 100) + ' b. b.')}` : 'zbytek roste v evidenci')}
      ${kpi('Nad ' + CFG.person.crit + ' h za měsíc', num(s.overCrit),
        `nad ${CFG.person.warn} h: ${num(s.overWarn)}`, s.overCrit ? 'crit' : 'good')}
      ${kpi('Nad ' + CFG.year.warn + ' h ročně', num(s.year150),
        `nad ${CFG.year.crit} h: ${num(s.year250)}`, s.year150 ? 'warn' : 'good')}
    </div>`

    const topAvg = s.byAvg.slice(0, 10)
    const maxAvg = topAvg.length ? topAvg[0].avg : 0
    const avgChart = `<div class="card">
      <div class="card-head">
        <h2>Ø hodin na osobu podle středisek</h2>
        <span class="hint">práh ${CFG.center.warn} h / ${CFG.center.crit} h · TOP 10</span>
      </div>
      <div class="bars">
        ${topAvg.map((c) => barRow(c.name, c.avg, maxAvg,
          `${hm(c.avg)} <small>· ${c.people} os.</small>`, c.level)).join('')}
      </div>
    </div>`

    const maxHist = Math.max.apply(null, s.hist.map((b) => b.count).concat([1]))
    const histChart = `<div class="card">
      <div class="card-head">
        <h2>Rozložení přesčasu</h2>
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
        <span><i class="dot" style="background:var(--accent)"></i>Do MEZD ${h1(s.mezdy)} h · ${pct(s.paidShare)}</span>
        <span><i class="dot" style="background:var(--accent-2);opacity:.5"></i>Evidence ${h1(s.evidence)} h · ${pct(1 - s.paidShare)}</span>
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
      `<div class="grid two">${avgChart}${histChart}</div>` +
      `<div class="grid two">${splitChart}${findings}</div>` +
      centerTable(s, cmp)
    bindCenterTable()
  }

  function buildFindings(s, cmp, prevK) {
    const out = []
    const top = s.byAvg[0]
    if (top) {
      const d = cmp && cmp.centers.find((c) => c.name === top.name)
      out.push(`<strong>${esc(top.name)}</strong> má nejvyšší průměr na osobu: <strong>${hm(top.avg)}</strong>
        na ${top.people} ${top.people === 1 ? 'člověka' : top.people < 5 ? 'lidi' : 'lidí'}` +
        (d && d.dAvg != null ? ` — proti ${esc(monthShort(prevK))} ${d.dAvg > 0 ? 'roste' : 'klesá'} o ${hm(Math.abs(d.dAvg))}.` : '.'))
    }
    const abs = s.byTotal[0]
    if (abs) {
      const d = cmp && cmp.centers.find((c) => c.name === abs.name)
      const jumped = d && d.prevTotal != null && cmp.centers.some((c) => c.name !== abs.name && c.prevTotal > d.prevTotal && c.total < abs.total)
      out.push(`Objemově je největší <strong>${esc(abs.name)}</strong> s <strong>${h1(abs.total)} h</strong>
        na ${abs.people} lidí` + (jumped ? ' — v tomto měsíci přeskočil dosud nejvytíženější středisko.' : '.') +
        ' Průměr ' + hm(abs.avg) + ' na osobu.')
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
        ${CFG.person.crit} h v jednom měsíci; maximum je ${hm(s.max)}.`)
    }
    return out.length ? out : ['Za tento měsíc nejsou vykázané žádné přesčasové hodiny.']
  }

  const CENTER_COLS = [
    { key: 'name', label: 'Středisko', num: false },
    { key: 'people', label: 'Lidí', num: true },
    { key: 'total', label: 'Celkem', num: true },
    { key: 'avg', label: 'Ø / osoba', num: true },
    { key: 'm', label: 'Do MEZD', num: true },
    { key: 'e', label: 'Evidence', num: true },
    { key: 'max', label: 'Maximum', num: true },
  ]

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
          ${CENTER_COLS.map((c) => `<th class="sortable${c.num ? ' num' : ''}" data-key="${c.key}"
            aria-sort="${key === c.key ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"
            >${esc(c.label)}</th>`).join('')}
          ${cmp ? '<th class="num">Δ Ø</th>' : ''}
        </tr></thead>
        <tbody>${rows.map((c) => {
          const d = dmap.get(c.name)
          return `<tr>
            <td>${esc(c.name)} ${c.level ? `<span class="tag ${c.level}">${c.level === 'crit' ? 'kritické' : 'sledovat'}</span>` : ''}</td>
            <td class="num">${num(c.people)}</td>
            <td class="num">${h1(c.total)}</td>
            <td class="num">${hm(c.avg)}</td>
            <td class="num">${h1(c.m)}</td>
            <td class="num">${h1(c.e)}</td>
            <td class="num">${hm(c.max)}</td>
            ${cmp ? `<td class="num">${d && d.dAvg != null ? delta(d.dAvg) : '<span class="tag">nové</span>'}</td>` : ''}
          </tr>`
        }).join('')}</tbody>
      </table></div>
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
          <span>${esc(x.name)}</span><span class="c-avg">${hm(x.avg)}</span>
        </button>`).join('')}</div>
    </div>`

    const share = s.total ? c.total / s.total : 0
    const kpis = `<div class="grid kpis">
      ${kpi('Přesčas celkem', h1(c.total) + ' h', `${pct(share)} přesčasu závodu`)}
      ${kpi('Lidí s přesčasem', num(c.people), `maximum ${hm(c.max)}`)}
      ${kpi('Ø na osobu', hm(c.avg),
        d && d.dAvg != null ? `proti ${esc(monthShort(prevK))} ${delta(d.dAvg)}` : 'práh ' + CFG.center.warn + ' / ' + CFG.center.crit + ' h',
        c.level)}
      ${kpi('Proplaceno (MEZD)', pct(c.total ? c.m / c.total : 0), `${h1(c.m)} h z ${h1(c.total)} h`)}
    </div>`

    const top5 = c.rows.slice(0, 5)
    const maxTop = top5.length ? top5[0].t : 0
    const topCard = `<div class="card">
      <div class="card-head"><h3>TOP 5 lidí</h3><span class="hint">${esc(c.name)}</span></div>
      <div class="bars">${top5.map((r) =>
        barRow(r.n, r.t, maxTop, hm(r.t), level(r.t, CFG.person))).join('')}</div>
    </div>`

    const listCard = `<div class="card">
      <div class="card-head"><h3>Všichni s přesčasem</h3><span class="hint">${c.people} lidí</span></div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th class="rank">#</th><th>Jméno</th><th class="num">Os. č.</th>
          <th class="num">Do MEZD</th><th class="num">Evidence</th>
          <th class="num">Přesčas</th><th class="num">Ročně</th>
        </tr></thead>
        <tbody>${c.rows.map((r, i) => personRow(r, i + 1)).join('')}</tbody>
      </table></div>
    </div>`

    // TOP 5 a plný seznam pod sebou — vedle sebe by se sedmisloupcová tabulka ořízla
    el.innerHTML = chips + kpis + topCard + listCard
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
      <td class="name">${query ? mark(r.n, query) : esc(r.n)}</td>
      <td class="num">${esc(String(r.o))}</td>
      <td class="num">${hm(r.m)}</td>
      <td class="num">${hm(r.e)}</td>
      <td class="num">${lvl ? `<span class="tag ${lvl}">${hm(r.t)}</span>` : hm(r.t)}</td>
      <td class="num">${ylvl ? `<span class="tag ${ylvl}">${hm(r.r)}</span>` : hm(r.r)}</td>
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
          <th class="num">Do MEZD</th><th class="num">Evidence</th>
          <th class="num">Přesčas</th><th class="num">Ročně</th>
        </tr></thead>
        <tbody>${shown.length
          ? shown.map((r) => {
              const rank = s.ranking.indexOf(r) + 1
              const lvl = level(r.t, CFG.person)
              const ylvl = r.r >= CFG.year.crit ? 'crit' : r.r > CFG.year.warn ? 'warn' : ''
              return `<tr>
                <td class="rank">${rank}</td>
                <td class="name">${mark(r.n, ui.query)}</td>
                <td>${mark(r.s, ui.query)}</td>
                <td class="num">${hm(r.m)}</td>
                <td class="num">${hm(r.e)}</td>
                <td class="num">${lvl ? `<span class="tag ${lvl}">${hm(r.t)}</span>` : hm(r.t)}</td>
                <td class="num">${ylvl ? `<span class="tag ${ylvl}">${hm(r.r)}</span>` : hm(r.r)}</td>
              </tr>`
            }).join('')
          : `<tr><td colspan="7" class="empty">Nikdo neodpovídá hledání „${esc(ui.query)}“.</td></tr>`}
        </tbody>
      </table></div>
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
    const more = $('#ranking-more')
    if (more) more.addEventListener('click', () => { ui.rankingLimit += 25; renderRanking() })
  }

  /* ---------- Roční limit ---------- */
  function renderYear() {
    const el = $('#panel-year')
    const rec = currentMonth()
    if (!rec) { el.innerHTML = emptyState('Naimportujte Součtový výkaz a panel se naplní.'); return }
    const s = currentStats()
    const list = s.yearly.slice(0, 25)

    el.innerHTML = `<div class="grid kpis">
      ${kpi('Nad ' + CFG.year.warn + ' h', num(s.year150), 'nutná dohoda o práci přesčas', s.year150 ? 'warn' : 'good')}
      ${kpi('Nad ' + CFG.year.crit + ' h', num(s.year250), 'zbývá do stropu méně než ' + (CFG.year.cap - CFG.year.crit) + ' h', s.year250 ? 'crit' : 'good')}
      ${kpi('Na stropu ' + CFG.year.cap + ' h', num(s.yearCap), 'další přesčas už nelze nařídit', s.yearCap ? 'crit' : 'good')}
      ${kpi('Nejvyšší roční součet', hm(s.yearly.length ? s.yearly[0].r : 0),
        s.yearly.length ? `zbývá ${hm(Math.max(0, CFG.year.cap - s.yearly[0].r))}` : '',
        s.yearly.length ? level(s.yearly[0].r, { warn: CFG.year.warn, crit: CFG.year.crit }) : '')}
    </div>
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
            <span class="amt">${hm(r.r)} <span class="hint">/ ${CFG.year.cap} h · zbývá ${hm(Math.max(0, CFG.year.cap - r.r))}</span></span>
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
    const keys = PP.data.keys()

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
      <div class="card-head"><h2>Načtené měsíce</h2><span class="hint">${keys.length} ${keys.length === 1 ? 'měsíc' : keys.length < 5 ? 'měsíce' : 'měsíců'}</span></div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Měsíc</th><th>Období</th><th class="num">Lidí</th><th class="num">Přesčas</th>
          <th>Zdroj</th><th>Soubor</th><th></th>
        </tr></thead>
        <tbody>${keys.map((k) => {
          const rec = PP.data.month(k)
          const st = PP.stats(rec)
          const imported = PP.data.isImported(k)
          return `<tr>
            <td>${esc(monthName(k))}</td>
            <td>${esc(rec.period || '—')}</td>
            <td class="num">${num(st.withOvertime)}</td>
            <td class="num">${h1(st.total)} h</td>
            <td>${rec.demo ? '<span class="tag warn">ukázka</span>' : imported ? '<span class="tag accent">import</span>' : '<span class="tag">vestavěné</span>'}</td>
            <td>${esc(rec.file || '—')}</td>
            <td>${imported ? `<button class="btn danger sm" type="button" data-remove="${esc(k)}">Smazat</button>` : ''}</td>
          </tr>`
        }).join('') || '<tr><td colspan="7" class="empty">Zatím žádná data.</td></tr>'}
        </tbody>
      </table></div>
    </div>`

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
      if (!window.confirm(`Opravdu smazat naimportovaný měsíc ${monthName(key)}?`)) return
      await PP.data.removeMonth(key)
      log('ok', `${monthName(key)} smazán.`)
      refreshAll()
    }))
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

  async function handleFiles(files) {
    for (const file of files) {
      const busy = log('busy', `Zpracovávám <strong>${esc(file.name)}</strong>…`)
      try {
        const { key, record, kind, skipped } = await PP.parseReport(file)
        const replaced = PP.data.month(key)
        await PP.data.addMonth(key, record)
        const st = PP.stats(PP.data.month(key))
        busy.kind = 'ok'
        busy.html = `<strong>${esc(monthName(key))}</strong> ${replaced ? 'přepsán' : 'přidán'} —
          ${num(st.withOvertime)} lidí s přesčasem, ${h1(st.total)} h, ${num(record.people)} osob ve výkazu.
          <span class="hint">Formát: ${esc(kind)}${skipped ? ` · přeskočeno ${num(skipped)} nepřesčasových řádků` : ''}</span>`
        ui.month = key
      } catch (err) {
        busy.kind = 'err'
        busy.html = `<strong>${esc(file.name)}</strong> — ${esc(err && err.message ? err.message : String(err))}`
      }
      renderLog()
    }
    refreshAll()
  }

  /* ---------- Metodika ---------- */
  function renderMethod() {
    $('#panel-method').innerHTML = `<div class="card"><div class="prose">
      <h3>Co se počítá jako přesčas</h3>
      <p><strong>Přesčas = Přesčas do MEZD + Přesčas evidence.</strong> První složka jsou hodiny
      poslané do výplaty, druhá zůstatek na kontě pracovní doby. Obě čte panel přímo z mzdových
      složek Součtového výkazu, nic se nedopočítává.</p>
      <p>Evidence může být <strong>záporná</strong> — to je odečet konta po proplacení. Proto může
      člověku vyjít součet 0 i v měsíci, kdy má ve výkazu desítky hodin: hodiny se proplatily
      a stejná částka odešla z konta.</p>

      <h3>Prahové hodnoty</h3>
      <ul>
        <li><strong>Jednotlivec za měsíc:</strong> ${CFG.person.warn} h oranžová, ${CFG.person.crit} h červená.</li>
        <li><strong>Středisko, Ø na osobu:</strong> ${CFG.center.warn} h oranžová, ${CFG.center.crit} h červená.</li>
        <li><strong>Roční součet:</strong> ${CFG.year.warn} h oranžová, ${CFG.year.crit} h červená,
            <strong>${CFG.year.cap} h</strong> zákonný strop.</li>
      </ul>
      <p>Prahy jsou provozní, ne zákonné — slouží k tomu, aby se v tabulce dalo rychle najít,
      kde se hromadí zátěž. Jediné tvrdé číslo je roční strop.</p>

      <h3>Legislativní kontext</h3>
      <p>Zákoník práce omezuje <em>nařízený</em> přesčas na 150 h za kalendářní rok a v průměru
      8 h týdně za vyrovnávací období. Nad rámec nařízeného přesčasu lze pracovat jen po
      <strong>dohodě se zaměstnancem</strong>, celkem však nejvýše v průměru 8 h týdně, tedy
      zhruba <strong>${CFG.year.cap} h ročně</strong>. Proto panel odděluje pásmo nad ${CFG.year.warn} h
      (od kdy je potřeba dohoda) od pásma nad ${CFG.year.crit} h (kde už zbývá malá rezerva).</p>

      <h3>Ø na osobu</h3>
      <p>Průměr se počítá <strong>jen z lidí, kteří v daném měsíci přesčas vykázali</strong>, ne
      z celého stavu střediska. Malé středisko se třemi lidmi tak vyjde vysoko, i když je v objemu
      hodin zanedbatelné — proto je vedle žebříčku průměrů i tabulka s absolutními součty.</p>

      <h3>Jak se čte Součtový výkaz</h3>
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

      <h3>Kde data leží</h3>
      <p>Importované měsíce se ukládají do: <strong>${esc(PP.store.backendName)}</strong>.
      Vestavěná data jsou součástí souboru <code>data/months.js</code> a importem se
      pro daný měsíc přebijí; po smazání importu se zase objeví.</p>
    </div></div>`
  }

  /* ---------- překreslení ---------- */
  function render() {
    renderDemoBanner()
    switch (ui.section) {
      case 'overview': return renderOverview()
      case 'centers': return renderCenters()
      case 'ranking': return renderRanking()
      case 'year': return renderYear()
      case 'import': return renderImport()
      case 'method': return renderMethod()
    }
  }

  function refreshAll() {
    renderMonthPicker()
    updateRailNote()
    render()
  }

  function updateRailNote() {
    const keys = PP.data.keys()
    const note = $('#rail-note')
    if (!keys.length) { note.textContent = 'Zatím bez dat.'; return }
    note.textContent = `${keys.length} ${keys.length === 1 ? 'měsíc' : keys.length < 5 ? 'měsíce' : 'měsíců'} · ` +
      `${monthShort(keys[keys.length - 1])} – ${monthShort(keys[0])}`
  }

  /* ---------- start ---------- */
  async function init() {
    initTheme()
    renderNav()
    await PP.data.init()
    renderMonthPicker()
    updateRailNote()

    $('#month-select').addEventListener('change', (e) => {
      ui.month = e.target.value
      ui.center = null
      render()
    })
    window.addEventListener('hashchange', () => {
      const id = location.hash.slice(1)
      if (id && id !== ui.section) go(id)
    })

    const initial = location.hash.slice(1)
    go(SECTIONS.some((s) => s.id === initial) ? initial : 'overview')
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})(window.PP)
