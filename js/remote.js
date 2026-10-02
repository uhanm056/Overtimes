/* Živé sdílení souhrnů přes Firebase Realtime Database.
 *
 * Co jde ven: VÝHRADNĚ agregáty za střediska z js/public.js. Jména ani osobní
 * čísla databázi nikdy neuvidí — zůstávají v prohlížeči toho, kdo importuje.
 * Zápis prochází touž kontrolou úniku jako stahovaný soubor; kdyby se v datech
 * objevilo jediné jméno, neodešle se nic.
 *
 * Kdo smí co:
 *   • čtení  — kdokoli přihlášený, i anonymně (souhrny nejsou osobní údaj)
 *   • zápis  — jen účet uvedený v pravidlech databáze, přes e-mail a heslo
 * Pravidla jsou v database.rules.json a vynucuje je server, ne tahle stránka.
 *
 * Konfigurace se doplňuje do window.PP_FIREBASE (viz README). Dokud tam není,
 * je celá vrstva vypnutá a panel se chová jako dřív — jen s localStorage.
 */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  /* Kam se v databázi zapisuje. Verze v cestě je tu proto, aby se dal formát
     později změnit, aniž by staré stránky četly něco, čemu nerozumí. */
  const PATH = 'prescasy/v1/public'

  /* Firebase SDK se stahuje až při prvním použití. Zkouší se postupně —
     kdyby jedna adresa nebyla dostupná, jede se na další. Vlastní verzi lze
     vynutit přes window.PP_FIREBASE.sdk. */
  const SDK_BASES = [
    'https://www.gstatic.com/firebasejs/10.12.2',
    'https://www.gstatic.com/firebasejs/9.23.0',
  ]
  const SDK_PARTS = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js']

  const cfg = () => window.PP_FIREBASE || null

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = url
      s.onload = resolve
      s.onerror = () => reject(new Error('Nenačetl se ' + url))
      document.head.appendChild(s)
    })
  }

  let sdkPromise = null
  function loadSdk() {
    if (window.firebase && window.firebase.database) return Promise.resolve(window.firebase)
    if (sdkPromise) return sdkPromise
    const bases = cfg() && cfg().sdk ? [cfg().sdk] : SDK_BASES
    sdkPromise = (async () => {
      let last = null
      for (const base of bases) {
        try {
          for (const part of SDK_PARTS) await loadScript(base + '/' + part)
          if (window.firebase && window.firebase.database) return window.firebase
          last = new Error('SDK se načetlo, ale firebase.database chybí.')
        } catch (err) { last = err }
      }
      sdkPromise = null
      throw new Error('Nepodařilo se načíst Firebase SDK. ' +
        (last ? last.message + ' ' : '') +
        'Zkontrolujte připojení, nebo doplňte do konfigurace vlastní adresu (sdk).')
    })()
    return sdkPromise
  }

  let app = null
  async function fb() {
    const c = cfg()
    if (!c || !c.databaseURL || /__FIREBASE/.test(JSON.stringify(c))) {
      throw new Error('Firebase není nastavený — v panelu chybí window.PP_FIREBASE (viz README).')
    }
    const firebase = await loadSdk()
    if (!app) app = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(c)
    return firebase
  }

  /* ---------- veřejné rozhraní ---------- */

  const impl = {
    name: 'Firebase RTDB',

    /** Je vůbec kam se připojovat? */
    configured() {
      const c = cfg()
      return !!(c && c.databaseURL && !/__FIREBASE/.test(JSON.stringify(c)))
    },

    /** Přihlásí se anonymně — potřeba i na pouhé čtení, pravidla to vyžadují. */
    async connect() {
      const firebase = await fb()
      if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously()
      return true
    },

    /** Přihlášení účtem, který smí zapisovat. */
    async signIn(email, password) {
      const firebase = await fb()
      const res = await firebase.auth().signInWithEmailAndPassword(email, password)
      return { email: res.user.email, uid: res.user.uid }
    },

    async signOut() {
      const firebase = await fb()
      await firebase.auth().signOut()
    },

    /** Kdo je právě přihlášený; anonymní účet se nepočítá. */
    async currentUser() {
      const firebase = await fb()
      const u = firebase.auth().currentUser
      return u && !u.isAnonymous ? { email: u.email, uid: u.uid } : null
    },

    /** Jednorázové načtení zveřejněných souhrnů. */
    async load() {
      const firebase = await fb()
      await this.connect()
      const snap = await firebase.database().ref(PATH).get()
      return snap.exists() ? snap.val() : null
    },

    /** Živé sledování — zavolá cb při každé změně. Vrací funkci pro odhlášení. */
    async watch(cb) {
      const firebase = await fb()
      await this.connect()
      const ref = firebase.database().ref(PATH)
      const handler = ref.on('value', (snap) => cb(snap.exists() ? snap.val() : null))
      return () => ref.off('value', handler)
    },

    /** Zápis souhrnů. Jedním update(), ať je stránka buď celá stará, nebo celá nová. */
    async publish(payload) {
      const firebase = await fb()
      await firebase.database().ref(PATH).set(payload)
    },
  }

  /* Testy a jiná úložiště si mohou podstrčit vlastní implementaci. */
  function backend() { return window.PP_REMOTE_ADAPTER || impl }

  PP.remote = {
    get name() { return backend().name },
    configured() { return backend().configured() },
    connect() { return backend().connect() },
    signIn(email, password) { return backend().signIn(email, password) },
    signOut() { return backend().signOut() },
    currentUser() { return backend().currentUser() },
    load() { return backend().load() },
    watch(cb) { return backend().watch(cb) },

    /**
     * Spočítá souhrny a zveřejní je. Před odesláním projde výsledek touž
     * kontrolou jako stahovaný soubor — kdyby se do agregátů jakkoli dostalo
     * jméno nebo osobní číslo, neodešle se vůbec nic.
     */
    async publishMonths(months) {
      if (!Object.keys(months).length) throw new Error('Nejsou naimportované žádné měsíce.')
      const agg = PP.publicMonths(months, PP.CFG)

      const payload = {
        months: agg.months,
        updatedAt: new Date().toISOString(),
      }
      const leaked = PP.publicLeaks(JSON.stringify(payload), months)
      if (leaked.length) {
        throw new Error('V souhrnech se objevilo ' + leaked.length +
          ' jmen nebo osobních čísel — neodeslalo se nic. Nahlas to, je to chyba panelu.')
      }

      await backend().publish(payload)
      return { months: agg.months, suppressed: agg.suppressed, log: agg.log, updatedAt: payload.updatedAt }
    },
  }
})(window.PP)
