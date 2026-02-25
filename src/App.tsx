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

    // ── Restore session from cookie on page load / refresh ──
    if (!useStore.getState().currentUser) {
      const session = readSessionCookie();
      if (session) {
        login(session.playerId, session.avatar, session.avatarColor);
      }
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="w-full h-full flex flex-col items-center sm:justify-center">
        <div className="hidden sm:block text-center mb-6 shrink-0">
          <div className="font-mono text-[9px] text-[#2A3555] tracking-[0.3em] uppercase">The Prediction Pit</div>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <div className="w-[32px] h-[32px] rounded-full bg-[radial-gradient(135deg,#00D68F,#00A86E)] flex items-center justify-center text-[16px] shadow-[0_0_20px_rgba(0,214,143,0.55),0_0_40px_rgba(0,214,143,0.2)] animate-[breathe_3s_ease-in-out_infinite]">🐼</div>
            <span className="text-[24px] font-black text-white tracking-[-1px]">BETPANDA</span>
          </div>
        </div>

        <div className="w-full h-[100dvh] sm:h-[812px] sm:max-w-[375px] mx-auto bg-bg sm:rounded-[46px] overflow-hidden sm:border sm:border-white/5 sm:shadow-[0_50px_120px_rgba(0,0,0,0.85),0_0_0_1px_rgba(59,110,255,0.07),0_0_80px_rgba(59,110,255,0.05)] flex flex-col relative shrink-0 transform-gpu">
          {/* Status Bar Spacer */}
          <div className="hidden sm:block h-[44px] shrink-0 relative z-50" />

          {/* Content */}
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
