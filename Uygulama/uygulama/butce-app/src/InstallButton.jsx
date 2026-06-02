import React, { useState, useEffect } from 'react';

// Sayfa ilk yüklendiğinde React henüz ayağa kalkarken gelebilecek sinyali kaçırmamak için global alanda yakalıyoruz
if (!window.hasPwaListener) {
  window.hasPwaListener = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    // Sinyalin geldiğini React bileşenlerine haber vermek için tetikleyici fırlatıyoruz
    window.dispatchEvent(new CustomEvent('pwa-sinyali-geldi'));
  });
}

export default function InstallButton() {
  const [showButton, setShowButton] = useState(!!window.deferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Uygulama zaten bilgisayara/telefona indirilip oradan mı açılmış?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // 2. Erken gelen global sinyali dinle
    const handleGlobalSignal = () => {
      setShowButton(true);
    };

    // 3. Geç gelen veya sayfa içi tetiklenen sinyali dinle
    const handleLocalSignal = (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      setShowButton(true);
    };

    window.addEventListener('pwa-sinyali-geldi', handleGlobalSignal);
    window.addEventListener('beforeinstallprompt', handleLocalSignal);

    // 4. Kullanıcı uygulamayı yüklerse butonu tamamen gizle
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowButton(false);
      window.deferredPrompt = null;
    });

    return () => {
      window.removeEventListener('pwa-sinyali-geldi', handleGlobalSignal);
      window.removeEventListener('beforeinstallprompt', handleLocalSignal);
    };
  }, []);

  // Eğer uygulama zaten kurulmuşsa hiçbir şey gösterme
  if (isInstalled) return null;

  // Sinyal henüz gelmediyse veya PWA kriterleri taranıyorsa geçici durum göster
  if (!showButton) {
    return (
      <span style={{ 
        color: '#64748b', 
        fontSize: '12px', 
        border: '1px dashed rgba(255,255,255,0.1)', 
        padding: '8px 14px', 
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.02)',
        display: 'inline-flex',
        alignItems: 'center'
      }}>
        ⏳ PWA Kontrol Ediliyor...
      </span>
    );
  }

  // Tarayıcı indirmeye hazır olduğunu bildirdiğinde ekrana gelecek gerçek butonumuz
  const handleInstallClick = async () => {
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) return;

    // Tarayıcının yükleme penceresini aç
    promptEvent.prompt();
    
    // Kullanıcının "Yükle" mi yoksa "İptal" mi dediğini kontrol et
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      window.deferredPrompt = null;
      setShowButton(false);
    }
  };

  return (
    <button
      onClick={handleInstallClick}
      style={{
        padding: "10px 18px",
        borderRadius: "10px",
        background: "linear-gradient(to right, #10b981, #059669)",
        color: "white",
        border: "none",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "700",
        boxShadow: "0 4px 12px rgba(16,185,129,0.2)",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px"
      }}
    >
      📥 Uygulamayı İndir
    </button>
  );
}