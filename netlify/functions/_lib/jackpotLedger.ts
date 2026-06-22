import { FieldValue } from './firebaseAdmin';

// ── Jackpot-/Hausbank-Bewegungslog ───────────────────────────────────────────
// Jede Änderung am angesparten Jackpot (appState/global.jackpot) wird hier mit
// Betrag (+ rein / − raus) und Grund mitgeschrieben. So lässt sich im Admin
// nachvollziehen, WARUM der Jackpot steigt oder fällt (z. B. Streak-/Underdog-
// Boni werden aus der Hausbank ausgezahlt → der Topf sinkt). Reines Diagnose-/
// Audit-Log; verändert keine Spiellogik.
//
// Typen über den globalen FirebaseFirestore-Namespace (firebase-admin stellt ihn
// bereit) — identisch zum übrigen Code in resolve.ts. FieldValue kommt als Wert
// aus firebaseAdmin (Re-Export), damit die Init-Logik geteilt bleibt.

export type JackpotLedgerKind =
  | 'auto-deduct'     // + Auto-Abzug bei Nicht-Tippern (tick)
  | 'shop-purchase'   // + Shop-Kaufpreis fließt zurück ins System
  | 'resolve-pool'    // + nicht ausgezahlter Pool-Rest / Rundung einer Auswertung
  | 'no-winner'       // + kein Gewinner → ganzer Einsatz-Pool in den Jackpot
  | 'underdog-bonus'  // − +10%-Bonus für Außenseiter-Tipper (aus der Hausbank)
  | 'streak-bonus'    // − ON-FIRE (+30) / DAMN-HOT (+100) Boni (aus der Hausbank)
  | 'combo'           // ± Combo-Auswertung (Gewinn aus Haus / Verlust ins Haus)
  | 'jackpot-round'   // ± Rest einer Gratis-/Jackpot-Sonderrunde
  | 'finale-absorb'   // − Finale schüttet den angesparten Jackpot aus
  | 'rollover'        // + Rollover: nicht zurückgezahlter Einsatz-Rest
  | 'manual-set'      // ± Admin hat den Jackpot manuell gesetzt
  | 'bonus-refund';   // + einmalige Rückerstattung historisch abgeflossener Boni

export interface JackpotLedgerEntry {
  delta: number;          // +rein / −raus (auf ganze Tokens gerundet)
  kind: JackpotLedgerKind;
  reason: string;         // menschenlesbarer Grund (für die Admin-Anzeige)
  marketId?: string;
  playerId?: string;
}

// Hängt einen Bewegungseintrag an den übergebenen Batch/die Transaction an.
// delta === 0 wird übersprungen (keine echte Bewegung → kein Rauschen im Log).
// WriteBatch und Transaction teilen sich die set(ref, data)-Signatur.
export function logJackpotChange(
  writer: FirebaseFirestore.WriteBatch | FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  entry: JackpotLedgerEntry,
): void {
  const delta = Math.round(entry.delta);
  if (!delta) return;
  const ref = db.collection('jackpotLedger').doc();
  (writer as FirebaseFirestore.WriteBatch).set(ref, {
    delta,
    kind: entry.kind,
    reason: entry.reason,
    ts: FieldValue.serverTimestamp(),
    ...(entry.marketId ? { marketId: entry.marketId } : {}),
    ...(entry.playerId ? { playerId: entry.playerId } : {}),
  });
}
