import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAo4zgCP3zM5DGHKoVw5n9RSVzNpqpB5Mw",
  authDomain: "wm-tippspiel-2026-5c401.firebaseapp.com",
  projectId: "wm-tippspiel-2026-5c401",
  storageBucket: "wm-tippspiel-2026-5c401.firebasestorage.app",
  messagingSenderId: "303045684830",
  appId: "1:303045684830:web:a8e03430f3f0b6ca498ecf"
};

export const app = initializeApp(firebaseConfig);
// Offline-Persistenz: IndexedDB-Cache. Beim App-Start/Reload kommt der erste
// Snapshot aus dem lokalen Cache (kostenlos), nur Änderungen seit dem letzten
// Sync werden abgerechnet — spart die teuren Voll-Neuladungen. Live-Listener
// (onSnapshot) bleiben unverändert aktiv: Echtzeit-Updates kommen wie bisher.
// persistentMultipleTabManager: mehrere offene Tabs teilen sich den Cache sauber.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);