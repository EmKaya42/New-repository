import React, { useState, useEffect, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";
// Başına components yazmadan, direkt yanındaki dosyayı çağırıyoruz:
import PWAInstallButton from "./PWAInstallButton";



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

function BudgetApp() {
  const { kullanici, cikisYap } = useAuth();
  const [islemler, setIslemler] = useState([]);
  const [miktar, setMiktar] = useState("");
  const [kategori, setKategori] = useState(KATEGORILER.gelir[0]);
  const [aciklama, setAciklama] = useState("");
  const [tip, setTip] = useState("gelir");
  const [islemTarihi, setIslemTarihi] = useState(new Date().toISOString().split("T")[0]);
  const [yukleniyor, setYukleniyor] = useState(true);
  
  // Premium Filtreleme ve Arama State'leri
  const [aramaMetni, setAramaMetni] = useState("");
  const [aktifFiltre, setAktifFiltre] = useState("hepsi"); // hepsi, gelir, gider

  // Bildirim Mekanizması
  const [bildirimAcik, setBildirimAcik] = useState(false);
  const bildirimRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, "kullanicilar", kullanici.uid, "islemler"), orderBy("tarih", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setIslemler(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setYukleniyor(false);
    });
    return unsub;
  }, [kullanici.uid]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (bildirimRef.current && !bildirimRef.current.contains(event.target)) setBildirimAcik(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Finansal Matematik ve Veri Analitiği
  const { toplamGelir, toplamGider, bakiye, toplamHacim, saglikSkoru } = useMemo(() => {
    const gelir = islemler.filter(i => i.tip === "gelir").reduce((a, b) => a + b.miktar, 0);
    const gider = islemler.filter(i => i.tip === "gider").reduce((a, b) => a + b.miktar, 0);
    const h = gelir + gider;
    const skor = gelir > 0 ? Math.max(0, Math.min(100, Math.round(((gelir - gider) / gelir) * 100))) : 0;
    return { toplamGelir: gelir, toplamGider: gider, bakiye: gelir - gider, toplamHacim: h, saglikSkoru: skor };
  }, [islemler]);

  // Tek Tablo İçin Kategori Konsolidasyonu
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

  // Akıllı Bildirim Filtresi (Bugün ve Gelecek Planlı Faturalar)
  const bugunStr = new Date().toISOString().split("T")[0];
  const aktifBildirimler = useMemo(() => {
    return islemler.filter(i => i.tip === "gider" && i.tarih >= bugunStr).map(b => {
      let etiket = "Yaklaşan Fatura";
      if (b.tarih === bugunStr) etiket = "🚨 Bugün Son Gün!";
      else {
        const gun = Math.ceil((new Date(b.tarih) - new Date(bugunStr)) / (1000 * 60 * 60 * 24));
        etiket = gun === 1 ? "⏳ Yarın Ödenecek" : `📅 ${gun} Gün Kaldı`;
      }
      return { ...b, etiket };
    });
  }, [islemler, bugunStr]);

  // İşlem Geçmişi Canlı Filtreleme Arayüzü
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

  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "10px" }}>
      
      {/* İLERİ DÜZEY ANİMASYONLAR VE GÜZELLEŞTİRMELER İÇİN ENJEKTE EDİLEN CSS YAPISI */}
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0b0f19; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #334155; }
        .premium-card { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease; }
        .premium-card:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.4); }
        .action-btn { transition: all 0.2s ease; }
        .action-btn:hover { filter: brightness(1.15); transform: scale(1.02); }
        @keyframes pulse-ring { 0% { transform: scale(0.95); opacity: 0.5; } 50% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.5; } }
        .pulse-badge { animation: pulse-ring 2s infinite ease-in-out; }
      `}</style>

      {/* Global Glassmorphic Üst Menü */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "35px", background: "rgba(19, 26, 44, 0.6)", padding: "16px 24px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.03)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "28px" }}>💎</div>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.5px", background: "linear-gradient(to right, #60a5fa, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AURA CAPITAL</h1>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>PREMIUM FINANCING</span>
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ color: "#94a3b8", fontSize: "13px" }}>Hesap: <strong style={{ color: "white" }}>{kullanici.displayName}</strong></span>
          
          {/* Bildirim Merkezi Dropdown */}
          <div ref={bildirimRef} style={{ position: "relative" }}>
            <button onClick={() => setBildirimAcik(!bildirimAcik)} className="action-btn" style={{ padding: "10px 18px", borderRadius: "10px", background: "#131a2c", color: "#60a5fa", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔔 Merkez</span>
              {aktifBildirimler.length > 0 && (
                <span className="pulse-badge" style={{ background: "#ef4444", color: "white", borderRadius: "50%", padding: "2px 6px", fontSize: "10px", fontWeight: "bold" }}>{aktifBildirimler.length}</span>
              )}
            </button>

            {bildirimAcik && (
              <div style={{ position: "absolute", right: 0, top: "45px", width: "340px", background: "#131a2c", border: "1px solid #2d3748", borderRadius: "14px", boxShadow: "0 20px 40px rgba(0,0,0,0.6)", zIndex: 120, padding: "18px", maxHeight: "380px", overflowY: "auto" }}>
                <h4 style={{ margin: "0 0 14px 0", color: "white", fontSize: "14px", display: "flex", justifyContent: "space-between" }}><span>🔔 Nakit Akış Hatırlatıcıları</span></h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {aktifBildirimler.length === 0 ? (
                    <p style={{ color: "#64748b", fontSize: "12px", margin: 0, textAlign: "center", padding: "15px 0" }}>Yaklaşan fatura veya ödeme planı bulunamadı.</p>
                  ) : (
                    aktifBildirimler.map(b => (
                      <div key={b.id} style={{ background: "#0b0f19", padding: "12px", borderRadius: "10px", borderLeft: `4px solid ${b.tarih === bugunStr ? "#ef4444" : "#3b82f6"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                          <span style={{ fontWeight: "700", color: b.tarih === bugunStr ? "#ef4444" : "#60a5fa" }}>{b.etiket}</span>
                          <span style={{ color: "#64748b" }}>{new Date(b.tarih).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: "500" }}>{b.aciklama || b.kategori}</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#f87171", marginTop: "4px" }}>₺{b.miktar.toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button onClick={cikisYap} className="action-btn" style={{ padding: "10px 18px", borderRadius: "10px", background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>Güvenli Çıkış</button>
        </div>
      </div>

      {/* Akıllı Finansal Özet Grid Paneli */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "30px" }}>
        <div className="premium-card" style={{ background: "linear-gradient(135deg, #131a2c 0%, #0d2720 100%)", padding: "24px", borderRadius: "20px", border: "1px solid rgba(16,185,129,0.1)" }}>
          <div style={{ color: "#64748b", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>Kümülatif Gelir</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#10b981" }}>₺{toplamGelir.toLocaleString()}</div>
          <div style={{ fontSize: "11px", color: "#34d399", marginTop: "8px" }}>↗ Наkit Girişi Aktif</div>
        </div>
        <div className="premium-card" style={{ background: "linear-gradient(135deg, #131a2c 0%, #3b1818 100%)", padding: "24px", borderRadius: "20px", border: "1px solid rgba(239,68,68,0.1)" }}>
          <div style={{ color: "#64748b", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>Kümülatif Gider</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#ef4444" }}>₺{toplamGider.toLocaleString()}</div>
          <div style={{ fontSize: "11px", color: "#f87171", marginTop: "8px" }}>↘ Operasyonel Çıkışlar</div>
        </div>
        <div className="premium-card" style={{ background: "linear-gradient(135deg, #131a2c 0%, #1e293b 100%)", padding: "24px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ color: "#64748b", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>Net Varlık Pozisyonu</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: bakiye >= 0 ? "#60a5fa" : "#f87171" }}>₺{bakiye.toLocaleString()}</div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "8px" }}>Mevcut Net Kullanılabilir Altyapı</div>
        </div>
        
        {/* SaaS Tipi Ekstra Premium Kart: Finansal Sağlık Skoru */}
        <div className="premium-card" style={{ background: "#131a2c", padding: "24px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#64748b", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>Finansal Sağlık Skoru</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <div style={{ fontSize: "28px", fontWeight: "800", color: saglikSkoru > 50 ? "#a78bfa" : "#facc15" }}>%{saglikSkoru}</div>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>Tasarruf Oranı</span>
            </div>
          </div>
          <div style={{ background: "#0b0f19", height: "6px", borderRadius: "10px", overflow: "hidden", marginTop: "10px" }}>
            <div style={{ width: `${saglikSkoru}%`, height: "100%", background: "linear-gradient(to right, #facc15, #a78bfa)", borderRadius: "10px" }}></div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: "25px", marginBottom: "35px" }}>
        
        {/* İşlem Ekleme Formu */}
        <form onSubmit={islemEkle} style={{ background: "#131a2c", padding: "30px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.02)" }}>
          <h3 style={{ marginTop: 0, marginBottom: "22px", fontSize: "18px", color: "white", fontWeight: "700" }}>➕ Yeni Entegrasyon</h3>

          <div style={{ display: "flex", gap: "12px", marginBottom: "18px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#64748b", fontWeight: "600" }}>Akış Yönü</label>
              <select value={tip} onChange={(e) => { setTip(e.target.value); setKategori(KATEGORILER[e.target.value][0]); }}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid #2d3748", outline: "none", fontSize: "14px", fontWeight: "500" }}>
                <option value="gelir">Gelir Akışı (+)</option>
                <option value="gider">Gider Dağılımı (-)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#64748b", fontWeight: "600" }}>Sınıflandırma</label>
              <select value={kategori} onChange={(e) => setKategori(e.target.value)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid #2d3748", outline: "none", fontSize: "14px", fontWeight: "500" }}>
                {KATEGORILER[tip].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>

          <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#64748b", fontWeight: "600" }}>Kurumsal / Özel Açıklama</label>
          <input type="text" placeholder="İşlem detay mutabakatı yazın..." value={aciklama} onChange={(e) => setAciklama(e.target.value)}
            style={{ width: "100%", padding: "14px", marginBottom: "18px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid #2d3748", boxSizing: "border-box", outline: "none", fontSize: "14px" }} />

          <div style={{ display: "flex", gap: "12px", marginBottom: "25px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#64748b", fontWeight: "600" }}>Finansal Tutar (₺)</label>
              <input type="number" placeholder="0.00" value={miktar} onChange={(e) => setMiktar(e.target.value)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid #2d3748", boxSizing: "border-box", outline: "none", fontSize: "14px" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#64748b", fontWeight: "600" }}>Valör / Vade Tarihi</label>
              <input type="date" value={islemTarihi} onChange={(e) => setIslemTarihi(e.target.value)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0b0f19", color: "white", border: "1px solid #2d3748", boxSizing: "border-box", outline: "none", fontSize: "14px" }} />
            </div>
          </div>

          <button type="submit" className="action-btn" style={{ width: "100%", padding: "15px", borderRadius: "12px", background: "linear-gradient(to right, #3b82f6, #60a5fa)", color: "white", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "15px", boxShadow: "0 4px 15px rgba(59,130,246,0.3)" }}>
            Deftere İşle ve Kaydet
          </button>
        </form>

        {/* Eşsiz Dağılım Tablosu (Tek Tabloda Progress Bar Destekli Yüzdesel Yapı) */}
        <div style={{ background: "#131a2c", padding: "30px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.02)", display: "flex", flexDirection: "column" }}>
          <h3 style={{ margin: "0 0 20px 0", fontSize: "18px", color: "white", fontWeight: "700" }}>📊 Portföy Dağılım Matrisi</h3>
          
          <div style={{ display: "flex", gap: "25px", height: "100%", alignItems: "center", flexWrap: "wrap" }}>
            {/* Ortak Pasta Grafiği */}
            <div style={{ width: "30%", minWidth: "140px", height: "180px" }}>
              {grafikData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={grafikData} innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                      {grafikData.map((entry, idx) => <Cell key={idx} fill={KATEGORI_RENKLERI[entry.name] || VARSAYILAN_RENK} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0b0f19", border: "1px solid #2d3748", borderRadius: "10px" }} itemStyle={{ color: "white" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                 <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "13px" }}>Kayıt yok</div>
              )}
            </div>

            {/* Premium Progress Bar'lı Tek Tablo */}
            <div style={{ flex: 1, height: "240px", overflowY: "auto", paddingRight: "6px" }}>
              {grafikData.map((item, index) => {
                const renk = KATEGORI_RENKLERI[item.name] || VARSAYILAN_RENK;
                return (
                  <div key={index} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: renk }}></div>
                        <span style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: "500" }}>
                          {item.name} <span style={{ fontSize: "11px", color: item.tip === "gelir" ? "#10b981" : "#ef4444" }}>({item.tip === "gelir" ? "Gelir" : "Gider"})</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: "600" }}>₺{item.value.toLocaleString()}</span>
                        <span style={{ fontSize: "13px", fontWeight: "700", color: item.tip === "gelir" ? "#10b981" : "#ef4444", width: "45px", textAlign: "right" }}>%{item.yuzde}</span>
                      </div>
                    </div>
                    {/* İç İlerleme Çubuğu Grafik Desteği */}
                    <div style={{ width: "100%", height: "4px", background: "#0b0f19", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${item.yuzde}%`, height: "100%", background: renk, borderRadius: "4px" }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Gelişmiş İşlem Geçmişi (Canlı Filtreleme ve Arama Katmanlı) */}
      <div style={{ background: "#131a2c", padding: "30px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "white", fontWeight: "700" }}>📋 Merkezi Finans Sicili</h3>
          
          {/* Arama ve Filtreleme Kontrolleri */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <input type="text" placeholder="İşlem ara..." value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)}
              style={{ padding: "8px 14px", borderRadius: "10px", background: "#0b0f19", color: "white", border: "1px solid #2d3748", outline: "none", fontSize: "13px", width: "180px" }} />
            
            <div style={{ display: "flex", background: "#0b0f19", padding: "3px", borderRadius: "8px", border: "1px solid #2d3748" }}>
              {["hepsi", "gelir", "gider"].map((f) => (
                <button key={f} onClick={() => setAktifFiltre(f)}
                  style={{ padding: "6px 12px", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", background: aktifFiltre === f ? "#3b82f6" : "transparent", color: aktifFiltre === f ? "white" : "#64748b", transition: "all 0.2s" }}>
                  {f === "hepsi" ? "Tümü" : f === "gelir" ? "Gelirler" : "Giderler"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
          {yukleniyor && <p style={{ color: "#64748b", textAlign: "center" }}>Veri kanalları senkronize ediliyor...</p>}
          {!yukleniyor && filtrelenmisIslemler.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: "20px" }}>Eşleşen işlem kaydı bulunamadı.</p>}
          
          {filtrelenmisIslemler.map(islem => (
            <div key={islem.id} className="premium-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "#0b0f19", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.01)", borderLeft: `5px solid ${islem.tip === "gelir" ? "#10b981" : "#ef4444"}` }}>
              <div>
                <div style={{ fontWeight: "600", fontSize: "15px", color: "white" }}>{islem.aciklama || islem.kategori}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <span style={{ color: islem.tip === "gelir" ? "#34d399" : "#fb923c", fontWeight: "600" }}>{islem.kategori}</span>
                  <span>•</span>
                  <span>{new Date(islem.tarih).toLocaleDateString("tr-TR")}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                <span style={{尊fontWeight: "700", fontSize: "17px", color: islem.tip === "gelir" ? "#10b981" : "#ef4444" }}>
                  {islem.tip === "gelir" ? "+" : "-"} ₺{islem.miktar.toLocaleString()}
                </span>
                <button onClick={() => islemSil(islem.id)} className="action-btn" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)", color: "#ef4444", cursor: "pointer", fontSize: "14px", padding: "8px 12px", borderRadius: "8px" }}>
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

function LandingPage({ onAc }) {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center", paddingTop: "100px", paddingBottom: "50px" }}>
      <div style={{ display: "inline-block", padding: "8px 16px", borderRadius: "20px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa", fontSize: "13px", fontWeight: "700", marginBottom: "20px", letterSpacing: "1px" }}>V2.0 LIVE UPDATE</div>
      <h1 style={{ color: "white", fontSize: "56px", fontWeight: "900", marginBottom: "20px", letterSpacing: "-1.5px", lineHeight: "1.1" }}>Finansal Akışınızı <br/><span style={{ background: "linear-gradient(to right, #3b82f6, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Sanat Eserine</span> Dönüştürün</h1>
      <p style={{ color: "#64748b", fontSize: "18px", marginBottom: "45px", maxWidth: "580px", margin: "0 auto 45px auto", lineHeight: "1.6" }}>
        Gelirlerinizi, planlanmış faturalarınızı ve anlık nakit operasyonlarınızı kurumsal seviyede tek bir matris üzerinden izleyin.
      </p>
      <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
        <button onClick={() => onAc("kayit")} className="action-btn" style={{ padding: "16px 36px", borderRadius: "12px", background: "#3b82f6", color: "white", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "16px", boxShadow: "0 4px 20px rgba(59,130,246,0.4)" }}>Hemen Başla</button>
        <button onClick={() => onAc("giris")} className="action-btn" style={{ padding: "16px 36px", borderRadius: "12px", background: "transparent", color: "#3b82f6", border: "2px solid #3b82f6", cursor: "pointer", fontWeight: "700", fontSize: "16px" }}>Mevcut Hesapla Giriş</button>
      </div>
    </div>
  );
}

export default function App() {
  const { kullanici } = useAuth();
  const [modal, setModal] = useState(null);

  if (kullanici === undefined) {
    return (
      <div style={{ background: "#0b0f19", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#60a5fa", fontSize: "16px", fontWeight: "600", letterSpacing: "1px" }}>KORUMALI AG BAGLANTISI KURULUYOR...</div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0b0f19", minHeight: "100vh", color: "white", fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", background: "rgba(11, 15, 25, 0.7)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.02)", position: "sticky", top: 0, zIndex: 100 }}>
        <span style={{ fontWeight: "900", fontSize: "16px", letterSpacing: "2px", color: "#3b82f6" }}>AURA // SECURE</span>
        {!kullanici && (
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={() => setModal("kayit")} style={{ padding: "8px 18px", borderRadius: "8px", background: "#3b82f6", color: "white", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "13px" }}>Kayıt Ol</button>
            <button onClick={() => setModal("giris")} style={{ padding: "8px 18px", borderRadius: "8px", background: "transparent", color: "#3b82f6", border: "1px solid #3b82f6", cursor: "pointer", fontWeight: "700", fontSize: "13px" }}>Giriş Yap</button>
          </div>
        )}
      </nav>

      <div style={{ padding: "40px 20px" }}>
        {kullanici ? <BudgetApp /> : <LandingPage onAc={setModal} />}
      </div>

      {modal && <AuthModal mod={modal} onKapat={() => setModal(null)} />}
    </div>
  );
}
// ... Mevcut React ve ReactDOM importların ...
// (Uygulamanın render edildiği root.render(...) kodunun hemen altına bunu ekle)

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