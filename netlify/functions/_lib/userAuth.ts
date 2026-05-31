import { getAdminAuth } from './firebaseAdmin';
import { adminEmails } from './adminAuth';

// Gemeinsame Auth-Verifizierung für Spieler-Endpunkte. Liefert die uid +
// optional eine Admin-Markierung, die der Aufrufer für „darf-für-andere"-
// Checks (z. B. Wetten für Test-Spieler) nutzen kann.
//
// Header-Format: Authorization: Bearer <Firebase ID Token>

export interface AuthCtx {
  ok: boolean;
  uid?: string;
  email?: string;
  isAdmin?: boolean;
  error?: string;
  status?: number;
}

export async function verifyAuth(req: Request): Promise<AuthCtx> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { ok: false, error: 'Kein Auth-Token übermittelt.', status: 401 };

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const isAdmin = !!email && adminEmails().includes(email);
    return { ok: true, uid: decoded.uid, email, isAdmin };
  } catch {
    return { ok: false, error: 'Ungültiger oder abgelaufener Token.', status: 401 };
  }
}
