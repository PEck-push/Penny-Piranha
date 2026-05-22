import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase Konfiguration — Zugang nur für dein privates Gaming-Netz
const firebaseConfig = {
  apiKey: "AIzaSyCQyd5Bd7-Wfo1lMVTtrUurR35_wVjZ61E",
  authDomain: "gaming-abend.firebaseapp.com",
  projectId: "gaming-abend",
  storageBucket: "gaming-abend.firebasestorage.app",
  messagingSenderId: "1063117923757",
  appId: "1:1063117923757:web:4db03e206cace4ab932d24"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);