import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "gaming-abend.firebaseapp.com",
  projectId: "gaming-abend",
  storageBucket: "gaming-abend.firebasestorage.app",
  messagingSenderId: "1063117923757",
  appId: "1:1063117923757:web:4db03e206cace4ab932d24"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
