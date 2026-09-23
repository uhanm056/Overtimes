/* Spojnicové grafy vývoje. Vlastní SVG, bez knihovny — panel se nemá
 * čím rozbít offline a nepotřebuje build.
 *
 * Kreslí se do změřené šířky kontejneru, ne do škálovaného viewBoxu, aby
 * popisky měly na každé šířce stejnou velikost.
 */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  /* Kategoriální paleta pro víc sérií. Firemní teal je sémantická barva
     (accent), na rozlišení entit se nehodí. Tyhle odstíny jsou ověřené na
     rozlišitelnost při barvosleposti proti světlému i tmavému povrchu panelu. */
  const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
  const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']

  function isDark() {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'dark') return true
    if (attr === 'light') return false
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  PP.seriesColors = function () { return isDark() ? SERIES_DARK : SERIES_LIGHT }

  const NS = 'http://www.w3.org/2000/svg'
  const el = (name, attrs) => {
    const n = document.createElementNS(NS, name)
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k])
    return n
  }

  /** Hezký krok osy — 1/2/2,5/5 × 10^n. */
  function niceStep(span, count) {
    const raw = span / count
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag
  }

  /**
   * Dělení osy y. Nula je vždycky uvnitř rozsahu — u člověka může měsíc vyjít
   * záporně (proplacené konto se odečte z evidence) a čára nesmí zmizet pod osu.
   */
  function ticks(min, max, count) {
    const lo = Math.min(0, min)
    const hi = Math.max(0, max)
    if (lo === hi) return [0, 1]
    const step = niceStep(hi - lo, count)
    const from = Math.floor(lo / step) * step
    const to = Math.ceil(hi / step) * step
    const out = []
    for (let v = from; v <= to + step * 0.001; v += step) {
      out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
    }
    return out
  }

  /**
   * Vykreslí spojnicový graf.
   *
   * @param {HTMLElement} host   kontejner; obsah se přepíše
   * @param {object} spec
   *   labels   popisky osy x
   *   series   [{ name, color, values }] — values může obsahovat null (chybí)
   *   format   funkce pro hodnotu v popisku a tooltipu
   *   area     vyplnit plochu pod čarou (jen u jedné série)
   *   endLabel přidat popisek na konec čáry (u víc sérií)
   */
  PP.lineChart = function (host, spec) {
    const width = Math.max(320, host.clientWidth || 640)
    const height = spec.height || 260
    const endRoom = spec.endLabel ? 94 : 16
    const pad = { t: 14, r: endRoom, b: 30, l: 56 }
    const iw = width - pad.l - pad.r
    const ih = height - pad.t - pad.b

    const all = spec.series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v))
    const maxVal = all.length ? Math.max.apply(null, all) : 1
    const minVal = all.length ? Math.min.apply(null, all) : 0

    let ys, yMin, yMax
    if (spec.domainMax != null) {
      // Osa končí přesně na zadané hodnotě — u ročního součtu je tou hodnotou
      // strop, takže je z grafu vidět, kolik z povolených hodin je vyčerpáno.
      yMin = Math.min(0, minVal)
      yMax = Math.max(spec.domainMax, maxVal)
      const step = niceStep(yMax - yMin, 5)
      ys = []
      for (let v = Math.ceil(yMin / step) * step; v <= yMax + step * 0.001; v += step) {
        if (v <= yMax) ys.push(Math.abs(v) < step * 1e-9 ? 0 : v)
      }
      if (!ys.length) ys = [yMin, yMax]
    } else {
      ys = ticks(minVal * 1.02, maxVal * 1.02, 4)
      yMin = ys[0]
      yMax = ys[ys.length - 1]
    }
    const span = yMax - yMin || 1

    const x = (i) => pad.l + (spec.labels.length < 2 ? iw / 2 : (i / (spec.labels.length - 1)) * iw)
    const y = (v) => pad.t + ih - ((v - yMin) / span) * ih

    host.innerHTML = ''
    host.style.position = 'relative'
    const svg = el('svg', {
      width, height, viewBox: `0 0 ${width} ${height}`,
      role: 'img', 'aria-label': spec.ariaLabel || 'Graf vývoje', class: 'chart',
    })

    // mřížka a osa y
    for (const v of ys) {
      svg.appendChild(el('line', {
        x1: pad.l, x2: pad.l + iw, y1: y(v), y2: y(v),
        class: v === 0 ? 'chart-axis' : 'chart-grid',
      }))
      const t = el('text', { x: pad.l - 9, y: y(v) + 4, class: 'chart-tick', 'text-anchor': 'end' })
      t.textContent = (spec.tickFormat || spec.format)(v)
      svg.appendChild(t)
    }

    // osa x
    spec.labels.forEach((lab, i) => {
      const t = el('text', { x: x(i), y: pad.t + ih + 19, class: 'chart-tick', 'text-anchor': 'middle' })
      t.textContent = lab
      svg.appendChild(t)
    })

    // série
    const endLabels = []
    spec.series.forEach((s) => {
      const pts = s.values
        .map((v, i) => (v == null ? null : [x(i), y(v)]))
        .filter(Boolean)
      if (!pts.length) return
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')

      if (spec.area) {
        svg.appendChild(el('path', {
          d: d + ` L${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`,   // plocha vždy k nule
          fill: s.color, opacity: 0.12, stroke: 'none',
        }))
      }
      svg.appendChild(el('path', { d, fill: 'none', stroke: s.color, class: 'chart-line' }))
      pts.forEach((p) => svg.appendChild(el('circle', {
        cx: p[0], cy: p[1], r: 4, fill: s.color, class: 'chart-dot',
      })))

      if (spec.endLabel) {
        const last = pts[pts.length - 1]
        endLabels.push({ x: last[0] + 10, y: last[1], name: s.name, color: s.color })
      }
    })

    // Koncové popisky se u blízkých čar překrývají — rozhrnout je od sebe,
    // pořadí shora dolů zůstává, takže popisek pořád patří ke své čáře.
    if (endLabels.length) {
      const GAP = 15
      endLabels.sort((a, b) => a.y - b.y)
      for (let i = 1; i < endLabels.length; i++) {
        if (endLabels[i].y - endLabels[i - 1].y < GAP) endLabels[i].y = endLabels[i - 1].y + GAP
      }
      const overflow = endLabels[endLabels.length - 1].y - (pad.t + ih)
      if (overflow > 0) {
        const shift = Math.min(overflow, endLabels[0].y - pad.t)
        for (const l of endLabels) l.y -= shift
      }
      for (const l of endLabels) {
        const t = el('text', { x: l.x, y: l.y + 4, class: 'chart-end', fill: l.color })
        t.textContent = l.name
        svg.appendChild(t)
      }
    }

    // prahové čáry (např. 40 a 60 h u jednotlivce)
    for (const ref of spec.refs || []) {
      if (ref.value > yMax || ref.value < yMin) continue
      svg.appendChild(el('line', {
        x1: pad.l, x2: pad.l + iw, y1: y(ref.value), y2: y(ref.value),
        class: 'chart-ref ' + (ref.tone || ''),
      }))
      const t = el('text', { x: pad.l + iw - 4, y: y(ref.value) - 5, class: 'chart-ref-label ' + (ref.tone || ''), 'text-anchor': 'end' })
      t.textContent = ref.label
      svg.appendChild(t)
    }

    // vrstva pro najetí myší
    const cross = el('line', { y1: pad.t, y2: pad.t + ih, class: 'chart-cross', opacity: 0 })
    svg.appendChild(cross)
    const hot = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' })
    svg.appendChild(hot)
    host.appendChild(svg)

    const tip = document.createElement('div')
    tip.className = 'chart-tip'
    tip.hidden = true
    host.appendChild(tip)

    const nearest = (px) => {
      let best = 0
      for (let i = 1; i < spec.labels.length; i++) {
        if (Math.abs(px - x(i)) < Math.abs(px - x(best))) best = i
      }
      return best
    }

    function show(ev) {
      const box = svg.getBoundingClientRect()
      const i = nearest(((ev.clientX - box.left) / box.width) * width)
      cross.setAttribute('x1', x(i))
      cross.setAttribute('x2', x(i))
      cross.setAttribute('opacity', 1)
      tip.innerHTML = `<strong>${PP.esc(spec.labels[i])}</strong>` +
        spec.series.map((s) => s.values[i] == null ? '' : `
          <span class="row"><i style="background:${s.color}"></i>
          <span class="nm">${PP.esc(s.name)}</span>
          <span class="vl">${PP.esc(spec.format(s.values[i]))}</span></span>`).join('')
      tip.hidden = false
      const left = (x(i) / width) * box.width
      tip.style.left = Math.min(Math.max(left, 8), box.width - tip.offsetWidth - 8) + 'px'
    }
    function hide() {
      cross.setAttribute('opacity', 0)
      tip.hidden = true
    }
    hot.addEventListener('mousemove', show)
    hot.addEventListener('mouseleave', hide)
    svg.addEventListener('touchstart', (e) => { if (e.touches[0]) show(e.touches[0]) }, { passive: true })
    svg.addEventListener('touchmove', (e) => { if (e.touches[0]) show(e.touches[0]) }, { passive: true })
  }

  /* Překreslení po změně šířky. Pozorovatel je jeden, přepíná se na aktuální
     sadu grafů, aby se nehromadily po každém překreslení sekce. */
  let observer = null
  PP.watchCharts = function (redraw) {
    if (observer) observer.disconnect()
    if (!window.ResizeObserver) return
    const host = document.querySelector('.content')
    if (!host) return

    // Překresluje se jen při skutečné změně šířky. Bez toho by překreslení
    // grafu změnilo výšku obsahu, pozorovatel by se spustil znovu a točilo
    // by se to dokola — a každé překreslení by navíc zahodilo rozkreslený
    // tooltip pod kurzorem.
    let lastWidth = host.clientWidth
    let timer = null
    observer = new ResizeObserver(() => {
      if (host.clientWidth === lastWidth) return
      lastWidth = host.clientWidth
      clearTimeout(timer)
      timer = setTimeout(redraw, 120)
    })
    observer.observe(host)
  }
})(window.PP)
