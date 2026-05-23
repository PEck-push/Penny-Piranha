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
      <div className="w-full h-[100dvh] flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="w-full h-full flex flex-col items-center sm:justify-center">
        <div className="hidden sm:block text-center mb-6 shrink-0">
          <div className="font-mono text-[9px] text-[#2A3555] tracking-[0.3em] uppercase">The Prediction Pit</div>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <img src="/pp3.webp" alt="Penny Piranha" className="w-[32px] h-[32px] object-contain animate-[breathe_3s_ease-in-out_infinite]" />
            <span className="text-[24px] font-black text-white tracking-[-1px]">PENNY PIRANHA</span>
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
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
