import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { clsx } from 'clsx';
import { auth, db } from '../firebase';
import { useStore } from '../store';
import type { StreakLevel } from '../store';

// ─── Avatar data (existing webp sprites, used as character placeholder) ────────
const AVATARS = [
  { id: 'c1',  n: 'Detlev',        img: '/avatars/1%20Kopie.webp',  color: '#ffb6c1' },
  { id: 'c2',  n: 'Uwe',           img: '/avatars/2%20Kopie.webp',  color: '#e0e0e0' },
  { id: 'c3',  n: 'Holger',        img: '/avatars/3%20Kopie.webp',  color: '#ffa500' },
  { id: 'c4',  n: 'Torsten',       img: '/avatars/4%20Kopie.webp',  color: '#8b4513' },
  { id: 'c5',  n: 'Knut',          img: '/avatars/5%20Kopie.webp',  color: '#87ceeb' },
  { id: 'c6',  n: 'Sven',          img: '/avatars/6%20Kopie.webp',  color: '#ff4500' },
  { id: 'c7',  n: 'Björn',         img: '/avatars/7%20Kopie.webp',  color: '#ffdab9' },
  { id: 'c8',  n: 'Jens',          img: '/avatars/8%20Kopie.webp',  color: '#8b4513' },
  { id: 'c9',  n: 'Dierk',         img: '/avatars/9%20Kopie.webp',  color: '#8b4513' },
  { id: 'c10', n: 'Sönke',         img: '/avatars/10%20Kopie.webp', color: '#a9a9a9' },
  { id: 'c11', n: 'Horst',         img: '/avatars/11%20Kopie.webp', color: '#00bfff' },
  { id: 'c12', n: 'Günther',       img: '/avatars/12%20Kopie.webp', color: '#ff0000' },
  { id: 'c13', n: 'Herbert',       img: '/avatars/13%20Kopie.webp', color: '#ffd700' },
  { id: 'c14', n: 'Fritz',         img: '/avatars/14%20Kopie.webp', color: '#8b4513' },
  { id: 'c15', n: 'Franz',         img: '/avatars/15%20Kopie.webp', color: '#ffdab9' },
  { id: 'c16', n: 'Seppl',         img: '/avatars/16%20Kopie.webp', color: '#696969' },
  { id: 'c17', n: 'Hans',          img: '/avatars/17%20Kopie.webp', color: '#8b4513' },
  { id: 'c18', n: 'Dieter',        img: '/avatars/18%20Kopie.webp', color: '#4169e1' },
  { id: 'c19', n: 'Ralf',          img: '/avatars/19%20Kopie.webp', color: '#f0f8ff' },
  { id: 'c20', n: 'Volker',        img: '/avatars/20%20Kopie.webp', color: '#e0e0e0' },
  { id: 'c21', n: 'Malte',         img: '/avatars/21%20Kopie.webp', color: '#ffd700' },
  { id: 'c22', n: 'Sören',         img: '/avatars/22%20Kopie.webp', color: '#b22222' },
  { id: 'c23', n: 'Tillmann',      img: '/avatars/23%20Kopie.webp', color: '#f5f5dc' },
  { id: 'c24', n: 'Gunnar',        img: '/avatars/24%20Kopie.webp', color: '#2f4f4f' },
  { id: 'c25', n: 'Hauke',         img: '/avatars/25%20Kopie.webp', color: '#708090' },
  { id: 'c26', n: 'Ansgar',        img: '/avatars/26%20Kopie.webp', color: '#1a1a2e' },
  { id: 'c27', n: 'Fynn',          img: '/avatars/27%20Kopie.webp', color: '#b0c4de' },
  { id: 'c28', n: 'Rüdiger',       img: '/avatars/28%20Kopie.webp', color: '#32cd32' },
  { id: 'c29', n: 'Hartmut',       img: '/avatars/29%20Kopie.webp', color: '#3cb371' },
  { id: 'c30', n: 'Burkhard',      img: '/avatars/30%20Kopie.webp', color: '#ffdab9' },
  { id: 'c31', n: 'Justus',        img: '/avatars/31.webp',         color: '#6a0dad' },
  { id: 'c32', n: 'Constantin',    img: '/avatars/32.webp',         color: '#c0392b' },
  { id: 'c33', n: 'Momme-Mommsen', img: '/avatars/33.webp',         color: '#2980b9' },
  { id: 'c34', n: 'Leopold',       img: '/avatars/34.webp',         color: '#27ae60' },
  { id: 'c35', n: 'Peer',          img: '/avatars/35.webp',         color: '#d35400' },
  { id: 'c36', n: 'Golo',          img: '/avatars/36.webp',         color: '#8e44ad' },
];

const BODY_STYLES = [
  { id: 'body_blau',    label: 'Austria Blau',  bg: 'from-blue-600 to-blue-900',   border: '#2563eb' },
  { id: 'body_rot',     label: 'Feuer-Rot',     bg: 'from-red-500 to-orange-700',  border: '#ef4444' },
  { id: 'body_gruen',   label: 'Waldgrün',      bg: 'from-green-500 to-green-800', border: '#16a34a' },
  { id: 'body_lila',    label: 'Royal Lila',    bg: 'from-purple-500 to-purple-900',border: '#7c3aed' },
  { id: 'body_weiss',   label: 'Klassik Weiß',  bg: 'from-gray-300 to-gray-500',   border: '#d1d5db' },
  { id: 'body_schwarz', label: 'Stealth',       bg: 'from-gray-600 to-gray-900',   border: '#374151' },
];

// ─── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={clsx(
            'h-1.5 rounded-full transition-all duration-300',
            i + 1 === current
              ? 'w-7 bg-gradient-to-r from-blue to-purple'
              : i + 1 < current
                ? 'w-3.5 bg-green/60'
                : 'w-3.5 bg-border',
          )}
        />
      ))}
      <span className="font-mono text-[9px] text-muted tracking-[0.1em] ml-1">
        Schritt {current} von {total}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Register() {
  const navigate = useNavigate();
  const registerPlayer = useStore(s => s.registerPlayer);

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [inviteCode, setInviteCode] = useState('');

  // Step 2
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // Step 3
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);

  // Step 4
  const [selectedBody, setSelectedBody] = useState(BODY_STYLES[0]);

  // Step 5: finale Bestätigung
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const displayName = [firstName, lastName].filter(Boolean).join(' ');

  // ── Step 1: Invite code validation ──────────────────────────────────────────
  const handleInviteCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'appState', 'global'));
      const code = snap.data()?.inviteCode as string | undefined;
      if (!code) {
        // No invite code configured yet — only blocked if Firestore returns something unexpected.
        // Admin can set the code via Admin-Panel (PIN: 1234 → Einladungscode).
        setError('Kein Anmeldecode konfiguriert. Admin: Code im Admin-Panel (Pin 1234) setzen, dann neu versuchen.');
        return;
      }
      if (inviteCode.trim().toLowerCase() !== code.toLowerCase()) {
        setError('Ungültiger Einladungscode. Bitte frage beim Admin nach.');
        return;
      }
      setStep(2);
    } catch {
      setError('Verbindungsfehler. Bitte versuche es nochmal.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Account validation ───────────────────────────────────────────────
  const handleAccountNext = () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Bitte gib Vor- und Nachname ein.');
      return;
    }
    if (!email.includes('@')) {
      setError('Ungültige E-Mail-Adresse.');
      return;
    }
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    setStep(3);
  };

  // ── Step 5: Create account in Firebase ──────────────────────────────────────
  const handleConfirm = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;

      await registerPlayer(uid, {
        name: displayName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        avatar: selectedAvatar.img,
        avatarId: selectedAvatar.id,
        avatarColor: selectedAvatar.color,
        loggedIn: true,
        tokens: 1000,
        comboMalus: false,
        badges: [],
        buybackUsed: false,
        characterLocked: true,
        currentStreak: 0,
        bestStreak: 0,
        streakLevel: 'none' as StreakLevel,
        streakHistory: [],
        underdogCorrect: 0,
        austriaSpecialCorrect: 0,
        dailyNetGain: 0,
        unseenResolutions: [],
        unlockedOverlays: [],
        activeAccessoryId: null,
        activeBadgeId: null,
      });

      navigate('/dashboard');
    } catch (err: any) {
      setShowFinalConfirm(false);
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('Diese E-Mail ist bereits registriert. Bitte melde dich an.');
          break;
        case 'auth/invalid-email':
          setError('Ungültige E-Mail-Adresse.');
          break;
        case 'auth/weak-password':
          setError('Passwort muss mindestens 8 Zeichen haben.');
          break;
        case 'auth/network-request-failed':
          setError('Netzwerkfehler. Bitte versuche es nochmal.');
          break;
        default:
          setError('Registrierung fehlgeschlagen. Bitte versuche es nochmal.');
      }
    } finally {
      setLoading(false);
    }
  };

  const BG = (
    <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(139,61,255,.35)_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,rgba(0,229,255,.15)_0%,transparent_45%),radial-gradient(ellipse_at_50%_100%,rgba(59,110,255,.2)_0%,transparent_50%)]" />
  );

  // ── Screen 1: Einladungscode ─────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        {BG}
        <div className="relative z-10 px-5 pt-8 flex-1 flex flex-col">
          <div className="text-center pb-5">
            <img src="/pp4.webp" alt="Penny Piranha" className="h-20 w-auto mx-auto drop-shadow-[0_0_24px_rgba(0,214,143,0.5)] animate-[float_3s_ease-in-out_infinite]" />
          </div>

          <StepDots current={1} total={5} />

          <div className="text-[26px] font-black text-white leading-[1.1] mb-1">
            Einladungscode
          </div>
          <div className="text-[12px] text-muted mb-7">
            Du brauchst einen gültigen Code vom Admin um mitzuspielen.
          </div>

          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInviteCode()}
              placeholder="Einladungscode eingeben…"
              className="bg-white/5 border border-border rounded-xl px-4 py-3.5 text-[15px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors text-center tracking-[0.15em]"
              autoCapitalize="none"
              autoComplete="off"
            />

            {error && (
              <div className="bg-red/10 border border-red/30 rounded-xl px-4 py-2.5 text-[13px] text-red text-center">
                {error}
              </div>
            )}

            <button
              onClick={handleInviteCode}
              disabled={loading || !inviteCode.trim()}
              className="w-full p-[15px] rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-black text-[16px] text-bg shadow-[0_8px_40px_rgba(0,214,143,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Prüfen…' : 'Weiter →'}
            </button>
          </div>

          <div className="mt-auto pb-8 text-center text-[13px] text-muted pt-8">
            Schon registriert?{' '}
            <Link to="/login" className="text-green font-bold">Anmelden</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen 2: Account erstellen ──────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        {BG}
        <div className="relative z-10 px-5 pt-6 flex-1 flex flex-col">
          <button
            onClick={() => { setStep(1); setError(null); }}
            className="text-[13px] font-bold text-muted mb-4 text-left bg-transparent border-none cursor-pointer"
          >
            ‹ Zurück
          </button>

          <StepDots current={2} total={5} />

          <div className="text-[24px] font-black text-white leading-[1.1] mb-1">
            Account erstellen
          </div>
          <div className="text-[12px] text-muted mb-5">
            Dein Name ist für alle sichtbar.
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto no-scrollbar pb-32">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">Vorname</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Max"
                  className="bg-white/5 border border-border rounded-xl px-3 py-2.5 text-[14px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">Nachname</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Mustermann"
                  className="bg-white/5 border border-border rounded-xl px-3 py-2.5 text-[14px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="deine@email.com"
                className="bg-white/5 border border-border rounded-xl px-4 py-2.5 text-[14px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                className="bg-white/5 border border-border rounded-xl px-4 py-2.5 text-[14px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">Passwort bestätigen</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                placeholder="Passwort wiederholen"
                className="bg-white/5 border border-border rounded-xl px-4 py-2.5 text-[14px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red/10 border border-red/30 rounded-xl px-4 py-2.5 text-[13px] text-red text-center">
                {error}
              </div>
            )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-12 pb-10 px-5">
            <button
              onClick={handleAccountNext}
              className="w-full p-[15px] rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-black text-[16px] text-bg shadow-[0_8px_40px_rgba(0,214,143,0.4)] transition-all hover:-translate-y-0.5"
            >
              Weiter → Charakter wählen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen 3: Charakter wählen ───────────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(139,61,255,.4)_0%,transparent_55%),radial-gradient(ellipse_at_20%_60%,rgba(0,229,255,.12)_0%,transparent_40%)]" />

        <div className="relative z-20 px-5 py-3 flex items-center justify-between">
          <button
            onClick={() => { setStep(2); setError(null); }}
            className="text-[13px] font-bold text-muted bg-transparent border-none cursor-pointer"
          >
            ‹ Zurück
          </button>
          <StepDots current={3} total={5} />
        </div>

        <div className="relative z-10 flex-none h-[210px] flex flex-col items-center justify-end overflow-visible">
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[220px] h-[60px] rounded-full blur-[30px]"
            style={{ backgroundColor: selectedAvatar.color }}
          />
          <img
            src={selectedAvatar.img}
            alt={selectedAvatar.n}
            className="relative z-30 h-[240px] object-contain -mb-2.5"
          />
        </div>

        <div className="relative z-20 text-center px-5 pt-3">
          <div className="text-[22px] font-black text-white tracking-[-0.5px] drop-shadow-[0_0_40px_rgba(139,61,255,0.6)]">
            {selectedAvatar.n}
          </div>
        </div>

        <div className="relative z-20 px-4 pt-2 flex-1 overflow-y-auto no-scrollbar">
          <div className="font-mono text-[9px] text-muted tracking-[0.2em] uppercase mb-2.5">
            Wähle deinen Charakter — tippe zum Vorschauen
          </div>
          <div className="grid grid-cols-6 gap-1.5 pb-32">
            {AVATARS.map(a => (
              <div
                key={a.id}
                className="flex flex-col items-center gap-[3px] cursor-pointer group"
                onClick={() => setSelectedAvatar(a)}
              >
                <div className={clsx(
                  'w-12 h-12 rounded-xl bg-card border-[1.5px] flex items-center justify-center transition-all duration-150 overflow-hidden',
                  selectedAvatar.id === a.id
                    ? 'border-green border-2 bg-green/10 shadow-[0_0_16px_rgba(0,214,143,0.35)] scale-110'
                    : 'border-border group-hover:border-blue/50 group-hover:scale-110',
                )}>
                  <img src={a.img} alt={a.n} className="w-full h-full object-cover" />
                </div>
                <div className={clsx(
                  'text-[8px] font-bold text-center leading-[1.2]',
                  selectedAvatar.id === a.id ? 'text-green' : 'text-muted',
                )}>
                  {a.n}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-4 pb-8 px-5 z-30">
          <button
            onClick={() => setStep(4)}
            className="w-full p-[14px] rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-black text-[16px] text-bg shadow-[0_8px_30px_rgba(0,214,143,0.4)] transition-all hover:-translate-y-[2px] flex items-center justify-center gap-2.5"
          >
            <img src={selectedAvatar.img} alt={selectedAvatar.n} className="w-7 h-7 object-cover rounded-full" />
            <span>Weiter als {selectedAvatar.n}</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 4: Stil/Trikot wählen ─────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        {BG}
        <div className="relative z-10 px-5 pt-6 flex-1 flex flex-col">
          <button
            onClick={() => { setStep(3); setError(null); }}
            className="text-[13px] font-bold text-muted mb-4 text-left bg-transparent border-none cursor-pointer"
          >
            ‹ Zurück
          </button>

          <StepDots current={4} total={5} />

          <div className="text-[24px] font-black text-white leading-[1.1] mb-1">
            Trikot wählen
          </div>
          <div className="text-[12px] text-muted mb-5">
            In welchen Farben läufst du für den WM-Titel auf?
          </div>

          <div className="flex-1 flex flex-col gap-2.5">
            {/* Preview: character + selected jersey color */}
            <div className="flex items-center gap-4 bg-white/5 border border-border rounded-2xl p-4">
              <img
                src={selectedAvatar.img}
                alt={selectedAvatar.n}
                className="w-14 h-14 object-contain rounded-xl"
              />
              <div>
                <div className="text-[14px] font-black text-white">{selectedAvatar.n}</div>
                <div className="text-[11px] text-muted mt-0.5">{selectedBody.label}</div>
              </div>
              <div
                className={`ml-auto w-10 h-10 rounded-full bg-gradient-to-br ${selectedBody.bg} border-2`}
                style={{ borderColor: selectedBody.border }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5 mt-1">
              {BODY_STYLES.map(style => (
                <button
                  key={style.id}
                  onClick={() => setSelectedBody(style)}
                  className={clsx(
                    'flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all',
                    selectedBody.id === style.id
                      ? 'border-green bg-green/10 shadow-[0_0_20px_rgba(0,214,143,0.2)]'
                      : 'border-border bg-white/5 hover:border-blue/40',
                  )}
                >
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${style.bg}`} />
                  <span className="text-[10px] font-bold text-center leading-[1.2] text-white/80">
                    {style.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pb-8 pt-4">
            <button
              onClick={() => setStep(5)}
              className="w-full p-[15px] rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-black text-[16px] text-bg shadow-[0_8px_40px_rgba(0,214,143,0.4)] transition-all hover:-translate-y-0.5"
            >
              Weiter → Bestätigung
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen 5: Bestätigung ────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      {BG}
      <div className="relative z-10 px-5 pt-6 flex-1 flex flex-col">
        <button
          onClick={() => { setStep(4); setError(null); }}
          className="text-[13px] font-bold text-muted mb-4 text-left bg-transparent border-none cursor-pointer"
        >
          ‹ Zurück
        </button>

        <StepDots current={5} total={5} />

        <div className="text-[24px] font-black text-white leading-[1.1] mb-1">
          Alles klar?
        </div>
        <div className="text-[12px] text-muted mb-5">
          Überprüfe dein Profil — danach ist es gesperrt.
        </div>

        {/* Character preview */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="relative">
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[140px] h-[40px] rounded-full blur-[20px] opacity-60"
              style={{ backgroundColor: selectedAvatar.color }}
            />
            <img
              src={selectedAvatar.img}
              alt={selectedAvatar.n}
              className="relative z-10 h-[160px] w-auto object-contain"
            />
          </div>
          <div className="text-center">
            <div className="text-[20px] font-black text-white">{displayName || '—'}</div>
            <div className="text-[11px] text-muted mt-0.5">{email}</div>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${selectedBody.bg}`} />
              <span className="text-[11px] text-muted">{selectedBody.label}</span>
            </div>
          </div>
        </div>

        {/* Start credits */}
        <div className="bg-green/10 border border-green/25 rounded-2xl p-3.5 text-center mb-4">
          <div className="text-[11px] font-black text-green/70 tracking-[0.1em] uppercase mb-0.5">Startguthaben</div>
          <div className="font-mono text-[28px] font-black text-green">1.000 TKN</div>
        </div>

        {/* Warning */}
        <div className="bg-yellow/10 border border-yellow/25 rounded-xl p-3 mb-5">
          <div className="text-[11px] font-black text-yellow text-center">
            ⚠️ Diese Wahl kann nicht mehr geändert werden!
          </div>
          <div className="text-[10px] text-muted text-center mt-0.5">
            Charakter und Name sind nach der Registrierung gesperrt.
          </div>
        </div>

        {error && (
          <div className="bg-red/10 border border-red/30 rounded-xl px-4 py-2.5 text-[13px] text-red text-center mb-3">
            {error}
          </div>
        )}

        <button
          onClick={() => setShowFinalConfirm(true)}
          disabled={loading}
          className="w-full p-[15px] rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-black text-[16px] text-bg shadow-[0_8px_40px_rgba(0,214,143,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Konto wird erstellt…' : '✓ Registrieren & Spielen'}
        </button>

        <button
          onClick={() => { setStep(3); setError(null); }}
          className="w-full mt-3 text-[13px] font-bold text-muted underline underline-offset-2 bg-transparent border-none cursor-pointer"
        >
          Charakter doch noch ändern
        </button>
      </div>

      {/* ── Finale Bestätigung (letzte Rückzugsmöglichkeit) ─────────────────────── */}
      {showFinalConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[340px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <img
              src={selectedAvatar.img}
              alt={selectedAvatar.n}
              className="h-[90px] w-auto object-contain mb-3"
            />
            <div className="text-[20px] font-black text-white mb-2">Wirklich festlegen?</div>
            <div className="text-[13px] text-muted mb-2 leading-relaxed">
              <b className="text-white">{displayName}</b> als <b className="text-white">{selectedAvatar.n}</b> ({selectedBody.label}).
            </div>
            <div className="text-[11px] text-yellow font-bold uppercase tracking-wider mb-5">
              Charakter & Name sind danach dauerhaft gesperrt!
            </div>
            <div className="flex flex-col gap-2.5 w-full">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="w-full p-3.5 rounded-xl font-black text-bg bg-gradient-to-r from-green to-[#00A86E] shadow-[0_0_15px_rgba(0,214,143,0.4)] transition-all disabled:opacity-50"
              >
                {loading ? 'Konto wird erstellt…' : '✓ Ja, jetzt registrieren'}
              </button>
              <button
                onClick={() => setShowFinalConfirm(false)}
                disabled={loading}
                className="w-full p-3.5 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                ‹ Zurück — noch ändern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
