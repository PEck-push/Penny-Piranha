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

// Zauberer-Videos (mp4) im public-Ordner:
//   public/win.mp4   — Zauberer füllt das Bierglas   (Gewinn)
//   public/loss.mp4  — Zauberer lässt das Glas fallen (Verlust)
const WIN_VIDEO  = '/win.mp4';
const LOSS_VIDEO = '/loss.mp4';

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

  // Emoji-Platzhalter (kein Video → kein onEnded): Zahl zeigen, dann schließen.
  useEffect(() => {
    if (!videoFailed) return;
    const t1 = setTimeout(() => setShowNumber(true), FALLBACK_MS);
    const t2 = setTimeout(() => closeNow(), FALLBACK_MS + HOLD_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFailed]);

  void marketIds; // wird über unseenResolutions:[] geleert

  return (
    <div
      onClick={finish}
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
            isWin
              ? 'bg-[radial-gradient(ellipse_at_50%_40%,rgba(230,180,60,.28)_0%,transparent_60%)]'
              : 'bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,61,90,.20)_0%,transparent_60%)]')} />
          <div className="relative text-[140px] leading-none" style={{ animation: 'auraGlow 2s ease-in-out infinite' }}>
            {isWin ? '🍺' : '💥'}
          </div>
        </div>
      ) : (
        <video
          src={isWin ? WIN_VIDEO : LOSS_VIDEO}
          autoPlay
          muted
          playsInline
          onEnded={() => { setShowNumber(true); closeNow(); }}
          onError={() => setVideoFailed(true)}
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
              isWin ? 'text-yellow' : 'text-red',
            )}
            style={{ fontSize: 72, animation: 'tokenPop 600ms cubic-bezier(.2,1.4,.4,1) both' }}
          >
            {isWin ? '+' : '−'}{Math.abs(net)}
            <span className="text-[30px] ml-2 align-middle opacity-80">TKN</span>
          </div>
          <div className="text-[12px] font-bold text-white/70 mt-2">
            {isWin ? 'Deine Bilanz seit zuletzt' : 'Autsch — deine Bilanz seit zuletzt'} · tippen zum Schließen
          </div>
        </div>
      )}
    </div>
  );
}
