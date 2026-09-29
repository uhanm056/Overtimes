/*
 * Vestavěná data panelu.
 *
 * Prázdné schválně — panel startuje bez dat a naplní se importem Součtového
 * výkazu. Žádná vymyšlená čísla se nedistribuují.
 *
 * Reálná data: node tools/report-to-data.mjs vykaz.xls  → data/months.local.js
 *              (ten je v .gitignore a build-single-file.mjs si ho vezme)
 */
window.PP_BUILTIN_MONTHS = {};
