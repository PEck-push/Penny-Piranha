import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store';
import { doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

interface RevealScreenProps {
  /** Marktliste, die nach dem Reveal als „gesehen" markiert wird. */
  marketIds: string[];
  onDone: () => void;
}

// Zauberer-Videos (mp4) im public-Ordner:
//   public/win.mp4   — Zauberer füllt das Bierglas   (Gewinn)
//   public/loss.mp4  — Zauberer lässt das Glas fallen (Verlust)
//   public/draw.mp4  — Edge-Case ±0 (optional; Fallback: win.mp4)
const WIN_VIDEO  = '/win.mp4';
const LOSS_VIDEO = '/loss.mp4';
const DRAW_VIDEO = '/draw.mp4';

// Timing in ms.
const NUMBER_DELAY_MS = 4300; // Zahl erscheint erst NACH 4,3 s Video
const FALLBACK_MS     = 1500; // wenn kein Video lädt (Emoji-Platzhalter)
const HOLD_MS         = 2500; // wie lange die Zahl danach steht
const FADE_MS         = 450;  // Ausblend-Dauer

// Tägliche Bilanz: EIN Screen mit Zauberer-Video + Gold/Rot-Zahl, blendet sich
// automatisch wieder aus. Die Summe kommt aus dailyNetGain (Auszahlung − Einsatz,
// inkl. Gratis-Jackpot-Gewinne), das beim Schließen wieder auf 0 gesetzt wird.
export default function RevealScreen({ marketIds, onDone }: RevealScreenProps) {
  const currentUser = useStore(s => s.currentUser);
  const me = useStore(s => s.players.find(p => p.id === currentUser));

  const net = Math.round(me?.dailyNetGain ?? 0);
  const isWin  = net > 0;
  const isDraw = net === 0;
  // Bei ±0 zuerst draw.mp4; wenn nicht vorhanden, fängt onError und schaltet
  // auf win.mp4 als Fallback (siehe drawFallback unten).
  const [drawFallback, setDrawFallback] = useState(false);

  const [showNumber, setShowNumber] = useState(false);
  const [closing, setClosing] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const doneRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasPlayedRef = useRef(false);

  // Videoauswahl: bei ±0 → draw.mp4 (mit Fallback auf win.mp4, falls noch
  // nicht hochgeladen); Gewinn → win, Verlust → loss.
  const videoSrc = isDraw
    ? (drawFallback ? WIN_VIDEO : DRAW_VIDEO)
    : isWin ? WIN_VIDEO : LOSS_VIDEO;
  const tone: 'win' | 'loss' | 'draw' = isDraw ? 'draw' : isWin ? 'win' : 'loss';

  const finish = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (currentUser && db) {
      try {
        // Nur die aufgelösten Markt-IDs entfernen — verhindert, dass parallele
        // neue Resolutions, die zwischenzeitlich reinkamen, mit-genullt werden.
        await updateDoc(doc(db, 'players', currentUser), {
          unseenResolutions: arrayRemove(...marketIds),
          dailyNetGain: 0,
        });
      } catch { /* nächste Session erneut */ }
    }
    onDone();
  };

  // Sanftes Schließen (Ausblenden → finish).
  const closeNow = () => {
    if (doneRef.current) return;
    setClosing(true);
    setTimeout(() => { finish(); }, FADE_MS);
  };

  // Zahl erscheint fix nach 4,3 s Video (nicht früher).
  useEffect(() => {
    const t = setTimeout(() => setShowNumber(true), NUMBER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // iOS/Safari: Inline-Autoplay läuft nur, wenn `muted` als DOM-PROPERTY gesetzt
  // ist — das React-Attribut allein reicht nicht (bekannter Bug). Daher hier
  // imperativ setzen und play() aktiv anstoßen. Schlägt es fehl (z. B. iOS-
  // Stromsparmodus blockt Autoplay generell), startet der erste Tap das Video
  // (siehe handleOverlayClick), statt den Screen sofort zu schließen.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => { /* Autoplay blockiert → Tap startet (handleOverlayClick) */ });
  }, [videoSrc]);

  // Emoji-Platzhalter (kein Video → kein onEnded): Zahl zeigen, dann schließen.
  useEffect(() => {
    if (!videoFailed) return;
    const t1 = setTimeout(() => setShowNumber(true), FALLBACK_MS);
    const t2 = setTimeout(() => closeNow(), FALLBACK_MS + HOLD_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFailed]);

  // Overlay-Tap: Lief das Video noch nie (Autoplay blockiert, z. B. iOS-
  // Stromsparmodus)? Dann startet der erste Tap das Video, statt den Screen zu
  // schließen. Sobald es einmal lief, schließt jeder Tap wie gewohnt.
  const handleOverlayClick = () => {
    const v = videoRef.current;
    if (v && !hasPlayedRef.current && v.paused && !videoFailed) {
      v.muted = true;
      v.play().catch(() => setVideoFailed(true));
      return;
    }
    finish();
  };

  return (
    <div
      onClick={handleOverlayClick}
      className={clsx(
        'fixed inset-0 z-[100] bg-[#02040C] cursor-pointer transition-opacity overflow-hidden',
        closing ? 'opacity-0' : 'opacity-100',
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* Zauberer-Video full-screen (oder Emoji-Fallback, solange kein mp4 vorliegt) */}
      {videoFailed ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={clsx('absolute inset-0',
            tone === 'win'
              ? 'bg-[radial-gradient(ellipse_at_50%_40%,rgba(230,180,60,.28)_0%,transparent_60%)]'
              : tone === 'loss'
                ? 'bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,61,90,.20)_0%,transparent_60%)]'
                : 'bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,255,255,.14)_0%,transparent_60%)]')} />
          <div className="relative text-[140px] leading-none" style={{ animation: 'auraGlow 2s ease-in-out infinite' }}>
            {tone === 'win' ? '🍺' : tone === 'loss' ? '💥' : '😐'}
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          muted
          playsInline
          preload="auto"
          onPlay={() => { hasPlayedRef.current = true; }}
          onEnded={() => { setShowNumber(true); closeNow(); }}
          onError={() => {
            // ±0 ohne draw.mp4 → einmalig auf win.mp4 zurückfallen, statt sofort Emoji.
            if (isDraw && !drawFallback) setDrawFallback(true);
            else setVideoFailed(true);
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Abdunklung unten für die Lesbarkeit der Zahl */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

      {/* +/- Tokenzahl als Überlagerung */}
      {showNumber && (
        <div className="absolute inset-x-0 bottom-[18%] flex flex-col items-center px-6">
          <div
            className={clsx(
              'font-black tracking-[-1px] drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]',
              tone === 'win' ? 'text-yellow' : tone === 'loss' ? 'text-red' : 'text-white',
            )}
            style={{ fontSize: 72, animation: 'tokenPop 600ms cubic-bezier(.2,1.4,.4,1) both' }}
          >
            {tone === 'win' ? '+' : tone === 'loss' ? '−' : '±'}{Math.abs(net)}
            <span className="text-[30px] ml-2 align-middle opacity-80">TKN</span>
          </div>
          <div className="text-[12px] font-bold text-white/70 mt-2">
            {tone === 'win'
              ? 'Deine Bilanz seit zuletzt'
              : tone === 'loss'
                ? 'Autsch — deine Bilanz seit zuletzt'
                : 'Knapp daneben — ±0 seit zuletzt'} · tippen zum Schließen
          </div>
        </div>
      )}
    </div>
  );
}
