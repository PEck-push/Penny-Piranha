import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useStore } from './store';
import { isAdminEmail } from './config/admins';
import { initFirebaseSync, teardownFirebaseSync } from './services/db';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Cashout from './pages/Cashout';
import Profile from './pages/Profile';
import Rules from './pages/Rules';
import CharacterSetup from './components/CharacterSetup';

function MythicSparkles() {
  const stars = [
    { top: '12%', left: '18%', size: 10, delay: 0,   dur: 2.4 },
    { top: '20%', left: '78%', size: 14, delay: .6,  dur: 3.1 },
    { top: '34%', left: '40%', size: 8,  delay: 1.2, dur: 2.8 },
    { top: '48%', left: '12%', size: 12, delay: .3,  dur: 3.4 },
    { top: '58%', left: '86%', size: 9,  delay: 1.6, dur: 2.6 },
    { top: '68%', left: '30%', size: 13, delay: .9,  dur: 3.2 },
    { top: '76%', left: '64%', size: 8,  delay: 1.9, dur: 2.9 },
    { top: '86%', left: '22%', size: 11, delay: .5,  dur: 3.0 },
    { top: '28%', left: '58%', size: 7,  delay: 2.1, dur: 2.5 },
    { top: '82%', left: '82%', size: 10, delay: 1.4, dur: 3.3 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -inset-[20%]" style={{ animation: 'mythicDrift 14s ease-in-out infinite alternate' }}>
        {stars.map((s, i) => (
          <span key={i} className="absolute" style={{
            top: s.top, left: s.left, fontSize: s.size,
            color: i % 2 ? 'rgba(230,180,60,.9)' : 'rgba(167,123,255,.9)',
            animation: `mythicTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
            filter: 'drop-shadow(0 0 6px currentColor)',
          }}>✦</span>
        ))}
      </div>
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="relative w-full h-[100dvh] flex flex-col items-center justify-center bg-bg gap-12 px-8 overflow-hidden">
      <MythicSparkles />
      <img src="/logo-full.webp" alt="Krügerl Propheten — Das WM-Tippspiel"
        className="relative z-10 w-full max-w-[320px] h-auto" style={{ animation: 'auraGlow 3s ease-in-out infinite' }} />
      <div className="relative z-10 flex items-center gap-2.5 mt-4">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border border-transparent"
            style={{ borderTopColor: 'rgba(167,123,255,.9)', borderRightColor: 'rgba(230,180,60,.5)', animation: 'magicSpin 1.2s linear infinite' }} />
          <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[8px]" style={{ animation: 'sparkle 1.2s ease-in-out infinite' }}>✦</span>
        </div>
        <div className="font-mono text-[10px] text-muted tracking-[0.25em] uppercase animate-[puls_1.8s_ease-in-out_infinite]">Die Propheten beraten…</div>
      </div>
    </div>
  );
}

export default function App() {
  const currentUser = useStore(state => state.currentUser);
  const currentEmail = useStore(state => state.currentEmail);
  const setCurrentUser = useStore(state => state.setCurrentUser);
  const setCurrentEmail = useStore(state => state.setCurrentEmail);
  const players = useStore(state => state.players);
  const me = players.find(p => p.id === currentUser);
  // Admin-Check über BEIDE Quellen: Firestore-Profil-Email UND Firebase-Auth-Email.
  // Letztere ist die echte Login-Identität — fängt Fälle ab, in denen das Spieler-
  // dokument mal ohne Email-Feld angelegt wurde und Admins sonst ausgesperrt wären.
  const isAdmin = !!me?.isAdmin || isAdminEmail(me?.email) || isAdminEmail(currentEmail);
  // Erzwungene Charakter-Neuerstellung (z. B. nach Admin-Reset im Testmodus).
  const needsCharacter = !!currentUser && !!me && me.needsCharacter === true;
  const [authLoading, setAuthLoading] = useState(true);
  const [splashDone, setSplashDone]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) teardownFirebaseSync();
      setCurrentUser(firebaseUser?.uid ?? null);
      setCurrentEmail(firebaseUser?.email ?? null);
      if (firebaseUser) initFirebaseSync();
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Self-Heal: wenn der eingeloggte User per Auth-Email Admin ist, das Spieler-
  // dokument aber kein/anderes Email-Feld hat → still nachziehen, damit auch
  // Server-seitige Checks (go-live, kick-player) wieder greifen.
  useEffect(() => {
    if (!me?.id || !currentEmail) return;
    if (!isAdminEmail(currentEmail)) return;
    if ((me.email ?? '').toLowerCase() === currentEmail.toLowerCase()) return;
    import('firebase/firestore').then(({ doc, updateDoc }) =>
      import('./firebase').then(({ db }) => {
        if (!db) return;
        updateDoc(doc(db, 'players', me.id), { email: currentEmail }).catch(() => {});
      }),
    );
  }, [me?.id, me?.email, currentEmail]);

  if (!splashDone || authLoading) return <SplashScreen />;

  return (
    <BrowserRouter>
      <div className="w-full h-full flex flex-col items-center sm:justify-center">
        <div className="hidden sm:block text-center mb-6 shrink-0">
          <img src="/logo-full.webp" alt="Krügerl Propheten — Das WM-Tippspiel" className="h-[88px] w-auto mx-auto" />
        </div>
        <div className="w-full h-[100dvh] sm:h-[812px] sm:max-w-[375px] mx-auto bg-bg sm:rounded-[46px] overflow-hidden sm:border sm:border-white/5 sm:shadow-[0_50px_120px_rgba(0,0,0,0.85)] flex flex-col relative shrink-0 transform-gpu">
          <div className="hidden sm:block h-[44px] shrink-0 relative z-50" />
          <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col relative">
            {needsCharacter ? (
              <CharacterSetup />
            ) : (
            <Routes>
              <Route path="/" element={currentUser ? <Navigate to="/dashboard" /> : <Login />} />
              <Route path="/login" element={currentUser ? <Navigate to="/dashboard" /> : <Login />} />
              <Route path="/register" element={currentUser ? <Navigate to="/dashboard" /> : <Register />} />
              <Route path="/dashboard" element={currentUser ? <Dashboard /> : <Navigate to="/" />} />
              <Route path="/admin" element={currentUser && isAdmin ? <Admin /> : <Navigate to="/dashboard" />} />
              <Route path="/cashout" element={currentUser && isAdmin ? <Cashout /> : <Navigate to="/dashboard" />} />
              <Route path="/profile" element={currentUser ? <Profile /> : <Navigate to="/" />} />
              <Route path="/rules" element={currentUser ? <Rules /> : <Navigate to="/" />} />
            </Routes>
            )}
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
