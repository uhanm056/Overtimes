/* Přesčasový panel Planá — společné utility a konfigurace.
   Klasický skript (ne ES modul), aby šel index.html otevřít i z disku (file://). */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  /* ---------- prahové hodnoty ---------- */
  PP.CFG = {
    // měsíční přesčas jednotlivce
    person: { warn: 40, crit: 60 },
    // průměr na osobu za středisko
    center: { warn: 35, crit: 45 },
    // přesčas jednotlivce za týden; zákoník práce počítá 8 h/týden v průměru
    week: { warn: 8, crit: 12 },
    // roční součet přesčasu
    year: { warn: 150, crit: 250, cap: 416 },
    /* Náklady na přesčas. Skutečné mzdy panel nezná a znát nemá — počítá se
       z průměrné hodinové sazby, kterou zadá uživatel. Příplatek za práci
       přesčas je podle zákoníku práce nejméně 25 % průměrného výdělku. */
    cost: { rate: null, surcharge: 25 },
  }

  /** Peníze v korunách: 123456.7 → "123 457 Kč". */
  PP.czk = function (value) {
    if (value == null || !isFinite(value)) return '—'
    return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(value) + ' Kč'
  }

  /** Náklad na hodiny při zadané sazbě a příplatku; bez sazby null. */
  PP.cost = function (hours, cfg) {
    const c = cfg || PP.CFG.cost
    if (!c.rate || !isFinite(c.rate)) return null
    return hours * c.rate * (1 + (Number(c.surcharge) || 0) / 100)
  }

  /** Stupeň závažnosti podle prahů: '' | 'warn' | 'crit'. */
  PP.level = function (value, th) {
    if (value >= th.crit) return 'crit'
    if (value >= th.warn) return 'warn'
    return ''
  }

  /* ---------- formátování ---------- */
  const NF = new Intl.NumberFormat('cs-CZ')
  const NF1 = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  /** Hodiny jako h:mm, se znaménkem: 54.4833 → "54:29", -2.5 → "−2:30". */
  PP.hm = function (hours) {
    if (hours == null || !isFinite(hours)) return '—'
    const sign = hours < 0 ? '−' : ''
    let total = Math.round(Math.abs(hours) * 60)
    const h = Math.floor(total / 60)
    const m = total % 60
    return sign + h + ':' + String(m).padStart(2, '0')
  }

  /** Hodiny jako desetinné číslo v českém formátu: 4625.05 → "4 625,1". */
  PP.h1 = function (hours) {
    if (hours == null || !isFinite(hours)) return '—'
    return NF1.format(hours)
  }

  /** Celé číslo v českém formátu. */
  PP.num = function (n) {
    if (n == null || !isFinite(n)) return '—'
    return NF.format(Math.round(n))
  }

  /** Procenta na celé číslo. */
  PP.pct = function (ratio) {
    if (ratio == null || !isFinite(ratio)) return '—'
    return Math.round(ratio * 100) + ' %'
  }

  /** Klíč měsíce YYYY-MM → "srpen 2026". */
  const MONTH_NAMES = [
    'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
    'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
  ]
  PP.monthName = function (key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '')
    if (!m) return key || '—'
    return MONTH_NAMES[Number(m[2]) - 1] + ' ' + m[1]
  }
  /** Klíč měsíce YYYY-MM → "8/2026". */
  PP.monthShort = function (key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '')
    if (!m) return key || '—'
    return Number(m[2]) + '/' + m[1]
  }

  /* ---------- týdny ----------
     Součtový výkaz jde z mezd vytisknout i za kratší období než měsíc. Týden
     se klíčuje podle ISO 8601 (týden začíná pondělím a patří do roku, do
     kterého spadá jeho čtvrtek), ať se panel shoduje s tím, co lidem ukazuje
     docházka i kalendář v Outlooku. */

  const DAY = 86400000

  /** Datum → { year, week } podle ISO 8601. */
  PP.isoWeek = function (date) {
    // posun na čtvrtek téhož týdne: ten určuje, do kterého roku týden patří
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const den = (d.getUTCDay() + 6) % 7            // pondělí = 0
    d.setUTCDate(d.getUTCDate() - den + 3)
    const ctvrtek = d.getTime()
    const prvni = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
    const prvniDen = (prvni.getUTCDay() + 6) % 7
    prvni.setUTCDate(prvni.getUTCDate() - prvniDen + 3)
    return {
      year: d.getUTCFullYear(),
      week: 1 + Math.round((ctvrtek - prvni.getTime()) / (7 * DAY)),
    }
  }

  /** Datum → klíč týdne "2026-W36". */
  PP.weekKey = function (date) {
    const w = PP.isoWeek(date)
    return w.year + '-W' + String(w.week).padStart(2, '0')
  }

  PP.isWeekKey = function (key) { return /^\d{4}-W\d{2}$/.test(key || '') }

  /** Pondělí daného ISO týdne. */
  PP.weekStart = function (key) {
    const m = /^(\d{4})-W(\d{2})$/.exec(key || '')
    if (!m) return null
    const ctvrtek = new Date(Date.UTC(Number(m[1]), 0, 4))
    const den = (ctvrtek.getUTCDay() + 6) % 7
    ctvrtek.setUTCDate(ctvrtek.getUTCDate() - den + (Number(m[2]) - 1) * 7)
    return ctvrtek
  }

  /** Klíč týdne → "36. týden 2026 (31. 8. – 6. 9.)". */
  PP.weekName = function (key) {
    const m = /^(\d{4})-W(\d{2})$/.exec(key || '')
    if (!m) return key || '—'
    const od = PP.weekStart(key)
    if (!od) return key
    const doD = new Date(od.getTime() + 6 * DAY)
    const d = (x) => x.getUTCDate() + '. ' + (x.getUTCMonth() + 1) + '.'
    return Number(m[2]) + '. týden ' + m[1] + ' (' + d(od) + ' – ' + d(doD) + ')'
  }

  /** Klíč týdne → "36/2026". */
  PP.weekShort = function (key) {
    const m = /^(\d{4})-W(\d{2})$/.exec(key || '')
    return m ? Number(m[2]) + '/' + m[1] : (key || '—')
  }

  /** Název období podle toho, jestli je klíč měsíc nebo týden. */
  PP.periodName = function (key) {
    return PP.isWeekKey(key) ? PP.weekName(key) : PP.monthName(key)
  }
  PP.periodShort = function (key) {
    return PP.isWeekKey(key) ? 'týden ' + PP.weekShort(key) : PP.monthShort(key)
  }

  /* ---------- text ---------- */
  /** Malá písmena bez diakritiky a s normalizovanými mezerami — pro hledání a párování hlaviček. */
  PP.fold = function (s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** Escapování do HTML. */
  PP.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]))
  }

  /** Zvýraznění hledaného výrazu v textu (vstup se escapuje). */
  PP.mark = function (text, query) {
    const safe = PP.esc(text)
    const q = PP.fold(query)
    if (!q) return safe
    const hay = PP.fold(text)
    const at = hay.indexOf(q)
    if (at < 0) return safe
    // fold nemění délku pro běžnou českou diakritiku, offsety tedy sedí
    return PP.esc(text.slice(0, at)) + '<mark>' + PP.esc(text.slice(at, at + q.length)) +
      '</mark>' + PP.esc(text.slice(at + q.length))
  }

  /** Střední jméno střediska bez kódu: "G463 Prefix" → "Prefix". */
  PP.centerName = function (s) {
    return String(s || '').replace(/^[A-Z]?\d{2,5}\s+/, '')
  }

  /* ---------- DOM ---------- */
  PP.el = function (tag, attrs, children) {
    const node = document.createElement(tag)
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k]
        else if (k === 'html') node.innerHTML = attrs[k]
        else if (k === 'text') node.textContent = attrs[k]
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k])
        else if (attrs[k] != null) node.setAttribute(k, attrs[k])
      }
    }
    for (const c of [].concat(children || [])) {
      if (c == null) continue
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    }
    return node
  }

  PP.$ = (sel, root) => (root || document).querySelector(sel)
  PP.$$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel))
})(window.PP)
