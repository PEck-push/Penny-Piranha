import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Falsche E-Mail oder falsches Passwort.';
    case 'auth/invalid-email':
      return 'Ungültige E-Mail-Adresse.';
    case 'auth/too-many-requests':
      return 'Zu viele Versuche. Bitte warte kurz und versuche es nochmal.';
    case 'auth/network-request-failed':
      return 'Netzwerkfehler. Bitte versuche es nochmal.';
    default:
      return 'Anmeldung fehlgeschlagen. Bitte versuche es nochmal.';
  }
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(mapFirebaseError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setError('Bitte gib zuerst deine E-Mail-Adresse ein.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
      setError(null);
    } catch {
      setError('Passwort-Reset fehlgeschlagen. Überprüfe die E-Mail-Adresse.');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(139,61,255,.35)_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,rgba(0,229,255,.15)_0%,transparent_45%),radial-gradient(ellipse_at_50%_100%,rgba(59,110,255,.2)_0%,transparent_50%)]" />

      <div className="relative z-10 px-5 pt-8 flex-1 flex flex-col">
        <div className="text-center pb-6">
          <div className="h-28 flex items-center justify-center">
            <span className="text-[92px] leading-none drop-shadow-[0_0_30px_rgba(0,214,143,0.5)] animate-[float_3s_ease-in-out_infinite]">🍺</span>
          </div>
          <div className="text-[20px] font-black text-white tracking-[-0.5px] mt-1">KRÜGERL PROPHETEN</div>
        </div>

        <div className="text-[26px] font-black text-white text-center leading-[1.1] mb-1">
          Willkommen zurück
        </div>
        <div className="text-[12px] text-muted mb-8 text-center">
          WM 2026 Tippspiel — melde dich an.
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-black text-muted tracking-[0.1em] uppercase">
              E-Mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="deine@email.com"
              required
              className="bg-white/5 border border-border rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-black text-muted tracking-[0.1em] uppercase">
              Passwort
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-white/5 border border-border rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-muted/40 outline-none focus:border-green/60 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red/10 border border-red/30 rounded-xl px-4 py-2.5 text-[13px] text-red text-center">
              {error}
            </div>
          )}

          {resetSent && (
            <div className="bg-green/10 border border-green/30 rounded-xl px-4 py-2.5 text-[13px] text-green text-center">
              Reset-E-Mail gesendet! Überprüfe dein Postfach.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full p-[15px] border-none rounded-[16px] bg-gradient-to-br from-green to-[#00A86E] font-sans text-[16px] font-black text-bg cursor-pointer tracking-[0.02em] shadow-[0_8px_40px_rgba(0,214,143,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_50px_rgba(0,214,143,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>

        <button
          onClick={handlePasswordReset}
          className="mt-3 text-[12px] text-muted/60 text-center underline underline-offset-2 cursor-pointer bg-transparent border-none"
        >
          Passwort vergessen?
        </button>

        <div className="mt-auto pb-10 text-center text-[13px] text-muted pt-8">
          Noch kein Account?{' '}
          <Link to="/register" className="text-green font-bold">
            Jetzt registrieren
          </Link>
        </div>
      </div>
    </div>
  );
}
