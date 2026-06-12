import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { clsx } from 'clsx';
import { auth, db } from '../firebase';
import { useStore } from '../store';
import type { StreakLevel } from '../store';
import { CHARACTER_MODE, HEADS, OUTFITS, isAsvHead, prettyName, headZoomStyle } from '../data/characterParts';

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

// Anzahl Schritte hängt vom Charakter-Modus ab:
//   fallback → Code, Konto, Charakter, Bestätigung      = 4
//   builder  → Code, Konto, Kopf, Outfit, Bestätigung   = 5
const TOTAL_STEPS = CHARACTER_MODE === 'builder' ? 5 : 4;
const CONFIRM_STEP = TOTAL_STEPS;

// Slug für die eindeutige Namens-Reservierung (Firestore-Doc-ID).
// Muss identisch zur Logik in der Kick-Function (kick-player.ts) sein.
export const nameSlug = (name: string) =>
  name.trim().toLowerCase().replace(/[/.#$[\]]/g, '_');

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

// ─── Anmeldeschluss ────────────────────────────────────────────────────────────
// Hard-Cutoff fuer neue Registrierungen: 10.06.2026 00:00 Wiener Zeit (CEST).
// CEST = UTC+2 im Sommer → 09.06.2026 22:00 UTC.
// Wer NACH diesem Zeitpunkt den Einladungscode eingibt, kommt nicht weiter.
const REGISTRATION_DEADLINE_MS = Date.UTC(2026, 5, 9, 22, 0, 0); // 9. Juni 2026, 22:00 UTC

// ─── Main component ────────────────────────────────────────────────────────────
export default function Register() {
  const navigate = useNavigate();
  const registerPlayer = useStore(s => s.registerPlayer);
  const setCurrentUser = useStore(s => s.setCurrentUser);
  const whatsappGroupLink = useStore(s => s.whatsappGroupLink);

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

  // Charakter — Fallback (1 Schritt)
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);

  // Charakter — Builder (2 Schritte): Kopf + Outfit
  const [selectedHead, setSelectedHead] = useState(HEADS.includes('Toni') ? 'Toni' : (HEADS[0] ?? ''));
  const [selectedOutfit, setSelectedOutfit] = useState(OUTFITS[0] ?? '');
  // Kopf-Kategorie: 'person' (Persönlichkeiten, Standard) oder 'asv'
  const [headCategory, setHeadCategory] = useState<'person' | 'asv'>('person');


  const displayName = [firstName, lastName].filter(Boolean).join(' ');

  // ── Step 1: Invite code validation ──────────────────────────────────────────
  const handleInviteCode = async () => {
    setError(null);
    setLoading(true);
    try {
      // Hard-Cutoff: nach Anmeldeschluss generell keine neuen Spieler mehr.
      // Pruefung VOR dem Firestore-Read, damit Late-Comers nicht erst Code
      // raten muessen, um "geschlossen" zu sehen.
      if (Date.now() >= REGISTRATION_DEADLINE_MS) {
        setError('Anmeldeschluss war am 10.06.2026 — nachträgliche Anmeldungen sind nicht mehr möglich. Bitte direkt beim Admin melden.');
        return;
      }
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
    // Zweite Anmeldeschluss-Pruefung: falls jemand im Registrier-Flow steckt,
    // waehrend der Cutoff vorbei zieht, hier blockieren.
    if (Date.now() >= REGISTRATION_DEADLINE_MS) {
      setError('Anmeldeschluss war am 10.06.2026 — nachträgliche Anmeldungen sind nicht mehr möglich. Bitte direkt beim Admin melden.');
      return;
    }
    setLoading(true);
    try {
      // Falls der Auth-Account noch existiert (z.B. nach einem Reset, der nur
      // das Spieler-Dokument gelöscht hat), melden wir uns an und legen das
      // Profil neu an — statt mit "E-Mail bereits vergeben" zu scheitern.
      let uid: string;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        uid = cred.user.uid;
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-in-use') {
          const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
          uid = cred.user.uid;
        } else {
          throw createErr;
        }
      }

      // Rückkehrer-Schutz: existiert bereits ein Spieler-Dokument für diese uid
      // (z. B. erneute Registrierung mit bestehender E-Mail), NICHT überschreiben
      // — sonst gingen Guthaben/Streak/Freigabe verloren. Einfach einloggen.
      const existing = await getDoc(doc(db, 'players', uid));
      if (existing.exists()) {
        setCurrentUser(uid);
        navigate('/dashboard');
        return;
      }

      // Name muss eindeutig sein (case-insensitive) — transaktional über eine
      // Reservierung in `usernames/{slug}`. Das verhindert die Race-Condition
      // bei gleichzeitigen Anmeldungen (zwei Clients können denselben Namen
      // nicht beide gewinnen, da die Transaction auf demselben Doc serialisiert).
      const slug = nameSlug(displayName);
      try {
        await runTransaction(db, async tx => {
          const uref = doc(db, 'usernames', slug);
          const usnap = await tx.get(uref);
          if (usnap.exists() && (usnap.data() as any).uid !== uid) {
            throw new Error('NAME_TAKEN');
          }
          tx.set(uref, { uid, name: displayName.trim(), createdAt: Date.now() });
        });
      } catch (txErr: any) {
        if (txErr?.message === 'NAME_TAKEN') {
          await signOut(auth).catch(() => {});
          setError('Dieser Name ist bereits vergeben. Bitte wähle einen anderen.');
          setStep(2);
          setLoading(false);
          return;
        }
        throw txErr;
      }

      // Charakter-Felder je nach Modus: Fallback speichert das vorhandene
      // Avatar-Bild, Builder die Kopf-/Outfit-IDs (CharacterAvatar setzt sie zusammen).
      const characterFields = CHARACTER_MODE === 'builder'
        ? { avatar: '', avatarId: '', avatarColor: '', headId: selectedHead, bodyId: selectedOutfit }
        : { avatar: selectedAvatar.img, avatarId: selectedAvatar.id, avatarColor: selectedAvatar.color };

      await registerPlayer(uid, {
        name: displayName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        ...characterFields,
        loggedIn: true,
        tokens: 1000,
        comboMalus: false,
        badges: [],
        buybackUsed: false,
        characterLocked: false,
        approved: false,
        onboardingDone: false,
        currentStreak: 0,
        bestStreak: 0,
        streakLevel: 'none' as StreakLevel,
        streakHistory: [],
        underdogCorrect: 0,
        austriaSpecialCorrect: 0,
        dailyNetGain: 0,
        matchdayNetGain: 0,
        unseenResolutions: [],
        unlockedOverlays: [],
        activeAccessoryId: null,
        activeBadgeId: null,
      });

      navigate('/dashboard');
    } catch (err: any) {
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('Diese E-Mail ist bereits registriert. Bitte melde dich an.');
          break;
        case 'auth/invalid-email':
          setError('Ungültige E-Mail-Adresse.');
          break;
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          setError('Diese E-Mail existiert bereits, aber das Passwort stimmt nicht. Nutze dein bisheriges Passwort oder „Passwort vergessen?" beim Login.');
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
            <img src="/logo-full.webp" alt="Krügerl Propheten — Das WM-Tippspiel" className="h-24 w-auto mx-auto" style={{ animation: 'auraGlow 4s ease-in-out infinite' }} />
          </div>

          <StepDots current={1} total={TOTAL_STEPS} />

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
              className="w-full p-[15px] rounded-[16px] bg-gradient-to-br from-green to-[#B8860B] font-black text-[16px] text-bg shadow-[0_8px_40px_rgba(230,180,60,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <span className="inline-flex items-center gap-2 justify-center"><span className="inline-block" style={{ animation: 'runeSpin .9s linear infinite' }}>✦</span> Prüfen…</span> : 'Weiter →'}
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

          <StepDots current={2} total={TOTAL_STEPS} />

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
              className="w-full p-[15px] rounded-[16px] bg-gradient-to-br from-green to-[#B8860B] font-black text-[16px] text-bg shadow-[0_8px_40px_rgba(230,180,60,0.4)] transition-all hover:-translate-y-0.5"
            >
              Weiter → Charakter wählen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Builder Schritt 1: Kopf wählen ───────────────────────────────────────────
  if (step === 3 && CHARACTER_MODE === 'builder') {
    const personHeads = HEADS.filter(h => !isAsvHead(h));
    const asvHeads = HEADS.filter(h => isAsvHead(h));
    const hasBothCats = personHeads.length > 0 && asvHeads.length > 0;
    const shownHeads = hasBothCats ? (headCategory === 'asv' ? asvHeads : personHeads) : HEADS;
    return (
      <div className="flex-1 flex flex-col bg-bg relative overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(139,61,255,.4)_0%,transparent_55%),radial-gradient(ellipse_at_20%_60%,rgba(0,229,255,.12)_0%,transparent_40%)]" />

        <div className="relative z-20 px-5 py-3 flex items-center justify-between">
          <button onClick={() => { setStep(2); setError(null); }}
            className="text-[13px] font-bold text-muted bg-transparent border-none cursor-pointer">‹ Zurück</button>
          <StepDots current={3} total={TOTAL_STEPS} />
        </div>

        <div className="relative z-10 flex-none h-[210px] flex items-end justify-center overflow-visible">
          {selectedHead
            ? <div className="relative z-30 w-[210px] h-[210px] overflow-hidden">
                <img src={`/characters/heads/${encodeURIComponent(selectedHead)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain" style={headZoomStyle} />
              </div>
            : <div className="text-[13px] text-muted self-center">Noch keine Köpfe hinterlegt</div>}
        </div>

        <div className="relative z-20 text-center px-5 pt-3">
          {selectedHead
            ? <div className="text-[22px] font-black text-white drop-shadow-[0_0_40px_rgba(139,61,255,0.6)]">{prettyName(selectedHead)}</div>
            : <div className="text-[22px] font-black text-white drop-shadow-[0_0_40px_rgba(139,61,255,0.6)]">Kopf wählen</div>}
          {selectedHead && <div className="text-[11px] text-muted mt-0.5">Kopf wählen</div>}
        </div>

        <div className="relative z-20 px-4 pt-2 flex-1 overflow-y-auto no-scrollbar">
          <div className="font-mono text-[9px] text-muted tracking-[0.2em] uppercase mb-2.5">Schritt 1 von 2 — Kopf</div>

          {/* Kategorie-Tabs (nur wenn beide Kategorien vorhanden sind) */}
          {hasBothCats && (
            <div className="flex gap-1.5 mb-3">
              {([['person', 'Persönlichkeiten'], ['asv', 'ASV']] as const).map(([cat, label]) => (
                <button key={cat} onClick={() => setHeadCategory(cat)}
                  className={clsx('flex-1 py-2 rounded-xl text-[11px] font-black transition-all border',
                    headCategory === cat ? 'bg-white/10 text-white border-white/15' : 'text-muted border-transparent hover:text-white')}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 pb-32">
            {shownHeads.map(id => (
              <div key={id} className="flex flex-col items-center cursor-pointer group" onClick={() => setSelectedHead(id)}>
                <div className={clsx('relative w-16 h-16 rounded-xl bg-card border-[1.5px] overflow-hidden transition-all',
                  selectedHead === id ? 'border-green border-2 bg-green/10 shadow-[0_0_16px_rgba(230,180,60,0.35)] scale-105' : 'border-border group-hover:border-blue/50 group-hover:scale-105')}>
                  <img src={`/characters/heads/${encodeURIComponent(id)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain" style={headZoomStyle} />
                </div>
                <div className="text-[8px] font-bold text-center leading-[1.2] text-muted mt-[3px] truncate w-full">{prettyName(id)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-4 pb-8 px-5 z-30">
          <button onClick={() => setStep(4)} disabled={!selectedHead}
            className="w-full p-[14px] rounded-[16px] bg-gradient-to-br from-green to-[#B8860B] font-black text-[16px] text-bg shadow-[0_8px_30px_rgba(230,180,60,0.4)] transition-all hover:-translate-y-[2px] disabled:opacity-40">
            Weiter → Outfit wählen
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 3: Charakter wählen (Fallback) ────────────────────────────────────
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
          <StepDots current={3} total={TOTAL_STEPS} />
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
                    ? 'border-green border-2 bg-green/10 shadow-[0_0_16px_rgba(230,180,60,0.35)] scale-110'
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
            className="w-full p-[14px] rounded-[16px] bg-gradient-to-br from-green to-[#B8860B] font-black text-[16px] text-bg shadow-[0_8px_30px_rgba(230,180,60,0.4)] transition-all hover:-translate-y-[2px] flex items-center justify-center gap-2.5"
          >
            <img src={selectedAvatar.img} alt={selectedAvatar.n} className="w-7 h-7 object-cover rounded-full" />
            <span>Weiter als {selectedAvatar.n}</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Builder Schritt 2: Outfit wählen ─────────────────────────────────────────
  if (step === 4 && CHARACTER_MODE === 'builder') {
    return (
      <div className="flex-1 flex flex-col bg-bg relative overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(139,61,255,.4)_0%,transparent_55%),radial-gradient(ellipse_at_20%_60%,rgba(0,229,255,.12)_0%,transparent_40%)]" />

        <div className="relative z-20 px-5 py-3 flex items-center justify-between">
          <button onClick={() => { setStep(3); setError(null); }}
            className="text-[13px] font-bold text-muted bg-transparent border-none cursor-pointer">‹ Zurück</button>
          <StepDots current={4} total={TOTAL_STEPS} />
        </div>

        {/* Live-Vorschau: Outfit + Kopf übereinander */}
        <div className="relative z-10 flex-none h-[210px] flex items-end justify-center overflow-visible">
          <div className="relative h-[240px] w-[240px] -mb-2.5">
            {selectedOutfit && <img src={`/characters/outfits/${encodeURIComponent(selectedOutfit)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain z-20" />}
            {selectedHead && <img src={`/characters/heads/${encodeURIComponent(selectedHead)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain z-30" />}
            {!selectedOutfit && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted">Noch keine Outfits hinterlegt</div>}
          </div>
        </div>

        <div className="relative z-20 text-center px-5 pt-3">
          <div className="text-[22px] font-black text-white drop-shadow-[0_0_40px_rgba(139,61,255,0.6)]">Outfit wählen</div>
        </div>

        <div className="relative z-20 px-4 pt-2 flex-1 overflow-y-auto no-scrollbar">
          <div className="font-mono text-[9px] text-muted tracking-[0.2em] uppercase mb-2.5">Schritt 2 von 2 — Outfit</div>
          <div className="grid grid-cols-4 gap-2 pb-32">
            {OUTFITS.map(id => (
              <div key={id} className="flex flex-col items-center cursor-pointer group" onClick={() => setSelectedOutfit(id)}>
                <div className={clsx('w-16 h-16 rounded-xl bg-card border-[1.5px] flex items-center justify-center transition-all overflow-hidden',
                  selectedOutfit === id ? 'border-green border-2 bg-green/10 shadow-[0_0_16px_rgba(230,180,60,0.35)] scale-105' : 'border-border group-hover:border-blue/50 group-hover:scale-105')}>
                  <img src={`/characters/outfits/${encodeURIComponent(id)}.webp`} alt="" className="w-full h-full object-contain" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-4 pb-8 px-5 z-30">
          <button onClick={() => setStep(5)} disabled={!selectedOutfit}
            className="w-full p-[14px] rounded-[16px] bg-gradient-to-br from-green to-[#B8860B] font-black text-[16px] text-bg shadow-[0_8px_30px_rgba(230,180,60,0.4)] transition-all hover:-translate-y-[2px] disabled:opacity-40">
            Weiter → Bestätigung
          </button>
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
          onClick={() => { setStep(CHARACTER_MODE === 'builder' ? 4 : 3); setError(null); }}
          className="text-[13px] font-bold text-muted mb-4 text-left bg-transparent border-none cursor-pointer"
        >
          ‹ Zurück
        </button>

        <StepDots current={CONFIRM_STEP} total={TOTAL_STEPS} />

        <div className="text-[24px] font-black text-white leading-[1.1] mb-1">
          Alles klar?
        </div>
        <div className="text-[12px] text-muted mb-5">
          Überprüfe dein Profil. Dein <b className="text-white">Name ist fix &amp; einmalig</b>.
        </div>

        {/* Character preview */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="relative">
            {CHARACTER_MODE === 'builder' ? (
              <div className="relative h-[160px] w-[160px] z-10">
                {selectedOutfit && <img src={`/characters/outfits/${encodeURIComponent(selectedOutfit)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain z-20" />}
                {selectedHead && <img src={`/characters/heads/${encodeURIComponent(selectedHead)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain z-30" />}
              </div>
            ) : (
              <>
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[140px] h-[40px] rounded-full blur-[20px] opacity-60"
                  style={{ backgroundColor: selectedAvatar.color }}
                />
                <img
                  src={selectedAvatar.img}
                  alt={selectedAvatar.n}
                  className="relative z-10 h-[160px] w-auto object-contain"
                />
              </>
            )}
          </div>
          <div className="text-center">
            <div className="text-[20px] font-black text-white">{displayName || '—'}</div>
            <div className="text-[11px] text-muted mt-0.5">{email}</div>
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
            ⏳ Freischaltung durch den Admin nötig
          </div>
          <div className="text-[10px] text-muted text-center mt-0.5">
            Nach der Registrierung wirst du vom Admin freigegeben (nach Einzahlung).
            Dein <b className="text-white/80">Name</b> ist einmalig und fix.
          </div>
        </div>

        {whatsappGroupLink && (
          <a
            href={whatsappGroupLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-green/10 border border-green/25 rounded-2xl p-3.5 text-green font-black text-[14px] mb-4 no-underline"
          >
            💬 WhatsApp-Gruppe beitreten →
          </a>
        )}

        {error && (
          <div className="bg-red/10 border border-red/30 rounded-xl px-4 py-2.5 text-[13px] text-red text-center mb-3">
            {error}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full p-[15px] rounded-[16px] bg-gradient-to-br from-green to-[#B8860B] font-black text-[16px] text-bg shadow-[0_8px_40px_rgba(230,180,60,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <span className="inline-flex items-center gap-2 justify-center"><span className="inline-block" style={{ animation: 'runeSpin .9s linear infinite' }}>✦</span> Konto wird beschworen…</span> : '✓ Registrieren & Spielen'}
        </button>

        <button
          onClick={() => { setStep(3); setError(null); }}
          className="w-full mt-3 text-[13px] font-bold text-muted underline underline-offset-2 bg-transparent border-none cursor-pointer"
        >
          Charakter doch noch ändern
        </button>
      </div>
    </div>
  );
}
