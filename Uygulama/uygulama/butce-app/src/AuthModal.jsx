import React, { useState } from "react";
import { useAuth } from "./AuthContext";

const inputStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "8px",
  background: "#0f172a",
  color: "white",
  border: "1px solid #334155",
  boxSizing: "border-box",
  fontSize: "14px",
  marginBottom: "14px"
};

const btnPrimary = {
  width: "100%",
  padding: "12px",
  borderRadius: "8px",
  background: "#3b82f6",
  color: "white",
  border: "none",
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "15px"
};

const labelStyle = {
  display: "block",
  marginBottom: "5px",
  fontSize: "13px",
  color: "#94a3b8"
};

function SifreSifirlaFormu({ onGeri }) {
  const { sifreSifirla } = useAuth();
  const [email, setEmail] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMesaj("");
    setHata("");
    setYukleniyor(true);
    try {
      await sifreSifirla(email);
      setMesaj("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.");
    } catch (err) {
      if (err.message === "kayitli-degil" || err.code === "auth/invalid-email") {
        setHata("Bu e-posta adresi sistemde kayıtlı değil.");
      } else {
        setHata("Bir hata oluştu. Lütfen tekrar dene.");
      }
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <>
      <h2 style={{ margin: "0 0 8px", color: "white", textAlign: "center" }}>Şifremi Unuttum</h2>
      <p style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", marginBottom: "24px" }}>
        Kayıtlı e-posta adresinizi girin, sıfırlama bağlantısı gönderelim.
      </p>

      {mesaj ? (
        <div style={{
          background: "#052e16",
          color: "#86efac",
          padding: "14px",
          borderRadius: "8px",
          fontSize: "14px",
          textAlign: "center",
          marginBottom: "16px"
        }}>
          {mesaj}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>E-posta</label>
          <input
            type="email"
            placeholder="ornek@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />

          {hata && (
            <div style={{
              background: "#450a0a",
              color: "#fca5a5",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "14px"
            }}>
              {hata}
            </div>
          )}

          <button type="submit" disabled={yukleniyor} style={{ ...btnPrimary, opacity: yukleniyor ? 0.7 : 1 }}>
            {yukleniyor ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
          </button>
        </form>
      )}

      <button
        onClick={onGeri}
        style={{
          marginTop: "12px", width: "100%", padding: "10px",
          borderRadius: "8px", background: "transparent",
          color: "#94a3b8", border: "1px solid #334155", cursor: "pointer"
        }}
      >
        Giriş Yap'a Dön
      </button>
    </>
  );
}

export default function AuthModal({ mod, onKapat }) {
  const { kayitOl, girisYap } = useAuth();
  const [isimSoyisim, setIsimSoyisim] = useState("");
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sifremiUnuttum, setSifremiUnuttum] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setHata("");
    setYukleniyor(true);
    try {
      if (mod === "kayit") {
        await kayitOl(isimSoyisim, email, sifre);
      } else {
        await girisYap(email, sifre);
      }
      onKapat();
    } catch (err) {
      const mesajlar = {
        "auth/email-already-in-use": "Bu e-posta adresi zaten kayıtlı.",
        "auth/invalid-email": "Geçersiz e-posta adresi.",
        "auth/weak-password": "Şifre en az 6 karakter olmalı.",
        "auth/user-not-found": "Bu e-posta ile kayıtlı kullanıcı bulunamadı.",
        "auth/wrong-password": "Şifre hatalı.",
        "auth/invalid-credential": "E-posta veya şifre hatalı."
      };
      setHata(mesajlar[err.code] || "Bir hata oluştu. Lütfen tekrar dene.");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <div
      onClick={onKapat}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1e293b",
          borderRadius: "16px",
          padding: "32px",
          width: "100%",
          maxWidth: "380px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)"
        }}
      >
        {sifremiUnuttum ? (
          <SifreSifirlaFormu onGeri={() => setSifremiUnuttum(false)} />
        ) : (
          <>
            <h2 style={{ margin: "0 0 24px", color: "white", textAlign: "center" }}>
              {mod === "kayit" ? "Kayıt Ol" : "Giriş Yap"}
            </h2>

            <form onSubmit={handleSubmit}>
              {mod === "kayit" && (
                <>
                  <label style={labelStyle}>İsim Soyisim</label>
                  <input
                    type="text"
                    placeholder="Adınız Soyadınız"
                    value={isimSoyisim}
                    onChange={(e) => setIsimSoyisim(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </>
              )}

              <label style={labelStyle}>E-posta</label>
              <input
                type="email"
                placeholder="ornek@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
              />

              <label style={labelStyle}>Şifre</label>
              <input
                type="password"
                placeholder={mod === "kayit" ? "En az 6 karakter" : "Şifreniz"}
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                required
                style={inputStyle}
              />

              {mod === "giris" && (
                <div style={{ textAlign: "right", marginTop: "-8px", marginBottom: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setSifremiUnuttum(true)}
                    style={{
                      background: "none", border: "none",
                      color: "#60a5fa", cursor: "pointer", fontSize: "13px"
                    }}
                  >
                    Şifremi Unuttum
                  </button>
                </div>
              )}

              {hata && (
                <div style={{
                  background: "#450a0a",
                  color: "#fca5a5",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  marginBottom: "14px"
                }}>
                  {hata}
                </div>
              )}

              <button type="submit" disabled={yukleniyor} style={{ ...btnPrimary, opacity: yukleniyor ? 0.7 : 1 }}>
                {yukleniyor ? "Lütfen bekleyin..." : (mod === "kayit" ? "Kayıt Ol" : "Giriş Yap")}
              </button>
            </form>

            <button
              onClick={onKapat}
              style={{
                marginTop: "16px", width: "100%", padding: "10px",
                borderRadius: "8px", background: "transparent",
                color: "#94a3b8", border: "1px solid #334155", cursor: "pointer"
              }}
            >
              İptal
            </button>
          </>
        )}
      </div>
    </div>
  );
}
