import { useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store';
import { CHARACTER_MODE, HEADS, OUTFITS, isAsvHead, prettyName, headZoomStyle } from '../data/characterParts';

// Charakter (neu) erstellen für einen bereits angemeldeten Spieler.
// Wird angezeigt, wenn der Spieler `needsCharacter` hat (z. B. nach Admin-Reset).
// Kopf + Outfit auf einer Seite; speichert über store.saveCharacter.
export default function CharacterSetup() {
  const currentUser = useStore(s => s.currentUser);
  const me = useStore(s => s.players.find(p => p.id === currentUser));
  const saveCharacter = useStore(s => s.saveCharacter);

  const defaultHead = me?.headId || (HEADS.includes('Toni') ? 'Toni' : (HEADS[0] ?? ''));
  const [head, setHead] = useState(defaultHead);
  const [outfit, setOutfit] = useState(me?.bodyId || (OUTFITS[0] ?? ''));
  const [cat, setCat] = useState<'person' | 'asv'>('person');
  const [saving, setSaving] = useState(false);

  const personHeads = HEADS.filter(h => !isAsvHead(h));
  const asvHeads = HEADS.filter(h => isAsvHead(h));
  const hasBoth = personHeads.length > 0 && asvHeads.length > 0;
  const shownHeads = hasBoth ? (cat === 'asv' ? asvHeads : personHeads) : HEADS;

  const canSave = !!head && !!outfit;
  const save = async () => {
    if (!currentUser || !canSave) return;
    setSaving(true);
    await saveCharacter(currentUser, { headId: head, bodyId: outfit, avatar: '', avatarId: '', avatarColor: '' });
  };

  if (CHARACTER_MODE !== 'builder') {
    // Sollte nicht vorkommen (Reset nur im Builder-Modus sinnvoll).
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg px-8 text-center gap-4">
        <div className="text-[15px] text-muted">Charakter-Erstellung ist nur im Builder-Modus verfügbar.</div>
        <button onClick={save} className="px-5 py-3 rounded-xl bg-green/15 border border-green/40 text-green font-black">Weiter</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(139,61,255,.35)_0%,transparent_55%)]" />

      <div className="relative z-10 px-5 pt-4 pb-1 shrink-0">
        <div className="text-[20px] font-black text-white">Neuen Charakter erstellen</div>
        <div className="text-[12px] text-muted">Wähle Kopf und Outfit.</div>
      </div>

      {/* Live-Vorschau (Outfit + Kopf übereinander) */}
      <div className="relative z-10 flex-none h-[170px] flex items-center justify-center">
        <div className="relative h-[170px] w-[170px]">
          {outfit && <img src={`/characters/outfits/${encodeURIComponent(outfit)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain z-10" />}
          {head && <img src={`/characters/heads/${encodeURIComponent(head)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain z-20" />}
        </div>
      </div>
      {head && <div className="relative z-10 text-center text-[13px] font-black text-white mb-1">{prettyName(head)}</div>}

      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-4 pb-28">
        {/* Kopf */}
        <div className="text-[10px] font-black text-muted uppercase tracking-[0.15em] mt-2 mb-2">Kopf</div>
        {hasBoth && (
          <div className="flex gap-1.5 mb-3">
            {([['person', 'Persönlichkeiten'], ['asv', 'ASV']] as const).map(([c, label]) => (
              <button key={c} onClick={() => setCat(c)}
                className={clsx('flex-1 py-2 rounded-xl text-[11px] font-black transition-all border',
                  cat === c ? 'bg-white/10 text-white border-white/15' : 'text-muted border-transparent hover:text-white')}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {shownHeads.map(id => (
            <div key={id} className="flex flex-col items-center cursor-pointer group" onClick={() => setHead(id)}>
              <div className={clsx('relative w-16 h-16 rounded-xl bg-card border-[1.5px] overflow-hidden transition-all',
                head === id ? 'border-green border-2 bg-green/10 shadow-[0_0_16px_rgba(230,180,60,0.35)] scale-105' : 'border-border group-hover:border-blue/50 group-hover:scale-105')}>
                <img src={`/characters/heads/${encodeURIComponent(id)}.webp`} alt="" className="absolute inset-0 w-full h-full object-contain" style={headZoomStyle} />
              </div>
              <div className="text-[8px] font-bold text-center leading-[1.2] text-muted mt-[3px] truncate w-full">{prettyName(id)}</div>
            </div>
          ))}
        </div>

        {/* Outfit */}
        <div className="text-[10px] font-black text-muted uppercase tracking-[0.15em] mb-2">Outfit</div>
        <div className="grid grid-cols-4 gap-2">
          {OUTFITS.map(id => (
            <div key={id} className="flex items-center justify-center cursor-pointer group" onClick={() => setOutfit(id)}>
              <div className={clsx('w-16 h-16 rounded-xl bg-card border-[1.5px] flex items-center justify-center overflow-hidden transition-all',
                outfit === id ? 'border-green border-2 bg-green/10 shadow-[0_0_16px_rgba(230,180,60,0.35)] scale-105' : 'border-border group-hover:border-blue/50 group-hover:scale-105')}>
                <img src={`/characters/outfits/${encodeURIComponent(id)}.webp`} alt="" className="w-full h-full object-contain" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-4 pb-8 px-5 z-30">
        <button onClick={save} disabled={!canSave || saving}
          className="w-full p-[14px] rounded-[16px] bg-gradient-to-br from-green to-[#B8860B] font-black text-[16px] text-bg shadow-[0_8px_30px_rgba(230,180,60,0.4)] transition-all hover:-translate-y-[2px] disabled:opacity-40">
          {saving ? 'Speichere…' : '✓ Charakter speichern'}
        </button>
      </div>
    </div>
  );
}
