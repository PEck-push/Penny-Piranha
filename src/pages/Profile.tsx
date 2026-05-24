import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { auth } from '../firebase';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { BADGE_LABELS } from '../store';
import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';

const STREAK_LABELS: Record<string, string> = {
  none:   '—',
  warm:   '🌡️ Warm',
  hot:    '🔥 On Fire',
  inferno:'🔥🔥 Inferno',
};

export default function Profile() {
  const navigate  = useNavigate();
  const me        = useStore(s => s.players.find(p => p.id === s.currentUser));
  const players   = useStore(s => s.players);
  const bets      = useStore(s => s.bets);
  const markets   = useStore(s => s.markets);
  const logoutAuth = useStore(s => s.logoutAuth);

  // ── Passwort-Änderung ────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus,  setPwStatus]  = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [pwError,   setPwError]   = useState('');
  const [showPw,    setShowPw]    = useState(false);

  if (!me) return null;

  // ── Stats berechnen ──────────────────────────────────────────────────
  const sorted = [...players].sort((a, b) => b.tokens - a.tokens);
  const rank   = sorted.findIndex(p => p.id === me.id) + 1;

  const myBets     = bets.filter(b => b.playerId === me.id && b.amount > 0);
  const myFreeTips = bets.filter(b => b.playerId === me.id && b.amount === 0).length;

  const resolvedBets = myBets.filter(b => {
    const m = markets.find(mk => mk.id === b.marketId);
    return m?.status === 'resolved' && m.winningOptionId != null;
  });
  const wins     = resolvedBets.filter(b => {
    const m = markets.find(mk => mk.id === b.marketId);
    return m?.winningOptionId === b.optionId;
  });
  const winRate  = resolvedBets.length > 0 ? Math.round((wins.length / resolvedBets.length) * 100) : null;

  const openBetsValue = bets
    .filter(b => b.playerId === me.id && markets.find(m => m.id === b.marketId)?.status === 'open')
    .reduce((s, b) => s + b.amount, 0);

  // ── Passwort ändern ──────────────────────────────────────────────────
  const handlePasswordChange = async () => {
    setPwError('');
    if (newPw.length < 6) { setPwError('Mindestens 6 Zeichen.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwörter stimmen nicht überein.'); return; }
    const user = auth.currentUser;
    if (!user?.email) { setPwError('Kein Auth-Account gefunden.'); return; }
    setPwStatus('loading');
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setPwStatus('ok');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      setPwStatus('error');
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwError('Aktuelles Passwort falsch.');
      } else {
        setPwError('Fehler: ' + (err.message ?? err.code));
      }
    }
  };

  const BG = (
    <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(139,61,255,.3)_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,rgba(0,229,255,.12)_0%,transparent_45%),radial-gradient(ellipse_at_50%_100%,rgba(59,110,255,.18)_0%,transparent_50%)]" />
  );

  return (
    <div className="flex-1 flex flex-col bg-bg relative overflow-y-auto no-scrollbar">
      {BG}

      {/* Header */}
      <div className="relative z-10 px-4 pt-4 pb-2 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/dashboard')}
          className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[17px] font-black text-white">Mein Profil</span>
      </div>

      {/* Avatar + Name */}
      <div className="relative z-10 flex flex-col items-center pt-2 pb-5 shrink-0">
        <div className="w-[140px] h-[140px] mb-3">
          {me.avatar
            ? <img src={me.avatar} alt={me.name} className="w-full h-full object-contain" style={{ animation: 'auraGlow 4s ease-in-out infinite' }} />
            : <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center text-[48px]" style={{ animation: 'auraGlow 4s ease-in-out infinite' }}>🍺</div>
          }
        </div>
        <div className="text-[22px] font-black text-white tracking-[-0.5px]">{me.name}</div>
        {me.email && <div className="text-[12px] text-muted mt-0.5">{me.email}</div>}
        {me.badges.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-2 px-6">
            {me.badges.map(b => (
              <span key={b} className="text-[10px] font-black text-yellow bg-yellow/10 border border-yellow/25 rounded-full px-2 py-0.5">
                {BADGE_LABELS[b]}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col gap-3 px-4 pb-8">

        {/* Token & Rang */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-3">Guthaben & Rang</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center bg-white/3 rounded-xl p-3 border border-white/8">
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1">Frei</span>
              <span className="text-[18px]">🪙</span>
              <span className="font-mono text-[15px] font-black text-green mt-0.5">{me.tokens}</span>
            </div>
            <div className="flex flex-col items-center bg-white/3 rounded-xl p-3 border border-white/8">
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1">Gesamt</span>
              <span className="text-[18px]">💰</span>
              <span className="font-mono text-[15px] font-black text-white mt-0.5">{me.tokens + openBetsValue}</span>
            </div>
            <div className="flex flex-col items-center bg-white/3 rounded-xl p-3 border border-white/8">
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider mb-1">Rang</span>
              <span className="text-[18px]">🏆</span>
              <span className="font-mono text-[15px] font-black text-yellow mt-0.5">#{rank}</span>
            </div>
          </div>
        </div>

        {/* Wett-Statistiken */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-3">Wett-Statistik</div>
          <div className="grid grid-cols-2 gap-2">
            <StatRow icon="🎯" label="Wetten gesamt" value={myBets.length} />
            <StatRow icon="✅" label="Richtig" value={wins.length} />
            <StatRow icon="📊" label="Trefferquote" value={winRate !== null ? `${winRate}%` : '—'} />
            <StatRow icon="🆓" label="Gratis-Tipps" value={myFreeTips} />
          </div>
        </div>

        {/* Streak */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-3">Streak</div>
          <div className="grid grid-cols-3 gap-2">
            <StatRow icon="⚡" label="Aktuell" value={me.currentStreak ?? 0} />
            <StatRow icon="🏅" label="Bester" value={me.bestStreak ?? 0} />
            <StatRow icon="🌡️" label="Level" value={STREAK_LABELS[me.streakLevel ?? 'none']} small />
          </div>
        </div>

        {/* Österreich & Underdog */}
        {((me.austriaSpecialCorrect ?? 0) > 0 || (me.underdogCorrect ?? 0) > 0) && (
          <div className="bg-card border border-[#EF3340]/20 rounded-2xl p-4">
            <div className="text-[10px] font-black text-[#EF3340] tracking-[0.15em] uppercase mb-3">Sonder-Erfolge</div>
            <div className="grid grid-cols-2 gap-2">
              <StatRow icon="🇦🇹" label="Österreich ✓" value={me.austriaSpecialCorrect ?? 0} />
              <StatRow icon="💪" label="Underdog-Wins" value={me.underdogCorrect ?? 0} />
            </div>
          </div>
        )}

        {/* Passwort ändern */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black text-muted tracking-[0.15em] uppercase mb-3">Passwort ändern</div>
          <div className="flex flex-col gap-2.5">
            <PwInput label="Aktuelles Passwort" value={currentPw} onChange={setCurrentPw} show={showPw} onToggle={() => setShowPw(v => !v)} />
            <PwInput label="Neues Passwort" value={newPw} onChange={setNewPw} show={showPw} onToggle={() => setShowPw(v => !v)} />
            <PwInput label="Bestätigen" value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(v => !v)} />

            {pwError && (
              <div className="bg-red/10 border border-red/30 rounded-xl px-3 py-2 text-[12px] text-red">{pwError}</div>
            )}
            {pwStatus === 'ok' && (
              <div className="bg-green/10 border border-green/30 rounded-xl px-3 py-2 text-[12px] text-green">✓ Passwort erfolgreich geändert.</div>
            )}

            <button onClick={handlePasswordChange} disabled={pwStatus === 'loading' || !currentPw || !newPw || !confirmPw}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple2 to-blue2 font-black text-[14px] text-white shadow-[0_4px_24px_rgba(139,61,255,0.35)] transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed">
              {pwStatus === 'loading'
                ? <span className="inline-flex items-center gap-2"><span className="inline-block" style={{ animation: 'runeSpin .9s linear infinite' }}>✦</span> Wird geändert…</span>
                : 'Passwort ändern'}
            </button>
          </div>
        </div>

        {/* Abmelden */}
        <button onClick={() => logoutAuth().then(() => navigate('/'))}
          className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/10 text-[14px] font-black text-muted hover:text-white hover:border-white/20 transition-all">
          Abmelden
        </button>

      </div>
    </div>
  );
}

function StatRow({ icon, label, value, small }: { icon: string; label: string; value: string | number; small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 bg-white/3 rounded-xl px-3 py-2.5 border border-white/8">
      <span className="text-[16px] shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className="text-[9px] font-bold text-muted uppercase tracking-wide leading-none">{label}</span>
        <span className={clsx('font-black text-white leading-tight mt-0.5', small ? 'text-[11px]' : 'text-[14px]')}>{value}</span>
      </div>
    </div>
  );
}

function PwInput({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black text-muted tracking-[0.1em] uppercase">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-white/5 border border-border rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-muted/40 outline-none focus:border-purple2/60 transition-colors pr-12"
          placeholder="••••••••"
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors text-[11px] font-bold">
          {show ? 'hide' : 'show'}
        </button>
      </div>
    </div>
  );
}
