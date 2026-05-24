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

export default function App() {
  const currentUser = useStore(state => state.currentUser);
  const setCurrentUser = useStore(state => state.setCurrentUser);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setCurrentUser(firebaseUser?.uid ?? null);
      // Firestore listeners require an authenticated session (security rules).
      // Initialise them only once a user is confirmed — otherwise the initial
      // listeners die with permission-denied and never recover until a refresh.
      if (firebaseUser) initFirebaseSync();
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  if (authLoading) {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-bg gap-5">
        <div className="relative w-20 h-20">
          {/* rotierender Magie-Ring */}
          <div className="absolute inset-0 rounded-full border-2 border-transparent"
               style={{ borderTopColor: 'rgba(167,123,255,.9)', borderRightColor: 'rgba(0,214,143,.5)', animation: 'magicSpin 1.4s linear infinite' }} />
          <div className="absolute inset-2 rounded-full border border-transparent"
               style={{ borderBottomColor: 'rgba(0,229,255,.7)', animation: 'magicSpin 2s linear infinite reverse' }} />
          {/* funkelnde Sterne auf der Bahn */}
          <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[12px]" style={{ animation: 'sparkle 1.5s ease-in-out infinite' }}>✦</span>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px]" style={{ animation: 'sparkle 1.5s ease-in-out .5s infinite' }}>✦</span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[9px]" style={{ animation: 'sparkle 1.5s ease-in-out .9s infinite' }}>✧</span>
          {/* Krügerl in der Mitte */}
          <div className="absolute inset-0 flex items-center justify-center text-[28px]" style={{ animation: 'auraGlow 2.4s ease-in-out infinite' }}>🍺</div>
        </div>
        <div className="font-mono text-[10px] text-muted tracking-[0.3em] uppercase animate-[puls_1.8s_ease-in-out_infinite]">Die Propheten beraten…</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="w-full h-full flex flex-col items-center sm:justify-center">
        <div className="hidden sm:block text-center mb-6 shrink-0">
          <div className="font-mono text-[9px] text-[#2A3555] tracking-[0.3em] uppercase">Das WM-Tippspiel</div>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className="text-[28px] animate-[breathe_3s_ease-in-out_infinite]">🍺</span>
            <span className="text-[24px] font-black text-white tracking-[-1px]">KRÜGERL PROPHETEN</span>
          </div>
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
