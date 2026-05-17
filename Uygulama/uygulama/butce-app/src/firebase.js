import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyClM4_BbfmCxKsW4XY9Mw2AYesXffAsq7s",
  authDomain: "projetestai-f0212.firebaseapp.com",
  projectId: "projetestai-f0212",
  storageBucket: "projetestai-f0212.firebasestorage.app",
  messagingSenderId: "988916703351",
  appId: "1:988916703351:web:7bcd26dd1dd221c51c2672"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
