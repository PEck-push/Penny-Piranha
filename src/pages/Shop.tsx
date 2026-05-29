import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../store';
import { SHOP_SLOTS, SHOP_SLOT_LABELS, isShopItemAvailable, shopItemImagePath, type ShopSlot } from '../data/shopItems';
import CharacterAvatar from '../components/CharacterAvatar';

type Filter = 'all' | ShopSlot;

export default function Shop() {
  const navigate = useNavigate();
  const me = useStore(s => s.players.find(p => p.id === s.currentUser));
  const items = useStore(s => s.shopItems);
  const purchase = useStore(s => s.purchaseShopItem);
  const setActiveShop = useStore(s => s.setActiveShopItem);
  const markShopVisited = useStore(s => s.markShopVisited);

  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => { markShopVisited(); }, [markShopVisited]);

  const inventory = useMemo(() => new Set(me?.shopInventory ?? []), [me?.shopInventory]);

  const visible = useMemo(() => {
    const list = items
      .filter(i => filter === 'all' || i.slot === filter)
      .filter(i => isShopItemAvailable(i) || inventory.has(i.id));
    return list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.label.localeCompare(b.label));
  }, [items, filter, inventory]);

  if (!me) return null;

  const handleBuy = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    const res = await purchase(id);
    setBusyId(null);
    setConfirmId(null);
    setMsg(res.ok
      ? { text: 'Gekauft! Du kannst es jetzt im Profil oder direkt unten tragen.', ok: true }
      : { text: res.error ?? 'Kauf fehlgeschlagen.', ok: false });
    setTimeout(() => setMsg(null), 5000);
  };

  const confirmItem = confirmId ? items.find(i => i.id === confirmId) : null;

  // Aktuell aktive Shop-Items je Slot (für die „Getragen"-Liste in der Vorschau).
  const activeShop = me.activeShopItems ?? {};
  const wornItems = SHOP_SLOTS
    .map(({ slot }) => items.find(i => i.id === activeShop[slot]))
    .filter((i): i is NonNullable<typeof i> => !!i);

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
          <span className="text-[13px]">🪙</span>
          <span className="font-mono text-[12px] font-bold text-yellow">{me.tokens}</span>
        </div>
      </div>

      {/* ── GROSSE LIVE-VORSCHAU (oberer halber Bildschirm) ──────────────────── */}
      <div className="relative z-10 shrink-0 h-[42vh] min-h-[260px] flex flex-col items-center justify-center px-4 border-b border-border/60">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(59,110,255,.22)_0%,transparent_65%)]" />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[9px] font-black text-muted uppercase tracking-[0.2em]">
          Live-Vorschau
        </div>
        <div className="relative h-[26vh] min-h-[170px] aspect-square" style={{ animation: 'auraGlow 4s ease-in-out infinite' }}>
          <CharacterAvatar player={me} size="lg" className="w-full h-full" />
        </div>
        <div className="relative text-[16px] font-black text-white mt-1">{me.name}</div>
        {/* Getragene Shop-Items als Chips */}
        <div className="relative flex flex-wrap justify-center gap-1.5 mt-2 px-2 min-h-[22px]">
          {wornItems.length === 0 ? (
            <span className="text-[10px] text-muted/60 italic">Noch nichts aus dem Shop angelegt</span>
          ) : wornItems.map(it => (
            <button key={it.id} onClick={() => setActiveShop(it.slot, null)}
              className="text-[10px] font-bold text-green bg-green/10 border border-green/30 rounded-full px-2 py-0.5 hover:bg-green/20 transition-colors">
              {it.icon} {it.label} ✕
            </button>
          ))}
        </div>
      </div>

      {/* Tab-Leiste */}
      <div className="relative z-10 px-4 pt-3 pb-2 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 min-w-max">
          {(['all', ...SHOP_SLOTS.map(s => s.slot)] as const).map(f => (
            <button key={f} onClick={() => setFilter(f as Filter)}
              className={clsx('px-3 py-1.5 rounded-full text-[11px] font-black border transition-colors whitespace-nowrap',
                filter === f
                  ? 'border-yellow/50 bg-yellow/15 text-yellow'
                  : 'border-white/10 bg-white/5 text-muted hover:text-white')}>
              {f === 'all' ? 'Alle' : SHOP_SLOT_LABELS[f as ShopSlot]}
            </button>
          ))}
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
              const canAfford = me.tokens >= item.price;
              return (
                <div key={item.id}
                  className={clsx('bg-card border rounded-2xl p-3 flex flex-col gap-2 relative overflow-hidden',
                    owned ? 'border-green/30' : 'border-border')}>
                  {/* Vorschau */}
                  <div className="relative aspect-square w-full bg-white/3 rounded-xl border border-white/5 flex items-center justify-center overflow-hidden">
                    <img src={shopItemImagePath(item)} alt=""
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="absolute inset-0 w-full h-full object-contain" />
                    <span className="text-[48px] select-none">{item.icon}</span>
                    <span className="absolute top-1 right-1 text-[8px] font-black tracking-wider uppercase text-muted bg-black/30 rounded-full px-1.5 py-0.5 backdrop-blur-sm">
                      {SHOP_SLOT_LABELS[item.slot]}
                    </span>
                    {owned && (
                      <span className="absolute top-1 left-1 text-[8px] font-black tracking-wider uppercase text-green bg-green/20 border border-green/30 rounded-full px-1.5 py-0.5">
                        ✓ Owned
                      </span>
                    )}
                  </div>
                  {/* Titel + Preis */}
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[12px] font-black text-white leading-tight">{item.label}</div>
                    <div className="text-[10px] text-muted line-clamp-2 leading-snug min-h-[2.5em]">{item.description}</div>
                  </div>
                  {/* Aktion */}
                  {owned ? (
                    <button onClick={() => setActiveShop(item.slot, equipped ? null : item.id)}
                      className={clsx('w-full py-2 rounded-xl text-[11px] font-black border transition-colors',
                        equipped
                          ? 'bg-green/15 border-green/40 text-green'
                          : 'bg-white/5 border-white/10 text-white hover:border-white/30')}>
                      {equipped ? '✓ Getragen — Abnehmen' : 'Anziehen'}
                    </button>
                  ) : (
                    <button onClick={() => setConfirmId(item.id)} disabled={!canAfford || busyId === item.id}
                      className={clsx('w-full py-2 rounded-xl text-[11px] font-black border transition-all',
                        canAfford
                          ? 'bg-yellow/15 border-yellow/40 text-yellow hover:bg-yellow/25'
                          : 'bg-white/5 border-white/10 text-muted/50 cursor-not-allowed',
                      )}>
                      🪙 {item.price} {canAfford ? 'Kaufen' : 'Zu teuer'}
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
            <div className="text-[64px] mb-2">{confirmItem.icon}</div>
            <div className="text-[16px] font-black text-white mb-1">{confirmItem.label}</div>
            <div className="text-[11px] text-muted mb-4">{confirmItem.description}</div>
            <div className="bg-yellow/10 border border-yellow/25 rounded-xl px-4 py-2 mb-4">
              <span className="text-[11px] text-muted">Preis</span>
              <div className="text-[18px] font-black text-yellow">🪙 {confirmItem.price}</div>
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
