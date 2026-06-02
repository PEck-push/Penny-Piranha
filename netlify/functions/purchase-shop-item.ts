import type { Context } from '@netlify/functions';
import { getDb, FieldValue } from './_lib/firebaseAdmin';
import { verifyAuth } from './_lib/userAuth';

// Atomarer Shop-Kauf. Transaktion deckt:
//   - Item-Verfügbarkeit (available, availableFrom/Until, stock)
//   - Doppelkauf-Schutz (shopInventory)
//   - Token-Saldo (>= price)
//   - Token-Abzug + Inventar-Update + sold-Zähler
//   - Kaufpreis fliesst in den Jackpot (recycling — wie Auto-Abzuege)
// Anschließend Feed-Eintrag (best-effort, ausserhalb der Transaction).
//
// Schreibt nur für den eigenen Spieler (auth.uid).

interface BuyBody { itemId: string; }

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await verifyAuth(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401);

  let body: BuyBody;
  try { body = (await req.json()) as BuyBody; }
  catch { return json({ error: 'Ungültiger Body.' }, 400); }
  if (!body.itemId) return json({ error: 'itemId erforderlich.' }, 400);

  const db = getDb();
  const uid = auth.uid!;
  const playerRef = db.collection('players').doc(uid);
  const itemRef   = db.collection('shopItems').doc(body.itemId);
  const appRef    = db.collection('appState').doc('global');

  let cost = 0;
  let itemLabel = '';
  let playerName = '';

  try {
    await db.runTransaction(async tx => {
      const [pSnap, iSnap] = await Promise.all([tx.get(playerRef), tx.get(itemRef)]);
      if (!pSnap.exists) throw new Error('player_not_found');
      if (!iSnap.exists) throw new Error('item_not_found');

      const p = pSnap.data() as any;
      const i = iSnap.data() as any;
      itemLabel = i.label ?? body.itemId;
      playerName = p.name ?? '';

      const now = Date.now();
      if (!i.available) throw new Error('item_not_available');
      if (typeof i.availableFrom === 'number' && i.availableFrom > now) throw new Error('item_not_unlocked');
      if (typeof i.availableUntil === 'number' && i.availableUntil < now) throw new Error('item_expired');

      const inv: string[] = Array.isArray(p.shopInventory) ? p.shopInventory : [];
      if (inv.includes(body.itemId)) throw new Error('already_owned');

      const sold = Number(i.sold ?? 0);
      if (i.stock != null && sold >= Number(i.stock)) throw new Error('sold_out');

      const tokens = Number(p.tokens ?? 0);
      const price = Number(i.price ?? 0);
      if (tokens < price) throw new Error('insufficient_tokens');
      cost = price;

      tx.update(playerRef, {
        tokens: tokens - cost,
        shopInventory: [...inv, body.itemId],
      });
      if (i.stock != null) tx.update(itemRef, { sold: sold + 1 });
      // Kaufpreis in den Jackpot: ohne diesen Increment verschwinden die Tokens
      // aus dem Spielsystem, was die Hausbank ungewollt erhoeht.
      if (cost > 0) {
        tx.set(appRef, { jackpot: FieldValue.increment(cost) }, { merge: true });
      }
    });

    // Feed-Eintrag best-effort, blockiert nicht das ok-Ergebnis.
    try {
      await db.collection('feed').add({
        type: 'shop_purchase',
        playerId: uid,
        playerName,
        text: `${playerName || 'Jemand'} hat „${itemLabel}" im Shop gekauft 🛍️`,
        creditsChange: -cost,
        ts: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('[purchase-shop-item] feed write failed:', e);
    }

    return json({ ok: true, cost, itemLabel });
  } catch (err: any) {
    const code = String(err?.message ?? 'unknown');
    return json({ error: errorMessage(code), code }, mapStatus(code));
  }
};

function errorMessage(code: string): string {
  switch (code) {
    case 'player_not_found':     return 'Spieler-Profil fehlt.';
    case 'item_not_found':       return 'Item nicht mehr verfügbar.';
    case 'item_not_available':   return 'Aktuell nicht im Verkauf.';
    case 'item_not_unlocked':    return 'Noch nicht freigeschaltet.';
    case 'item_expired':         return 'Nicht mehr verfügbar.';
    case 'already_owned':        return 'Bereits im Inventar.';
    case 'sold_out':             return 'Ausverkauft.';
    case 'insufficient_tokens':  return 'Nicht genug Tokens.';
    default:                      return 'Kauf fehlgeschlagen.';
  }
}
function mapStatus(code: string): number {
  if (code === 'player_not_found' || code === 'item_not_found') return 404;
  return 409;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
