/* Připojení ke sdílené databázi (Firebase Realtime Database).
 *
 * Dokud je tu null, je živé sdílení vypnuté a panel funguje jako dřív —
 * data jen v prohlížeči. Postup nastavení je v README, část „Živé sdílení“.
 *
 * Tyhle údaje NEJSOU heslo. apiKey u Firebase je jen identifikátor projektu
 * a běžně se posílá do prohlížeče; kdo smí číst a kdo zapisovat, rozhodují
 * pravidla databáze (database.rules.json), ne tenhle soubor. Proto smí být
 * v repozitáři i veřejně.
 *
 * Až budeš mít projekt založený, nahraď null tímhle a doplň své hodnoty:
 *
 *   window.PP_FIREBASE = {
 *     apiKey: 'AIza…',
 *     authDomain: 'prescasy-plana.firebaseapp.com',
 *     databaseURL: 'https://prescasy-plana-default-rtdb.europe-west1.firebasedatabase.app',
 *     projectId: 'prescasy-plana',
 *     appId: '1:123…:web:abc…',
 *   }
 *
 * Volitelně `sdk: 'https://www.gstatic.com/firebasejs/10.12.2'`, kdyby
 * výchozí adresa SDK nefungovala.
 */
window.PP_FIREBASE = null
