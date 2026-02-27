import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore, readSessionCookie } from './store';
import { initFirebaseSync } from './services/db';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Cashout from './pages/Cashout';

export default function App() {
  const currentUser = useStore(state => state.currentUser);
  const login = useStore(state => state.login);

  useEffect(() => {
    initFirebaseSync();
    // Wait for first Firebase sync, then restore session only if Firebase confirms loggedIn
    setTimeout(() => {
      if (!useStore.getState().currentUser) {
        const session = readSessionCookie();
        if (session) {
          const players = useStore.getState().players;
          const player = players.find(p => p.id === session.playerId);
          // Only restore if Firebase still has this player as loggedIn
          if (player?.loggedIn) {
            login(session.playerId, session.avatar, session.avatarColor, player.avatarId ?? '');
          } else {
            // Reset was done — clear stale cookie
            import('./store').then(m => m.clearSessionCookie());
          }
        }
      }
    }, 1200);
  }, []);

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