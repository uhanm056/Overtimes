/* Připojení ke sdílené databázi (Firebase Realtime Database).
 *
 * Tyhle údaje NEJSOU heslo. apiKey u Firebase je jen identifikátor projektu
 * a běžně se posílá do prohlížeče; kdo smí číst a kdo zapisovat, rozhodují
 * pravidla databáze (database.rules.json), ne tenhle soubor. Proto smí být
 * v repozitáři i veřejně.
 *
 * Nastavení celé věci je v README, část „Živé sdílení souhrnů“.
 * Když se tohle přepíše na null, sdílení se vypne a panel jede jen lokálně.
 */
window.PP_FIREBASE = {
  apiKey: 'AIzaSyD2jwZqIaXsawLCvh0Fb0LFHIqgjHtIv3Q',
  authDomain: 'overtimes-343aa.firebaseapp.com',
  databaseURL: 'https://overtimes-343aa-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'overtimes-343aa',
  appId: '1:341131557471:web:ea0551dc7ba170724a39ea',
}
