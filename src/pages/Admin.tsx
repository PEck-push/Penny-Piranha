import { useState } from 'react';
import { useStore, MarketOption, buildSelectionKey } from '../store';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { WM2026_GROUP_SCHEDULE } from '../data/wm2026Schedule';
import type { ScheduleMatch } from '../store';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { deName } from '../utils/teams';
import { getLimits, type Phase } from '../utils/phase';
import { INTERNATIONAL_SPECIALS, JACKPOT_TEMPLATES, JACKPOT_BLOCK_LABELS, type SpecialBetTemplate } from '../data/specialBets';
import { ACCESSORIES } from '../data/accessories';
import { SHOP_SLOTS, SHOP_SLOT_LABELS, type ShopSlot, type ShopUnlockRule } from '../data/shopItems';
import CharacterAvatar from '../components/CharacterAvatar';
import { isAdminEmail } from '../config/admins';

const GROUP_LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// Drop-Preset-Auswahl für Shop-Items (Admin-Dropdown). Wert „none" entfernt jede
// Freischalt-Sperre; die anderen Werte setzen unlockRule + Anzeige-Label.
type UnlockPresetKey = 'none' | 'matchday_1' | 'matchday_2' | 'matchday_3' | 'group_end';
const UNLOCK_PRESETS: Array<{ key: UnlockPresetKey; label: string; rule: ShopUnlockRule | null; unlockLabel: string | null }> = [
  { key: 'none',       label: 'Sofort verfügbar',     rule: null, unlockLabel: null },
  { key: 'matchday_1', label: '⚽ Ab Spieltag 1',     rule: { kind: 'fifaMatchday', matchday: 1 }, unlockLabel: 'Ab dem 1. Spieltag' },
  { key: 'matchday_2', label: '⚽ Ab Spieltag 2',     rule: { kind: 'fifaMatchday', matchday: 2 }, unlockLabel: 'Ab dem 2. Spieltag' },
  { key: 'matchday_3', label: '⚽ Ab Spieltag 3',     rule: { kind: 'fifaMatchday', matchday: 3 }, unlockLabel: 'Ab dem 3. Spieltag' },
  { key: 'group_end',  label: '🏆 Nach Gruppenphase', rule: { kind: 'afterGroupStage' },           unlockLabel: 'Nach der Gruppenphase' },
];
const presetKeyForItem = (rule?: ShopUnlockRule): UnlockPresetKey => {
  if (!rule) return 'none';
  if (rule.kind === 'fifaMatchday' && rule.matchday === 1) return 'matchday_1';
  if (rule.kind === 'fifaMatchday' && rule.matchday === 2) return 'matchday_2';
  if (rule.kind === 'fifaMatchday' && rule.matchday === 3) return 'matchday_3';
  if (rule.kind === 'afterGroupStage') return 'group_end';
  return 'none';
};

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
  const [isMultiSelect, setIsMultiSelect] = useState(false);
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
  // Gratis-/Jackpot-Wette schließen: Löschen ODER Absagen wählbar
  const [pendingFreeClose, setPendingFreeClose] = useState<{ marketId: string; question: string } | null>(null);

  // Multiple-Choice-Auflösung: richtige Options-Menge je Markt
  const [mcResolveSel, setMcResolveSel] = useState<Record<string, string[]>>({});

  // Accessoires & Block-Preise
  const [accPlayer, setAccPlayer] = useState('');
  const [accId, setAccId] = useState('');
  const [accMsg, setAccMsg] = useState('');
  // Shop-Verwaltung
  const [shopMsg, setShopMsg] = useState('');
  const [shopFormOpen, setShopFormOpen] = useState(false);
  const [priceEdit, setPriceEdit] = useState<Record<string, string>>({}); // Item-ID → eingegebener Preis
  const [descEdit, setDescEdit] = useState<Record<string, string>>({});   // Item-ID → eingegebene Beschreibung
  const [shopForm, setShopForm] = useState({
    id: '', label: '', description: '', slot: 'head' as ShopSlot, icon: '👑',
    price: 100, available: true, phase: '', sortOrder: 100,
    stock: '', unlockLabel: '',
  });
  // Avatar-Reset (Test)
  const [resetCharPlayer, setResetCharPlayer] = useState('');
  const [resetCharMsg, setResetCharMsg] = useState('');

  // Jackpot/Hausbank manuell setzen
  const [jackpotInput, setJackpotInput] = useState('');
  const [pendingJackpot, setPendingJackpot] = useState<number | null>(null);

  // Eigene Gratis-Wette erstellen (gleiches Prinzip wie Jackpot-Runden)
  const [freeBetQuestion, setFreeBetQuestion] = useState('');
  const [freeBetFormat, setFreeBetFormat] = useState<'binary' | 'single' | 'multi'>('binary');
  const [freeBetOptions, setFreeBetOptions] = useState<string[]>(['', '']);
  const [freeBetPrize, setFreeBetPrize] = useState('0');
  const [freeBetMsg, setFreeBetMsg] = useState('');

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
  // API check
  const [apiCheckStatus, setApiCheckStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [apiCheckResult, setApiCheckResult] = useState<any>(null);
  // WhatsApp config
  const [waLinkInput, setWaLinkInput] = useState('');
  const [waLinkStatus, setWaLinkStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [waTestStatus, setWaTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [waTestMsg, setWaTestMsg] = useState('');
  // Force-open market (testMode only)
  const [forceOpenMatchId, setForceOpenMatchId] = useState('');
  const [forceOpenStatus, setForceOpenStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [forceOpenMsg, setForceOpenMsg] = useState('');
  // Sim result (testMode only)
  const [simMarketId, setSimMarketId] = useState<string | null>(null);
  const [simScoreA, setSimScoreA] = useState('');
  const [simScoreB, setSimScoreB] = useState('');
  const [simStatus, setSimStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [simMsg, setSimMsg] = useState('');
  // Golden-Test: echtes Spiel (z.B. CL-Finale) laden + Markt anlegen
  const [clStatus, setClStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [clMsg, setClMsg] = useState('');
  const [clMatches, setClMatches] = useState<{ id: number; home: string; away: string; utcDate: string; status: string }[]>([]);

  const markets = useStore(s => s.markets);
  const answers = useStore(s => s.answers);
  const jackpot = useStore(s => s.jackpot);
  const testMode = useStore(s => s.testMode);
  const createMarket = useStore(s => s.createMarket);
  const lockMarket = useStore(s => s.lockMarket);
  const pauseMarket = useStore(s => s.pauseMarket);
  const reopenMarket = useStore(s => s.reopenMarket);
  const giveTokens = useStore(s => s.giveTokens);
  const executeBuyback = useStore(s => s.executeBuyback);
  const liveSchedule = useStore(s => s.schedule);
  const fullReset = useStore(s => s.fullReset);
  const closeMarket = useStore(s => s.closeMarket);
  const deleteMarket = useStore(s => s.deleteMarket);
  const createTestPlayer = useStore(s => s.createTestPlayer);
  const autoBetTestPlayers = useStore(s => s.autoBetTestPlayers);
  const grantAccessory = useStore(s => s.grantAccessory);
  const awardBlockWinner = useStore(s => s.awardBlockWinner);
  const shopItems       = useStore(s => s.shopItems);
  const createShopItem  = useStore(s => s.createShopItem);
  const updateShopItem  = useStore(s => s.updateShopItem);
  const deleteShopItem  = useStore(s => s.deleteShopItem);
  const seedShopExamples = useStore(s => s.seedShopExamples);
  const seedShopFirstItems = useStore(s => s.seedShopFirstItems);
  const simulateReveal = useStore(s => s.simulateReveal);
  const placeBetAs = useStore(s => s.placeBetAs);
  const placeTipAs = useStore(s => s.placeTipAs);
  const setPlayerAdmin = useStore(s => s.setPlayerAdmin);
  const setPlayerApproved = useStore(s => s.setPlayerApproved);
  const resetPlayerCharacter = useStore(s => s.resetPlayerCharacter);
  const setAdminMessage = useStore(s => s.setAdminMessage);
  const setJackpot = useStore(s => s.setJackpot);
  const adminMessage = useStore(s => s.adminMessage);
  const players = useStore(s => s.players);
  const whatsappGroupLink = useStore(s => s.whatsappGroupLink ?? '');
  const setWhatsappGroupLink = useStore(s => s.setWhatsappGroupLink);
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
      id: crypto.randomUUID(), label: label.trim(), pool: 0,
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
      const multiplier = filledLegs.length >= 3 ? 6 : 3;
      // EIN echter Combo-Markt (Parlay): Spieler setzen einmal auf „alle richtig"
      // und gewinnen Einsatz × Multiplikator, wenn jede Vorhersage (Option A der
      // jeweiligen Frage) eintritt. Aufgelöst wird zentral über den Server.
      createMarket({
        question: newMarketQuestion.trim(),
        type: 'combo',
        status: 'open',
        createdBy: 'admin',
        options: [{ id: 'combo-win', label: '✓ Alle richtig', pool: 0 }],
        winningOptionId: null,
        resolutionType: null,
        isOpenQuestion: false,
        multiplier,
        minBet: 10,
        maxBet: 100,
        comboLegs: filledLegs.map((leg, i) => ({
          marketId: `leg-${i}`,
          marketQuestion: leg.question.trim(),
          predictedOptionId: 'a',
          predictedOptionLabel: leg.optionA.trim() || 'JA',
          status: 'pending' as const,
        })),
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
        multiSelect: isMultiSelect,
        ...(newMarketType === 'hot-take' ? { expiresAt: Date.now() + hotTakeMinutes * 60 * 1000 } : {}),
      });
    }

    setNewMarketQuestion('');
    setCustomOptions(['', '']);
    setIsBinary(true);
    setIsOpenQuestion(false);
    setIsMultiSelect(false);
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

  const handleCheckApi = async () => {
    setApiCheckStatus('loading');
    setApiCheckResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/.netlify/functions/check-api', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setApiCheckResult(data);
      setApiCheckStatus(data.ok ? 'ok' : 'error');
    } catch (err: any) {
      setApiCheckStatus('error');
      setApiCheckResult({ error: err.message });
    }
  };

  const handleSaveWaLink = async () => {
    if (!waLinkInput.trim()) return;
    setWaLinkStatus('loading');
    try {
      await setWhatsappGroupLink(waLinkInput.trim());
      setWaLinkStatus('ok');
      setTimeout(() => setWaLinkStatus('idle'), 2000);
    } catch {
      setWaLinkStatus('error');
    }
  };

  const handleTestWa = async () => {
    setWaTestStatus('loading');
    setWaTestMsg('');
    try {
      await setDoc(doc(db, 'appState', 'global'), { waTestRequest: Date.now() }, { merge: true });
      setWaTestStatus('ok');
      setWaTestMsg('✓ Testanforderung gesendet — Nachricht erscheint in ~1 Min in der Gruppe.');
    } catch (err: any) {
      setWaTestStatus('error');
      setWaTestMsg(err.message || 'Fehler');
    }
  };

  const handleForceOpen = async () => {
    if (!forceOpenMatchId) return;
    setForceOpenStatus('loading');
    setForceOpenMsg('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nicht eingeloggt.');
      const res = await fetch('/.netlify/functions/force-open-market', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: forceOpenMatchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setForceOpenStatus('ok');
      setForceOpenMsg(`✓ Markt erstellt: ${data.question}`);
      setForceOpenMatchId('');
    } catch (err: any) {
      setForceOpenStatus('error');
      setForceOpenMsg(err.message || 'Fehler');
    }
  };

  const callTestMatch = async (payload: Record<string, unknown>) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Nicht eingeloggt.');
    const res = await fetch('/.netlify/functions/create-test-match', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const handleLoadCl = async () => {
    setClStatus('loading'); setClMsg(''); setClMatches([]);
    try {
      const data = await callTestMatch({ action: 'list', competition: 'CL' });
      setClMatches(data.matches ?? []);
      setClStatus('ok');
      setClMsg(`✓ API liefert ${data.count} CL-Spiele.`);
    } catch (err: any) {
      setClStatus('error'); setClMsg(err.message || 'Fehler');
    }
  };

  const handleCreateCl = async (id: number) => {
    setClStatus('loading'); setClMsg('');
    try {
      const data = await callTestMatch({ action: 'create', competition: 'CL', footballDataOrgId: id });
      setClStatus('ok');
      setClMsg(data.skipped ? 'Markt existiert bereits.' : `✓ Markt erstellt: ${data.question} (${data.status})`);
    } catch (err: any) {
      setClStatus('error'); setClMsg(err.message || 'Fehler');
    }
  };

  const handleSimResult = async (marketId: string) => {
    setSimStatus('loading');
    setSimMsg('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nicht eingeloggt.');
      const res = await fetch('/.netlify/functions/sim-result', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId, scoreA: Number(simScoreA), scoreB: Number(simScoreB) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSimStatus('ok');
      setSimMsg(`✓ Aufgelöst: ${data.winningOptionId}`);
      setSimMarketId(null);
      setSimScoreA('');
      setSimScoreB('');
    } catch (err: any) {
      setSimStatus('error');
      setSimMsg(err.message || 'Fehler');
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

  // Echte WM-2026-Gruppenspiele: Phase = Gruppenphase UND FIFA-Matchday 1/2/3
  // UND ein Gruppenlabel mit Buchstabe A–L. Damit fallen Fremd-Wettbewerbs-
  // Imports (CL, EL, Friendlies …) und unsaubere Einträge raus.
  const groupPhaseMatches = scheduleSource.filter(
    m => (m.phase ?? 'gruppenphase') === 'gruppenphase'
      && (m.matchday === 1 || m.matchday === 2 || m.matchday === 3)
      && /Gruppe\s+[A-L]/i.test(m.groupLabel ?? ''),
  );
  // Diagnose: alles, was sich „Gruppenphase" nennt — inkl. unsauberer Reste.
  const rawGroupPhaseCount = scheduleSource.filter(
    m => (m.phase ?? 'gruppenphase') === 'gruppenphase',
  ).length;
  const scheduleNoise = rawGroupPhaseCount - groupPhaseMatches.length;
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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

  // Eigene Gratis-Wette: frei definierte Frage, einsatzfrei (noStake), fester
  // Haus-Preis — gleiches Auflösungsprinzip wie Jackpot-Runden.
  const buildFreeBetOptions = (): MarketOption[] => {
    if (freeBetFormat === 'binary') return [{ id: 'yes', label: 'JA', pool: 0 }, { id: 'no', label: 'NEIN', pool: 0 }];
    return freeBetOptions.filter(o => o.trim()).map(label => ({
      id: crypto.randomUUID(), label: label.trim(), pool: 0,
    }));
  };
  const canCreateFreeBet =
    freeBetQuestion.trim() !== '' &&
    (freeBetFormat === 'binary' || freeBetOptions.filter(o => o.trim()).length >= 2);
  const createFreeBet = () => {
    if (!canCreateFreeBet) return;
    if (markets.some(m => m.question === freeBetQuestion.trim())) {
      setFreeBetMsg('Eine Wette mit diesem Titel existiert bereits.');
      setTimeout(() => setFreeBetMsg(''), 3000);
      return;
    }
    createMarket({
      question: freeBetQuestion.trim(),
      type: 'standard',
      status: 'open',
      createdBy: 'admin',
      options: buildFreeBetOptions(),
      winningOptionId: null,
      resolutionType: null,
      isOpenQuestion: false,
      marketSubtype: 'jackpot',
      noStake: true,
      multiSelect: freeBetFormat === 'multi',
      fixedPrize: parseInt(freeBetPrize) || 0,
      absorbsJackpotPot: false,
      jackpotBlock: 'special',
      jackpotBlockLabel: JACKPOT_BLOCK_LABELS.special,
      minBet: 0,
      maxBet: 0,
      autoDeductAmount: 0,
      autoDeductProcessed: true,
    });
    setFreeBetMsg(`„${freeBetQuestion.trim()}" als Gratis-Wette erstellt.`);
    setFreeBetQuestion('');
    setFreeBetFormat('binary');
    setFreeBetOptions(['', '']);
    setFreeBetPrize('0');
    setTimeout(() => setFreeBetMsg(''), 4000);
  };

  const handleSetJackpot = () => {
    const v = parseInt(jackpotInput);
    if (isNaN(v) || v < 0) return;
    setPendingJackpot(v);
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

  // Zentrale, atomare Auflösung über den geschützten Server-Endpunkt. Ersetzt die
  // alten Client-Store-Auflösungen → identische Logik (Streak/Underdog/Feed) und
  // keine Lost-Update-Risiken. Das Ergebnis kommt per onSnapshot in die UI zurück.
  const [resolveBusy, setResolveBusy] = useState(false);
  const callResolve = async (payload: Record<string, unknown>): Promise<boolean> => {
    setResolveBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nicht eingeloggt.');
      const res = await fetch('/.netlify/functions/resolve-market', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      return true;
    } catch (err: any) {
      alert(`Auflösung fehlgeschlagen: ${err.message || err}`);
      return false;
    } finally {
      setResolveBusy(false);
    }
  };

  const executeResolution = async () => {
    if (!pendingResolution) return;
    const { marketId, optionId, type } = pendingResolution;
    const ok = type === 'win'
      ? await callResolve({ action: 'win', marketId, winningOptionId: optionId })
      : type === 'rollover'
        ? await callResolve({ action: 'rollover', marketId })
        : await callResolve({ action: 'storno', marketId });
    if (ok) setPendingResolution(null);
  };

  // Spieler endgültig entfernen (z. B. wenn nicht gezahlt wurde). Löscht Profil,
  // Wetten, Namens-Reservierung und Auth-Account über den geschützten Endpunkt.
  const [kickBusyId, setKickBusyId] = useState<string | null>(null);
  const handleKickPlayer = async (playerId: string, name: string) => {
    if (!window.confirm(`„${name}" wirklich endgültig entfernen?\n\nProfil, Wetten und Zugang werden gelöscht. Das kann nicht rückgängig gemacht werden.`)) return;
    setKickBusyId(playerId);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Nicht eingeloggt.');
      const res = await fetch('/.netlify/functions/kick-player', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (err: any) {
      alert(`Entfernen fehlgeschlagen: ${err.message || err}`);
    } finally {
      setKickBusyId(null);
    }
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

          {/* ── REVEAL TESTEN ──────────────────────────────────────── */}
          <div className="bg-card border border-purple2/25 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🎬</span>
              <div className="text-[11px] font-black text-purple2 tracking-[0.15em] uppercase">Reveal testen</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Setzt deine Tagesbilanz auf einen Testwert und springt ins Dashboard — der
              Reveal-Screen (Zauberer-Video + Zahl) spielt dann sofort ab.
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={async () => { await simulateReveal(Math.floor(Math.random() * 480 + 20)); navigate('/dashboard'); }}
                className="p-2.5 rounded-xl bg-yellow/15 border border-yellow/40 text-yellow text-[11px] font-black hover:bg-yellow/25 transition-colors">
                🎉 Gewinn
              </button>
              <button
                onClick={async () => { await simulateReveal(-Math.floor(Math.random() * 480 + 20)); navigate('/dashboard'); }}
                className="p-2.5 rounded-xl bg-red/15 border border-red/40 text-red text-[11px] font-black hover:bg-red/25 transition-colors">
                💥 Verlust
              </button>
              <button
                onClick={async () => {
                  const v = Math.floor(Math.random() * 480 + 20) * (Math.random() < 0.5 ? -1 : 1);
                  await simulateReveal(v);
                  navigate('/dashboard');
                }}
                className="p-2.5 rounded-xl bg-purple/15 border border-purple2/40 text-purple2 text-[11px] font-black hover:bg-purple/25 transition-colors">
                🎲 Zufall
              </button>
            </div>
          </div>

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

          {/* ── API PRÜFEN ───────────────────────────────────────── */}
          <div className="bg-card border border-blue2/20 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🔍</span>
              <div className="text-[11px] font-black text-blue2 tracking-[0.15em] uppercase">API prüfen</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Prüft API-Key und WC-Match-Verfügbarkeit. Zeigt FINISHED/SCHEDULED-Zähler und frühestes Spieldatum.
            </div>
            {apiCheckResult && (
              <div className={clsx('rounded-xl px-3 py-2 text-[11px] font-mono mb-3 overflow-auto max-h-[200px] whitespace-pre-wrap break-all',
                apiCheckStatus === 'ok' ? 'bg-green/10 border border-green/30 text-green' : 'bg-red/10 border border-red/30 text-red')}>
                {JSON.stringify(apiCheckResult, null, 2)}
              </div>
            )}
            <button
              onClick={handleCheckApi}
              disabled={apiCheckStatus === 'loading'}
              className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[13px] font-black text-white cursor-pointer shadow-[0_4px_18px_rgba(59,110,255,0.3)] transition-all hover:-translate-y-px disabled:opacity-50"
            >
              {apiCheckStatus === 'loading' ? 'Prüfe…' : '🔍 API jetzt prüfen'}
            </button>
          </div>

          {/* ── GOLDEN TEST: echtes Spiel (CL-Finale) ──────────── */}
          <div className="bg-card border border-purple2/25 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🏆</span>
              <div className="text-[11px] font-black text-purple2 tracking-[0.15em] uppercase">Golden Test (CL-Finale)</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Lädt echte Champions-League-Spiele von der API (= API-Test) und legt für ein Spiel
              einen Markt an. Nach Abpfiff löst <b className="text-white">auto-resolve</b> ihn
              automatisch auf — End-to-End-Test der ganzen Pipeline.
            </div>
            {clMsg && (
              <div className={clsx('rounded-xl px-3 py-2 text-[12px] font-bold text-center mb-3',
                clStatus === 'ok' ? 'bg-green/10 border border-green/30 text-green' :
                clStatus === 'error' ? 'bg-red/10 border border-red/30 text-red' :
                'bg-blue/10 border border-blue2/30 text-blue2')}>
                {clStatus === 'loading' ? 'Lädt…' : clMsg}
              </div>
            )}
            <button onClick={handleLoadCl} disabled={clStatus === 'loading'}
              className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-blue to-purple font-sans text-[13px] font-black text-white cursor-pointer shadow-[0_4px_18px_rgba(59,110,255,0.3)] transition-all hover:-translate-y-px disabled:opacity-50 mb-2">
              🌐 CL-Spiele laden
            </button>
            {clMatches.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto no-scrollbar">
                {clMatches.map(m => {
                  const exists = markets.some(mk => (mk as any).footballDataOrgId === m.id);
                  return (
                    <div key={m.id} className="flex items-center gap-2 bg-input rounded-xl p-2 px-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold text-white truncate">{m.home} vs. {m.away}</div>
                        <div className="text-[9px] text-muted">{toCEST(new Date(m.utcDate).getTime())} · {m.status}</div>
                      </div>
                      <button onClick={() => handleCreateCl(m.id)} disabled={exists || clStatus === 'loading'}
                        className={clsx('text-[10px] font-black rounded-lg px-2 py-1.5 border whitespace-nowrap shrink-0',
                          exists ? 'border-green/20 bg-green/5 text-muted opacity-60' : 'border-purple2/40 bg-purple/10 text-purple2 hover:bg-purple/20')}>
                        {exists ? '✓ Markt da' : '+ Markt'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── FORCE-OPEN MARKET (testMode only) ──────────────── */}
          {testMode && liveSchedule.length > 0 && (
            <div className="bg-card border border-yellow/20 rounded-2xl p-4 mb-2.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[18px]">🧪</span>
                <div className="text-[11px] font-black text-yellow tracking-[0.15em] uppercase">Markt sofort öffnen (Test)</div>
              </div>
              <div className="text-[10px] text-muted mb-3">
                Öffnet sofort einen WM-Markt — ignoriert die 48h-Regel. Nur im Testmodus.
              </div>
              {forceOpenMsg && (
                <div className={clsx('rounded-xl px-3 py-2 text-[12px] font-bold text-center mb-3',
                  forceOpenStatus === 'ok' ? 'bg-green/10 border border-green/30 text-green' : 'bg-red/10 border border-red/30 text-red')}>
                  {forceOpenMsg}
                </div>
              )}
              <select
                value={forceOpenMatchId}
                onChange={e => setForceOpenMatchId(e.target.value)}
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-yellow/60 mb-2"
              >
                <option value="">Spiel wählen…</option>
                {liveSchedule
                  .filter(m => !markets.some(mkt => mkt.matchId === m.matchId))
                  .sort((a, b) => a.kickoffAt - b.kickoffAt)
                  .slice(0, 30)
                  .map(m => (
                    <option key={m.matchId} value={m.matchId}>
                      {m.teamA} vs. {m.teamB} ({new Date(m.kickoffAt).toLocaleDateString('de-AT')})
                    </option>
                  ))
                }
              </select>
              <button
                onClick={handleForceOpen}
                disabled={!forceOpenMatchId || forceOpenStatus === 'loading'}
                className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-yellow to-orange font-sans text-[13px] font-black text-bg cursor-pointer shadow-[0_4px_18px_rgba(230,180,60,0.3)] transition-all hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {forceOpenStatus === 'loading' ? 'Öffne…' : '🚀 Markt jetzt öffnen'}
              </button>
            </div>
          )}

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
            {scheduleNoise > 0 && (
              <div className="mt-2 text-[10px] text-yellow/90 leading-snug">
                ⚠ Im Spielplan stehen <b>{rawGroupPhaseCount}</b> als „Gruppenphase" markierte Einträge,
                aber nur <b>{groupPhaseMatches.length}</b> sind echte WM-Spiele (Matchday 1–3, Gruppe A–L).
                Die {scheduleNoise} unsauberen Einträge stammen wahrscheinlich aus einem Fremd-Import
                (z. B. CL) — bereinige sie über „Spielplan jetzt laden" mit <code>?competition=WC</code>
                oder lösche die Reste in Firestore.
              </div>
            )}
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
              Jackpot an (aktuell angespart: <b className="text-yellow">{jackpot} TKN</b>) und fließen in die
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

          {/* ── EIGENE GRATIS-WETTE ───────────────────────────────── */}
          <div className="bg-card border border-yellow/25 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🆓</span>
              <div className="text-[11px] font-black text-yellow tracking-[0.15em] uppercase">Eigene Gratis-Wette</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Frei definierte Frage nach dem Jackpot-Prinzip: einsatzfrei, Spieler tippen gratis.
              Der feste Haus-Preis wird bei der Auflösung gleichmäßig auf alle richtigen Tipper
              verteilt. Auflösung & Schließen über „Märkte verwalten".
            </div>
            {freeBetMsg && (
              <div className="bg-yellow/10 border border-yellow/30 rounded-xl px-3 py-2 text-[12px] font-bold text-center text-yellow mb-3">
                {freeBetMsg}
              </div>
            )}

            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Frage / Titel</label>
              <input type="text" value={freeBetQuestion} onChange={e => setFreeBetQuestion(e.target.value)}
                placeholder="z. B. Wer schießt das erste Tor?"
                className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-yellow/60 placeholder:text-muted" />
            </div>

            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Antwort-Modus</label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {([
                  ['binary', 'Binär'],
                  ['single', 'Single Choice'],
                  ['multi',  'Multiple Choice'],
                ] as const).map(([mode, label]) => (
                  <div key={mode} onClick={() => setFreeBetFormat(mode)}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      freeBetFormat === mode ? "border-yellow/50 text-yellow bg-yellow/10" : "border-border text-muted hover:border-yellow/40")}>
                    {label}
                  </div>
                ))}
              </div>
              {freeBetFormat === 'multi' && (
                <div className="text-[10px] text-blue2 bg-blue/10 border border-blue2/30 rounded-xl px-2.5 py-2 mb-2">
                  ☑️ Spieler darf mehrere Antworten ankreuzen. Gewinn nur bei <b>exakt</b> richtiger Auswahl.
                </div>
              )}
              {freeBetFormat !== 'binary' && (
                <div className="flex flex-col gap-1.5">
                  {freeBetOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 bg-yellow/20 text-yellow">{i + 1}</div>
                      <input type="text" value={opt} onChange={e => { const n = [...freeBetOptions]; n[i] = e.target.value; setFreeBetOptions(n); }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 bg-input border border-border rounded-xl p-2.5 px-3 text-white font-sans text-[13px] font-bold outline-none focus:border-yellow/60 placeholder:text-muted" />
                      {freeBetOptions.length > 2 && (
                        <button onClick={() => setFreeBetOptions(freeBetOptions.filter((_, idx) => idx !== i))}
                          className="w-7 h-7 rounded-lg bg-red/10 border border-red/25 text-red text-[12px] flex items-center justify-center hover:bg-red/20">✕</button>
                      )}
                    </div>
                  ))}
                  {freeBetOptions.length < 8 && (
                    <button onClick={() => setFreeBetOptions([...freeBetOptions, ''])}
                      className="mt-1 w-full p-2 border border-dashed border-white/15 rounded-xl text-[11px] font-black text-muted hover:text-white hover:border-yellow/40 transition-colors">
                      + Option hinzufügen
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-[10px] font-black text-muted tracking-[0.12em] uppercase mb-1.5">Fester Haus-Preis (TKN)</label>
              <input type="number" min="0" value={freeBetPrize} onChange={e => setFreeBetPrize(e.target.value)}
                className="w-full bg-input border border-border rounded-xl p-3 px-3.5 text-white font-sans text-[14px] font-bold outline-none focus:border-yellow/60" />
              <div className="text-[10px] text-muted mt-1.5">0 = reiner Gratis-Spaß-Tipp ohne Auszahlung.</div>
            </div>

            <button onClick={createFreeBet} disabled={!canCreateFreeBet}
              className="w-full p-3 border-none rounded-xl bg-gradient-to-br from-yellow to-orange font-sans text-[13px] font-black text-bg cursor-pointer shadow-[0_4px_18px_rgba(230,180,60,0.3)] transition-all hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed">
              🆓 Gratis-Wette erstellen
            </button>
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
                  <div key={t} onClick={() => { setNewMarketType(t); setIsOpenQuestion(false); setIsMultiSelect(false); setComboLegs([]); }}
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
                <div className={clsx("grid gap-1.5 mb-2", newMarketType === 'anonymous' ? 'grid-cols-4' : 'grid-cols-3')}>
                  <div onClick={() => { setIsBinary(true); setIsOpenQuestion(false); setIsMultiSelect(false); }}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      isBinary && !isOpenQuestion && !isMultiSelect ? "border-green/50 text-green bg-green/10" : "border-border text-muted hover:border-blue/40")}>
                    Binär
                  </div>
                  <div onClick={() => { setIsBinary(false); setIsOpenQuestion(false); setIsMultiSelect(false); }}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      !isBinary && !isOpenQuestion && !isMultiSelect ? "border-blue2/50 text-blue2 bg-blue/10" : "border-border text-muted hover:border-blue/40")}>
                    Single
                  </div>
                  <div onClick={() => { setIsBinary(false); setIsOpenQuestion(false); setIsMultiSelect(true); }}
                    className={clsx("bg-input border rounded-xl p-2.5 text-center text-[11px] font-extrabold cursor-pointer transition-all",
                      isMultiSelect ? "border-blue2/50 text-blue2 bg-blue/10" : "border-border text-muted hover:border-blue/40")}>
                    Multiple
                  </div>
                  {newMarketType === 'anonymous' && (
                    <div onClick={() => { setIsOpenQuestion(true); setIsBinary(false); setIsMultiSelect(false); }}
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

                {isMultiSelect && (
                  <div className="bg-blue/10 border border-blue2/30 rounded-xl p-2.5 text-[11px] text-blue2 font-bold mb-2">
                    ☑️ Spieler kreuzt mehrere Antworten an. Gewinn nur bei <b>exakt</b> richtiger Auswahl; Topf wird unter exakten Treffern aufgeteilt.
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
            <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-1.5">Märkte verwalten</div>
            <div className="text-[10px] text-muted mb-3.5 leading-relaxed">
              <b className="text-yellow">🔒 Sperren:</b> Wettannahme stoppt, Markt bleibt für Spieler sichtbar. ·{' '}
              <b className="text-blue2">⏸ Pause:</b> Markt wird für Spieler ausgeblendet (Einsätze bleiben). ·{' '}
              <b className="text-green">🔓 Öffnen:</b> macht Sperre/Pause rückgängig.
            </div>
            {markets.filter(m => m.status !== 'resolved').map(m => (
              <div key={m.id} className="bg-input rounded-xl p-3 mb-2">
                {/* Zeile 1: Frage in voller Breite (mit Ellipsis bei Overflow) */}
                <div className="text-[12px] font-bold text-white truncate mb-2">{m.question}</div>
                {/* Zeile 2: Status-Badges + Aktions-Buttons */}
                <div className="flex items-center gap-x-1.5 gap-y-2 flex-wrap">
                  {m.status === 'locked' && (
                    <span className="text-[9px] font-black tracking-wider text-yellow bg-yellow/10 border border-yellow/30 rounded px-1.5 py-1 shrink-0">🔒 GESPERRT</span>
                  )}
                  {m.status === 'paused' && (
                    <span className="text-[9px] font-black tracking-wider text-blue2 bg-blue/10 border border-blue2/30 rounded px-1.5 py-1 shrink-0">⏸ PAUSIERT</span>
                  )}
                  {m.status === 'cancelled' && (
                    <>
                      <span className="text-[9px] font-black tracking-wider text-muted bg-white/5 border border-white/15 rounded px-1.5 py-1 shrink-0">🚫 ABGESAGT</span>
                      <button onClick={() => deleteMarket(m.id)} className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-red border-red/35 hover:bg-red/10 shrink-0">🗑 ENTFERNEN</button>
                    </>
                  )}
                  {(m.status === 'locked' || m.status === 'paused') && (
                    <button onClick={() => reopenMarket(m.id)} className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-green border-green/35 hover:bg-green/10">🔓 ÖFFNEN</button>
                  )}
                  {m.status === 'open' && (
                    <button onClick={() => lockMarket(m.id)} className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-yellow border-yellow/35 hover:bg-yellow/10">🔒 SPERREN</button>
                  )}
                  {(m.status === 'open' || m.status === 'locked') && (
                    <button onClick={() => pauseMarket(m.id)} className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-blue2 border-blue2/35 hover:bg-blue/10">⏸ PAUSE</button>
                  )}
                  {(m.status === 'open' || m.status === 'locked' || m.status === 'paused') && (
                    m.noStake
                      ? <button onClick={() => setPendingFreeClose({ marketId: m.id, question: m.question })} className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-red border-red/35 hover:bg-red/10">✕ SCHLIESSEN</button>
                      : <button onClick={() => setPendingClose({ marketId: m.id, question: m.question })} className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-red border-red/35 hover:bg-red/10">✕ SCHLIESSEN</button>
                  )}
                </div>
                {(m.status === 'open' || m.status === 'locked') && (
                <div className="flex flex-wrap gap-x-1.5 gap-y-2 mt-2.5 pt-2.5 border-t border-white/5">
                  {m.isOpenQuestion ? (
                    // Open question: single button opens answer picker
                    <button
                      onClick={() => { setOpenQModal(m.id); setSelectedWinners(new Set()); }}
                      className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-green border-green/35 hover:bg-green/10">
                      ✏️ Antworten auswerten
                    </button>
                  ) : m.multiSelect ? (
                    // Multiple-Choice: richtige Menge ankreuzen, dann exakt auflösen
                    (() => {
                      const sel = mcResolveSel[m.id] ?? [];
                      const toggle = (id: string) => setMcResolveSel(s => {
                        const cur = s[m.id] ?? [];
                        return { ...s, [m.id]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
                      });
                      return (
                        <div className="w-full flex flex-col gap-2">
                          <div className="text-[10px] font-black text-blue2">☑️ Richtige Antworten ankreuzen:</div>
                          <div className="flex flex-wrap gap-x-1.5 gap-y-2">
                            {m.options.map(opt => {
                              const on = sel.includes(opt.id);
                              return (
                                <button key={opt.id} onClick={() => toggle(opt.id)}
                                  className={clsx('text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer font-sans whitespace-nowrap transition-all',
                                    on ? 'text-green border-green/50 bg-green/15' : 'text-muted border-muted/35 hover:bg-white/5')}>
                                  {on ? '☑ ' : '☐ '}{opt.label}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            disabled={sel.length === 0}
                            onClick={() => {
                              const labels = m.options.filter(o => sel.includes(o.id)).map(o => o.label).join(' + ');
                              setPendingResolution({ marketId: m.id, optionId: buildSelectionKey(sel), optionLabel: labels, type: 'win' });
                            }}
                            className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-green border-green/35 hover:bg-green/10 disabled:opacity-40 self-start">
                            ✓ Exakt auflösen ({sel.length})
                          </button>
                        </div>
                      );
                    })()
                  ) : m.type === 'combo' ? (
                    // Combo: entweder alle Vorhersagen richtig (×Multiplikator) oder gescheitert.
                    <>
                      <button
                        onClick={() => setPendingResolution({ marketId: m.id, optionId: 'combo-win', optionLabel: `✓ Alle richtig (×${m.multiplier ?? 3})`, type: 'win' })}
                        className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-green border-green/35 hover:bg-green/10">
                        ✓ Alle richtig (×{m.multiplier ?? 3})
                      </button>
                      <button
                        onClick={() => setPendingResolution({ marketId: m.id, optionId: 'combo-miss', optionLabel: '✗ Gescheitert — Einsätze in den Jackpot', type: 'win' })}
                        className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-red border-red/35 hover:bg-red/10">
                        ✗ Gescheitert
                      </button>
                    </>
                  ) : (
                    m.options.map((opt, i) => {
                      const colors = ['text-green border-green/35 hover:bg-green/10','text-red border-red/35 hover:bg-red/10','text-blue2 border-blue2/35 hover:bg-blue/10','text-yellow border-yellow/35 hover:bg-yellow/10','text-purple2 border-purple2/35 hover:bg-purple/10'];
                      return (
                        <button key={opt.id}
                          onClick={() => setPendingResolution({ marketId: m.id, optionId: opt.id, optionLabel: opt.label, type: 'win' })}
                          className={clsx("text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap transition-all", colors[i] ?? colors[0])}>
                          ✓ {opt.label}
                        </button>
                      );
                    })
                  )}
                  {m.type !== 'combo' && (
                    <button onClick={() => setPendingResolution({ marketId: m.id, optionId: '', optionLabel: 'ROLLOVER', type: 'rollover' })}
                      className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-purple2 border-purple2/35 hover:bg-purple2/10">
                      🎰 ROLLOVER
                    </button>
                  )}
                  <button onClick={() => setPendingResolution({ marketId: m.id, optionId: '', optionLabel: 'STORNO', type: 'storno' })}
                    className="text-[10px] font-black rounded-lg px-2.5 py-2.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-muted border-muted/35 hover:bg-muted/10">
                    ↩️ STORNO
                  </button>
                </div>
                )}
                {/* Sim-result: only for locked wm-match markets in testMode */}
                {testMode && m.marketSubtype === 'wm-match' && m.status === 'locked' && (
                  <div className="mt-2">
                    {simMarketId === m.id ? (
                      <div className="bg-yellow/5 border border-yellow/20 rounded-xl p-2.5">
                        <div className="text-[10px] font-black text-yellow mb-2">⚽ Ergebnis simulieren</div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] text-muted shrink-0">{m.teamA}</span>
                          <input type="number" min="0" max="20" value={simScoreA} onChange={e => setSimScoreA(e.target.value)}
                            className="w-10 bg-white/5 border border-border rounded-lg px-2 py-1 text-[13px] text-white text-center outline-none focus:border-yellow/60" />
                          <span className="text-muted">:</span>
                          <input type="number" min="0" max="20" value={simScoreB} onChange={e => setSimScoreB(e.target.value)}
                            className="w-10 bg-white/5 border border-border rounded-lg px-2 py-1 text-[13px] text-white text-center outline-none focus:border-yellow/60" />
                          <span className="text-[10px] text-muted shrink-0">{m.teamB}</span>
                        </div>
                        {simMsg && simMarketId === m.id && (
                          <div className={clsx('text-[10px] font-bold text-center mb-1.5',
                            simStatus === 'ok' ? 'text-green' : 'text-red')}>{simMsg}</div>
                        )}
                        <div className="flex gap-1.5">
                          <button onClick={() => handleSimResult(m.id)}
                            disabled={simScoreA === '' || simScoreB === '' || simStatus === 'loading'}
                            className="flex-1 p-1.5 rounded-lg bg-yellow/20 border border-yellow/40 text-yellow text-[10px] font-black disabled:opacity-40">
                            {simStatus === 'loading' ? '…' : '✓ Auflösen'}
                          </button>
                          <button onClick={() => { setSimMarketId(null); setSimScoreA(''); setSimScoreB(''); setSimMsg(''); }}
                            className="px-2.5 rounded-lg bg-white/5 border border-border text-muted text-[10px] font-black">
                            Abbruch
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setSimMarketId(m.id); setSimScoreA(''); setSimScoreB(''); setSimMsg(''); }}
                        className="text-[10px] font-black rounded-lg px-2 py-1.5 border cursor-pointer bg-transparent font-sans whitespace-nowrap text-yellow border-yellow/35 hover:bg-yellow/10">
                        ⚽ Ergebnis sim.
                      </button>
                    )}
                  </div>
                )}
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

          {/* ── SPIELER-FREIGABE (Pending) ─────────────────────────── */}
          <div className="bg-card border border-green/25 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">✅</span>
              <div className="text-[11px] font-black text-green tracking-[0.15em] uppercase">Spieler freigeben</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Neue Spieler sind <b className="text-yellow">pending</b> und können erst spielen, wenn du sie
              freigibst (z. B. nach erfolgter Einzahlung).
            </div>
            {(() => {
              const pending = players.filter(p => !p.isTestPlayer && p.approved === false);
              if (pending.length === 0) return <div className="text-[12px] text-muted text-center py-2">Keine offenen Freigaben.</div>;
              return pending.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-input rounded-xl p-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-black text-white truncate flex items-center gap-1.5">
                      {p.name}
                      <span className="text-[9px] font-black text-yellow bg-yellow/10 border border-yellow/25 rounded px-1.5 py-0.5">PENDING</span>
                    </div>
                    {p.email && <div className="text-[10px] text-muted truncate">{p.email}</div>}
                  </div>
                  <button onClick={() => handleKickPlayer(p.id, p.name)} disabled={kickBusyId === p.id}
                    title="Spieler rauswerfen"
                    className="shrink-0 w-9 h-9 rounded-xl bg-red/10 border border-red/35 text-red font-black text-[14px] hover:bg-red/20 transition-colors cursor-pointer font-sans disabled:opacity-40 flex items-center justify-center">
                    {kickBusyId === p.id ? '…' : '✕'}
                  </button>
                  <button onClick={() => {
                      if (window.confirm(`„${p.name}" wirklich freigeben?\n\nDanach kann der Spieler sofort wetten und zählt für die Auswertung mit.`)) {
                        setPlayerApproved(p.id, true);
                      }
                    }}
                    className="shrink-0 px-3 py-2 rounded-xl bg-green/15 border border-green/40 text-green font-black text-[12px] hover:bg-green/25 transition-colors cursor-pointer font-sans">
                    ✓ Freigeben
                  </button>
                </div>
              ));
            })()}
          </div>

          {/* ── AVATAR-RESET (nur Testmodus) ───────────────────────── */}
          {testMode && (
            <div className="bg-card border border-red/25 rounded-2xl p-4 mb-2.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[18px]">🔁</span>
                <div className="text-[11px] font-black text-red tracking-[0.15em] uppercase">Avatar-Reset (Test)</div>
              </div>
              <div className="text-[10px] text-muted mb-3">
                Setzt den Charakter eines Spielers zurück. Beim nächsten Aufruf muss er einen
                <b className="text-white"> neuen Charakter erstellen</b>. Tokens & Wetten bleiben unberührt.
              </div>
              {resetCharMsg && (
                <div className="bg-red/10 border border-red/30 rounded-xl px-3 py-2 text-[12px] font-bold text-center text-red mb-3">{resetCharMsg}</div>
              )}
              <div className="flex flex-col gap-2">
                <select value={resetCharPlayer} onChange={e => setResetCharPlayer(e.target.value)}
                  className="bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-red/60">
                  <option value="">Spieler wählen…</option>
                  {players.filter(p => !p.isTestPlayer).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  onClick={async () => {
                    if (!resetCharPlayer) return;
                    const name = players.find(p => p.id === resetCharPlayer)?.name ?? '?';
                    await resetPlayerCharacter(resetCharPlayer);
                    setResetCharMsg(`✓ Charakter von ${name} zurückgesetzt.`);
                    setResetCharPlayer('');
                    setTimeout(() => setResetCharMsg(''), 4000);
                  }}
                  disabled={!resetCharPlayer}
                  className="w-full p-2.5 rounded-xl bg-red/15 border border-red/40 text-red text-[12px] font-black disabled:opacity-40">
                  🔁 Charakter zurücksetzen
                </button>
              </div>
            </div>
          )}

          {/* ── ACCESSOIRES & BLOCK-PREISE ─────────────────────────── */}
          <div className="bg-card border border-yellow/25 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">🎁</span>
              <div className="text-[11px] font-black text-yellow tracking-[0.15em] uppercase">Accessoires & Preise</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Rein kosmetisch. „Block-Sieger küren" vergibt die Block-Preise (z.B. Österreich-Trikot)
              an den/die Spieler mit den meisten richtigen Tipps im Block. Manuelles Vergeben dient
              auch zum Testen der Anzeige.
            </div>
            {accMsg && (
              <div className="bg-yellow/10 border border-yellow/30 rounded-xl px-3 py-2 text-[12px] font-bold text-center text-yellow mb-3">
                {accMsg}
              </div>
            )}

            {/* Block-Sieger küren */}
            <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-1.5">Block-Sieger küren</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(['block1', 'austria', 'block2', 'finale'] as const).map(block => (
                <button key={block}
                  onClick={async () => {
                    const { winners } = await awardBlockWinner(block);
                    setAccMsg(winners.length
                      ? `🏆 ${JACKPOT_BLOCK_LABELS[block]}: ${winners.join(', ')}`
                      : `Keine richtigen Tipps im Block „${JACKPOT_BLOCK_LABELS[block]}" gefunden.`);
                    setTimeout(() => setAccMsg(''), 5000);
                  }}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-white font-black text-[11px] hover:border-yellow/50 transition-all text-left">
                  {JACKPOT_BLOCK_LABELS[block]}
                </button>
              ))}
            </div>

            {/* Manuell vergeben (Test) */}
            <div className="text-[10px] font-black text-muted uppercase tracking-[0.1em] mb-1.5">Manuell vergeben</div>
            <div className="flex flex-col gap-2">
              <select value={accPlayer} onChange={e => setAccPlayer(e.target.value)}
                className="bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-yellow/60">
                <option value="">Spieler wählen…</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={accId} onChange={e => setAccId(e.target.value)}
                className="bg-white/5 border border-border rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-yellow/60">
                <option value="">Accessoire wählen…</option>
                {ACCESSORIES.map(a => <option key={a.id} value={a.id}>{a.icon} {a.label} ({a.slot})</option>)}
              </select>
              <button
                onClick={async () => {
                  if (!accPlayer || !accId) return;
                  await grantAccessory(accPlayer, accId);
                  const pName = players.find(p => p.id === accPlayer)?.name ?? '?';
                  const aLabel = ACCESSORIES.find(a => a.id === accId)?.label ?? accId;
                  setAccMsg(`✓ „${aLabel}" an ${pName} vergeben.`);
                  setTimeout(() => setAccMsg(''), 4000);
                }}
                disabled={!accPlayer || !accId}
                className="w-full p-2.5 rounded-xl bg-yellow/20 border border-yellow/40 text-yellow text-[12px] font-black disabled:opacity-40">
                🎁 Freischalten
              </button>
            </div>
          </div>

          {/* ── SHOP-VERWALTUNG ─────────────────────────────────── */}
          <div className="bg-card border border-yellow/25 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[18px]">🛒</span>
                <div className="text-[11px] font-black text-yellow tracking-[0.15em] uppercase">Shop verwalten</div>
              </div>
              <div className="text-[10px] font-black text-muted">{shopItems.length} Items</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Hier definierst du, was Spieler im Shop für Tokens kaufen können.
              Grafiken kommen in <code className="text-yellow">public/shop/&lt;id&gt;.webp</code>.
              Neue Items lösen automatisch einen Feed-Eintrag und „Neu"-Punkt aus.
            </div>
            {shopMsg && (
              <div className="bg-yellow/10 border border-yellow/30 rounded-xl px-3 py-2 text-[12px] font-bold text-center text-yellow mb-3">
                {shopMsg}
              </div>
            )}
            {/* Schnellaktionen */}
            <button
              onClick={async () => {
                // Alle Torso-Items (ohne Platzhalter-Beispiele) nach sortOrder/createdAt ordnen.
                const torsos = shopItems
                  .filter(i => i.slot === 'torso' && !i.id.startsWith('ex_'))
                  .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
                if (torsos.length === 0) {
                  setShopMsg('Keine Torso-Items im Shop gefunden.');
                  setTimeout(() => setShopMsg(''), 4000);
                  return;
                }
                // ASV-Torso (id beginnt mit "asv") sofort verfügbar. Andere zwei auf Spieltag 1 + 2.
                const asv = torsos.find(i => /^asv/i.test(i.id));
                const rest = torsos.filter(i => i.id !== asv?.id).slice(0, 2);
                const updates: string[] = [];
                if (asv) {
                  await updateShopItem(asv.id, { unlockRule: null as any, unlockLabel: null as any, available: true });
                  updates.push(`${asv.label} → sofort`);
                }
                const matchdayPresets = [UNLOCK_PRESETS[1], UNLOCK_PRESETS[2]]; // Spieltag 1, 2
                for (let i = 0; i < rest.length; i++) {
                  const preset = matchdayPresets[i];
                  await updateShopItem(rest[i].id, {
                    unlockRule: preset.rule as any,
                    unlockLabel: preset.unlockLabel as any,
                    available: true,
                  });
                  updates.push(`${rest[i].label} → Spieltag ${i + 1}`);
                }
                setShopMsg(`✓ ${updates.join(' · ')}`);
                setTimeout(() => setShopMsg(''), 6000);
              }}
              className="w-full p-2.5 rounded-xl bg-yellow/15 border border-yellow/40 text-yellow text-[11px] font-black hover:bg-yellow/25 transition-colors mb-2">
              🎽 Torso-Drops verteilen (ASV sofort · andere auf Spieltag 1 + 2)
            </button>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                onClick={async () => {
                  const { added } = await seedShopFirstItems();
                  setShopMsg(added > 0 ? `✓ ${added} Items angelegt (Schwechi & Co).` : '✓ Items aktualisiert (Freischaltung aus Spielplan).');
                  setTimeout(() => setShopMsg(''), 4000);
                }}
                className="p-2.5 rounded-xl bg-yellow/15 border border-yellow/40 text-yellow text-[11px] font-black hover:bg-yellow/25 transition-colors">
                🍺 Erste Items anlegen
              </button>
              <button
                onClick={() => { setShopFormOpen(o => !o); setShopForm({ id: '', label: '', description: '', slot: 'head', icon: '👑', price: 100, available: true, phase: '', sortOrder: (shopItems.length + 1) * 10, stock: '', unlockLabel: '' }); }}
                className="p-2.5 rounded-xl bg-yellow/15 border border-yellow/40 text-yellow text-[11px] font-black hover:bg-yellow/25 transition-colors">
                {shopFormOpen ? '✕ Formular schließen' : '➕ Neues Item'}
              </button>
            </div>
            <button
              onClick={async () => {
                const { added } = await seedShopExamples();
                setShopMsg(added > 0 ? `✓ ${added} Platzhalter-Beispiele angelegt.` : 'Beispiele sind bereits vorhanden.');
                setTimeout(() => setShopMsg(''), 4000);
              }}
              className="w-full p-2 rounded-xl bg-white/5 border border-white/10 text-muted text-[10px] font-black hover:border-white/30 transition-colors mb-3">
              🌱 Platzhalter-Beispiele anlegen (zum Testen)
            </button>

            {/* Formular */}
            {shopFormOpen && (
              <div className="bg-white/3 border border-white/10 rounded-xl p-3 mb-3 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <input value={shopForm.id} onChange={e => setShopForm(f => ({ ...f, id: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() }))}
                    placeholder="id (a-z0-9_)" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                  <select value={shopForm.slot} onChange={e => setShopForm(f => ({ ...f, slot: e.target.value as ShopSlot }))}
                    className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60">
                    {SHOP_SLOTS.map(s => <option key={s.slot} value={s.slot}>{s.label}</option>)}
                  </select>
                </div>
                <input value={shopForm.label} onChange={e => setShopForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Name (z. B. Achtelfinale-Trikot)" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                <input value={shopForm.description} onChange={e => setShopForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Kurzbeschreibung" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={shopForm.icon} onChange={e => setShopForm(f => ({ ...f, icon: e.target.value }))}
                    placeholder="Emoji" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                  <input type="number" value={shopForm.price} onChange={e => setShopForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                    placeholder="Preis" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                  <input type="number" value={shopForm.sortOrder} onChange={e => setShopForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                    placeholder="Sort" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={shopForm.stock} onChange={e => setShopForm(f => ({ ...f, stock: e.target.value }))}
                    placeholder="Stückzahl (leer = ∞)" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                  <input value={shopForm.phase} onChange={e => setShopForm(f => ({ ...f, phase: e.target.value }))}
                    placeholder="Phase (optional)" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                </div>
                <input value={shopForm.unlockLabel} onChange={e => setShopForm(f => ({ ...f, unlockLabel: e.target.value }))}
                  placeholder="Freischalt-Hinweis (z. B. Ab dem 1. Spieltag) — leer = sofort" className="bg-input border border-border rounded-lg px-2.5 py-2 text-[12px] text-white outline-none focus:border-yellow/60" />
                <label className="flex items-center gap-2 text-[12px] text-white cursor-pointer">
                  <input type="checkbox" checked={shopForm.available} onChange={e => setShopForm(f => ({ ...f, available: e.target.checked }))} />
                  Sofort kaufbar (bei Freischalt-Hinweis ausschalten → sichtbar, aber gesperrt)
                </label>
                <button
                  onClick={async () => {
                    if (!shopForm.id || !shopForm.label || shopForm.price < 0) {
                      setShopMsg('ID, Name und Preis sind Pflicht.');
                      setTimeout(() => setShopMsg(''), 3000);
                      return;
                    }
                    if (shopItems.some(i => i.id === shopForm.id)) {
                      setShopMsg(`ID „${shopForm.id}" existiert bereits.`);
                      setTimeout(() => setShopMsg(''), 3000);
                      return;
                    }
                    const stockNum = parseInt(shopForm.stock);
                    await createShopItem({
                      id: shopForm.id,
                      label: shopForm.label,
                      description: shopForm.description,
                      slot: shopForm.slot,
                      icon: shopForm.icon || '🎁',
                      price: shopForm.price,
                      available: shopForm.available,
                      phase: shopForm.phase || undefined,
                      sortOrder: shopForm.sortOrder,
                      ...(Number.isFinite(stockNum) && stockNum > 0 ? { stock: stockNum, sold: 0 } : {}),
                      ...(shopForm.unlockLabel.trim() ? { unlockLabel: shopForm.unlockLabel.trim() } : {}),
                    });
                    setShopMsg(`✓ „${shopForm.label}" angelegt.`);
                    setShopFormOpen(false);
                    setTimeout(() => setShopMsg(''), 4000);
                  }}
                  className="w-full p-2.5 rounded-xl bg-gradient-to-br from-yellow to-[#B8860B] text-bg text-[12px] font-black shadow-[0_4px_14px_rgba(230,180,60,0.3)]">
                  ➕ Item anlegen
                </button>
              </div>
            )}

            {/* Liste vorhandener Items */}
            {shopItems.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {[...shopItems].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)).map(it => (
                  <div key={it.id} className="bg-input border border-border rounded-xl p-2.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[20px] shrink-0">{it.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-black text-white truncate">{it.label}</div>
                        <div className="text-[10px] text-muted">
                          {SHOP_SLOT_LABELS[it.slot]}
                          {it.stock != null ? ` · ★ ${Math.max(0, it.stock - (it.sold ?? 0))}/${it.stock}` : ''}
                          {it.unlockLabel ? ` · 🔒 ${it.unlockLabel}` : ''}
                        </div>
                      </div>
                      {/* Preis bearbeiten */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px]">🪙</span>
                        <input
                          type="number"
                          value={priceEdit[it.id] ?? String(it.price)}
                          onChange={e => setPriceEdit(p => ({ ...p, [it.id]: e.target.value }))}
                          onBlur={async () => {
                            const raw = priceEdit[it.id];
                            if (raw === undefined) return;
                            const n = parseInt(raw);
                            if (Number.isFinite(n) && n >= 0 && n !== it.price) {
                              await updateShopItem(it.id, { price: n });
                              setShopMsg(`✓ Preis „${it.label}": ${n} TKN.`);
                              setTimeout(() => setShopMsg(''), 3000);
                            }
                            setPriceEdit(p => { const c = { ...p }; delete c[it.id]; return c; });
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="w-16 bg-white/5 border border-border rounded-lg px-2 py-1 text-[12px] text-white text-right outline-none focus:border-yellow/60" />
                      </div>
                      <button
                        onClick={() => updateShopItem(it.id, { available: !it.available })}
                        className={clsx('text-[10px] font-black rounded-lg px-2 py-1 border',
                          it.available ? 'border-green/40 bg-green/10 text-green' : 'border-white/10 bg-white/5 text-muted')}>
                        {it.available ? 'Live' : 'Aus'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Item „${it.label}" wirklich löschen?`)) return;
                          await deleteShopItem(it.id);
                          setShopMsg(`✗ „${it.label}" gelöscht.`);
                          setTimeout(() => setShopMsg(''), 4000);
                        }}
                        className="text-[10px] font-black rounded-lg px-2 py-1 border border-red/40 bg-red/10 text-red hover:bg-red/20">
                        ✕
                      </button>
                    </div>
                    {/* Drop-Preset: Freischalt-Regel ändern */}
                    <select
                      value={presetKeyForItem(it.unlockRule)}
                      onChange={async e => {
                        const preset = UNLOCK_PRESETS.find(p => p.key === e.target.value as UnlockPresetKey);
                        if (!preset) return;
                        await updateShopItem(it.id, {
                          unlockRule: preset.rule as any,
                          unlockLabel: preset.unlockLabel as any,
                          available: true,
                        });
                        setShopMsg(`✓ „${it.label}" → ${preset.label}.`);
                        setTimeout(() => setShopMsg(''), 3000);
                      }}
                      className="bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-yellow/60">
                      {UNLOCK_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    {/* Beschreibung bearbeiten */}
                    <input
                      value={descEdit[it.id] ?? it.description ?? ''}
                      placeholder="Beschreibung…"
                      onChange={e => setDescEdit(p => ({ ...p, [it.id]: e.target.value }))}
                      onBlur={async () => {
                        const raw = descEdit[it.id];
                        if (raw === undefined) return;
                        const v = raw.trim();
                        if (v !== (it.description ?? '')) {
                          await updateShopItem(it.id, { description: v });
                          setShopMsg(`✓ Beschreibung „${it.label}" gespeichert.`);
                          setTimeout(() => setShopMsg(''), 3000);
                        }
                        setDescEdit(p => { const c = { ...p }; delete c[it.id]; return c; });
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted outline-none focus:border-yellow/60" />
                  </div>
                ))}
              </div>
            )}
          </div>

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
                      <>
                        <button
                          onClick={() => setPlayerAdmin(p.id, !p.isAdmin)}
                          className={clsx('shrink-0 px-3 py-2 rounded-xl font-black text-[12px] border transition-colors cursor-pointer font-sans',
                            p.isAdmin
                              ? 'bg-red/15 border-red/40 text-red hover:bg-red/25'
                              : 'bg-green/15 border-green/40 text-green hover:bg-green/25')}
                        >
                          {p.isAdmin ? '✕ Entziehen' : '✓ Zum Admin'}
                        </button>
                        <button onClick={() => handleKickPlayer(p.id, p.name)} disabled={kickBusyId === p.id}
                          title="Spieler entfernen"
                          className="shrink-0 px-3 py-2 rounded-xl font-black text-[12px] border border-red/35 bg-red/10 text-red hover:bg-red/20 transition-colors cursor-pointer font-sans disabled:opacity-40">
                          {kickBusyId === p.id ? '…' : '🗑'}
                        </button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          </>}

          {adminTab === 'wetten' && <>

          {/* ── JACKPOT ─────────────────────────────────────────── */}
          {(() => {
            const openJpPrizes = markets
              .filter(m => m.status === 'open' && m.marketSubtype === 'jackpot')
              .reduce((s, m) => s + (m.fixedPrize ?? 0), 0);
            const totalAvailable = jackpot + openJpPrizes;
            return (
              <div className="bg-card border border-border rounded-2xl p-4 mb-2.5">
                <div className="text-[11px] font-black text-muted tracking-[0.15em] uppercase mb-3.5">Community Jackpot</div>
                <div className="text-center py-2">
                  <div className="font-mono text-[40px] font-bold text-yellow drop-shadow-[0_0_30px_rgba(255,212,71,0.4)]">🪙 {totalAvailable}</div>
                  <div className="text-[11px] text-muted mt-1">Gesamt verfügbar für Spieler</div>
                </div>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1 bg-yellow/5 border border-yellow/20 rounded-xl px-3 py-2 text-center">
                    <div className="text-[10px] text-muted mb-0.5">Offene Fragen</div>
                    <div className="font-mono text-[16px] font-bold text-yellow">{openJpPrizes} TKN</div>
                  </div>
                  <div className="flex-1 bg-yellow/5 border border-yellow/20 rounded-xl px-3 py-2 text-center">
                    <div className="text-[10px] text-muted mb-0.5">Angespart (Finale)</div>
                    <div className="font-mono text-[16px] font-bold text-yellow">{jackpot} TKN</div>
                  </div>
                </div>

                {/* Hausbank manuell setzen */}
                <div className="border-t border-border mt-3 pt-3">
                  <div className="text-[10px] font-black text-muted tracking-[0.1em] uppercase mb-2">Hausbank manuell setzen</div>
                  <div className="text-[10px] text-muted mb-2">
                    Setzt den angesparten Jackpot (Finale) auf einen exakten Wert. Offene Frage-Preise
                    bleiben davon unberührt.
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={jackpotInput}
                      onChange={e => setJackpotInput(e.target.value)}
                      placeholder={`Aktuell: ${jackpot}`}
                      className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-muted/40 outline-none focus:border-yellow/60"
                    />
                    <button
                      onClick={handleSetJackpot}
                      disabled={jackpotInput.trim() === '' || isNaN(parseInt(jackpotInput)) || parseInt(jackpotInput) < 0}
                      className="px-4 py-2 rounded-xl bg-yellow/20 border border-yellow/40 text-yellow text-[12px] font-black disabled:opacity-40"
                    >
                      Setzen
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

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

          {/* ── WHATSAPP GRUPPE ─────────────────────────────────── */}
          <div className="bg-card border border-green/20 rounded-2xl p-4 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[18px]">💬</span>
              <div className="text-[11px] font-black text-green tracking-[0.15em] uppercase">WhatsApp Gruppe</div>
            </div>
            <div className="text-[10px] text-muted mb-3">
              Beitrittslink für neue Spieler (erscheint auf Screen 5 der Registrierung). Der Bot sendet tägliche Updates.
            </div>
            {whatsappGroupLink && (
              <div className="bg-white/5 border border-border rounded-xl px-3 py-2 font-mono text-[11px] text-green text-center mb-3 break-all">
                {whatsappGroupLink}
              </div>
            )}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={waLinkInput}
                onChange={e => setWaLinkInput(e.target.value)}
                placeholder="https://chat.whatsapp.com/…"
                className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-muted/40 outline-none focus:border-green/60"
              />
              <button
                onClick={handleSaveWaLink}
                disabled={!waLinkInput.trim() || waLinkStatus === 'loading'}
                className="px-4 py-2 rounded-xl bg-green/20 border border-green/40 text-green text-[12px] font-black disabled:opacity-40"
              >
                {waLinkStatus === 'ok' ? '✓' : waLinkStatus === 'loading' ? '…' : 'Setzen'}
              </button>
            </div>
            {waTestMsg && (
              <div className={clsx('rounded-xl px-3 py-2 text-[12px] font-bold text-center mb-2',
                waTestStatus === 'ok' ? 'bg-green/10 border border-green/30 text-green' : 'bg-red/10 border border-red/30 text-red')}>
                {waTestMsg}
              </div>
            )}
            <button
              onClick={handleTestWa}
              disabled={waTestStatus === 'loading'}
              className="w-full p-2.5 border border-green/30 rounded-xl bg-green/10 font-sans text-[12px] font-black text-green cursor-pointer disabled:opacity-40"
            >
              {waTestStatus === 'loading' ? 'Sendet…' : '🧪 WhatsApp testen'}
            </button>
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
                        {player ? <CharacterAvatar player={player} size="sm" className="w-full h-full" /> : <div className="w-full h-full bg-white/5" />}
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
                    const ok = await callResolve({ action: 'open', marketId: openQModal, winnerPlayerIds: Array.from(selectedWinners) });
                    if (ok) { setOpenQModal(null); setSelectedWinners(new Set()); }
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

      {pendingFreeClose && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-red/10 border border-red/25 flex items-center justify-center text-[28px] mb-4">✕</div>
            <div className="text-[20px] font-black text-white mb-2">Gratis-Wette schließen</div>
            <div className="text-[13px] text-white/90 font-semibold mb-1 leading-snug">„{pendingFreeClose.question}"</div>
            <div className="text-[13px] text-muted mb-1.5 leading-relaxed">Einsatzfrei — keine Token-Auswirkung. Wähle, wie geschlossen werden soll:</div>
            <div className="text-[11px] text-muted/80 mb-4 leading-relaxed text-left w-full">
              <b className="text-white">Löschen:</b> verschwindet sofort komplett.<br />
              <b className="text-white">Absagen:</b> bleibt als „abgesagt" sichtbar.
            </div>
            <div className="text-[11px] text-red/80 font-bold uppercase tracking-wider mb-5">Kann nicht rückgängig gemacht werden!</div>
            <div className="flex flex-col gap-2.5 w-full">
              <div className="flex gap-3 w-full">
                <button onClick={async () => { await deleteMarket(pendingFreeClose.marketId); setPendingFreeClose(null); }} className="flex-1 p-3 rounded-xl font-black text-white bg-gradient-to-r from-red to-orange shadow-[0_0_15px_rgba(255,61,90,0.4)] transition-all">🗑 Löschen</button>
                <button onClick={async () => { await closeMarket(pendingFreeClose.marketId); setPendingFreeClose(null); }} className="flex-1 p-3 rounded-xl font-black text-yellow bg-yellow/10 border border-yellow/40 hover:bg-yellow/20 transition-colors">🚫 Absagen</button>
              </div>
              <button onClick={() => setPendingFreeClose(null)} className="w-full p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {pendingJackpot !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="w-16 h-16 rounded-full bg-yellow/10 border border-yellow/25 flex items-center justify-center text-[28px] mb-4">🪙</div>
            <div className="text-[20px] font-black text-white mb-2">Hausbank setzen</div>
            <div className="text-[13px] text-muted mb-2 leading-relaxed">
              Angesparten Jackpot von <b className="text-white">{jackpot} TKN</b> auf{' '}
              <b className="text-yellow">{pendingJackpot} TKN</b> setzen?
            </div>
            <div className="text-[11px] text-red/80 font-bold uppercase tracking-wider mb-5">Überschreibt den aktuellen Wert!</div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setPendingJackpot(null)} className="flex-1 p-3 rounded-xl font-bold text-muted bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Abbrechen</button>
              <button onClick={async () => { await setJackpot(pendingJackpot); setPendingJackpot(null); setJackpotInput(''); }} className="flex-1 p-3 rounded-xl font-bold text-bg bg-gradient-to-r from-yellow to-orange shadow-[0_0_15px_rgba(230,180,60,0.4)] transition-all">✓ Setzen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}