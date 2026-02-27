import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

const AVATARS = [
  { id: 'c1',  n: 'Detlev',        r: 'STD',  img: '/avatars/1%20Kopie.webp',  color: '#ffb6c1' },
  { id: 'c2',  n: 'Uwe',           r: 'STD',  img: '/avatars/2%20Kopie.webp',  color: '#e0e0e0' },
  { id: 'c3',  n: 'Holger',        r: 'EPIC', img: '/avatars/3%20Kopie.webp',  color: '#ffa500' },
  { id: 'c4',  n: 'Torsten',       r: 'STD',  img: '/avatars/4%20Kopie.webp',  color: '#8b4513' },
  { id: 'c5',  n: 'Knut',          r: 'RARE', img: '/avatars/5%20Kopie.webp',  color: '#87ceeb' },
  { id: 'c6',  n: 'Sven',          r: 'EPIC', img: '/avatars/6%20Kopie.webp',  color: '#ff4500' },
  { id: 'c7',  n: 'Björn',         r: 'STD',  img: '/avatars/7%20Kopie.webp',  color: '#ffdab9' },
  { id: 'c8',  n: 'Jens',          r: 'RARE', img: '/avatars/8%20Kopie.webp',  color: '#8b4513' },
  { id: 'c9',  n: 'Dierk',         r: 'STD',  img: '/avatars/9%20Kopie.webp',  color: '#8b4513' },
  { id: 'c10', n: 'Sönke',         r: 'RARE', img: '/avatars/10%20Kopie.webp', color: '#a9a9a9' },
  { id: 'c11', n: 'Horst',         r: 'EPIC', img: '/avatars/11%20Kopie.webp', color: '#00bfff' },
  { id: 'c12', n: 'Günther',       r: 'RARE', img: '/avatars/12%20Kopie.webp', color: '#ff0000' },
  { id: 'c13', n: 'Herbert',       r: 'EPIC', img: '/avatars/13%20Kopie.webp', color: '#ffd700' },
  { id: 'c14', n: 'Fritz',         r: 'RARE', img: '/avatars/14%20Kopie.webp', color: '#8b4513' },
  { id: 'c15', n: 'Franz',         r: 'STD',  img: '/avatars/15%20Kopie.webp', color: '#ffdab9' },
  { id: 'c16', n: 'Seppl',         r: 'RARE', img: '/avatars/16%20Kopie.webp', color: '#696969' },
  { id: 'c17', n: 'Hans',          r: 'STD',  img: '/avatars/17%20Kopie.webp', color: '#8b4513' },
  { id: 'c18', n: 'Dieter',        r: 'RARE', img: '/avatars/18%20Kopie.webp', color: '#4169e1' },
  { id: 'c19', n: 'Ralf',          r: 'EPIC', img: '/avatars/19%20Kopie.webp', color: '#f0f8ff' },
  { id: 'c20', n: 'Volker',        r: 'RARE', img: '/avatars/20%20Kopie.webp', color: '#e0e0e0' },
  { id: 'c21', n: 'Malte',         r: 'EPIC', img: '/avatars/21%20Kopie.webp', color: '#ffd700' },
  { id: 'c22', n: 'Sören',         r: 'RARE', img: '/avatars/22%20Kopie.webp', color: '#b22222' },
  { id: 'c23', n: 'Tillmann',      r: 'RARE', img: '/avatars/23%20Kopie.webp', color: '#f5f5dc' },
  { id: 'c24', n: 'Gunnar',        r: 'EPIC', img: '/avatars/24%20Kopie.webp', color: '#2f4f4f' },
  { id: 'c25', n: 'Hauke',         r: 'EPIC', img: '/avatars/25%20Kopie.webp', color: '#708090' },
  { id: 'c26', n: 'Ansgar',        r: 'EPIC', img: '/avatars/26%20Kopie.webp', color: '#1a1a2e' },
  { id: 'c27', n: 'Fynn',          r: 'RARE', img: '/avatars/27%20Kopie.webp', color: '#b0c4de' },
  { id: 'c28', n: 'Rüdiger',       r: 'STD',  img: '/avatars/28%20Kopie.webp', color: '#32cd32' },
  { id: 'c29', n: 'Hartmut',       r: 'RARE', img: '/avatars/29%20Kopie.webp', color: '#3cb371' },
  { id: 'c30', n: 'Burkhard',      r: 'STD',  img: '/avatars/30%20Kopie.webp', color: '#ffdab9' },
  { id: 'c31', n: 'Justus',        r: 'EPIC', img: '/avatars/31.webp',         color: '#6a0dad' },
  { id: 'c32', n: 'Constantin',    r: 'RARE', img: '/avatars/32.webp',         color: '#c0392b' },
  { id: 'c33', n: 'Momme-Mommsen', r: 'EPIC', img: '/avatars/33.webp',         color: '#2980b9' },
  { id: 'c34', n: 'Leopold',       r: 'RARE', img: '/avatars/34.webp',         color: '#27ae60' },
  { id: 'c35', n: 'Peer',          r: 'STD',  img: '/avatars/35.webp',         color: '#d35400' },
  { id: 'c36', n: 'Golo',          r: 'EPIC', img: '/avatars/36.webp',         color: '#8e44ad' },
];

export default function Login() {
  const [step, setStep] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const players = useStore(state => state.players);
  const login = useStore(state => state.login);
  const navigate = useNavigate();

  // A player is "taken" if loggedIn=true OR has an avatar set (backwards compat)
  const takenPlayerIds = new Set(
    players.filter(p => p.loggedIn === true || p.avatar !== '').map(p => p.id)
  );
  const takenAvatarIds = new Set(
    players.filter(p => p.loggedIn === true || p.avatar !== '').map(p => p.avatarId).filter(Boolean)
  );

  // Loop.mp3 during login flow
  useEffect(() => {
    const audio = new Audio('/Loop.mp3');
    audio.loop = true;
    audio.volume = 0.35;
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => { audio.pause(); audio.src = ''; };
  }, []);

  const handleLogin = () => {
    if (selectedPlayerId) {
      login(selectedPlayerId, selectedAvatar.img, selectedAvatar.color, selectedAvatar.id);
      navigate('/dashboard');
    }
  };

  if (step === 1) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(139,61,255,.35)_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,rgba(0,229,255,.15)_0%,transparent_45%),radial-gradient(ellipse_at_50%_100%,rgba(59,110,255,.2)_0%,transparent_50%)]" />
        
        <div className="relative z-10 px-5 pt-5 flex-1 flex flex-col">
          <div className="text-center py-2 pb-4">
            <img src="/pp4.webp" alt="Penny Piranha" className="h-28 w-auto mx-auto drop-shadow-[0_0_30px_rgba(0,214,143,0.5)] animate-[float_3s_ease-in-out_infinite]" />
          </div>
          
          <div className="text-[28px] font-black text-white leading-[1.1] mb-1 text-center">
            Wähle deinen <span className="bg-gradient-to-r from-green to-cyan bg-clip-text text-transparent">Namen</span>
          </div>
          <div className="text-[12px] text-muted mb-[18px] text-center">Kein Passwort. Kein Login. Wähle einfach deinen Namen.</div>
          
          <div className="flex items-center gap-1.5 mb-4">
            <div className="w-7 h-1.5 rounded-full overflow-hidden bg-gradient-to-r from-blue to-purple" />
            <div className="w-7 h-1.5 rounded-full overflow-hidden bg-border" />
            <div className="w-7 h-1.5 rounded-full overflow-hidden bg-border" />
            <span className="font-mono text-[9px] text-muted tracking-[0.1em] ml-1">Schritt 1 von 3</span>
          </div>
          
          <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-2.5">11 Spieler</div>
          
          <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto no-scrollbar pb-32">
            {players.map(p => {
              const taken = takenPlayerIds.has(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => !taken && setSelectedPlayerId(p.id)}
                  className={clsx(
                    "border rounded-[14px] p-3 px-4 flex items-center gap-3 transition-all duration-200 relative overflow-hidden",
                    taken
                      ? "bg-white/2 border-white/5 opacity-40 cursor-not-allowed"
                      : selectedPlayerId === p.id
                        ? "bg-green/10 border-green shadow-[0_0_24px_rgba(0,214,143,0.1)] cursor-pointer"
                        : "bg-white/5 border-border hover:border-blue/40 hover:translate-x-1 cursor-pointer group"
                  )}
                >
                  <div className="flex-1">
                    <div className="text-[15px] font-black text-white">{p.name}</div>
                    <div className="font-mono text-[10px] text-muted mt-[1px]">
                      {taken
                        ? <span className="text-red/60">🔒 Bereits vergeben</span>
                        : <span>Start: <b className="text-yellow">{p.tokens} Token</b></span>
                      }
                    </div>
                  </div>
                  <div className={clsx(
                    "w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-[11px] transition-all duration-200",
                    taken ? "border-white/10 text-transparent" :
                    selectedPlayerId === p.id ? "bg-green border-green text-bg font-black" : "border-border text-transparent"
                  )}>
                    {taken ? '🔒' : '✓'}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-12 pb-12 px-5 pointer-events-none">
            <button 
              onClick={() => selectedPlayerId && setStep(2)}
              disabled={!selectedPlayerId}
              className="w-full p-[17px] border-none rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-sans text-[16px] font-black text-bg cursor-pointer tracking-[0.02em] shadow-[0_8px_40px_rgba(0,214,143,0.4),0_0_0_1px_rgba(0,214,143,0.2)] transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-[0_14px_50px_rgba(0,214,143,0.5)] disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
            >
              Weiter → Avatar wählen {selectedPlayerId && `als ${players.find(p => p.id === selectedPlayerId)?.name}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(139,61,255,.4)_0%,transparent_55%),radial-gradient(ellipse_at_20%_60%,rgba(0,229,255,.12)_0%,transparent_40%),radial-gradient(ellipse_at_80%_80%,rgba(59,110,255,.15)_0%,transparent_40%)] animate-[flareMove_15s_ease-in-out_infinite]" />
      
      <div className="relative z-20 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-muted cursor-pointer" onClick={() => setStep(1)}>
          ‹ Zurück
        </div>
        <div className="font-mono text-[9px] text-muted border border-border rounded-full px-2.5 py-1 tracking-[0.1em]">
          Schritt 2 von 3
        </div>
      </div>

      <div className="relative z-10 flex-none h-[230px] flex flex-col items-center justify-end overflow-visible">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[220px] h-[60px] rounded-full blur-[30px]" style={{ backgroundColor: selectedAvatar.color }} />
        <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 w-[160px] h-[160px] rounded-full bg-[radial-gradient(circle,rgba(0,214,143,.15)_0%,transparent_70%)] blur-[10px] animate-[flareMove_10s_ease-in-out_infinite]" />
        
        {selectedAvatar.img ? (
          <img 
            src={selectedAvatar.img} 
            alt={selectedAvatar.n}
            className="relative z-30 h-[260px] object-contain -mb-2.5 cursor-pointer"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="relative z-30 h-[260px] w-[200px] bg-white/5 rounded-t-full -mb-2.5" />
        )}
      </div>

      <div className="relative z-20 text-center px-5 pt-4">
        <div className="text-[26px] font-black text-white tracking-[-0.5px] drop-shadow-[0_0_40px_rgba(139,61,255,0.6)]">
          {selectedAvatar.n}
        </div>
      </div>

      <div className="relative z-20 px-4 pt-2 flex-1 overflow-y-auto no-scrollbar">
        <div className="font-mono text-[9px] text-muted tracking-[0.2em] uppercase mb-2.5">Alle 36 Charaktere — tippe zum Vorschauen</div>
        <div className="grid grid-cols-6 gap-1.5 pb-32">
          {AVATARS.map((a, i) => {
            const avatarTaken = takenAvatarIds.has(a.id);
            return (
              <div
                key={i}
                className={clsx("flex flex-col items-center gap-[3px]", avatarTaken ? "cursor-not-allowed opacity-35" : "cursor-pointer group")}
                onClick={() => !avatarTaken && setSelectedAvatar(a)}
              >
                <div className={clsx(
                  "w-12 h-12 rounded-xl bg-card border-[1.5px] flex items-center justify-center transition-all duration-150 relative overflow-hidden",
                  avatarTaken
                    ? "border-white/5"
                    : selectedAvatar.id === a.id
                      ? "border-green border-2 bg-green/10 shadow-[0_0_16px_rgba(0,214,143,0.35)] scale-110"
                      : "border-border group-hover:border-blue/50 group-hover:scale-110"
                )}>
                  {a.img ? (
                    <img src={a.img} alt={a.n} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-white/5" />
                  )}
                  {avatarTaken && (
                    <div className="absolute inset-0 bg-bg/60 flex items-center justify-center text-[14px]">🔒</div>
                  )}
                </div>
                <div className={clsx(
                  "text-[8px] font-bold text-center leading-[1.2]",
                  avatarTaken ? "text-white/20" : selectedAvatar.id === a.id ? "text-green" : "text-muted"
                )}>
                  {a.n}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-4 pb-8 px-5 z-30">
        <button 
          onClick={handleLogin}
          className="w-full p-[14px] border-none rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-sans text-[16px] font-black text-bg cursor-pointer tracking-[0.02em] shadow-[0_8px_30px_rgba(0,214,143,0.4)] transition-all duration-200 flex items-center justify-center gap-2.5 hover:-translate-y-[2px] hover:shadow-[0_12px_40px_rgba(0,214,143,0.5)]"
        >
          {selectedAvatar.img ? (
            <img src={selectedAvatar.img} alt={selectedAvatar.n} className="w-8 h-8 object-cover rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/5" />
          )}
          <span>Spielen als {selectedAvatar.n}</span>
        </button>
      </div>
    </div>
  );
}