# Přesčasový panel Planá

Interaktivní přehled přesčasových hodin podle středisek. Statická stránka —
bez buildu, bez frameworku, bez serveru. Otevře se dvojklikem na `index.html`
nebo se nasadí na libovolný statický hosting.

Původně jeden self-contained HTML soubor, tady rozdělený do samostatných
souborů, aby se v tom dalo dál pracovat.

## Rychlý start

```bash
git clone <repo> && cd Overtimes
open index.html            # nebo: npm start  (http-server na :8080)
```

Panel se otevře s **ukázkovými daty** — vygenerovaným vzorkem za 7 a 8/2026.
Jsou označená žlutým pruhem a jsou **syntetická**: jména, osobní čísla
i hodiny jsou vymyšlené. Reálná data se přidávají importem (viz níže).

## Co panel ukazuje

| Sekce | Obsah |
| --- | --- |
| **Přehled** | KPI dlaždice, žebříček Ø hodin na osobu podle středisek, histogram rozložení, rozpad na MEZD vs. evidenci, tabulka všech středisek, automaticky odvozená zjištění |
| **Střediska** | Výběr střediska přes chipy, KPI střediska, TOP 5 lidí, seznam všech |
| **Žebříček závodu** | Fulltext přes jméno i středisko, žebříček po 25 |
| **Roční limit** | Kdo je nejblíž stropu 416 h/rok, počty nad 150 h a 250 h |
| **Import výkazu** | Drag & drop Součtového výkazu, přidá nebo přepíše měsíc |
| **Metodika** | Jak se počítá, legislativní kontext |

Jsou-li načtené aspoň dva měsíce, přibude u KPI a u tabulky středisek
srovnání s předchozím měsícem (Δ na osobu i v součtu).

## Struktura

```
index.html                  kostra stránky, řazení <script> tagů
styles.css                  tokeny (:root + prefers-color-scheme + [data-theme]) a vzhled
js/util.js                  formátování (h:mm, cs-CZ čísla), prahy, drobné DOM helpery
js/store.js                 perzistence — localStorage nebo vlastní adaptér
js/parser.js                čtení Součtového výkazu (xlsx / BIFF / HTML tabulka / CSV)
js/data.js                  sloučení vestavěných a importovaných měsíců + statistiky
js/app.js                   vykreslení sekcí
data/months.js              vestavěná data (window.PP_BUILTIN_MONTHS)
tools/generate-demo-data.mjs  generátor ukázkových dat
tools/report-to-data.mjs      převod reálných výkazů na data/months.js
tests/                      vzorové výkazy a integrační test importu
```

Skripty jsou **klasické** (`window.PP`), ne ES moduly — díky tomu jde
`index.html` otevřít i přes `file://`, kde by se moduly kvůli CORS nenačetly.
Kdyby se v budoucnu přidal build krok, tohle je první věc, která může padnout.

## Datový model

Klíč měsíce je `YYYY-MM`, hodnotou záznam:

```js
{
  period: "1. 8. – 31. 8. 2026",   // pro zobrazení
  rawPeriod: "1.8.2026 - 31.8.2026",
  people: 197,                     // osob ve výkazu celkem, i bez přesčasu
  rows: [{
    n: "Příjmení Jméno, Titul",
    o: 10248,                      // osobní číslo
    s: "G463 Prefix",              // středisko
    m: 30.05,                      // přesčas do MEZD (h)
    e: -12.5,                      // přesčas evidence (h)
    t: 17.55,                      // m + e
    r: 212.0                       // přesčas roční součet
  }],
  importedAt: "2026-09-03T06:48:00.000Z",
  file: "Souctovy_vykaz_2026_08.xls"
}
```

**Přesčas = Přesčas do MEZD + Přesčas evidence.** Záporná evidence je odečet
konta po proplacení — proto může někomu vyjít součet 0 i v měsíci, kdy má ve
výkazu 40 vykázaných hodin.

Prahy (v `js/util.js`, `PP.CFG`): člověk 40 h / 60 h za měsíc, středisko
Ø 35 h / 45 h, roční součet 150 h / 250 h a strop 416 h.

## Import Součtového výkazu

Sekce **Import výkazu** bere soubor přetažením i výběrem. Parser:

1. Formát pozná z prvních bajtů — `PK` → `.xlsx` (SheetJS se dotáhne z cdnjs
   až v momentě potřeby), `D0CF` → starší binární `.xls`, jinak text.
2. Výkaz z mezd má sice příponu `.xls`, ale je to **HTML tabulka**. Parsuje se
   přes `DOMParser` a bere se `<table>` s nejvíc řádky.
3. Kódování se řeší podle deklarovaného charsetu, jinak UTF-8 s fallbackem na
   windows-1250 (mzdový systém posílá středoevropské kódování).
4. Hlavička se hledá do 40. řádku podle sloupců obsahujících *příjmení+jméno*,
   *osobní*, *středisko*, *mzdová+složka*, *hodiny*.
5. Období se bere z řádku nad hlavičkou začínajícího `Období:`, jinak z prvního
   výskytu `d.m.rrrr - d.m.rrrr`. Z něj vzniká klíč měsíce.
6. Hodiny se čtou jako `h:mm` i jako desetinné číslo, včetně znaménka
   (`-2:30`, `12:30-`, `(12:30)`).
7. Řádky se agregují na klíč `osobní číslo | středisko`; nepřesčasové mzdové
   složky se přeskočí, ale člověk se započítá do stavu ve výkazu.

Existující měsíc se importem **přepíše**. Naimportované měsíce jdou v seznamu
smazat; pokud pro daný měsíc existují i vestavěná data, po smazání se vrátí.

## Perzistence

Importované měsíce se ukládají do `localStorage` pod klíčem
`prescasy.months.v1`. Vrstva je odstíněná — `js/store.js` volá jen
`loadImported / saveImported / removeImported` a backend se dá vyměnit
dosazením `window.PP_DB_ADAPTER` **před** načtením `js/app.js`:

```html
<script>
  window.PP_DB_ADAPTER = {
    name: 'kolekce months',
    async load() { /* → { 'YYYY-MM': record } */ },
    async save(key, record) { /* uložit jeden měsíc */ },
    async remove(key) { /* smazat jeden měsíc */ },
  }
</script>
```

Takhle je panel napojený na úložiště publikovaného artefaktu, kde je jeden
měsíc jedním dokumentem v kolekci `months` (cca 22 KiB na měsíc, limit
dokumentu 256 KiB). Když je úložiště nedostupné (privátní režim, zablokované
cookies), spadne se na paměť a panel to napíše v sekci Import.

## Data

```bash
npm run data                                  # přegeneruje ukázková data
node tools/report-to-data.mjs vykaz-07.xls vykaz-08.xls   # reálná data
node tools/report-to-data.mjs --keep vykaz-09.xls         # přidat další měsíc
```

`report-to-data.mjs` parser neduplikuje — pustí headless Chromium, načte do něj
samotný panel a rozparsuje soubory **stejným kódem, jaký běží v prohlížeči**.
Co projde skriptem, projde i importem v UI.

> **Pozor:** vygenerovaný `data/months.js` s reálnými daty obsahuje osobní
> údaje (jméno, osobní číslo, středisko, přesčasy). Než ho commitnete nebo
> panel někam nasadíte, ověřte, komu tato data smí být vidět. Ukázková data
> jsou v repu proto, aby tuhle otázku nebylo nutné řešit hned.

## Testy

```bash
npm install     # playwright
npm test
```

`tests/make-fixtures.mjs` vyrobí vzorové výkazy — HTML tabulku s příponou
`.xls` v kódování windows-1250 a CSV s desetinnými hodinami. `tests/import.test.mjs`
je pak nahraje **přes reálné UI** a ověří období, počty lidí, součty, zápornou
evidenci, součet 0 u proplaceného konta, diakritiku i chování při smazání
importu.

## Vzhled

Boční tmavý rail, světlý/tmavý obsah. Motiv se řídí systémem a dá se přepnout
tlačítkem v railu (systém → světlý → tmavý), volba se pamatuje.

* Písma: Bricolage Grotesque (nadpisy), Figtree (text), JetBrains Mono (čísla)
* Akcent teal `#0f9e91` / `#25c9b6`
* Sémantika: warn `#c07f00`, crit `#d24842`, good `#1a9963`

Google Fonts jsou jediná externí závislost při startu; bez sítě se použije
systémové písmo a panel funguje dál. SheetJS se stahuje z cdnjs, ale jen když
opravdu přijde `.xlsx`.

## Co dál

* Srovnávací pohled měsíc/měsíc jako samostatná sekce, až budou 3+ měsíce
  (delty už se počítají v `PP.compare`, zatím se zobrazují jen v Přehledu)
* Export do Excelu přímo z panelu
