import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../store';
import CoinIcon from '../components/CoinIcon';
import { SHOP_SLOTS, SHOP_SLOT_LABELS, isShopItemListed, isShopItemSoldOut, shopItemStockLeft, shopItemImagePath, shopUnlockAt, type ShopSlot } from '../data/shopItems';
import CharacterAvatar from '../components/CharacterAvatar';

export default function Shop() {
  const navigate = useNavigate();
  const me = useStore(s => s.players.find(p => p.id === s.currentUser));
  const items = useStore(s => s.shopItems);
  const schedule = useStore(s => s.schedule);
  const purchase = useStore(s => s.purchaseShopItem);
  const setActiveShop = useStore(s => s.setActiveShopItem);
  const markShopVisited = useStore(s => s.markShopVisited);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Lokale Anprobier-Vorschau (NICHT gespeichert): Klick aufs Item-Bild zeigt es
  // sofort am Avatar, egal ob gekauft. Überschreibt je Slot die getragenen Items
  // nur visuell in der Live-Vorschau.
  const [preview, setPreview] = useState<Partial<Record<ShopSlot, string | null>>>({});
  // Sekundentakt für Live-Countdowns gesperrter Items mit Datum.
  const [now, setNow] = useState(Date.now());
  // Items, deren Grafik nicht geladen werden konnte → Emoji-Fallback.
  const [imgFailed, setImgFailed] = useState<Set<string>>(new Set());
  const markImgFailed = (id: string) => setImgFailed(s => (s.has(id) ? s : new Set(s).add(id)));

  useEffect(() => { markShopVisited(); }, [markShopVisited]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const inventory = useMemo(() => new Set(me?.shopInventory ?? []), [me?.shopInventory]);

  const visible = useMemo(() => {
    const list = items.filter(i => isShopItemListed(i, inventory.has(i.id)));
    return list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || (a.label ?? '').localeCompare(b.label ?? ''));
  }, [items, inventory]);

  // Restzeit bis Freischaltung als „2d 4h 12m" / „45s".
  const countdown = (target: number): string => {
    let s = Math.max(0, Math.floor((target - now) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (!me) return null;

  // Effektiv angezeigtes Item je Slot: Anprobier-Override hat Vorrang, sonst das
  // tatsächlich getragene.
  const effectiveSlot = (slot: ShopSlot): string | null =>
    preview[slot] !== undefined ? preview[slot]! : ((me.activeShopItems ?? {})[slot] ?? null);

  // Spieler-Objekt für die Live-Vorschau mit anprobierten Items überlagert.
  const previewPlayer = {
    ...me,
    activeShopItems: SHOP_SLOTS.reduce((acc, { slot }) => {
      acc[slot] = effectiveSlot(slot);
      return acc;
    }, {} as Record<ShopSlot, string | null>),
  };

  // Klick aufs Item-Bild → anprobieren (oder, wenn schon gezeigt, wieder ablegen).
  const tryOn = (item: typeof items[number]) => {
    setPreview(p => {
      const cur = p[item.slot] !== undefined ? p[item.slot]! : ((me.activeShopItems ?? {})[item.slot] ?? null);
      return { ...p, [item.slot]: cur === item.id ? null : item.id };
    });
  };

  const handleBuy = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    const res = await purchase(id);
    setBusyId(null);
    setConfirmId(null);
    if (res.ok) {
      // Frisch gekauftes Item direkt tragen (war ja angesehen) + Preview lösen.
      const bought = items.find(i => i.id === id);
      if (bought) {
        await setActiveShop(bought.slot, id);
        setPreview(p => { const n = { ...p }; delete n[bought.slot]; return n; });
      }
      setMsg({ text: 'Gekauft & angezogen! 🎉', ok: true });
    } else {
      setMsg({ text: res.error ?? 'Kauf fehlgeschlagen.', ok: false });
    }
    setTimeout(() => setMsg(null), 5000);
  };

  // Item an-/ausziehen (gespeichert) — zeigt einen Hinweis, wenn dabei ein anderes
  // Item aus demselben Slot abgelegt wird (es bleibt im Inventar, nur nicht aktiv).
  const handleEquip = async (slot: ShopSlot, itemId: string | null) => {
    const prevId = (me.activeShopItems ?? {})[slot] ?? null;
    await setActiveShop(slot, itemId);
    // Anprobier-Override für diesen Slot auflösen, damit der echte Stand zählt.
    setPreview(p => { const n = { ...p }; delete n[slot]; return n; });
    if (itemId && prevId && prevId !== itemId) {
      const prev = items.find(i => i.id === prevId);
      const next = items.find(i => i.id === itemId);
      if (prev && next) {
        setMsg({ ok: true, text: `${prev.label} abgelegt → ${next.label} angezogen. (Bleibt im Inventar.)` });
        setTimeout(() => setMsg(null), 4500);
      }
    }
  };

  const confirmItem = confirmId ? items.find(i => i.id === confirmId) : null;

  // Aktuell in der Vorschau gezeigte Items je Slot (inkl. Anprobiertes), mit Info,
  // ob es nur anprobiert (nicht getragen) ist.
  const wornItems = SHOP_SLOTS
    .map(({ slot }) => {
      const id = effectiveSlot(slot);
      const item = id ? items.find(i => i.id === id) : undefined;
      if (!item) return null;
      const isWorn = ((me.activeShopItems ?? {})[slot] ?? null) === id;
      return { item, isWorn };
    })
    .filter((x): x is { item: NonNullable<typeof items[number]>; isWorn: boolean } => !!x);

  return (
    <div className="flex-1 flex flex-col bg-bg relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(230,180,60,.18)_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,rgba(139,61,255,.12)_0%,transparent_45%),radial-gradient(ellipse_at_50%_100%,rgba(0,229,255,.12)_0%,transparent_50%)]" />

      {/* Header */}
      <div className="relative z-10 px-4 pt-4 pb-2 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/dashboard')}
          className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted hover:text-white transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[20px]">🛒</span>
          <span className="text-[17px] font-black text-white">Shop</span>
        </div>
        <div className="ml-auto flex items-center gap-1 bg-yellow/10 border border-yellow/25 rounded-full px-3 py-1.5">
          <CoinIcon size={13} />
          <span className="font-mono text-[12px] font-bold text-yellow">{me.tokens}</span>
        </div>
      </div>

      {/* ── GROSSE LIVE-VORSCHAU (oberer halber Bildschirm) ──────────────────── */}
      <div className="relative z-10 shrink-0 h-[44vh] min-h-[280px] flex flex-col items-center justify-center px-4 border-b border-border/60">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(59,110,255,.22)_0%,transparent_65%)]" />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[9px] font-black text-muted uppercase tracking-[0.2em]">
          Live-Vorschau
        </div>
        <div className="relative h-[32vh] min-h-[210px] aspect-square" style={{ animation: 'auraGlow 4s ease-in-out infinite' }}>
          <CharacterAvatar player={previewPlayer} size="lg" className="w-full h-full" />
        </div>
        {/* Gezeigte Shop-Items als Chips (grün = getragen, gelb = nur anprobiert) */}
        <div className="relative flex flex-wrap justify-center gap-1.5 mt-2 px-2 min-h-[22px]">
          {wornItems.length === 0 ? (
            <span className="text-[10px] text-muted/60 italic">Tipp auf ein Item-Bild zum Anprobieren</span>
          ) : wornItems.map(({ item, isWorn }) => (
            <button key={item.id}
              onClick={() => isWorn ? handleEquip(item.slot, null) : tryOn(item)}
              className={clsx('text-[10px] font-bold border rounded-full px-2 py-0.5 transition-colors',
                isWorn
                  ? 'text-green bg-green/10 border-green/30 hover:bg-green/20'
                  : 'text-yellow bg-yellow/10 border-yellow/30 hover:bg-yellow/20')}>
              {item.label} {isWorn ? '✕' : '· Probe ✕'}
            </button>
          ))}
        </div>
      </div>

      {/* Slot-Hinweis */}
      <div className="relative z-10 px-4 pt-3 pb-2 shrink-0">
        <div className="text-[10px] text-muted/80 leading-snug">
          💡 <b className="text-white">Tipp aufs Bild = anprobieren.</b> Pro Kategorie trägst du 1 Item — das vorherige bleibt im Inventar.
        </div>
      </div>

      {/* Status-Banner */}
      {msg && (
        <div className={clsx('relative z-10 mx-4 mb-2 rounded-xl px-3 py-2 text-[12px] font-bold text-center shrink-0',
          msg.ok ? 'bg-green/10 border border-green/30 text-green' : 'bg-red/10 border border-red/30 text-red')}>
          {msg.text}
        </div>
      )}

      {/* Item-Grid (scrollt unter der fixen Vorschau) */}
      <div className="relative z-10 px-4 pb-6 flex-1 overflow-y-auto no-scrollbar">
        {visible.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <div className="text-[32px] mb-2">🛍️</div>
            <div className="text-[14px] font-black text-white mb-1">Noch nichts im Shop</div>
            <div className="text-[11px] text-muted">Der Admin füllt die Regale gerade — schau bald wieder vorbei.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {visible.map(item => {
              const owned = inventory.has(item.id);
              const equipped = (me.activeShopItems ?? {})[item.slot] === item.id;
              const tryingOn = effectiveSlot(item.slot) === item.id;
              const canAfford = me.tokens >= item.price;
              // Status
              const stockLeft = shopItemStockLeft(item);
              const soldOut = !owned && isShopItemSoldOut(item);
              const unlockAt = shopUnlockAt(item, schedule);          // null = keine Sperre
              const knownTs = unlockAt != null && unlockAt < Number.MAX_SAFE_INTEGER; // berechenbar
              const timedLocked = unlockAt != null && unlockAt > now; // (auch wenn Spielplan fehlt)
              const locked = !owned && !soldOut && (timedLocked || !item.available);
              return (
                <div key={item.id}
                  className={clsx('bg-card border rounded-2xl p-3 flex flex-col gap-2 relative overflow-hidden transition-colors',
                    tryingOn ? 'border-yellow/50' : owned ? 'border-green/30' : soldOut ? 'border-red/25' : locked ? 'border-purple2/25' : 'border-border')}>
                  {/* Vorschau — Klick = anprobieren (auch bei gesperrt/ausverkauft) */}
                  <button onClick={() => tryOn(item)}
                    className={clsx('relative aspect-square w-full rounded-xl border flex items-center justify-center overflow-hidden cursor-pointer transition-colors',
                      tryingOn ? 'bg-yellow/10 border-yellow/40' : 'bg-white/3 border-white/5 hover:border-white/20')}>
                    <img src={shopItemImagePath(item)} alt={item.label}
                      onError={() => markImgFailed(item.id)}
                      style={{ transform: item.imageTransform ?? (item.slot === 'hand' ? 'scale(1.7) translateX(15%)' : item.slot === 'head' ? 'scale(1.9) translateY(13%)' : 'scale(1.35)'), transformOrigin: 'center' }}
                      className={clsx('absolute inset-0 w-full h-full object-contain', (soldOut || locked) && 'opacity-50 grayscale')} />
                    {/* Emoji nur als Fallback, falls die Grafik (noch) fehlt */}
                    {imgFailed.has(item.id) && (
                      <span className={clsx('text-[48px] select-none', (soldOut || locked) && 'opacity-50 grayscale')}>{item.icon}</span>
                    )}
                    <span className="absolute top-1 right-1 text-[8px] font-black tracking-wider uppercase text-muted bg-black/30 rounded-full px-1.5 py-0.5 backdrop-blur-sm">
                      {SHOP_SLOT_LABELS[item.slot]}
                    </span>
                    {owned && (
                      <span className="absolute top-1 left-1 text-[8px] font-black tracking-wider uppercase text-green bg-green/20 border border-green/30 rounded-full px-1.5 py-0.5">
                        ✓ Owned
                      </span>
                    )}
                    {/* Knappheit / Status oben links */}
                    {!owned && stockLeft != null && !soldOut && (
                      <span className={clsx('absolute top-1 left-1 text-[8px] font-black tracking-wider uppercase rounded-full px-1.5 py-0.5 border',
                        stockLeft === 1 ? 'text-yellow bg-yellow/20 border-yellow/40' : 'text-white/90 bg-black/40 border-white/15')}>
                        {item.stock === 1 ? '★ Unikat!' : stockLeft === 1 ? '★ Letztes' : `★ ${stockLeft}/${item.stock}`}
                      </span>
                    )}
                    {soldOut && (
                      <span className="absolute top-1 left-1 text-[8px] font-black tracking-wider uppercase text-red bg-red/20 border border-red/40 rounded-full px-1.5 py-0.5">
                        Ausverkauft
                      </span>
                    )}
                    {tryingOn && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black tracking-wider uppercase text-yellow bg-yellow/20 border border-yellow/40 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                        👀 Anprobiert
                      </span>
                    )}
                  </button>
                  {/* Titel + Preis */}
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[12px] font-black text-white leading-tight">{item.label}</div>
                    <div className="text-[10px] text-muted line-clamp-2 leading-snug min-h-[2.5em]">{item.description}</div>
                  </div>
                  {/* Aktion */}
                  {owned ? (
                    <button onClick={() => handleEquip(item.slot, equipped ? null : item.id)}
                      className={clsx('w-full py-2 rounded-xl text-[11px] font-black border transition-colors',
                        equipped
                          ? 'bg-green/15 border-green/40 text-green'
                          : 'bg-white/5 border-white/10 text-white hover:border-white/30')}>
                      {equipped ? '✓ Getragen — Abnehmen' : 'Anziehen'}
                    </button>
                  ) : soldOut ? (
                    <div className="w-full py-2 rounded-xl text-[11px] font-black border bg-red/5 border-red/20 text-red/70 text-center">
                      Vergriffen
                    </div>
                  ) : locked ? (
                    <div className="w-full py-1.5 rounded-xl border bg-purple2/5 border-purple2/25 text-purple2 text-center leading-tight">
                      <div className="text-[10px] font-black">🔒 {item.unlockLabel ?? 'Bald verfügbar'}</div>
                      {knownTs && unlockAt && (
                        <div className="text-[9px] font-bold text-purple2/80 mt-0.5">noch {countdown(unlockAt)}</div>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(item.id)} disabled={!canAfford || busyId === item.id}
                      className={clsx('w-full py-2 rounded-xl text-[11px] font-black border transition-all',
                        canAfford
                          ? 'bg-yellow/15 border-yellow/40 text-yellow hover:bg-yellow/25'
                          : 'bg-white/5 border-white/10 text-muted/50 cursor-not-allowed',
                      )}>
                      <CoinIcon size={12} /> {item.price} {canAfford ? 'Kaufen' : 'Zu teuer'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Kauf-Bestätigung */}
      {confirmItem && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5"
          onClick={() => setConfirmId(null)}>
          <div className="bg-card border border-border rounded-[24px] p-6 w-full max-w-[320px] flex flex-col items-center text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
            onClick={e => e.stopPropagation()}>
            <div className="relative w-28 h-28 mb-2 flex items-center justify-center overflow-hidden">
              <img src={shopItemImagePath(confirmItem)} alt={confirmItem.label}
                onError={() => markImgFailed(confirmItem.id)}
                style={{ transform: confirmItem.imageTransform ?? (confirmItem.slot === 'hand' ? 'scale(1.7) translateX(15%)' : confirmItem.slot === 'head' ? 'scale(1.9) translateY(13%)' : 'scale(1.35)'), transformOrigin: 'center' }}
                className="absolute inset-0 w-full h-full object-contain" />
              {imgFailed.has(confirmItem.id) && <span className="text-[56px]">{confirmItem.icon}</span>}
            </div>
            <div className="text-[16px] font-black text-white mb-1">{confirmItem.label}</div>
            <div className="text-[11px] text-muted mb-4">{confirmItem.description}</div>
            <div className="bg-yellow/10 border border-yellow/25 rounded-xl px-4 py-2 mb-4">
              <span className="text-[11px] text-muted">Preis</span>
              <div className="text-[18px] font-black text-yellow flex items-center gap-1.5"><CoinIcon size={18} /> {confirmItem.price}</div>
            </div>
            <div className="text-[10px] text-muted mb-4">
              Nach dem Kauf bleibt das Item dauerhaft in deinem Inventar — auch bei Charakter-Reset.
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={() => setConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-muted text-[12px] font-black hover:text-white transition-colors">
                Abbrechen
              </button>
              <button onClick={() => handleBuy(confirmItem.id)} disabled={busyId === confirmItem.id}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-br from-yellow to-[#B8860B] text-bg text-[12px] font-black transition-all hover:-translate-y-0.5 disabled:opacity-50">
                {busyId === confirmItem.id ? '…' : 'Kaufen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
