import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
export const auth = getAuth(app);