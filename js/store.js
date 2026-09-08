/* Perzistence importovaných měsíců.
 *
 * Vrstva je odstíněná — panel volá jen loadImported / saveImported / removeImported
 * a nezajímá ho, kam se ukládá:
 *
 *   • localStorage pod klíčem `prescasy.months.v1` (výchozí, funguje i z file://)
 *   • libovolný jiný backend přes window.PP_DB_ADAPTER (viz README) — např.
 *     kolekce `months` v úložišti publikovaného artefaktu, kde je dokumentem
 *     klíč měsíce. Jeden měsíc má cca 22 KiB, limit dokumentu je 256 KiB.
 *
 * Všechny funkce vracejí Promise, aby šel doplnit asynchronní backend.
 */
window.PP = window.PP || {}

;(function (PP) {
  'use strict'

  const LS_KEY = 'prescasy.months.v1'

  const localBackend = {
    name: 'localStorage',
    async load() {
      try {
        const raw = window.localStorage.getItem(LS_KEY)
        if (!raw) return {}
        const data = JSON.parse(raw)
        return data && typeof data === 'object' ? data : {}
      } catch (err) {
        console.warn('[store] localStorage není dostupný:', err)
        return {}
      }
    },
    async save(key, record) {
      const all = await this.load()
      all[key] = record
      window.localStorage.setItem(LS_KEY, JSON.stringify(all))
    },
    async remove(key) {
      const all = await this.load()
      delete all[key]
      window.localStorage.setItem(LS_KEY, JSON.stringify(all))
    },
  }

  const memoryBackend = {
    name: 'paměť (neukládá se)',
    data: {},
    async load() { return Object.assign({}, this.data) },
    async save(key, record) { this.data[key] = record },
    async remove(key) { delete this.data[key] },
  }

  function backend() {
    // Adaptér smí být dosazen před načtením app.js — např. wrapperem artefaktu.
    if (window.PP_DB_ADAPTER) return window.PP_DB_ADAPTER
    try {
      const probe = '__pp_probe__'
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return localBackend
    } catch (err) {
      // privátní režim, zablokované úložiště, file:// v některých prohlížečích
      return memoryBackend
    }
  }

  PP.store = {
    /** Název aktivního backendu — zobrazuje se v sekci Import. */
    get backendName() { return backend().name },

    /** Všechny importované měsíce jako mapa { 'YYYY-MM': record }. */
    loadImported() { return backend().load() },

    /** Uloží/přepíše jeden měsíc. */
    saveImported(key, record) { return backend().save(key, record) },

    /** Smaže jeden importovaný měsíc. */
    removeImported(key) { return backend().remove(key) },
  }
})(window.PP)
