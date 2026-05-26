import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface RevealScreenProps {
  /** Marktliste, die nach dem Reveal als „gesehen" markiert wird. */
  marketIds: string[];
  onDone: () => void;
}

// Zauberer-Videos (mp4). Vor Go-live ablegen:
//   public/fx/win.mp4   — Zauberer füllt das Bierglas   (Gewinn)
//   public/fx/loss.mp4  — Zauberer lässt das Glas fallen (Verlust)
const WIN_VIDEO  = '/fx/win.mp4';
const LOSS_VIDEO = '/fx/loss.mp4';

// Timing in ms.
const MAX_VIDEO_MS = 9000; // Sicherheit: Zahl spätestens hier zeigen (falls Autoplay blockiert)
const FALLBACK_MS  = 1500; // wenn kein Video lädt (Emoji-Platzhalter)
const HOLD_MS      = 2500; // wie lange die Zahl danach steht
const FADE_MS      = 450;  // Ausblend-Dauer

// Tägliche Bilanz: EIN Screen mit Zauberer-Video + Gold/Rot-Zahl, blendet sich
// automatisch wieder aus. Die Summe kommt aus dailyNetGain (Auszahlung − Einsatz,
// inkl. Gratis-Jackpot-Gewinne), das beim Schließen wieder auf 0 gesetzt wird.
export default function RevealScreen({ marketIds, onDone }: RevealScreenProps) {
  const currentUser = useStore(s => s.currentUser);
  const me = useStore(s => s.players.find(p => p.id === currentUser));

  const net = Math.round(me?.dailyNetGain ?? 0);
  const isWin = net >= 0;

  const [showNumber, setShowNumber] = useState(false);
  const [closing, setClosing] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const doneRef = useRef(false);

  const finish = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (currentUser && db) {
      try {
        await updateDoc(doc(db, 'players', currentUser), { unseenResolutions: [], dailyNetGain: 0 });
      } catch { /* nächste Session erneut */ }
    }
    onDone();
  };

  // Sicherheits-Timer: Zahl spätestens nach MAX_VIDEO_MS zeigen.
  useEffect(() => {
    const t = setTimeout(() => setShowNumber(true), MAX_VIDEO_MS);
    return () => clearTimeout(t);
  }, []);

  // Emoji-Platzhalter (kein Video) → Zahl nach kurzer Zeit.
  useEffect(() => {
    if (!videoFailed) return;
    const t = setTimeout(() => setShowNumber(true), FALLBACK_MS);
    return () => clearTimeout(t);
  }, [videoFailed]);

  // Sobald die Zahl steht → kurz halten → ausblenden → schließen.
  useEffect(() => {
    if (!showNumber) return;
    const t1 = setTimeout(() => setClosing(true), HOLD_MS);
    const t2 = setTimeout(() => { finish(); }, HOLD_MS + FADE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNumber]);

  void marketIds; // wird über unseenResolutions:[] geleert

  return (
    <div
      onClick={finish}
      className={clsx(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#02040C] cursor-pointer transition-opacity',
        closing ? 'opacity-0' : 'opacity-100',
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* Hintergrund-Glow je nach Ergebnis */}
      <div className={clsx(
        'absolute inset-0',
        isWin
          ? 'bg-[radial-gradient(ellipse_at_50%_40%,rgba(230,180,60,.28)_0%,transparent_60%)]'
          : 'bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,61,90,.20)_0%,transparent_60%)]',
      )} />

      {/* Zauberer-Video (oder Emoji-Fallback, solange kein mp4 vorliegt) */}
      <div className="relative z-10 w-[min(82vw,360px)] aspect-square flex items-center justify-center">
        {videoFailed ? (
          <div className="text-[120px] leading-none" style={{ animation: 'auraGlow 2s ease-in-out infinite' }}>
            {isWin ? '🍺' : '💥'}
          </div>
        ) : (
          <video
            src={isWin ? WIN_VIDEO : LOSS_VIDEO}
            autoPlay
            muted
            playsInline
            onEnded={() => setShowNumber(true)}
            onError={() => setVideoFailed(true)}
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {/* +/- Tokenzahl */}
      <div className="relative z-10 h-[80px] mt-2 flex items-center justify-center">
        {showNumber && (
          <div
            className={clsx(
              'font-black tracking-[-1px] drop-shadow-[0_0_30px_rgba(0,0,0,0.6)]',
              isWin ? 'text-yellow' : 'text-red',
            )}
            style={{ fontSize: 56, animation: 'tokenPop 600ms cubic-bezier(.2,1.4,.4,1) both' }}
          >
            {isWin ? '+' : '−'}{Math.abs(net)}
            <span className="text-[24px] ml-1.5 align-middle opacity-80">TKN</span>
          </div>
        )}
      </div>

      {showNumber && (
        <div className="relative z-10 text-[12px] font-bold text-muted mt-1">
          {isWin ? 'Deine Bilanz seit zuletzt' : 'Autsch — deine Bilanz seit zuletzt'} · tippen zum Schließen
        </div>
      )}
    </div>
  );
}
