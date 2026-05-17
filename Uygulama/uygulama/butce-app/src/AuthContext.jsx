import React, { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [kullanici, setKullanici] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setKullanici(user ?? null));
    return unsub;
  }, []);

  async function kayitOl(isimSoyisim, email, sifre) {
    const sonuc = await createUserWithEmailAndPassword(auth, email, sifre);
    await updateProfile(sonuc.user, { displayName: isimSoyisim });
    await setDoc(doc(db, "kullanicilar", sonuc.user.uid), {
      isimSoyisim,
      email,
      olusturmaTarihi: new Date().toISOString()
    });
    return sonuc.user;
  }

  async function girisYap(email, sifre) {
    const sonuc = await signInWithEmailAndPassword(auth, email, sifre);
    return sonuc.user;
  }

  async function cikisYap() {
    await signOut(auth);
  }

  async function sifreSifirla(email) {
    const yontemler = await fetchSignInMethodsForEmail(auth, email);
    if (yontemler.length === 0) {
      throw new Error("kayitli-degil");
    }
    await sendPasswordResetEmail(auth, email);
  }

  return (
    <AuthContext.Provider value={{ kullanici, kayitOl, girisYap, cikisYap, sifreSifirla }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
