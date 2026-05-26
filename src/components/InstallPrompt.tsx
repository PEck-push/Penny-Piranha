import { useEffect, useState } from 'react';

// Optionaler „Zum Homescreen hinzufügen"-Button.
// - Android/Chrome: nutzt das native Install-Prompt (beforeinstallprompt), falls verfügbar.
// - iOS/Safari & sonst: zeigt eine kurze Anleitung (kein programmatisches Hinzufügen möglich).
// Versteckt sich automatisch, wenn die App bereits installiert (standalone) läuft.

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as any).standalone === true
  );
}
function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setHidden(true); return; }
    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden) return null;

  const handleClick = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* egal */ }
      setDeferred(null);
    } else {
      setShowHelp(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[13px] font-black text-white/80 hover:text-white hover:border-white/20 transition-colors"
      >
        📲 Zum Homescreen hinzufügen <span className="text-muted font-bold">(optional)</span>
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => setShowHelp(false)}>
          <div className="bg-card border border-border rounded-[24px] w-full max-w-[360px] p-6 mb-4 sm:mb-0 shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
            onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-black text-white mb-1">Zum Homescreen hinzufügen</div>
            <div className="text-[12px] text-muted mb-4">So hast du die App wie eine echte App direkt am Handy.</div>
            {isIOS() ? (
              <ol className="text-[13px] text-white/90 space-y-2 list-decimal list-inside">
                <li>Unten auf das <b>Teilen-Symbol</b> tippen (Quadrat mit Pfeil nach oben ⬆️).</li>
                <li>Etwas nach unten scrollen → <b>„Zum Home-Bildschirm"</b>.</li>
                <li>Oben rechts auf <b>„Hinzufügen"</b> tippen.</li>
              </ol>
            ) : (
              <ol className="text-[13px] text-white/90 space-y-2 list-decimal list-inside">
                <li>Oben/unten im Browser auf das <b>Menü</b> (⋮) tippen.</li>
                <li><b>„App installieren"</b> bzw. <b>„Zum Startbildschirm hinzufügen"</b> wählen.</li>
                <li>Bestätigen — fertig.</li>
              </ol>
            )}
            <button onClick={() => setShowHelp(false)}
              className="mt-5 w-full p-3 rounded-xl bg-gradient-to-br from-green to-[#B8860B] font-black text-[14px] text-bg">
              Verstanden
            </button>
          </div>
        </div>
      )}
    </>
  );
}
