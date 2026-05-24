import { useState } from 'react';
import { useStore, MarketOption } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { WM2026_GROUP_SCHEDULE } from '../data/wm2026Schedule';
import type { ScheduleMatch } from '../store';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { deName } from '../utils/teams';
import { getLimits, type Phase } from '../utils/phase';
import { INTERNATIONAL_SPECIALS, JACKPOT_TEMPLATES, JACKPOT_BLOCK_LABELS, type SpecialBetTemplate } from '../data/specialBets';
import { isAdminEmail } from '../config/admins';

const GROUP_LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

const toCEST = (ts: number) => {
  const d = new Date(ts + 2 * 60 * 60 * 1000);
  return `${d.getUTCDate().toString().padStart(2,'0')}.${(d.getUTCMonth()+1).toString().padStart(2,'0')}. ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')} CEST`;
};

export default function Admin() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  // Schedule import from football-data.org API (via Netlify Function)
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState('');

  // WM-Match market creation
  const [wmGroup, setWmGroup] = useState('A');
  const [wmMatchId, setWmMatchId] = useState('');
  const [wmCreated, setWmCreated] = useState(false);

  // Market creation
  const [newMarketQuestion, setNewMarketQuestion] = useState('');
  const [newMarketType, setNewMarketType] = useState<'standard' | 'hot-take' | 'anonymous' | 'combo'>('standard');
  const [isBinary, setIsBinary] = useState(true);
  const [isOpenQuestion, setIsOpenQuestion] = useState(false);
  const [customOptions, setCustomOptions] = useState<string[]>(['', '']);
  const [hotTakeMinutes, setHotTakeMinutes] = useState(5); // NEW: configurable timer

  // Combo legs — standalone, admin types them freely
  const [comboLegs, setComboLegs] = useState<{ question: string; optionA: string; optionB: string }[]>([
    { question: '', optionA: 'JA', optionB: 'NEIN' },
  ]);

  // Token giving
  const [givePlayerId, setGivePlayerId] = useState('');
  const [giveAmount, setGiveAmount] = useState('20');

  // Resolution confirmation popup
  const [pendingResolution, setPendingResolution] = useState<{
    marketId: string; optionId: string; optionLabel: string; type: 'win' | 'rollover' | 'storno';
  } | null>(null);
  // Close-market / delete confirmation
  const [pendingClose, setPendingClose] = useState<{ marketId: string; question: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ marketId: string; question: string } | null>(null);

  // Open question resolution
  const [openQModal, setOpenQModal] = useState<string | null>(null); // marketId
  const [selectedWinners, setSelectedWinners] = useState<Set<string>>(new Set());

  // Go-Live (Testmodus beenden)
  const [goLiveModal, setGoLiveModal] = useState(false);
  const [goLiveStatus, setGoLiveStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [goLiveMsg, setGoLiveMsg] = useState('');

  // Einladungscode verwalten
  const [currentInviteCode, setCurrentInviteCode] = useState<string | null>(null);
  const [newInviteCode, setNewInviteCode] = useState('');
  const [inviteCodeStatus, setInviteCodeStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  // Test-Spieler & manuelle Wetten
  const [testPlayerName, setTestPlayerName] = useState('');
  const [autoBetBusy, setAutoBetBusy] = useState(false);
  const [betAsPlayer, setBetAsPlayer] = useState('');
  const [betAsMarket, setBetAsMarket] = useState('');
  const [betAsOption, setBetAsOption] = useState('');
  const [betAsAmount, setBetAsAmount] = useState('50');

  // Admin submenus
  const [adminTab, setAdminTab] = useState<'maerkte' | 'wetten' | 'spieler' | 'system'>('maerkte');
  // Ticker-Nachricht
  const [tickerMsg, setTickerMsg] = useState('');

  const markets = useStore(s => s.markets);
  const answers = useStore(s => s.answers);
  const jackpot = useStore(s => s.jackpot);
  const testMode = useStore(s => s.testMode);
  const createMarket = useStore(s => s.createMarket);
  const resolveMarket = useStore(s => s.resolveMarket);
  const resolveOpenQuestion = useStore(s => s.resolveOpenQuestion);
  const resolveRollover = useStore(s => s.resolveRollover);
  const resolveStorno = useStore(s => s.resolveStorno);
  const lockMarket = useStore(s => s.lockMarket);
  const giveTokens = useStore(s => s.giveTokens);
  const executeBuyback = useStore(s => s.executeBuyback);
  const liveSchedule = useStore(s => s.schedule);
  const fullReset = useStore(s => s.fullReset);
  const closeMarket = useStore(s => s.closeMarket);
  const deleteMarket = useStore(s => s.deleteMarket);
  const createTestPlayer = useStore(s => s.createTestPlayer);
  const autoBetTestPlayers = useStore(s => s.autoBetTestPlayers);
  const placeBetAs = useStore(s => s.placeBetAs);
  const placeTipAs = useStore(s => s.placeTipAs);
  const setPlayerAdmin = useStore(s => s.setPlayerAdmin);
  const setAdminMessage = useStore(s => s.setAdminMessage);
  const adminMessage = useStore(s => s.adminMessage);
  const players = useStore(s => s.players);
  const navigate = useNavigate();

  const handlePinInput = (num: string) => {
    if (pin.length < 4) {
      const p = pin + num;
      setPin(p);
      if (p === '1234') setTimeout(() => setUnlocked(true), 300);
      else if (p.length === 4) setTimeout(() => setPin(''), 500);
    }
  };

  // ── Options builder ────────────────────────────────────────────────────────
  const buildOptions = (): MarketOption[] => {
    if (newMarketType === 'combo') {
      return [
        { id: 'combo-win',  label: '✓ Alle richtig',  pool: 0 },
        { id: 'combo-miss', label: '✗ Mind. 1 falsch', pool: 0 },
      ];
    }
    if (isOpenQuestion) return [{ id: 'open', label: 'Offene Antwort', pool: 0 }];
    if (isBinary) return [{ id: 'yes', label: 'JA', pool: 0 }, { id: 'no', label: 'NEIN', pool: 0 }];
    return customOptions.filter(o => o.trim()).map(label => ({
      id: Math.random().toString(36).substring(7), label: label.trim(), pool: 0,
    }));
  };

  const validComboLegs = comboLegs.filter(l => l.question.trim() !== '');
  const validOptions = newMarketType === 'combo'
    ? validComboLegs.length >= 2
    : isOpenQuestion || isBinary || customOptions.filter(o => o.trim()).length >= 2;

  const canCreate = newMarketQuestion.trim() !== '' && validOptions;

  const handleCreateMarket = () => {
    if (!canCreate) return;

    if (newMarketType === 'combo') {
      const filledLegs = comboLegs.filter(l => l.question.trim() !== '');
      const groupId = Math.random().toString(36).substring(7);
      filledLegs.forEach(leg => {
        createMarket({
          question: leg.question.trim(),
          type: 'standard',
          status: 'open',
          createdBy: 'admin',
          options: [
            { id: 'a', label: leg.optionA.trim() || 'JA', pool: 0 },
            { id: 'b', label: leg.optionB.trim() || 'NEIN', pool: 0 },
          ],
          winningOptionId: null,
          resolutionType: null,
          isOpenQuestion: false,
          comboGroupId: groupId,
          comboGroupLabel: newMarketQuestion.trim(),
        });
      });
    } else {
      createMarket({
        question: newMarketQuestion,
        type: newMarketType,
        status: 'open',
        createdBy: 'admin',
        options: buildOptions(),
        winningOptionId: null,
        resolutionType: null,
        isOpenQuestion: newMarketType === 'anonymous' ? isOpenQuestion : false,
        ...(newMarketType === 'hot-take' ? { expiresAt: Date.now() + hotTakeMinutes * 60 * 1000 } : {}),
      });
    }

    setNewMarketQuestion('');
    setCustomOptions(['', '']);
    setIsBinary(true);
    setIsOpenQuestion(false);
    setComboLegs([{ question: '', optionA: 'JA', optionB: 'NEIN' }]);
    setHotTakeMinutes(5);
  };

  const handleGiveTokens = () => {
    const player = players.find(p => p.name.toLowerCase() === givePlayerId.toLowerCase() || p.id === givePlayerId);
    if (player && giveAmount) { giveTokens(player.id, parseInt(giveAmount)); setGivePlayerId(''); }
  };

  const handleImportSchedule = async () => {
    setImportStatus('loading');
    setImportMsg('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nicht eingeloggt. Bitte als Admin anmelden.');
      const res = await fetch('/.netlify/functions/import-schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setImportStatus('ok');
      setImportMsg(`${data.imported} Spiele importiert.`);
    } catch (err: any) {
      setImportStatus('error');
      setImportMsg(err.message || 'Import fehlgeschlagen');
    }
  };

  const scheduleSource: ScheduleMatch[] = liveSchedule.length > 0 ? liveSchedule : WM2026_GROUP_SCHEDULE;

  // Baut die Market-Daten für ein WM-Spiel — Einsatzlimits kommen automatisch
  // aus der Phase (Plan §2), Teamnamen werden auf Deutsch übersetzt.
  const buildWmMarket = (match: ScheduleMatch) => {
    const phase = (match.phase as Phase) || 'gruppenphase';
    const limits = getLimits(phase);
    const a = deName(match.teamA);
    const b = deName(match.teamB);
    return {
      question: `${a} vs. ${b}`,
      type: 'standard' as const,
      status: 'open' as const,
      createdBy: 'admin',
      options: [
        { id: 'home', label: a, pool: 0 },
        { id: 'draw', label: 'Unentschieden', pool: 0 },
        { id: 'away', label: b, pool: 0 },
      ],
      winningOptionId: null,
      resolutionType: null,
      isOpenQuestion: false,
      marketSubtype: 'wm-match' as const,
      matchId: match.matchId,
      teamA: a,
      teamB: b,
      kickoffAt: match.kickoffAt,
      groupLabel: match.groupLabel,
      minBet: limits.minBet,
      maxBet: limits.maxBet,
      autoDeductAmount: limits.autoDeduct,
      autoDeductProcessed: false,
    };
  };

  const handleCreateWmMarket = () => {
    const match = scheduleSource.find(m => m.matchId === wmMatchId);
    if (!match) return;
    if (markets.some(m => m.matchId === wmMatchId)) return;
    createMarket(buildWmMarket(match));
    setWmCreated(true);
    setWmMatchId('');
    setTimeout(() => setWmCreated(false), 3000);
  };

  // Massen-Freigabe: erstellt Märkte für mehrere Spiele auf einmal (Plan §2.Tippabgabe).
  const [bulkMsg, setBulkMsg] = useState('');
  const bulkCreateMarkets = (matches: ScheduleMatch[]) => {
    const existing = new Set(markets.map(m => m.matchId));
    const toCreate = matches.filter(m => !existing.has(m.matchId));
    toCreate.forEach(m => createMarket(buildWmMarket(m)));
    setBulkMsg(
      toCreate.length === 0
        ? 'Alle Märkte für diese Auswahl existieren bereits.'
        : `${toCreate.length} Märkte geöffnet.`,
    );
    setTimeout(() => setBulkMsg(''), 4000);
  };

  const groupPhaseMatches = scheduleSource.filter(
    m => (m.phase ?? 'gruppenphase') === 'gruppenphase',
  );
  const openMatchday = (md: number) =>
    bulkCreateMarkets(groupPhaseMatches.filter(m => m.matchday === md));
  const openWholeGroupPhase = () => bulkCreateMarkets(groupPhaseMatches);

  // Spezialwetten aus Vorlagen erstellen (Plan §5).
  const [specialMsg, setSpecialMsg] = useState('');
  const createSpecialBet = (tpl: SpecialBetTemplate) => {
    if (markets.some(m => m.question === tpl.title)) {
      setSpecialMsg('Diese Spezialwette existiert bereits.');
      setTimeout(() => setSpecialMsg(''), 3000);
      return;
    }
    createMarket({
      question: tpl.title,
      type: 'standard',
      status: 'open',
      createdBy: 'admin',
      options: tpl.options.map(label => ({
        id: Math.random().toString(36).substring(7),
        label,
        pool: 0,
      })),
      winningOptionId: null,
      resolutionType: null,
      isOpenQuestion: false,
      marketSubtype: 'spezialwette',
      austriaBlock: !!tpl.austria,
      minBet: 10,
      maxBet: 0,
      autoDeductAmount: 0,
      autoDeductProcessed: true,
    });
    setSpecialMsg(`„${tpl.title}" erstellt.`);
    setTimeout(() => setSpecialMsg(''), 3000);
  };

  const createJackpotBet = (tpl: SpecialBetTemplate) => {
    if (markets.some(m => m.question === tpl.title)) {
      setSpecialMsg('Diese Jackpot-Runde existiert bereits.');
      setTimeout(() => setSpecialMsg(''), 3000);
      return;
    }
    createMarket({
      question: tpl.title,
      type: 'standard',
      status: 'open',
      createdBy: 'admin',
      options: tpl.options.map(label => ({
        id: Math.random().toString(36).substring(7),
        label,
        pool: 0,
      })),
      winningOptionId: null,
      resolutionType: null,
      isOpenQuestion: false,
      marketSubtype: 'jackpot',
      noStake: true,
      jackpotBlock: tpl.block,
      jackpotBlockLabel: tpl.block ? JACKPOT_BLOCK_LABELS[tpl.block] : undefined,
      fixedPrize: tpl.fixedPrize ?? 0,
      absorbsJackpotPot: !!tpl.absorbsJackpotPot,
      minBet: 0,
      maxBet: 0,
      autoDeductAmount: 0,
      autoDeductProcessed: true,
    });
    setSpecialMsg(`„${tpl.title}" als Jackpot-Runde erstellt.`);
    setTimeout(() => setSpecialMsg(''), 3000);
  };

  const handleLoadInviteCode = async () => {
    setInviteCodeStatus('loading');
    try {
      const snap = await getDoc(doc(db, 'appState', 'global'));
      const code = snap.data()?.inviteCode as string | undefined;
      setCurrentInviteCode(code ?? '(nicht gesetzt)');
      setInviteCodeStatus('idle');
    } catch {
      setCurrentInviteCode('Fehler beim Laden');
      setInviteCodeStatus('error');
    }
  };

  const handleSetInviteCode = async () => {
    if (!newInviteCode.trim()) return;
    setInviteCodeStatus('loading');
    try {
      await setDoc(doc(db, 'appState', 'global'), { inviteCode: newInviteCode.trim() }, { merge: true });
      setCurrentInviteCode(newInviteCode.trim());
      setNewInviteCode('');
      setInviteCodeStatus('ok');
      setTimeout(() => setInviteCodeStatus('idle'), 2000);
    } catch {
      setInviteCodeStatus('error');
    }
  };

  const handleManualBet = async () => {
    const mkt = markets.find(m => m.id === betAsMarket);
    const opt = mkt?.options.find(o => o.id === betAsOption);
    if (!betAsPlayer || !mkt || !opt) return;
    if (mkt.marketSubtype === 'jackpot' || mkt.noStake) {
      await placeTipAs(betAsPlayer, mkt.id, opt.id, opt.label);
    } else {
      const amt = parseInt(betAsAmount) || 0;
      if (amt <= 0) return;
      await placeBetAs(betAsPlayer, mkt.id, opt.id, opt.label, amt);
    }
  };

  const handleGoLive = async () => {
    setGoLiveStatus('loading');
    setGoLiveMsg('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nicht eingeloggt. Bitte als Admin anmelden.');
      const res = await fetch('/.netlify/functions/go-live', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGoLiveStatus('ok');
      setGoLiveMsg(
        `${data.message} (${data.deletedPlayers} Spieler gelöscht, Märkte & Wetten geleert.)`,
      );
      setGoLiveModal(false);
    } catch (err: any) {
      setGoLiveStatus('error');
      setGoLiveMsg(err.message || 'Live gehen fehlgeschlagen.');
      setGoLiveModal(false);
    }
  };

  const executeResolution = async () => {
    if (!pendingResolution) return;
    const { marketId, optionId, type } = pendingResolution;
    if (type === 'win') await resolveMarket(marketId, optionId);
    else if (type === 'rollover') await resolveRollover(marketId);
    else await resolveStorno(marketId);
    setPendingResolution(null);
  };

  // ── PIN Screen ─────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="flex-1 flex flex-col bg-bg relative">
        <div className="absolute inset-0 z-[100] bg-[#02040C]/95 backdrop-blur-2xl flex flex-col items-center justify-center">
          <button onClick={() => navigate('/dashboard')} className="absolute top-6 left-6 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors">✕</button>
          <img src="/logo-icon.webp" alt="" className="h-[72px] w-auto mb-3" style={{ animation: 'auraGlow 3s ease-in-out infinite' }} />
          <div className="text-[18px] font-black text-white mb-1">Admin-Zugang</div>
          <div className="text-[12px] text-muted mb-7">Nur für den Host · PIN: 1234</div>
          <div className="flex gap-3 mb-8">
            {[0,1,2,3].map(i => (
              <div key={i} className={clsx("w-3.5 h-3.5 rounded-full border-2 transition-all", i < pin.length ? "bg-blue2 border-blue2 shadow-[0_0_12px_rgba(93,143,255,0.6)]" : "border-white/10 bg-transparent")} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5 w-[230px]">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <div key={n} onClick={() => handlePinInput(n.toString())} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer hover:bg-bg3 hover:border-blue/40 active:scale-90 transition-all">{n}</div>
            ))}
            <div onClick={() => setPin(pin.slice(0,-1))} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[16px] text-muted flex items-center justify-center cursor-pointer hover:bg-bg3 active:scale-90 transition-all">⌫</div>
            <div onClick={() => handlePinInput('0')} className="aspect-square rounded-2xl bg-card border border-border font-mono text-[22px] font-bold text-white flex items-center justify-center cursor-pointer hover:bg-bg3 active:scale-90 transition-all">0</div>
            <div onClick={() => navigate('/dashboard')} className="aspect-square rounded-2xl bg-green/10 border border-green/40 text-green font-mono text-[22px] font-bold flex items-center justify-center cursor-pointer active:scale-90 transition-all">✕</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Admin Panel ────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,61,90,.12)_0%,transparent_40%)]" />
      <div className="relative z-10 flex flex-col flex-1">
        <div className="p-3.5 px-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="text-[17px] font-black text-white flex items-center gap-2">
            <img src="/logo-icon.webp" alt="" className="w-6 h-6 object-contain" /> Admin Panel
          </div>
          <div className="text-[10px] font-black tracking-[0.1em] text-red bg-red/10 border border-red/30 rounded-lg px-2.5 py-1">HOST ONLY</div>
        </div>

        {/* ── TAB NAVIGATION ─────────────────────────────────────────── */}
        <div className="flex gap-1 px-3 py-2 border-b border-border shrink-0">
          {([
            ['maerkte', '⚽', 'Märkte'],
            ['wetten',  '🎰', 'Wetten'],
            ['spieler', '👤', 'Spieler'],
            ['system',  '⚙️', 'System'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} onClick={() => setAdminTab(id)}
              className={clsx(
                'flex-1 py-2 rounded-xl text-[11px] font-black transition-all border',
                adminTab === id
                  ? 'bg-white/10 text-white border-white/15'
                  : 'text-muted hover:text-white border-transparent',
              )}>
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 px-4 pb-safe">

          {/* ── SYSTEM TAB ─────────────────────────────────────────── */}
          {adminTab === 'system' && <>

          {/* ── TESTMODUS / LIVE GEHEN ─────────────────────────────── */}
          <div className={clsx(
            'border rounded-2xl p-4 mb-2.5',
            testMode ? 'bg-yellow/10 border-yellow/30' : 'bg-green/10 border-green/30',
          )}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">{testMode ? '🧪' : '🟢'}</span>
              <div className={clsx('text-[11px] font-black tracking-[0.15em] uppercase', testMode ? 'text-yellow' : 'text-green')}>
                {testMode ? 'Testmodus aktiv' : 'Live-Modus'}
              </div>
            </div>
            {testMode ? (
              <>
                <div className="text-[10px] text-muted mb-3">
                  Die App läuft im <b className="text-yellow">Testmodus</b>. Du kannst beliebig
                  Spieler anlegen, wetten und auflösen. Beim <b className="text-white">Live gehen</b>{' '}
                  werden <b className="text-red">alle Daten zurückgesetzt</b> und alle Spieler
                  gelöscht — <b className="text-white">außer ausgewiesene Admins</b>. Der Spielplan
                  und der Invite-Code bleiben erhalten.
                </div>
                {goLiveStatus !== 'idle' && (
                  <div className={clsx('rounded-xl px-3 py-2 text-[12px] font-bold text-center mb-3',
                    goLiveStatus === 'ok' ? 'bg-green/10 border border-green/30 text-green' :
                    goLiveStatus === 'error' ? 'bg-red/10 border border-red/30 text-red' :
                    'bg-blue/10 border border-blue2/30 text-blue2')}>
                    {goLiveStatus === 'loading' ? 'Setze zurück…' : goLiveMsg}
                  </div>
                )}
                <button
                  onClick={() => setGoLiveModal(true)}
                  disabled={goLiveStatus === 'loading'}
                  className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-green to-[#B8860B] font-sans text-[13px] font-black text-bg cursor-pointer shadow-[0_4px_18px_rgba(230,180,60,0.3)] transition-all hover:-translate-y-px disabled:opacity-50"
                >
                  🟢 Testmodus beenden & live gehen
                </button>
              </>
            ) : (
              <div className="text-[10px] text-muted">
                Die App ist <b className="text-green">live</b>. Alle Spielerdaten zählen jetzt für
                das echte Turnier.
                {goLiveStatus === 'ok' && goLiveMsg && (
                  <div className="mt-2 text-green font-bold">{goLiveMsg}</div>
                )}
              </div>
            )}
          </div>

          {/* ── SPIELPLAN-IMPORT (API) ─────────────────────────────── */}
          <div className="bg-card border border-blue2/20 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🌐</span>

              <div className="text-[11px] font-black text-blue2 tracking-[0.15em] uppercase">Spielplan von API laden</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Holt alle WM-2026-Spiele (Teams + Anstoßzeiten) live von football-data.org
              und schreibt sie in die Datenbank. Aktuell im Spielplan: <b className="text-white">{liveSchedule.length}</b> Spiele.
            </div>
            {importStatus !== 'idle' && (
              <div className={clsx('rounded-xl px-3 py-2 text-[12px] font-bold text-center mb-3',
                importStatus === 'ok' ? 'bg-green/10 border border-green/30 text-green' :
                importStatus === 'error' ? 'bg-red/10 border border-red/30 text-red' :
                'bg-blue/10 border border-blue2/30 text-blue2')}>
                {importStatus === 'loading' ? 'Lädt…' : importMsg}
              </div>
            )}
            <button
              onClick={handleImportSchedule}
              disabled={importStatus === 'loading'}
              className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[13px] font-black text-white cursor-pointer shadow-[0_4px_18px_rgba(59,110,255,0.3)] transition-all hover:-translate-y-px disabled:opacity-50"
            >
              🌐 Spielplan jetzt laden
            </button>
          </div>

          </>}

          {/* ── MÄRKTE TAB ─────────────────────────────────────────── */}
          {adminTab === 'maerkte' && <>

          {/* ── WM MATCH MARKT ────────────────────────────────────── */}
          <div className="bg-card border border-[#E6B43C]/20 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-3.5">
              <span className="text-[18px]">⚽</span>
              <div className="text-[11px] font-black text-green tracking-[0.15em] uppercase">WM-Match Markt öffnen</div>
            </div>

            {wmCreated && (
              <div className="bg-green/10 border border-green/30 rounded-xl px-4 py-2.5 text-[13px] text-green font-black text-center mb-3">
                ✓ Markt erstellt!
              </div>
            )}

            {/* Group tabs */}
            <div className="mb-3">
              <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-1.5">Gruppe</div>
              <div className="flex gap-1.5 flex-wrap">
                {GROUP_LABELS.map(g => (
                  <button key={g} onClick={() => { setWmGroup(g); setWmMatchId(''); }}
                    className={clsx('w-8 h-8 rounded-xl font-black text-[12px] border transition-all',
                      wmGroup === g ? 'bg-green/15 border-green/50 text-green' : 'bg-white/5 border-white/10 text-muted hover:text-white')}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Match selector */}
            <div className="mb-3">
              <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-1.5">Spiel</div>
              <div className="flex flex-col gap-1.5">
                {scheduleSource
                  .filter(m => m.groupLabel === `Gruppe ${wmGroup}`)
                  .map(match => {
                    const exists = markets.some(m => m.matchId === match.matchId);
                    return (
                      <div key={match.matchId}
                        onClick={() => !exists ? setWmMatchId(match.matchId) : undefined}
                        className={clsx(
                          'flex items-center gap-2.5 rounded-xl p-2.5 border text-[12px] transition-all',
                          exists ? 'border-green/20 bg-green/5 opacity-60 cursor-not-allowed' :
                          wmMatchId === match.matchId
                            ? 'border-green/50 bg-green/10 cursor-pointer'
                            : 'border-border bg-input cursor-pointer hover:border-blue2/40',
                        )}
                      >
                        <span className="font-black text-white flex-1 truncate">
                          {deName(match.teamA)} vs. {deName(match.teamB)}
                        </span>
                        <span className="text-[10px] text-muted shrink-0">{toCEST(match.kickoffAt)}</span>
                        {exists && <span className="text-[10px] font-black text-green shrink-0">✓</span>}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="text-[10px] text-muted mb-3">
              Einsatzlimits werden automatisch aus der Turnierphase übernommen
              (Gruppenphase: Min 10 / Max 150 / Auto-Abzug 10).
            </div>

            <button
              onClick={handleCreateWmMarket}
              disabled={!wmMatchId || markets.some(m => m.matchId === wmMatchId)}
              className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-green to-[#B8860B] font-sans text-[13px] font-black text-bg cursor-pointer shadow-[0_4px_18px_rgba(230,180,60,0.3)] transition-all hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⚽ Einzelnen WM-Markt öffnen
            </button>
          </div>

          {/* ── MASSEN-FREIGABE ───────────────────────────────────── */}
          <div className="bg-card border border-blue2/20 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">📢</span>
              <div className="text-[11px] font-black text-blue2 tracking-[0.15em] uppercase">Massen-Freigabe Gruppenphase</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Öffnet viele Märkte auf einmal — Limits automatisch aus der Phase.
              Bereits offene Spiele werden übersprungen.
            </div>
            {bulkMsg && (
              <div className="bg-blue/10 border border-blue2/30 rounded-xl px-3 py-2 text-[12px] font-bold text-center text-blue2 mb-3">
                {bulkMsg}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[1, 2, 3].map(md => (
                <button key={md} onClick={() => openMatchday(md)}
                  className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-black text-[12px] hover:border-blue2/50 transition-all">
                  Spieltag {md}
                </button>
              ))}
            </div>
            <button
              onClick={openWholeGroupPhase}
              className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[13px] font-black text-white cursor-pointer shadow-[0_4px_18px_rgba(59,110,255,0.3)] transition-all hover:-translate-y-px"
            >
              📢 Komplette Gruppenphase öffnen ({groupPhaseMatches.length} Spiele)
            </button>
          </div>

          </>}

          {/* ── WETTEN TAB ─────────────────────────────────────────── */}
          {adminTab === 'wetten' && <>

          {/* ── SPEZIALWETTEN ─────────────────────────────────────── */}
          <div className="bg-card border border-purple2/20 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🌟</span>
              <div className="text-[11px] font-black text-purple2 tracking-[0.15em] uppercase">Spezialwetten</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Per Klick öffnen. Kein Auto-Abzug, Mindesteinsatz 10. Auflösung über „Märkte verwalten".
            </div>
            {specialMsg && (
              <div className="bg-purple/10 border border-purple2/30 rounded-xl px-3 py-2 text-[12px] font-bold text-center text-purple2 mb-3">
                {specialMsg}
              </div>
            )}

            <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-1.5">International</div>
            <div className="flex flex-col gap-1.5">
              {INTERNATIONAL_SPECIALS.map(tpl => {
                const exists = markets.some(m => m.question === tpl.title);
                return (
                  <button key={tpl.id} onClick={() => createSpecialBet(tpl)} disabled={exists}
                    className={clsx('text-left rounded-xl p-2.5 border text-[12px] font-bold transition-all',
                      exists ? 'border-green/20 bg-green/5 text-muted opacity-60 cursor-not-allowed'
                             : 'border-border bg-input text-white hover:border-purple2/40 cursor-pointer')}>
                    {exists ? '✓ ' : '+ '}{tpl.title}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-muted mt-2.5 leading-relaxed">
              🇦🇹 Österreich-Fragen liegen jetzt einsatzfrei im Abschnitt „🎰 Jackpot-Sonderrunden" (Block Österreich).
            </div>
          </div>

          {/* ── JACKPOT-SONDERRUNDEN ──────────────────────────────── */}
          <div className="bg-card border border-yellow/25 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🎰</span>
              <div className="text-[11px] font-black text-yellow tracking-[0.15em] uppercase">Jackpot-Sonderrunden</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Einsatzfrei — Spieler tippen gratis. Fester Haus-Preis pro Frage, gleichmäßig auf
              richtige Tipper verteilt. Resttoken aus „Kein-Gewinner"-Auflösungen sparen sich im
              Jackpot an (aktuell <b className="text-yellow">{jackpot} TKN</b>) und fließen in die
              Finale-Frage „Wer wird Weltmeister?". Auflösung über „Märkte verwalten".
            </div>
            {(['block1', 'austria', 'block2', 'finale'] as const).map(block => (
              <div key={block} className="mb-3 last:mb-0">
                <div className={clsx('text-[10px] font-black uppercase tracking-[0.1em] mb-1.5',
                  block === 'austria' ? 'text-[#EF3340]' : 'text-yellow/80')}>
                  {JACKPOT_BLOCK_LABELS[block]}
                </div>
                <div className="flex flex-col gap-1.5">
                  {JACKPOT_TEMPLATES.filter(t => t.block === block).map(tpl => {
                    const exists = markets.some(m => m.question === tpl.title);
                    const aut = block === 'austria';
                    return (
                      <button key={tpl.id} onClick={() => createJackpotBet(tpl)} disabled={exists}
                        className={clsx('text-left rounded-xl p-2.5 border text-[12px] font-bold transition-all flex items-center justify-between gap-2',
                          exists ? 'border-green/20 bg-green/5 text-muted opacity-60 cursor-not-allowed'
                                 : aut ? 'border-[#EF3340]/30 bg-[#EF3340]/5 text-white hover:border-[#EF3340]/60 cursor-pointer'
                                       : 'border-yellow/25 bg-yellow/5 text-white hover:border-yellow/50 cursor-pointer')}>
                        <span>{exists ? '✓ ' : '+ '}{tpl.title}</span>
                        <span className={clsx('text-[10px] font-black shrink-0', aut ? 'text-[#EF3340]' : 'text-yellow')}>
                          {tpl.absorbsJackpotPot ? `${tpl.fixedPrize}+Pot` : `${tpl.fixedPrize}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          </>}

          {adminTab === 'maerkte' && <>

          {/* ── CREATE MARKET ─────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Neuen Markt erstellen</div>

            {/* Frage */}
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Frage / Titel</label>
              <input type="text" value={newMarketQuestion} onChange={e => setNewMarketQuestion(e.target.value)}
                placeholder="Was passiert als nächstes?" className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-blue2 placeholder:text-muted" />
            </div>

            {/* Typ */}
            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Markt-Typ</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['standard','hot-take','anonymous','combo'] as const).map(t => (
                  <div key={t} onClick={() => { setNewMarketType(t); setIsOpenQuestion(false); setComboLegs([]); }}
                    className={clsx("bg-input border rounded-xl p-2.5 px-2 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      newMarketType === t ? "border-green/50 text-green bg-green/10" : "border-border text-muted hover:border-blue/40 hover:text-blue2")}>
                    {t === 'standard' ? 'Standard' : t === 'hot-take' ? '⚡ Hot Take' : t === 'anonymous' ? '🕵️ Anonym' : '🔗 Combo'}
                  </div>
                ))}
              </div>
            </div>

            {/* ── HOT TAKE: Timer ───────────────────────────────── */}
            {newMarketType === 'hot-take' && (
              <div className="mb-3 bg-blue/10 border border-blue2/30 rounded-xl p-3">
                <label className="block text-[10px] font-black text-blue2 tracking-[0.12em] uppercase mb-2">⏱ Timer (Minuten)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="1" max="30" value={hotTakeMinutes}
                    onChange={e => setHotTakeMinutes(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-input rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <div className="font-mono text-[18px] font-bold text-blue2 min-w-[48px] text-right">{hotTakeMinutes}m</div>
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-muted font-bold">
                  <span>1 min</span><span>30 min</span>
                </div>
                <div className="text-[10px] text-muted mt-1.5">Wettannahme endet automatisch nach {hotTakeMinutes} Minute{hotTakeMinutes > 1 ? 'n' : ''}.</div>
              </div>
            )}

            {/* ── COMBO: Standalone Leg Builder ────────────────── */}
            {newMarketType === 'combo' && (
              <div className="mb-3">
                <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-2">
                  Combo-Fragen ({validComboLegs.length}/3)
                  {validComboLegs.length === 2 && <span className="text-green ml-1">· 3× Multiplikator</span>}
                  {validComboLegs.length === 3 && <span className="text-yellow ml-1">· 6× Multiplikator</span>}
                </label>

                {comboLegs.map((leg, i) => (
                  <div key={i} className="bg-input border border-border rounded-xl p-3 mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md bg-purple/20 border border-purple2/30 flex items-center justify-center text-[10px] font-black text-purple2 shrink-0">{i+1}</div>
                      <input
                        type="text"
                        value={leg.question}
                        onChange={e => { const n = [...comboLegs]; n[i] = { ...n[i], question: e.target.value }; setComboLegs(n); }}
                        placeholder={`Frage ${i+1}…`}
                        className="flex-1 bg-bg border border-border rounded-lg p-2 px-2.5 text-white font-sans text-[13px] font-bold outline-none focus:border-purple2 placeholder:text-muted"
                      />
                      {comboLegs.length > 1 && (
                        <button onClick={() => setComboLegs(comboLegs.filter((_, idx) => idx !== i))}
                          className="w-6 h-6 rounded-lg bg-red/10 border border-red/25 text-red text-[10px] flex items-center justify-center hover:bg-red/20 shrink-0">✕</button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="text-[9px] font-black text-green/70 uppercase tracking-wider mb-1">Option A</div>
                        <input
                          type="text"
                          value={leg.optionA}
                          onChange={e => { const n = [...comboLegs]; n[i] = { ...n[i], optionA: e.target.value }; setComboLegs(n); }}
                          className="w-full bg-bg border border-green/25 rounded-lg p-2 px-2.5 text-green font-sans text-[12px] font-bold outline-none focus:border-green/60 placeholder:text-muted"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] font-black text-red/70 uppercase tracking-wider mb-1">Option B</div>
                        <input
                          type="text"
                          value={leg.optionB}
                          onChange={e => { const n = [...comboLegs]; n[i] = { ...n[i], optionB: e.target.value }; setComboLegs(n); }}
                          className="w-full bg-bg border border-red/25 rounded-lg p-2 px-2.5 text-red font-sans text-[12px] font-bold outline-none focus:border-red/60 placeholder:text-muted"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {comboLegs.length < 3 && (
                  <button onClick={() => setComboLegs([...comboLegs, { question: '', optionA: 'JA', optionB: 'NEIN' }])}
                    className="w-full p-2 border border-dashed border-white/15 rounded-xl text-[11px] font-black text-muted hover:text-white hover:border-purple2/40 transition-colors">
                    + Frage hinzufügen
                  </button>
                )}
                {validComboLegs.length < 2 && (
                  <div className="text-[10px] text-muted mt-1.5">Mindestens 2 ausgefüllte Fragen erforderlich.</div>
                )}
              </div>
            )}

            {/* ── STANDARD / HOT-TAKE / ANONYMOUS: Antwort-Modus ── */}
            {newMarketType !== 'combo' && (
              <div className="mb-3">
                <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Antwort-Modus</label>
                <div className={clsx("grid gap-1.5 mb-2", newMarketType === 'anonymous' ? 'grid-cols-3' : 'grid-cols-2')}>
                  <div onClick={() => { setIsBinary(true); setIsOpenQuestion(false); }}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      isBinary && !isOpenQuestion ? "border-green/50 text-green bg-green/10" : "border-border text-muted hover:border-blue/40")}>
                    Binär (JA/NEIN)
                  </div>
                  <div onClick={() => { setIsBinary(false); setIsOpenQuestion(false); }}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      !isBinary && !isOpenQuestion ? "border-blue2/50 text-blue2 bg-blue/10" : "border-border text-muted hover:border-blue/40")}>
                    Custom
                  </div>
                  {newMarketType === 'anonymous' && (
                    <div onClick={() => { setIsOpenQuestion(true); setIsBinary(false); }}
                      className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                        isOpenQuestion ? "border-purple2/50 text-purple2 bg-purple/10" : "border-border text-muted hover:border-blue/40")}>
                      ✏️ Offen
                    </div>
                  )}
                </div>

                {isOpenQuestion && (
                  <div className="bg-purple/10 border border-purple2/30 rounded-xl p-2.5 text-[11px] text-purple2 font-bold">
                    ✏️ Spieler tippen frei. Antworten bleiben bis zur Auflösung anonym.
                  </div>
                )}

                {!isBinary && !isOpenQuestion && (
                  <div className="flex flex-col gap-1.5">
                    {customOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                          style={{ backgroundColor: ['#E6B43C','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'][i]+'33', color: ['#E6B43C','#FF3D5A','#3B6EFF','#FFD447','#8B3DFF'][i] }}>
                          {i+1}
                        </div>
                        <input type="text" value={opt} onChange={e => { const n=[...customOptions]; n[i]=e.target.value; setCustomOptions(n); }}
                          placeholder={`Option ${i+1}`}
                          className="flex-1 bg-input border border-border rounded-xl p-2.5 px-3 text-white font-sans text-[13px] font-bold outline-none focus:border-blue2 placeholder:text-muted" />
                        {customOptions.length > 2 && (
                          <button onClick={() => setCustomOptions(customOptions.filter((_,idx)=>idx!==i))}
                            className="w-7 h-7 rounded-lg bg-red/10 border border-red/25 text-red text-[12px] flex items-center justify-center hover:bg-red/20">✕</button>
                        )}
                      </div>
                    ))}
                    {customOptions.length < 5 && (
                      <button onClick={() => setCustomOptions([...customOptions,''])}
                        className="mt-1 w-full p-2 border border-dashed border-white/15 rounded-xl text-[11px] font-black text-muted hover:text-white hover:border-blue/40 transition-colors">
                        + Option hinzufügen
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleCreateMarket} disabled={!canCreate}
              className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[14px] font-black text-white cursor-pointer shadow-[0_6px_24px_rgba(59,110,255,0.3)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed">
              + Markt erstellen
            </button>
          </div>

          {/* ── MANAGE MARKETS ──────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Märkte verwalten</div>
            {markets.filter(m => m.status !== 'resolved').map(m => (
              <div key={m.id} className="bg-input rounded-xl p-2.5 px-3 mb-1.5">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="flex-1 text-[12px] font-bold text-white truncate min-w-0">{m.question}</span>
                  {m.status === 'open' && (
                    <>
                      <button onClick={() => lockMarket(m.id)} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-yellow border-yellow/35 hover:bg-yellow/10">LOCK</button>
                      {m.noStake
                        ? <button onClick={() => setPendingDelete({ marketId: m.id, question: m.question })} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-red border-red/35 hover:bg-red/10">🗑 LÖSCHEN</button>
                        : <button onClick={() => setPendingClose({ marketId: m.id, question: m.question })} className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-red border-red/35 hover:bg-red/10">✕ SCHLIESSEN</button>
                      }
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {m.isOpenQuestion ? (
                    // Open question: single button opens answer picker
                    <button
                      onClick={() => { setOpenQModal(m.id); setSelectedWinners(new Set()); }}
                      className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-green border-green/35 hover:bg-green/10">
                      ✏️ Antworten auswerten
                    </button>
                  ) : (
                    m.options.map((opt, i) => {
                      const colors = ['text-green border-green/35 hover:bg-green/10','text-red border-red/35 hover:bg-red/10','text-blue2 border-blue2/35 hover:bg-blue/10','text-yellow border-yellow/35 hover:bg-yellow/10','text-purple2 border-purple2/35 hover:bg-purple/10'];
                      return (
                        <button key={opt.id}
                          onClick={() => setPendingResolution({ marketId: m.id, optionId: opt.id, optionLabel: opt.label, type: 'win' })}
                          className={clsx("text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap transition-all", colors[i] ?? colors[0])}>
                          ✓ {opt.label}
                        </button>
                      );
                    })
                  )}
                  {m.type !== 'combo' && (
                    <button onClick={() => setPendingResolution({ marketId: m.id, optionId: '', optionLabel: 'ROLLOVER', type: 'rollover' })}
                      className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-purple2 border-purple2/35 hover:bg-purple2/10">
                      🎰 ROLLOVER
                    </button>
                  )}
                  <button onClick={() => setPendingResolution({ marketId: m.id, optionId: '', optionLabel: 'STORNO', type: 'storno' })}
                    className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-muted border-muted/35 hover:bg-muted/10">
                    ↩️ STORNO
                  </button>
                </div>
                {/* Show combo legs status */}
                {m.type === 'combo' && m.comboLegs && (
                  <div className="mt-2 flex flex-col gap-1">
                    {m.comboLegs.map((leg, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <span className={clsx("font-black", leg.status === 'hit' ? 'text-green' : leg.status === 'miss' ? 'text-red' : 'text-muted')}>
                          {leg.status === 'hit' ? '✓' : leg.status === 'miss' ? '✗' : '○'}
                        </span>
                        <span className="text-muted truncate">{leg.marketQuestion}</span>
                        <span className="text-white font-bold shrink-0">→ {leg.predictedOptionLabel}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {markets.filter(m => m.status !== 'resolved').length === 0 && (
              <div className="text-[12px] text-muted text-center py-2">Keine aktiven Märkte</div>
            )}
          </div>

          </>}

          {/* ── SPIELER TAB ────────────────────────────────────────── */}
          {adminTab === 'spieler' && <>

          {/* ── BUYBACK ─────────────────────────────────────────── */}
          {(() => {
            const buybackEligible = players.filter(p =>
              !p.buybackUsed && p.tokens < 25
            );
            if (buybackEligible.length === 0) return null;
            return (
              <div className="bg-card border border-red/25 rounded-2xl p-4 mb-2.5">
                <div className="text-[11px] font-black text-red tracking-[0.15em] uppercase mb-3.5">
                  🔄 Buyback bestätigen
                </div>
                <div className="text-[10px] text-muted mb-3">
                  Nach Bestätigung erhält der Spieler 800 + aktuelles Guthaben Credits.
                  Nur möglich bis Ende Sechzehntelfinale.
                </div>
                {buybackEligible.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-input rounded-xl p-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-white truncate">{p.name}</div>
                      <div className="text-[10px] text-muted">Guthaben: <b className="text-yellow">{p.tokens} Cr.</b> → nach Buyback: <b className="text-green">{800 + (p.tokens ?? 0)} Cr.</b></div>
                    </div>
                    <button
                      onClick={() => executeBuyback(p.id)}
                      className="shrink-0 px-3 py-2 rounded-xl bg-green/15 border border-green/40 text-green font-black text-[12px] hover:bg-green/25 transition-colors cursor-pointer font-sans"
                    >
                      ✓ Bestätigen
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── GIVE TOKENS ─────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Token vergeben</div>
            <input type="text" value={givePlayerId} onChange={e => setGivePlayerId(e.target.value)} placeholder="Name des Spielers"
              className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-blue2 placeholder:text-muted mb-3" />
            <input type="number" value={giveAmount} onChange={e => setGiveAmount(e.target.value)}
              className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-blue2 mb-3" />
            <button onClick={handleGiveTokens} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-green to-[#B8860B] font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(230,180,60,0.3)] transition-all hover:-translate-y-px">🪙 Tokens vergeben</button>
          </div>

          {/* ── ADMIN-ROLLEN ────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-2">🔑 Admin-Rechte</div>
            <div className="text-[10px] text-muted mb-3">
              Admins sehen das Schloss-Icon und können Märkte verwalten. Spieler in der
              fest hinterlegten E-Mail-Liste sind immer Admin.
            </div>
            {players.filter(p => !p.isTestPlayer).length === 0 ? (
              <div className="text-[12px] text-muted text-center py-2">Keine Spieler</div>
            ) : (
              players.filter(p => !p.isTestPlayer).map(p => {
                const fixedAdmin = isAdminEmail(p.email);
                const active = fixedAdmin || !!p.isAdmin;
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-input rounded-xl p-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-white truncate flex items-center gap-1.5">
                        {p.name}
                        {active && <span className="text-[9px] font-black text-yellow bg-yellow/10 border border-yellow/25 rounded px-1.5 py-0.5">ADMIN</span>}
                      </div>
                      {p.email && <div className="text-[10px] text-muted truncate">{p.email}</div>}
                    </div>
                    {fixedAdmin ? (
                      <span className="shrink-0 text-[10px] text-muted px-2">fix (E-Mail)</span>
                    ) : (
                      <button
                        onClick={() => setPlayerAdmin(p.id, !p.isAdmin)}
                        className={clsx('shrink-0 px-3 py-2 rounded-xl font-black text-[12px] border transition-colors cursor-pointer font-sans',
                          p.isAdmin
                            ? 'bg-red/15 border-red/40 text-red hover:bg-red/25'
                            : 'bg-green/15 border-green/40 text-green hover:bg-green/25')}
                      >
                        {p.isAdmin ? '✕ Entziehen' : '✓ Zum Admin'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          </>}

          {adminTab === 'wetten' && <>

          {/* ── JACKPOT ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Community Jackpot</div>
            <div className="text-center py-2">
              <div className="font-mono text-[40px] font-bold text-yellow drop-shadow-[0_0_30px_rgba(255,212,71,0.4)]">🪙 {jackpot}</div>
              <div className="text-[11px] text-muted mt-1">Wird beim nächsten Gewinn ausgezahlt</div>
            </div>
          </div>

          </>}

          {adminTab === 'system' && <>

          {/* ── EINLADUNGSCODE ──────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3">Einladungscode</div>
            <div className="text-[10px] text-muted mb-3">
              Spieler brauchen diesen Code zur Registrierung. Wird beim lokalen Reset nicht mehr gelöscht.
            </div>
            {currentInviteCode !== null && (
              <div className="bg-white/5 border border-border rounded-xl px-3 py-2 font-mono text-[14px] text-white text-center mb-3">
                {currentInviteCode}
              </div>
            )}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newInviteCode}
                onChange={e => setNewInviteCode(e.target.value)}
                placeholder="Neuer Code…"
                className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-muted/40 outline-none focus:border-green/60"
              />
              <button
                onClick={handleSetInviteCode}
                disabled={!newInviteCode.trim() || inviteCodeStatus === 'loading'}
                className="px-4 py-2 rounded-xl bg-green/20 border border-green/40 text-green text-[12px] font-black disabled:opacity-40"
              >
                {inviteCodeStatus === 'ok' ? '✓' : inviteCodeStatus === 'loading' ? '…' : 'Setzen'}
              </button>
            </div>
            <button
              onClick={handleLoadInviteCode}
              className="w-full text-[11px] text-muted underline underline-offset-2 text-center bg-transparent border-none cursor-pointer"
            >
              Aktuellen Code anzeigen
            </button>
            {inviteCodeStatus === 'error' && (
              <div className="text-[11px] text-red text-center mt-2">Fehler. Bitte Firebase prüfen.</div>
            )}
          </div>

          {/* ── TICKER-NACHRICHT ────────────────────────────────── */}
          <div className="bg-card border border-blue2/20 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">📢</span>
              <div className="text-[11px] font-black text-blue2 tracking-[0.15em] uppercase">Ticker-Nachricht</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Wird im blauen Laufband im Dashboard angezeigt. Leer lassen um keine Nachricht anzuzeigen.
            </div>
            {adminMessage && (
              <div className="bg-blue/10 border border-blue2/30 rounded-xl px-3 py-2 text-[12px] font-bold text-blue2 mb-3 break-words">
                Aktuell: „{adminMessage}"
              </div>
            )}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tickerMsg}
                onChange={e => setTickerMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && tickerMsg.trim()) { setAdminMessage(tickerMsg.trim()); setTickerMsg(''); } }}
                placeholder="Nachricht eingeben…"
                className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-muted/40 outline-none focus:border-blue2/60"
              />
              <button
                onClick={() => { if (tickerMsg.trim()) { setAdminMessage(tickerMsg.trim()); setTickerMsg(''); } }}
                disabled={!tickerMsg.trim()}
                className="px-4 py-2 rounded-xl bg-blue/20 border border-blue2/40 text-blue2 text-[12px] font-black disabled:opacity-40"
              >
                Setzen
              </button>
            </div>
            {adminMessage && (
              <button
                onClick={() => setAdminMessage('')}
                className="w-full text-[11px] text-muted underline underline-offset-2 text-center bg-transparent border-none cursor-pointer"
              >
                Nachricht löschen
              </button>
            )}
          </div>

          </>}

          {/* ── SPIELER TAB (Test-Spieler) ──────────────────────────── */}
          {adminTab === 'spieler' && <>

          {/* ── TEST-SPIELER ────────────────────────────────────── */}
          {testMode && (
            <div className="bg-card border border-yellow/25 rounded-2xl p-4 mb-2.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[16px]">🧪</span>
                <div className="text-[11px] font-black text-yellow tracking-[0.15em] uppercase">Test-Spieler</div>
              </div>
              <div className="text-[10px] text-muted mb-3">
                Erfundene Mitspieler zum Testen. Zählen bei Wetten, Pools & Auflösung wie echte Spieler. Werden beim „Auf null stellen" gelöscht.
              </div>

              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={testPlayerName}
                  onChange={e => setTestPlayerName(e.target.value)}
                  placeholder="Name (optional)…"
                  className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-muted/40 outline-none focus:border-yellow/60"
                />
                <button
                  onClick={async () => { await createTestPlayer(testPlayerName); setTestPlayerName(''); }}
                  className="px-4 py-2 rounded-xl bg-yellow/20 border border-yellow/40 text-yellow text-[12px] font-black"
                >
                  + Spieler
                </button>
              </div>

              {(() => {
                const testPlayers = players.filter(p => p.isTestPlayer);
                if (testPlayers.length === 0) return <div className="text-[11px] text-muted/60 italic mb-2">Noch keine Test-Spieler.</div>;
                return (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {testPlayers.map(p => (
                      <span key={p.id} className="text-[10px] font-bold text-white bg-white/5 border border-border rounded-full px-2 py-1">
                        {p.name} · {p.tokens} TKN
                      </span>
                    ))}
                  </div>
                );
              })()}

              <button
                onClick={async () => { setAutoBetBusy(true); try { await autoBetTestPlayers(); } finally { setAutoBetBusy(false); } }}
                disabled={autoBetBusy || players.filter(p => p.isTestPlayer).length === 0}
                className="w-full p-2.5 mb-3 rounded-xl bg-blue/15 border border-blue2/40 text-blue2 text-[12px] font-black disabled:opacity-40"
              >
                {autoBetBusy ? 'Verteile…' : '🎲 Auto-Wetten auf offene Märkte verteilen'}
              </button>

              {/* Manuelle Wette im Namen eines Test-Spielers */}
              <div className="border-t border-border pt-3">
                <div className="text-[10px] font-black text-muted tracking-[0.1em] uppercase mb-2">Manuelle Wette platzieren</div>
                <div className="flex flex-col gap-2">
                  <select
                    value={betAsPlayer}
                    onChange={e => setBetAsPlayer(e.target.value)}
                    className="bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-green/60"
                  >
                    <option value="">Spieler wählen…</option>
                    {players.filter(p => p.isTestPlayer).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.tokens} TKN)</option>
                    ))}
                  </select>
                  <select
                    value={betAsMarket}
                    onChange={e => { setBetAsMarket(e.target.value); setBetAsOption(''); }}
                    className="bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-green/60"
                  >
                    <option value="">Markt wählen…</option>
                    {markets.filter(m => m.status === 'open').map(m => (
                      <option key={m.id} value={m.id}>{m.question}</option>
                    ))}
                  </select>
                  {betAsMarket && (
                    <select
                      value={betAsOption}
                      onChange={e => setBetAsOption(e.target.value)}
                      className="bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-green/60"
                    >
                      <option value="">Option wählen…</option>
                      {markets.find(m => m.id === betAsMarket)?.options.map(o => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  )}
                  {(() => {
                    const mkt = markets.find(m => m.id === betAsMarket);
                    const isFree = mkt?.marketSubtype === 'jackpot' || mkt?.noStake;
                    if (isFree) return null;
                    return (
                      <input
                        type="number"
                        value={betAsAmount}
                        onChange={e => setBetAsAmount(e.target.value)}
                        placeholder="Einsatz (TKN)"
                        className="bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white placeholder:text-muted/40 outline-none focus:border-green/60"
                      />
                    );
                  })()}
                  <button
                    onClick={handleManualBet}
                    disabled={!betAsPlayer || !betAsMarket || !betAsOption}
                    className="w-full p-2.5 rounded-xl bg-green/20 border border-green/40 text-green text-[12px] font-black disabled:opacity-40"
                  >
                    Wette platzieren
                  </button>
                </div>
              </div>
            </div>
          )}

          </>}

          {adminTab === 'system' && <>

          {/* ── SESSION ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Session</div>
            <button onClick={() => navigate('/cashout')} className="w-full p-3.5 border-none rounded-xl bg-gradient-to-br from-red to-orange font-sans text-[14px] font-black text-bg cursor-pointer shadow-[0_6px_24px_rgba(255,61,90,0.3)] transition-all hover:-translate-y-px mb-3">💰 CASHOUT ÖFFNEN</button>
            <button onClick={async () => {
              if (window.confirm('Wirklich ALLES auf null stellen? Märkte, Wetten, Antworten, Feed, Jackpot und alle Test-Spieler werden gelöscht. Admin-Accounts, Spielplan und Invite-Code bleiben.')) {
                try { await fullReset(); alert('Auf null gestellt ✓'); }
                catch (e) { console.error(e); alert('Fehler beim Zurücksetzen.'); }
              }
            }} className="w-full p-3.5 border border-red/40 rounded-xl bg-red/10 font-sans text-[14px] font-black text-red cursor-pointer transition-all hover:bg-red/20">
              ⚠️ ALLES AUF NULL STELLEN
            </button>
          </div>

          <div className="mt-8 text-center mb-6">
            <button onClick={() => navigate('/dashboard')} className="text-muted text-[12px] underline">Zurück zum Dashboard</button>
          </div>

          </>}

          {/* ── BACK BUTTON (alle anderen Tabs) ─────────────────────── */}
          {adminTab !== 'system' && (
            <div className="mt-8 text-center mb-6">
              <button onClick={() => navigate('/dashboard')} className="text-muted text-[12px] underline">Zurück zum Dashboard</button>
            </div>
          )}

        </div>
      </div>

      {/* ── OPEN QUESTION RESOLUTION MODAL ──────────────────────────────────── */}
      {openQModal && (() => {
        const market = markets.find(m => m.id === openQModal);
        if (!market) return null;
        const marketAnswers = answers.filter(a => a.marketId === openQModal);
        const prizePerWinner = selectedWinners.size > 0 ? Math.floor(jackpot / selectedWinners.size) : 0;
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
            <div className="bg-card border border-border rounded-[24px] w-full max-w-[360px] max-h-[85vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
              {/* Header */}
              <div className="p-5 border-b border-border shrink-0">
                <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-1">Offene Frage auswerten</div>
                <div className="text-[15px] font-black text-white leading-snug">{market.question}</div>
                <div className="text-[11px] text-muted mt-1.5">
                  🎰 Jackpot: <b className="text-yellow">{jackpot} TKN</b>
                  {selectedWinners.size > 0 && (
                    <span className="text-green ml-2">→ je <b>{prizePerWinner} TKN</b> für {selectedWinners.size} Gewinner</span>
                  )}
                </div>
              </div>

              {/* Answers list */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-2">
                {marketAnswers.length === 0 && (
                  <div className="text-[12px] text-muted text-center py-6">Noch keine Antworten eingegangen.</div>
                )}
                {marketAnswers.map(ans => {
                  const player = players.find(p => p.id === ans.playerId);
                  const isWinner = selectedWinners.has(ans.playerId);
                  return (
                    <div
                      key={ans.id}
                      onClick={() => {
                        const next = new Set(selectedWinners);
                        if (next.has(ans.playerId)) next.delete(ans.playerId);
                        else next.add(ans.playerId);
                        setSelectedWinners(next);
                      }}
                      className={clsx(
                        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                        isWinner
                          ? "bg-green/10 border-green/50 shadow-[0_0_12px_rgba(230,180,60,0.2)]"
                          : "bg-input border-border hover:border-blue/40"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-card border border-border shrink-0 overflow-hidden">
                        {player?.avatar
                          ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-white/5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-black text-white">{player?.name ?? '?'}</div>
                        <div className="text-[12px] text-muted leading-snug mt-0.5 break-words">{ans.text}</div>
                      </div>
                      <div className={clsx(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] shrink-0 transition-all",
                        isWinner ? "bg-green border-green text-bg font-black" : "border-border"
                      )}>
                        {isWinner && '✓'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-border flex gap-2.5 shrink-0">
                <button onClick={() => setOpenQModal(null)}
                  className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  Abbrechen
                </button>
                <button
                  onClick={async () => {
                    await resolveOpenQuestion(openQModal, Array.from(selectedWinners));
                    setOpenQModal(null);
                    setSelectedWinners(new Set());
                  }}
                  className="flex-1 p-3 rounded-xl font-black text-white bg-gradient-to-r from-green to-[#B8860B] shadow-[0_0_15px_rgba(230,180,60,0.4)] transition-all">
                  {selectedWinners.size === 0 ? 'Keine Gewinner' : `${selectedWinners.size} Gewinner bestätigen ✓`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── GO-LIVE CONFIRMATION ───────────────────────────────────────────────── */}
      {goLiveModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[340px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-red/10 border border-red/25 flex items-center justify-center text-[28px] mb-4">⚠️</div>
            <div className="text-[20px] font-black text-white mb-2">Live gehen?</div>
            <div className="text-[13px] text-muted mb-2 leading-relaxed">
              Dies <b className="text-red">löscht alle Testdaten unwiderruflich</b>:
              alle Spieler (außer Admins), alle Märkte, Wetten, Antworten, den Feed und die Hausbank.
            </div>
            <div className="text-[12px] text-muted mb-2 leading-relaxed">
              Erhalten bleiben: <b className="text-white">Spielplan</b>, <b className="text-white">Invite-Code</b> und <b className="text-white">Admin-Accounts</b> (auf 1.000 Credits zurückgesetzt).
            </div>
            <div className="text-[11px] text-red/80 font-bold uppercase tracking-wider mb-5">Kann nicht rückgängig gemacht werden!</div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setGoLiveModal(false)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={handleGoLive} className="flex-1 p-3 rounded-xl font-bold text-white bg-gradient-to-r from-green to-[#B8860B] shadow-[0_0_15px_rgba(230,180,60,0.4)] transition-all">Live gehen ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESOLUTION CONFIRMATION ────────────────────────────────────────────── */}
      {pendingResolution && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-red/10 border border-red/25 flex items-center justify-center text-[28px] mb-4">⚠️</div>
            <div className="text-[20px] font-black text-white mb-2">Ergebnis bestätigen</div>
            <div className="text-[14px] text-muted mb-2 leading-relaxed">
              {pendingResolution.type === 'win' && <>Gewinner: <b className="text-white">„{pendingResolution.optionLabel}"</b></>}
              {pendingResolution.type === 'rollover' && <><b className="text-purple2">ROLLOVER</b> durchführen?</>}
              {pendingResolution.type === 'storno' && <><b className="text-muted">STORNO</b> — alle erhalten Einsatz zurück.</>}
            </div>
            <div className="text-[11px] text-red/80 font-bold uppercase tracking-wider mb-5">Kann nicht rückgängig gemacht werden!</div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setPendingResolution(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={executeResolution} className="flex-1 p-3 rounded-xl font-bold text-white bg-gradient-to-r from-red to-orange shadow-[0_0_15px_rgba(255,61,90,0.4)] transition-all">Bestätigen ✓</button>
            </div>
          </div>
        </div>
      )}

      {pendingClose && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-red/10 border border-red/25 flex items-center justify-center text-[28px] mb-4">⚠️</div>
            <div className="text-[20px] font-black text-white mb-2">Markt schließen</div>
            <div className="text-[13px] text-white/90 font-semibold mb-1 leading-snug">„{pendingClose.question}"</div>
            <div className="text-[13px] text-muted mb-2 leading-relaxed">Alle Wetten werden zurückgebucht.</div>
            <div className="text-[11px] text-red/80 font-bold uppercase tracking-wider mb-5">Kann nicht rückgängig gemacht werden!</div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setPendingClose(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={async () => { await closeMarket(pendingClose.marketId); setPendingClose(null); }} className="flex-1 p-3 rounded-xl font-bold text-white bg-gradient-to-r from-red to-orange shadow-[0_0_15px_rgba(255,61,90,0.4)] transition-all">✓ Schließen & Refund</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-red/10 border border-red/25 flex items-center justify-center text-[28px] mb-4">🗑</div>
            <div className="text-[20px] font-black text-white mb-2">Frage löschen</div>
            <div className="text-[13px] text-white/90 font-semibold mb-1 leading-snug">„{pendingDelete.question}"</div>
            <div className="text-[13px] text-muted mb-2 leading-relaxed">Gratis-Tipps werden verworfen, keine Token-Auswirkung.</div>
            <div className="text-[11px] text-red/80 font-bold uppercase tracking-wider mb-5">Kann nicht rückgängig gemacht werden!</div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setPendingDelete(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={async () => { await deleteMarket(pendingDelete.marketId); setPendingDelete(null); }} className="flex-1 p-3 rounded-xl font-bold text-white bg-gradient-to-r from-red to-orange shadow-[0_0_15px_rgba(255,61,90,0.4)] transition-all">🗑 Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}