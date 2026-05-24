import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useStore } from './store';
import { initFirebaseSync } from './services/db';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Cashout from './pages/Cashout';
import Profile from './pages/Profile';

function SplashScreen() {
  return (
    <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-bg gap-8 px-8">
      <img src="/logo-full.webp" alt="Krügerl Propheten — Das WM-Tippspiel"
        className="w-full max-w-[320px] h-auto" style={{ animation: 'auraGlow 3s ease-in-out infinite' }} />
      <div className="flex items-center gap-2.5">
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
  const setCurrentUser = useStore(state => state.setCurrentUser);
  const [authLoading, setAuthLoading] = useState(true);
  const [splashDone, setSplashDone]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setCurrentUser(firebaseUser?.uid ?? null);
      if (firebaseUser) initFirebaseSync();
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

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
            <Routes>
              <Route path="/" element={currentUser ? <Navigate to="/dashboard" /> : <Login />} />
              <Route path="/login" element={currentUser ? <Navigate to="/dashboard" /> : <Login />} />
              <Route path="/register" element={currentUser ? <Navigate to="/dashboard" /> : <Register />} />
              <Route path="/dashboard" element={currentUser ? <Dashboard /> : <Navigate to="/" />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/cashout" element={<Cashout />} />
              <Route path="/profile" element={currentUser ? <Profile /> : <Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
