import React, { useState, useEffect, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";
import InstallButton from "./InstallButton";

// --- SES ÜRETİCİ FONKSİYON ---
const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.error("Ses çalınamadı", e);
  }
};

const KATEGORILER = {
  gelir: ["Maaş", "Freelance", "Yatırım", "Eğitim", "Diğer"],
  gider: ["Elektrik Faturası", "Su Faturası", "Doğalgaz Faturası", "İnternet / Telefon", "Kira", "Market", "Ulaşım", "Eğlence", "Sağlık", "Diğer"]
};

const KATEGORI_RENKLERI = {
  "Maaş": "#10b981", "Freelance": "#34d399", "Yatırım": "#059669", "Eğitim": "#6ee7b7", "Diğer": "#a7f3d0",
  "Elektrik Faturası": "#ef4444", "Su Faturası": "#f87171", "Doğalgaz Faturası": "#f97316", "İnternet / Telefon": "#fb923c",
  "Kira": "#dc2626", "Market": "#f43f5e", "Ulaşım": "#fb7185", "Eğlence": "#ec4899", "Sağlık": "#f472b6", "Diğer Gider": "#94a3b8"
};

const VARSAYILAN_RENK = "#3b82f6";

const TEMA_PALETLERI = {
  cyberpunk: { name: "Cyberpunk Neon", gradient: "linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)", shadow: "rgba(139, 92, 246, 0.4)", accent: "#3b82f6" },
  matrix: { name: "Matrix Grid", gradient: "linear-gradient(135deg, #059669, #10b981, #34d399)", shadow: "rgba(16, 185, 129, 0.4)", accent: "#10b981" },
  gold: { name: "Royal Gold", gradient: "linear-gradient(135deg, #d97706, #f59e0b, #fbbf24)", shadow: "rgba(245, 158, 11, 0.4)", accent: "#f59e0b" }
};

function PremiumModal({ onKapat, onAktifEt }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, padding: "20px" }}>
      <div className="rgb-card-border" style={{ background: "#0f172a", padding: "40px", borderRadius: "28px", maxWidth: "420px", textAlign: "center", boxShadow: "0 25px 60px rgba(0,0,0,0.9)", width: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: "52px", marginBottom: "15px" }}>👑</div>
        <h2 style={{ margin: "0 0 10px 0", color: "white", fontSize: "24px", fontWeight: "900", background: "linear-gradient(to right, #facc15, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>NEXUS PRO'ya Yükselt</h2>
        <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6", marginBottom: "30px" }}>
          Arka planda çalışan zaman ayarlı fatura hatırlatıcıları, özel tema paletleri ve gelişmiş finansal entegrasyonlar ile tam yetki sahibi olun.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button onClick={() => { onAktifEt(); onKapat(); }} className="rgb-btn" style={{ padding: "16px", borderRadius: "14px", fontSize: "15px", fontWeight: "800", cursor: "pointer" }}>
            PRO Özellikleri Aktifleştir
          </button>
          <button onClick={onKapat} style={{ padding: "12px", borderRadius: "14px", background: "transparent", color: "#64748b", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>
            Belki Daha Sonra
          </button>
        </div>
      </div>
    </div>
  );
}

function BudgetApp({ aktifTema, temaDegistir, seciliTema }) {
  const { kullanici, cikisYap } = useAuth();
  const [islemler, setIslemler] = useState([]);
  const [hedefler, setHedefler] = useState([]);
  const [miktar, setMiktar] = useState("");
  const [kategori, setKategori] = useState(KATEGORILER.gelir[0]);
  const [aciklama, setAciklama] = useState("");
  const [tip, setTip] = useState("gelir");
  const [islemTarihi, setIslemTarihi] = useState(new Date().toISOString().split("T")[0]);
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // Canlı kur state'leri
  const [canliKur, setCanliKur] = useState({ usd: "0.00", eur: "0.00", altin: "0.00" });
  const [hedefBaslik, setHedefBaslik] = useState("");
  const [hedefTutar, setHedefTutar] = useState("");

  const [aramaMetni, setAramaMetni] = useState("");
  const [aktifFiltre, setAktifFiltre] = useState("hepsi");

  const [bildirimAcik, setBildirimAcik] = useState(false);
  const bildirimRef = useRef(null);

  const [isPro, setIsPro] = useState(localStorage.getItem("nexus_pro") === "true");
  const [showProModal, setShowProModal] = useState(false);
  const [hatirlaticiNot, setHatirlaticiNot] = useState("");
  
  const now = new Date();
  now.setMinutes(now.getMinutes() + 10);
  const defaultDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  
  const [hatirlaticiTarihSaat, setHatirlaticiTarihSaat] = useState(defaultDateTime);
  const [aktifHatirlaticilar, setAktifHatirlaticilar] = useState([]);

  // Canlı Döviz ve Altın Verilerini Periyodik (Canlı Polling) Çekme
  useEffect(() => {
    const kurlariCek = async () => {
      try {
        const resUsd = await fetch("https://open.er-api.com/v6/latest/USD");
        const dataUsd = await resUsd.json();
        const usdRate = dataUsd.rates?.TRY || 34.0;
        const eurUsdRate = dataUsd.rates?.EUR || 0.92;
        const eurRate = usdRate / eurUsdRate;

        let altinRate = 3250.00;
        try {
          const resAltin = await fetch("https://api.genelpara.com/embed/altin.json");
          const dataAltin = await resAltin.json();
          if (dataAltin && dataAltin.GA && dataAltin.GA.satis) {
            altinRate = parseFloat(dataAltin.GA.satis);
          }
        } catch (err) {
          console.warn("Altın kuru API uyarısı, varsayılan güncel kur kullanılıyor", err);
        }

        setCanliKur({
          usd: usdRate.toFixed(2),
          eur: eurRate.toFixed(2),
          altin: altinRate.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        });
      } catch (e) {
        console.error("Canlı kurlar çekilemedi", e);
      }
    };

    kurlariCek();
    const kurInterval = setInterval(kurlariCek, 30000);
    return () => clearInterval(kurInterval);
  }, []);

  const yukleHatirlaticilar = () => {
    const kayitli = JSON.parse(localStorage.getItem("nexus_reminders") || "[]");
    setAktifHatirlaticilar(kayitli);
  };

  useEffect(() => {
    yukleHatirlaticilar();
    window.addEventListener("remindersUpdated", yukleHatirlaticilar);

    const q = query(collection(db, "kullanicilar", kullanici.uid, "islemler"), orderBy("tarih", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setIslemler(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setYukleniyor(false);
    });

    const qHedef = query(collection(db, "kullanicilar", kullanici.uid, "hedefler"));
    const unsubHedef = onSnapshot(qHedef, (snapshot) => {
      setHedefler(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    return () => {
      window.removeEventListener("remindersUpdated", yukleHatirlaticilar);
      unsub();
      unsubHedef();
    };
  }, [kullanici.uid]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (bildirimRef.current && !bildirimRef.current.contains(event.target)) setBildirimAcik(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { toplamGelir, toplamGider, bakiye, toplamHacim } = useMemo(() => {
    const gelir = islemler.filter(i => i.tip === "gelir").reduce((a, b) => a + b.miktar, 0);
    const gider = islemler.filter(i => i.tip === "gider").reduce((a, b) => a + b.miktar, 0);
    const h = gelir + gider;
    return { toplamGelir: gelir, toplamGider: gider, bakiye: gelir - gider, toplamHacim: h };
  }, [islemler]);

  const akilliAnaliz = useMemo(() => {
    if (islemler.length === 0) return "Henüz analiz edilecek işlem verisi bulunmuyor.";
    const giderler = islemler.filter(i => i.tip === "gider");
    if (giderler.length === 0) return "Harika! Hiç gider kaydınız yok, tamamen güçlü bir nakit akışındasınız.";

    const kategoriHarcamalari = {};
    giderler.forEach(g => {
      kategoriHarcamalari[g.kategori] = (kategoriHarcamalari[g.kategori] || 0) + g.miktar;
    });

    let enYuksekKat = "";
    let maxTutar = 0;
    Object.entries(kategoriHarcamalari).forEach(([kat, tutar]) => {
      if (tutar > maxTutar) {
        maxTutar = tutar;
        enYuksekKat = kat;
      }
    });

    const oran = toplamGelir > 0 ? Math.round((toplamGider / toplamGelir) * 100) : 100;
    return `Dikkat: En yüksek gider kalemin ${enYuksekKat} (₺${maxTutar.toLocaleString()}). Gelirinize oranla toplam harcama yükünüz %${oran} seviyesinde.`;
  }, [islemler, toplamGelir, toplamGider]);

  const grafikData = useMemo(() => {
    const ozetler = {};
    islemler.forEach(islem => {
      const key = `${islem.tip}-${islem.kategori}`;
      if (!ozetler[key]) ozetler[key] = { name: islem.kategori, tip: islem.tip, value: 0 };
      ozetler[key].value += islem.miktar;
    });
    return Object.values(ozetler).map(item => ({
      ...item,
      yuzde: toplamHacim > 0 ? ((item.value / toplamHacim) * 100).toFixed(1) : 0
    })).sort((a, b) => b.value - a.value);
  }, [islemler, toplamHacim]);

  const bugunStr = new Date().toISOString().split("T")[0];
  const aktifBildirimler = useMemo(() => {
    return islemler.filter(i => i.tip === "gider" && i.tarih >= bugunStr).map(b => {
      let etiket = "Yaklaşan Ödeme";
      if (b.tarih === bugunStr) etiket = "🚨 Bugün Son Gün!";
      else {
        const gun = Math.ceil((new Date(b.tarih) - new Date(bugunStr)) / (1000 * 60 * 60 * 24));
        etiket = gun === 1 ? "⏳ Yarın Ödenecek" : `📅 ${gun} Gün Kaldı`;
      }
      return { ...b, etiket };
    });
  }, [islemler, bugunStr]);

  const filtrelenmisIslemler = useMemo(() => {
    return islemler.filter(i => {
      const matchesSearch = (i.aciklama || i.kategori).toLowerCase().includes(aramaMetni.toLowerCase());
      const matchesType = aktifFiltre === "hepsi" || i.tip === aktifFiltre;
      return matchesSearch && matchesType;
    });
  }, [islemler, aramaMetni, aktifFiltre]);

  const islemEkle = async (e) => {
    e.preventDefault();
    if (!miktar) return;
    await addDoc(collection(db, "kullanicilar", kullanici.uid, "islemler"), {
      miktar: parseFloat(miktar), kategori, aciklama, tip, tarih: islemTarihi
    });
    setMiktar(""); setAciklama("");
  };

  const islemSil = async (id) => {
    try {
      await deleteDoc(doc(db, "kullanicilar", kullanici.uid, "islemler", id));
    } catch (error) {
      console.error("İşlem silinirken hata oluştu:", error);
    }
  };

  const hedefEkle = async (e) => {
    e.preventDefault();
    if (!hedefBaslik || !hedefTutar) return;
    await addDoc(collection(db, "kullanicilar", kullanici.uid, "hedefler"), {
      baslik: hedefBaslik, hedefTutar: parseFloat(hedefTutar)
    });
    setHedefBaslik(""); setHedefTutar("");
  };

  const hedefSil = async (id) => {
    await deleteDoc(doc(db, "kullanicilar", kullanici.uid, "hedefler", id));
  };

  const csvDisaAktar = () => {
    if (islemler.length === 0) {
      alert("Dışa aktarılacak işlem bulunamadı.");
      return;
    }
    const headers = ["ID,Tip,Kategori,Aciklama,Miktar,Tarih\n"];
    const rows = islemler.map(i => `"${i.id}","${i.tip}","${i.kategori}","${i.aciklama || ''}",${i.miktar},"${i.tarih}"`);
    const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "nexus_finans_raporu.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const proAktiflestir = () => {
    localStorage.setItem("nexus_pro", "true");
    setIsPro(true);
  };

  const hatirlaticiKur = (e) => {
    e.preventDefault();
    if (!hatirlaticiNot || !hatirlaticiTarihSaat) return;
    
    const hedefZamanMs = new Date(hatirlaticiTarihSaat).getTime();
    const suAn = new Date().getTime();

    if (hedefZamanMs <= suAn) {
      alert("Lütfen geçmiş bir zaman seçmeyin!");
      return;
    }
    
    const yeniHatirlatici = {
      id: "rm_" + Date.now(),
      not: hatirlaticiNot,
      time: hedefZamanMs,
      olusturmaZamani: suAn
    };

    const guncelListe = [...aktifHatirlaticilar, yeniHatirlatici];
    localStorage.setItem("nexus_reminders", JSON.stringify(guncelListe));
    setAktifHatirlaticilar(guncelListe);
    setHatirlaticiNot("");
    
    alert("Hatırlatıcı başarıyla kuruldu! Uygulama kapalı olsa bile tam zamanında uyarılacaksınız.");
  };

  return (
    <div style={{ maxWidth: "1240px", margin: "0 auto", position: "relative" }}>
      {showProModal && <PremiumModal onKapat={() => setShowProModal(false)} onAktifEt={proAktiflestir} />}

      {/* CANLI DÖVİZ & ALTIN BANTI */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg, #111827 100%, #1f2937 0%)", padding: "14px 24px", borderRadius: "18px", marginBottom: "24px", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 10px 25px rgba(0,0,0,0.4)", flexWrap: "wrap", gap: "15px" }}>
        <div style={{ display: "flex", gap: "25px", fontSize: "13px", fontWeight: "700", color: "#94a3b8", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🇺🇸</span> USD/TRY: <strong style={{ color: "#10b981", fontSize: "14px" }}>₺{canliKur.usd}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🇪🇺</span> EUR/TRY: <strong style={{ color: "#3b82f6", fontSize: "14px" }}>₺{canliKur.eur}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🥇</span> Gram Altın: <strong style={{ color: "#f59e0b", fontSize: "14px" }}>₺{canliKur.altin}</strong>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700" }}>Tema:</span>
          {Object.entries(TEMA_PALETLERI).map(([key, t]) => (
            <button key={key} onClick={() => temaDegistir(key)} style={{ padding: "6px 14px", borderRadius: "8px", border: aktifTema === key ? `2px solid ${t.accent}` : "1px solid rgba(255,255,255,0.08)", background: aktifTema === key ? "rgba(255, 255, 255, 0.08)" : "#0b0f19", color: aktifTema === key ? t.accent : "#94a3b8", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "all 0.2s" }}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Üst Menü / Navbar */}
      <div className="header-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(17, 24, 39, 0.85)", padding: "20px 28px", borderRadius: "22px", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", marginBottom: "30px", boxShadow: "0 15px 35px rgba(0,0,0,0.3)", flexWrap: "wrap", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ fontSize: "34px", filter: `drop-shadow(0 0 12px ${seciliTema.shadow})` }}>💎</div>
          <div style={{ textAlign: "left" }}>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "900", letterSpacing: "-0.5px", background: seciliTema.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", display: "inline-block" }}>NEXUS FİNANS</h1>
            <div style={{ fontSize: "11px", color: isPro ? "#facc15" : "#64748b", fontWeight: "800", letterSpacing: "1.2px", marginTop: "2px" }}>
              {isPro ? "PRO HESAP AKTİF" : "PROFESSIONAL EDITION"}
            </div>
          </div>
        </div>
        
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
          <span className="hide-mobile" style={{ color: "#94a3b8", fontSize: "14px" }}>Aktif Kullanıcı: <strong style={{ color: "white" }}>{kullanici.displayName}</strong></span>
          
          <button onClick={csvDisaAktar} className="action-btn" style={{ padding: "12px 18px", borderRadius: "12px", background: "#111827", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)", cursor: "pointer", fontSize: "14px", fontWeight: "700" }}>
            📥 CSV İndir
          </button>

          <div ref={bildirimRef} style={{ position: "relative" }}>
            <button onClick={() => setBildirimAcik(!bildirimAcik)} className="action-btn" style={{ padding: "12px 20px", borderRadius: "12px", background: "#111827", color: seciliTema.accent, border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: "14px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <span>🔔 Bildirimler</span>
              {aktifBildirimler.length > 0 && (
                <span className="pulse-badge" style={{ background: "#ef4444", color: "white", borderRadius: "50%", padding: "2px 8px", fontSize: "11px", fontWeight: "bold" }}>{aktifBildirimler.length}</span>
              )}
            </button>

            {bildirimAcik && (
              <div className="dropdown-menu" style={{ position: "absolute", right: 0, top: "55px", width: "340px", background: "#111827", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "18px", boxShadow: "0 25px 60px rgba(0,0,0,0.8)", zIndex: 120, padding: "20px", maxHeight: "400px", overflowY: "auto" }}>
                <h4 style={{ margin: "0 0 15px 0", color: "white", fontSize: "15px", fontWeight: "800" }}>🔔 Yaklaşan Ödemeler</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {aktifBildirimler.length === 0 ? (
                    <p style={{ color: "#64748b", fontSize: "13px", margin: 0, textAlign: "center", padding: "15px 0" }}>Yaklaşan ödeme bulunmuyor.</p>
                  ) : (
                    aktifBildirimler.map(b => (
                      <div key={b.id} style={{ background: "#0b0f19", padding: "14px", borderRadius: "12px", borderLeft: `4px solid ${b.tarih === bugunStr ? "#ef4444" : seciliTema.accent}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                          <span style={{ fontWeight: "700", color: b.tarih === bugunStr ? "#ef4444" : seciliTema.accent }}>{b.etiket}</span>
                          <span style={{ color: "#64748b" }}>{new Date(b.tarih).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <div style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: "600" }}>{b.aciklama || b.kategori}</div>
                        <div style={{ fontSize: "14px", fontWeight: "900", color: "#f87171", marginTop: "6px" }}>₺{b.miktar.toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <InstallButton />

          <button onClick={cikisYap} className="action-btn" style={{ padding: "12px 20px", borderRadius: "12px", background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", fontSize: "14px", fontWeight: "700" }}>Çıkış</button>
        </div>
      </div>

      {/* YAPAY ZEKA DESTEKLİ AKILLI HARCAMA ANALİZİ */}
      <div style={{ background: "linear-gradient(135deg, #111827 0%, #1e1b4b 100%)", padding: "22px 28px", borderRadius: "22px", border: "1px solid rgba(139, 92, 246, 0.3)", marginBottom: "35px", display: "flex", alignItems: "center", gap: "18px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: "32px" }}>💡</div>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "800", color: "#a78bfa", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>Nexus Yapay Zeka Finans Asistanı</div>
          <div style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: "500", lineHeight: "1.5" }}>{akilliAnaliz}</div>
        </div>
      </div>

      {/* ÖZET KARTLARI */}
      <div className="stats-grid" style={{ marginBottom: "35px" }}>
        <div className="premium-card" style={{ background: "linear-gradient(135deg, #111827 0%, #064e3b 100%)", padding: "28px", borderRadius: "22px", border: "1px solid rgba(16,185,129,0.3)", boxShadow: "0 12px 30px rgba(0,0,0,0.3)" }}>
          <div style={{ color: "#64748b", fontSize: "13px", fontWeight: "800", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Toplam Gelir</div>
          <div style={{ fontSize: "34px", fontWeight: "900", color: "#10b981", filter: "drop-shadow(0 0 10px rgba(16,185,129,0.4))" }}>₺{toplamGelir.toLocaleString()}</div>
        </div>
        <div className="premium-card" style={{ background: "linear-gradient(135deg, #111827 0%, #7f1d1d 100%)", padding: "28px", borderRadius: "22px", border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 12px 30px rgba(0,0,0,0.3)" }}>
          <div style={{ color: "#64748b", fontSize: "13px", fontWeight: "800", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Toplam Gider</div>
          <div style={{ fontSize: "34px", fontWeight: "900", color: "#ef4444", filter: "drop-shadow(0 0 10px rgba(239,68,68,0.4))" }}>₺{toplamGider.toLocaleString()}</div>
        </div>
        <div className="premium-card" style={{ background: "linear-gradient(135deg, #111827 0%, #1e3a8a 100%)", padding: "28px", borderRadius: "22px", border: "1px solid rgba(96,165,250,0.3)", boxShadow: "0 12px 30px rgba(0,0,0,0.3)" }}>
          <div style={{ color: "#64748b", fontSize: "13px", fontWeight: "800", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Net Varlık Durumu</div>
          <div style={{ fontSize: "34px", fontWeight: "900", color: bakiye >= 0 ? seciliTema.accent : "#f87171", filter: `drop-shadow(0 0 10px ${bakiye >= 0 ? seciliTema.shadow : 'rgba(248,113,113,0.4)'})` }}>₺{bakiye.toLocaleString()}</div>
        </div>
      </div>

      {/* 👑 NEXUS PRO & PREMIUM ÖZELLİKLER BÖLÜMÜ */}
      <div className={isPro ? "rgb-card-border" : ""} style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", padding: "32px", borderRadius: "24px", border: isPro ? "none" : "1px solid rgba(234, 179, 8, 0.3)", marginBottom: "35px", position: "relative", overflow: "hidden", boxShadow: "0 15px 35px rgba(0,0,0,0.4)" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px", flexWrap: "wrap", gap: "15px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "28px" }}>👑</span>
              <h3 style={{ margin: 0, fontSize: "20px", color: "white", fontWeight: "900", background: "linear-gradient(to right, #facc15, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                NEXUS PRO & Arka Plan Görev Yöneticisi
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
              {isPro ? "PRO sürüm aktif durumdadır. Tüm arka plan zamanlayıcıları ve hatırlatıcılar çalışıyor." : "Uygulama kapalı olsa bile çalışan zaman ayarlı hatırlatıcılar ve özel ayrıcalıklar için PRO'ya geçin."}
            </p>
          </div>
          
          {!isPro && (
            <button onClick={() => setShowProModal(true)} className="rgb-btn" style={{ padding: "14px 28px", borderRadius: "14px", fontSize: "14px", fontWeight: "900", cursor: "pointer" }}>
              ⭐ PRO'YA YÜKSELT
            </button>
          )}
        </div>

        <form onSubmit={hatirlaticiKur} className="form-row" style={{ opacity: isPro ? 1 : 0.4, alignItems: "flex-end" }}>
          <div style={{ flex: "2" }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#cbd5e1", fontWeight: "700" }}>Hatırlatıcı / Görev Notu</label>
            <input type="text" placeholder="Örn: Döviz/Altın alım emrini kontrol et..." value={hatirlaticiNot} onChange={(e) => setHatirlaticiNot(e.target.value)} disabled={!isPro} required
              style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontSize: "15px" }} />
          </div>
          <div style={{ flex: "1", minWidth: "220px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#cbd5e1", fontWeight: "700" }}>Tarih ve Saat</label>
            <input type="datetime-local" value={hatirlaticiTarihSaat} onChange={(e) => setHatirlaticiTarihSaat(e.target.value)} disabled={!isPro} required
              style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontSize: "15px", fontWeight: "600", colorScheme: "dark" }} />
          </div>
          <button type="submit" className="rgb-btn" disabled={!isPro} style={{ padding: "14px 30px", borderRadius: "12px", cursor: isPro ? "pointer" : "not-allowed", fontWeight: "800", fontSize: "15px", height: "51px" }}>
            SİSTEME KUR
          </button>
        </form>

        {!isPro && (
          <div style={{ marginTop: "15px", fontSize: "12px", color: "#facc15", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🔒</span> Bu alanı kullanabilmek için yukarıdaki butondan PRO sürümü aktif etmeniz gerekir.
          </div>
        )}

        {aktifHatirlaticilar.length > 0 && isPro && (
           <div style={{ marginTop: "25px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
             <div style={{ fontSize: "13px", color: "#a78bfa", marginBottom: "15px", fontWeight: "800" }}>Aktif Arka Plan Görevleri ({aktifHatirlaticilar.length})</div>
             <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
               {aktifHatirlaticilar.map(h => (
                 <div key={h.id} style={{ background: "#0b0f19", padding: "12px 18px", borderRadius: "12px", fontSize: "13px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "14px", alignItems: "center" }}>
                   <span style={{ color: "white", fontWeight: "600" }}>{h.not}</span>
                   <span style={{ color: "#a78bfa", fontWeight: "800" }}>{new Date(h.time).toLocaleString("tr-TR")}</span>
                 </div>
               ))}
             </div>
           </div>
        )}
      </div>

      {/* YATIRIM HEDEFLERİ & BİRİKİM KUMBARASI */}
      <div style={{ background: "#111827", padding: "32px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: "35px", boxShadow: "0 15px 35px rgba(0,0,0,0.3)" }}>
        <h3 style={{ margin: "0 0 20px 0", fontSize: "18px", color: "white", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}>
          🎯 Yatırım Hedefleri & Birikim Kumbarası
        </h3>
        <form onSubmit={hedefEkle} className="form-row" style={{ alignItems: "flex-end", marginBottom: "20px" }}>
          <div style={{ flex: 2 }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#94a3b8", fontWeight: "700" }}>Hedef Adı (Örn: Yeni Bilgisayar)</label>
            <input type="text" placeholder="Hedef girin..." value={hedefBaslik} onChange={(e) => setHedefBaslik(e.target.value)} required
              style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontSize: "15px" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#94a3b8", fontWeight: "700" }}>Hedef Tutar (₺)</label>
            <input type="number" placeholder="0.00" value={hedefTutar} onChange={(e) => setHedefTutar(e.target.value)} required
              style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontSize: "15px", fontWeight: "700" }} />
          </div>
          <button type="submit" className="rgb-btn" style={{ padding: "14px 25px", borderRadius: "12px", cursor: "pointer", fontWeight: "800", fontSize: "15px", height: "51px" }}>
            HEDEF EKLE
          </button>
        </form>

        {hedefler.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
            {hedefler.map(h => {
              const yuzde = Math.min(100, Math.round((bakiye > 0 ? bakiye : 0) / h.hedefTutar * 100));
              return (
                <div key={h.id} style={{ background: "#0b0f19", padding: "20px", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span style={{ fontWeight: "700", color: "white", fontSize: "15px" }}>{h.baslik}</span>
                    <button onClick={() => hedefSil(h.id)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "14px" }}>🗑️</button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                    <span>Tamamlanma Oranı</span>
                    <span style={{ fontWeight: "800", color: "#34d399" }}>%{yuzde}</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#1e293b", borderRadius: "6px", overflow: "hidden" }}>
                    <div style={{ width: `${yuzde}%`, height: "100%", background: seciliTema.gradient, borderRadius: "6px" }}></div>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "10px" }}>Hedef: ₺{h.hedefTutar.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* İŞLEM EKLEME VE GRAFİK IZGARASI */}
      <div className="main-grid" style={{ marginBottom: "35px" }}>
        
        {/* İşlem Ekleme Formu */}
        <form onSubmit={islemEkle} style={{ background: "#111827", padding: "32px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 15px 35px rgba(0,0,0,0.3)" }}>
          <h3 style={{ marginTop: 0, marginBottom: "25px", fontSize: "20px", color: "white", fontWeight: "800" }}>➕ Yeni Entegrasyon / İşlem</h3>
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#94a3b8", fontWeight: "700" }}>Akış Yönü</label>
              <select value={tip} onChange={(e) => { setTip(e.target.value); setKategori(KATEGORILER[e.target.value][0]); }}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontSize: "15px", fontWeight: "600" }}>
                <option value="gelir">Gelir Akışı (+)</option>
                <option value="gider">Gider Dağılımı (-)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#94a3b8", fontWeight: "700" }}>Sınıflandırma</label>
              <select value={kategori} onChange={(e) => setKategori(e.target.value)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontSize: "15px", fontWeight: "600" }}>
                {KATEGORILER[tip].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#94a3b8", fontWeight: "700" }}>İşlem Detayı / Açıklama</label>
          <input type="text" placeholder="Açıklama girin..." value={aciklama} onChange={(e) => setAciklama(e.target.value)}
            style={{ width: "100%", padding: "14px", marginBottom: "20px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", boxSizing: "border-box", outline: "none", fontSize: "15px" }} />
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#94a3b8", fontWeight: "700" }}>Tutar (₺)</label>
              <input type="number" placeholder="0.00" value={miktar} onChange={(e) => setMiktar(e.target.value)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", boxSizing: "border-box", outline: "none", fontSize: "15px", fontWeight: "700" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "#94a3b8", fontWeight: "700" }}>Tarih</label>
              <input type="date" value={islemTarihi} onChange={(e) => setIslemTarihi(e.target.value)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", boxSizing: "border-box", outline: "none", fontSize: "15px", colorScheme: "dark" }} />
            </div>
          </div>
          <button type="submit" className="rgb-btn" style={{ width: "100%", padding: "16px", borderRadius: "12px", cursor: "pointer", fontWeight: "800", fontSize: "16px" }}>
            DEFTERE İŞLE
          </button>
        </form>

        {/* Grafik Bölümü */}
        <div style={{ background: "#111827", padding: "32px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", boxShadow: "0 15px 35px rgba(0,0,0,0.3)" }}>
          <h3 style={{ margin: "0 0 25px 0", fontSize: "20px", color: "white", fontWeight: "800" }}>📊 Portföy Dağılım Matrisi</h3>
          <div className="form-row" style={{ height: "100%", alignItems: "center" }}>
            <div className="chart-container" style={{ width: "40%", minWidth: "160px", height: "200px", margin: "0 auto" }}>
              {grafikData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={grafikData} innerRadius={65} outerRadius={85} paddingAngle={5} dataKey="value">
                      {grafikData.map((entry, idx) => <Cell key={idx} fill={KATEGORI_RENKLERI[entry.name] || VARSAYILAN_RENK} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0b0f19", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontWeight: "bold" }} itemStyle={{ color: "white" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                 <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "14px", fontWeight: "600" }}>Kayıt yok</div>
              )}
            </div>

            <div style={{ flex: 1, height: "240px", overflowY: "auto", paddingRight: "10px", width: "100%" }}>
              {grafikData.map((item, index) => {
                const renk = KATEGORI_RENKLERI[item.name] || VARSAYILAN_RENK;
                return (
                  <div key={index} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: renk, boxShadow: `0 0 8px ${renk}` }}></div>
                        <span style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: "600" }}>
                          {item.name}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                        <span style={{ fontSize: "14px", color: "#94a3b8", fontWeight: "700" }}>₺{item.value.toLocaleString()}</span>
                        <span style={{ fontSize: "14px", fontWeight: "800", color: item.tip === "gelir" ? "#10b981" : "#ef4444", width: "50px", textAlign: "right" }}>%{item.yuzde}</span>
                      </div>
                    </div>
                    <div style={{ width: "100%", height: "6px", background: "#0b0f19", borderRadius: "6px", overflow: "hidden" }}>
                      <div style={{ width: `${item.yuzde}%`, height: "100%", background: renk, borderRadius: "6px" }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MERKEZİ FİNANS SİCİLİ */}
      <div style={{ background: "#111827", padding: "32px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 15px 35px rgba(0,0,0,0.3)" }}>
        <div className="form-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "25px" }}>
          <h3 style={{ margin: 0, fontSize: "20px", color: "white", fontWeight: "800" }}>📋 Merkezi Finans Sicili</h3>
          <div className="form-row" style={{ margin: 0, alignItems: "center" }}>
            <input type="text" placeholder="İşlem ara..." value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)}
              style={{ padding: "12px 16px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontSize: "14px", width: "100%", minWidth: "200px" }} />
            <div style={{ display: "flex", background: "#0b0f19", padding: "4px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", width: "100%" }}>
              {["hepsi", "gelir", "gider"].map((f) => (
                <button key={f} onClick={() => setAktifFiltre(f)}
                  style={{ flex: 1, padding: "10px 15px", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer", background: aktifFiltre === f ? seciliTema.accent : "transparent", color: aktifFiltre === f ? "white" : "#64748b", transition: "all 0.2s" }}>
                  {f === "hepsi" ? "Tümü" : f === "gelir" ? "Gelir" : "Gider"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px", maxHeight: "450px", overflowY: "auto", paddingRight: "5px" }}>
          {yukleniyor && <p style={{ color: "#64748b", textAlign: "center", fontWeight: "600" }}>Veri kanalları senkronize ediliyor...</p>}
          {!yukleniyor && filtrelenmisIslemler.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: "20px", fontWeight: "600" }}>Kayıt bulunamadı.</p>}
          
          {filtrelenmisIslemler.map(islem => (
            <div key={islem.id} className="premium-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", background: "#0b0f19", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.04)", borderLeft: `6px solid ${islem.tip === "gelir" ? "#10b981" : "#ef4444"}` }}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "16px", color: "white", marginBottom: "6px" }}>{islem.aciklama || islem.kategori}</div>
                <div style={{ fontSize: "13px", color: "#64748b", display: "flex", gap: "10px", alignItems: "center", fontWeight: "600" }}>
                  <span style={{ color: islem.tip === "gelir" ? "#34d399" : "#fb923c" }}>{islem.kategori}</span>
                  <span>•</span>
                  <span>{new Date(islem.tarih).toLocaleDateString("tr-TR")}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "25px" }}>
                <span style={{ fontWeight: "900", fontSize: "18px", color: islem.tip === "gelir" ? "#10b981" : "#ef4444", filter: `drop-shadow(0 0 5px ${islem.tip === "gelir" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"})` }}>
                  {islem.tip === "gelir" ? "+" : "-"} ₺{islem.miktar.toLocaleString()}
                </span>
                <button onClick={() => islemSil(islem.id)} className="action-btn" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", cursor: "pointer", fontSize: "16px", padding: "10px 14px", borderRadius: "10px" }}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LandingPage({ onAc, seciliTema }) {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center", paddingTop: "80px", paddingBottom: "60px" }}>
      <div style={{ display: "inline-block", padding: "8px 20px", borderRadius: "20px", background: "rgba(255,255,255,0.05)", border: `1px solid ${seciliTema.accent}`, color: seciliTema.accent, fontSize: "14px", fontWeight: "800", marginBottom: "25px", letterSpacing: "2px" }}>NEXUS // V3.0 ULTIMATE</div>
      <h1 className="hero-title" style={{ color: "white", fontSize: "60px", fontWeight: "900", marginBottom: "25px", letterSpacing: "-1.5px", lineHeight: "1.1" }}>
        Finansal Akışınızı <br/>
        <span style={{ background: seciliTema.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: `drop-shadow(0 0 20px ${seciliTema.shadow})`, display: "inline-block" }}>Efsanevi Bir</span> Matrise Dönüştürün
      </h1>
      <p style={{ color: "#94a3b8", fontSize: "18px", marginBottom: "50px", maxWidth: "600px", margin: "0 auto 50px auto", lineHeight: "1.7", fontWeight: "500" }}>
        Canlı döviz ve altın kurları, yapay zeka harcama öngörüleri, birikim hedefleri ve çoklu tema desteğiyle tam donanımlı profesyonel finans yönetim merkezi.
      </p>
      <div className="form-row" style={{ justifyContent: "center", gap: "20px" }}>
        <button onClick={() => onAc("kayit")} className="rgb-btn" style={{ padding: "18px 45px", borderRadius: "14px", cursor: "pointer", fontWeight: "900", fontSize: "16px", width: "100%", maxWidth: "250px" }}>HEMEN BAŞLA</button>
        <button onClick={() => onAc("giris")} className="action-btn" style={{ padding: "18px 45px", borderRadius: "14px", background: "transparent", color: seciliTema.accent, border: `2px solid ${seciliTema.accent}`, cursor: "pointer", fontWeight: "800", fontSize: "16px", width: "100%", maxWidth: "250px" }}>SİSTEME GİRİŞ</button>
      </div>
    </div>
  );
}

export default function App() {
  const { kullanici } = useAuth();
  const [modal, setModal] = useState(null);
  
  const [aktifTema, setAktifTema] = useState(localStorage.getItem("nexus_theme") || "cyberpunk");
  const seciliTema = TEMA_PALETLERI[aktifTema] || TEMA_PALETLERI.cyberpunk;

  const temaDegistir = (key) => {
    setAktifTema(key);
    localStorage.setItem("nexus_theme", key);
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    const intervalId = setInterval(() => {
      const reminders = JSON.parse(localStorage.getItem("nexus_reminders") || "[]");
      if (reminders.length === 0) return;

      const now = new Date().getTime();
      let changed = false;

      const guncelListe = reminders.filter(r => {
        if (r.time <= now) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("NEXUS PRO Sistemi", { 
              body: r.not,
              icon: "/vite.svg" 
            });
          }
          playNotificationSound();
          changed = true;
          return false; 
        }
        return true; 
      });

      if (changed) {
        localStorage.setItem("nexus_reminders", JSON.stringify(guncelListe));
        window.dispatchEvent(new Event("remindersUpdated"));
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, []);

  if (kullanici === undefined) {
    return (
      <div style={{ background: "#0b0f19", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="pulse-badge" style={{ color: seciliTema.accent, fontSize: "18px", fontWeight: "800", letterSpacing: "2px" }}>SİSTEM BAŞLATILIYOR...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      background: "#0b0f19", 
      minHeight: "100vh", 
      color: "white", 
      fontFamily: "'Inter', sans-serif",
      "--theme-gradient": seciliTema.gradient,
      "--theme-shadow": seciliTema.shadow,
      "--accent-color": seciliTema.accent
    }}>
      
      <style>{`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100%;
          min-height: 100vh;
          background-color: #0b0f19;
          overflow-x: hidden;
        }
        * {
          box-sizing: border-box;
        }
        
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #0b0f19; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        ::-webkit-scrollbar-thumb-hover { background: var(--accent-color); }

        @keyframes rgb-bg {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        .rgb-btn {
          background: var(--theme-gradient);
          background-size: 300% 300%;
          animation: rgb-bg 4s linear infinite;
          border: none !important;
          color: white;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 15px var(--theme-shadow);
          position: relative;
          z-index: 1;
          letter-spacing: 1px;
        }
        .rgb-btn:hover {
          transform: scale(1.03) translateY(-2px);
          box-shadow: 0 0 30px var(--theme-shadow);
        }

        @keyframes rgb-border-glow {
          0% { border-color: rgba(59, 130, 246, 0.4); box-shadow: 0 0 20px rgba(59,130,246,0.15); }
          33% { border-color: rgba(139, 92, 246, 0.4); box-shadow: 0 0 20px rgba(139,92,246,0.15); }
          66% { border-color: rgba(236, 72, 153, 0.4); box-shadow: 0 0 20px rgba(236,72,153,0.15); }
          100% { border-color: rgba(59, 130, 246, 0.4); box-shadow: 0 0 20px rgba(59,130,246,0.15); }
        }
        .rgb-card-border {
          animation: rgb-border-glow 4s linear infinite;
        }

        .premium-card { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease; }
        .premium-card:hover { transform: translateY(-4px); box-shadow: 0 15px 35px rgba(0,0,0,0.6); }
        .action-btn { transition: all 0.2s ease; }
        .action-btn:hover:not(.rgb-btn) { filter: brightness(1.2); transform: scale(1.02); }
        
        @keyframes pulse-ring { 0% { transform: scale(0.95); opacity: 0.6; } 50% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.6; } }
        .pulse-badge { animation: pulse-ring 2s infinite ease-in-out; }

        .nexus-wrapper { padding: 40px 20px; }
        .form-row { display: flex; gap: 15px; margin-bottom: 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px; }
        .main-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(480px, 1fr)); gap: 30px; }

        @media (max-width: 768px) {
          .nexus-wrapper { padding: 15px 10px !important; }
          .form-row { flex-direction: column; gap: 15px; width: 100%; margin-bottom: 15px; }
          .form-row > div, .form-row > button { width: 100%; max-width: 100% !important; }
          
          .header-container { flex-direction: column; gap: 20px; text-align: center; padding: 25px 15px !important; justify-content: center !important; }
          .header-container > div { width: 100%; justify-content: center; }
          .header-actions { flex-direction: column; width: 100%; gap: 12px; align-items: stretch !important; }
          .header-actions > button, .header-actions > div { width: 100% !important; }
          .header-actions > div > button { width: 100% !important; }
          .hide-mobile { display: none; }
          
          .main-grid { grid-template-columns: 1fr; gap: 20px; }
          .stats-grid { grid-template-columns: 1fr; gap: 15px; }
          .hero-title { font-size: 36px !important; }
          
          .dropdown-menu { right: auto !important; left: 0 !important; width: 100% !important; min-width: 100% !important; top: 50px !important; }
          .chart-container { width: 100% !important; margin-bottom: 20px; }
        }
      `}</style>

      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 30px", background: "rgba(11, 15, 25, 0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, zIndex: 100 }}>
        <span style={{ fontWeight: "900", fontSize: "18px", letterSpacing: "3px", color: seciliTema.accent, filter: `drop-shadow(0 0 5px ${seciliTema.shadow})` }}>NEXUS</span>
        {!kullanici && (
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={() => setModal("kayit")} className="rgb-btn" style={{ padding: "10px 22px", borderRadius: "10px", cursor: "pointer", fontWeight: "800", fontSize: "13px" }}>Kayıt Ol</button>
            <button onClick={() => setModal("giris")} style={{ padding: "10px 22px", borderRadius: "10px", background: "transparent", color: seciliTema.accent, border: `2px solid ${seciliTema.accent}`, cursor: "pointer", fontWeight: "800", fontSize: "13px" }}>Giriş Yap</button>
          </div>
        )}
      </nav>

      <div className="nexus-wrapper">
        {kullanici ? <BudgetApp aktifTema={aktifTema} temaDegistir={temaDegistir} seciliTema={seciliTema} /> : <LandingPage onAc={setModal} seciliTema={seciliTema} />}
      </div>

      {modal && <AuthModal mod={modal} onKapat={() => setModal(null)} />}
    </div>
  );
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("PWA Service Worker başarıyla kaydedildi: ", registration.scope);
      })
      .catch((err) => {
        console.log("PWA Service Worker kayıt hatası: ", err);
      });
  });
}