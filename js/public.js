/* Veřejné vydání panelu — agregace, potlačení malých středisek a sestavení
 * souboru pro GitHub Pages.
 *
 * Běží v prohlížeči, protože tam už data jsou. Milan tak nepotřebuje Node ani
 * Playwright: naimportuje výkazy do panelu, klikne na Vygenerovat a dostane
 * hotový index.html, který jen nahraje do repozitáře.
 *
 * Tentýž kód používá i tools/build-public.mjs, aby existovala jedna jediná
 * definice toho, co se zveřejňuje. Kdyby se rozešly, lišila by se webová
 * verze od té z příkazové řádky a nikdo by nevěděl, která platí.
 */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  /** Pod tolik lidí se středisko nezveřejňuje samostatně. */
  const MIN_PEOPLE = 5

  const HIST = [
    { to: 0, label: '≤ 0' }, { from: 0, to: 10, label: '0–10' },
    { from: 10, to: 20, label: '10–20' }, { from: 20, to: 30, label: '20–30' },
    { from: 30, to: 40, label: '30–40' }, { from: 40, to: 50, label: '40–50' },
    { from: 50, to: 60, label: '50–60' }, { from: 60, to: Infinity, label: '60+' },
  ]

  const round2 = (v) => Math.round(v * 100) / 100

  const stredisek = (n) => (n === 1 ? 'středisko' : n < 5 ? 'střediska' : 'středisek')

  /**
   * Z měsíců s řádky lidí udělá měsíce se samými souhrny.
   * @returns {{months: object, suppressed: number, log: string[]}}
   */
  PP.publicMonths = function (months, CFG) {
    const out = {}
    const log = []
    let suppressed = 0

    for (const key of Object.keys(months).sort()) {
      const rec = months[key]
      const rows = rec.rows || []

      const byCenter = new Map()
      for (const r of rows) {
        let c = byCenter.get(r.s)
        if (!c) { c = { name: r.s, people: 0, total: 0, m: 0, e: 0 }; byCenter.set(r.s, c) }
        c.people++; c.total += r.t; c.m += r.m; c.e += r.e
      }

      // Malá střediska se slučují. U tříčlenného by průměr na osobu prakticky
      // prozradil přesčasy těch tří lidí — každý ví, kdo tam pracuje.
      const big = []
      const small = { name: 'Ostatní (malá střediska)', people: 0, total: 0, m: 0, e: 0 }
      let smallCount = 0
      for (const c of byCenter.values()) {
        if (c.people >= MIN_PEOPLE) big.push(c)
        else {
          small.people += c.people; small.total += c.total; small.m += c.m; small.e += c.e
          smallCount++
        }
      }

      const centers = big.map((c) => ({
        name: c.name, people: c.people,
        total: round2(c.total), m: round2(c.m), e: round2(c.e),
      }))
      // Sloučený zbytek může být sám příliš malý — pak se nezveřejní vůbec.
      if (small.people >= MIN_PEOPLE) {
        centers.push({
          name: small.name, people: small.people,
          total: round2(small.total), m: round2(small.m), e: round2(small.e),
        })
      } else if (smallCount) {
        suppressed += small.people
      }

      out[key] = {
        period: rec.period,
        rawPeriod: rec.rawPeriod,
        people: rec.people,
        aggregate: true,
        // ať je i na zveřejněné stránce poznat, že jde o vzorek, ne o závod
        demo: rec.demo || undefined,
        summary: {
          withOvertime: rows.length,
          total: round2(rows.reduce((a, r) => a + r.t, 0)),
          mezdy: round2(rows.reduce((a, r) => a + r.m, 0)),
          evidence: round2(rows.reduce((a, r) => a + r.e, 0)),
          overWarn: rows.filter((r) => r.t >= CFG.person.warn).length,
          overCrit: rows.filter((r) => r.t >= CFG.person.crit).length,
          year150: rows.filter((r) => r.r > CFG.year.warn).length,
          year250: rows.filter((r) => r.r > CFG.year.crit).length,
          yearCap: rows.filter((r) => r.r >= CFG.year.cap).length,
          hist: HIST.map((b) => ({
            label: b.label,
            count: rows.filter((r) => (b.to === 0 ? r.t <= 0 : r.t > b.from && r.t <= b.to)).length,
          })),
          centers,
        },
      }

      const label = PP.monthName ? PP.monthName(key) : key
      log.push(`${label}: ${centers.length} ${stredisek(centers.length)} zveřejněno` +
        (smallCount ? ` · ${smallCount} malých sloučeno` : ''))
    }

    return { months: out, suppressed, log }
  }

  /**
   * Poslední pojistka před zápisem: projde hotový text a hledá v něm jakékoli
   * jméno nebo osobní číslo ze zdrojových dat. Když něco najde, soubor se
   * nesmí vydat — ať už to tam přiteklo odkudkoli.
   */
  PP.publicLeaks = function (text, months) {
    const needles = new Set()
    for (const rec of Object.values(months)) {
      for (const r of rec.rows || []) { needles.add(String(r.n)); needles.add(String(r.o)) }
    }
    return [...needles].filter((n) => n && text.includes(n))
  }

  /* ---------- sestavení souboru v prohlížeči ---------- */

  const safe = (code) => code.replace(/<\/(script)/gi, '<\\/$1')

  /** Stáhne a vloží do dokumentu styly a skripty, které jsou zatím odkazem. */
  async function inlineAssets(doc) {
    const local = (url) => {
      try { return new URL(url, location.href).origin === location.origin } catch (e) { return false }
    }

    for (const link of [...doc.querySelectorAll('link[rel="stylesheet"][href]')]) {
      const href = link.getAttribute('href')
      if (!local(href)) continue           // Google Fonts zůstávají odkazem
      const css = await (await fetch(href)).text()
      const style = doc.createElement('style')
      style.textContent = css.trimEnd()
      link.replaceWith(style)
    }

    for (const script of [...doc.querySelectorAll('script[src]')]) {
      const src = script.getAttribute('src')
      if (!local(src)) continue
      const code = await (await fetch(src)).text()
      const inlineScript = doc.createElement('script')
      if (script.id) inlineScript.id = script.id
      inlineScript.textContent = '\n' + safe(code.trimEnd()) + '\n'
      script.replaceWith(inlineScript)
    }
  }

  /**
   * Postaví veřejnou verzi z právě běžícího panelu.
   * @param {object} months  měsíce s řádky lidí (PP.data)
   * @returns {Promise<{html: string, months: object, suppressed: number, log: string[]}>}
   */
  PP.buildPublicHtml = async function (months) {
    if (!Object.keys(months).length) throw new Error('Nejsou naimportované žádné měsíce.')

    const agg = PP.publicMonths(months, PP.CFG)

    // Vychází se z živé stránky, ale všechno vykreslené se vyhodí. Právě
    // v panelech jsou jména — kdyby tam zbyla, odnesl by si je výstup.
    const doc = document.implementation.createHTMLDocument('')
    doc.replaceChild(doc.importNode(document.documentElement, true), doc.documentElement)
    doc.documentElement.setAttribute('data-theme', '')
    for (const el of doc.querySelectorAll('.panel, #nav, #month-select, #demo-banner, #rail-note, #export-status')) {
      el.innerHTML = ''
    }

    await inlineAssets(doc)

    const data = doc.querySelector('#pp-data')
    if (!data) throw new Error('V dokumentu chybí skript s daty (#pp-data).')
    const serialized = JSON.stringify(agg.months)
    data.removeAttribute('src')
    data.textContent = '\nwindow.PP_PUBLIC = true;\nwindow.PP_BUILTIN_MONTHS = ' + safe(serialized) + ';\n'

    const head = doc.querySelector('head')
    const robots = doc.createElement('meta')
    robots.setAttribute('name', 'robots')
    robots.setAttribute('content', 'noindex')
    head.appendChild(robots)
    const gen = doc.createElement('meta')
    gen.setAttribute('name', 'generator')
    gen.setAttribute('content', 'panel · ' + new Date().toISOString().slice(0, 10))
    head.appendChild(gen)

    const html = '<!doctype html>\n' + doc.documentElement.outerHTML + '\n'

    const leaked = PP.publicLeaks(html, months)
    if (leaked.length) {
      throw new Error('Ve výstupu se objevilo ' + leaked.length +
        ' jmen nebo osobních čísel — soubor se nevydal. Nahlas to, je to chyba panelu.')
    }

    return { html, months: agg.months, suppressed: agg.suppressed, log: agg.log }
  }

  PP.PUBLIC_MIN_PEOPLE = MIN_PEOPLE
})(window.PP)
