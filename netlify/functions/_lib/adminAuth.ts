import { getAdminAuth } from './firebaseAdmin';

// Gemeinsame Admin-Autorisierung für geschützte Netlify Functions.
// Der Aufruf muss den Firebase ID Token des eingeloggten Admins mitschicken:
//   Authorization: Bearer <idToken>
// Der Token muss zu einer E-Mail aus der Admin-Liste gehören (ADMIN_EMAILS
// Env-Var, kommagetrennt; Fallback unten).

const FALLBACK_ADMIN_EMAILS = ['marketing@gwt.at', 'philipp_eckhardt@live.de'];

export function adminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const all = [...FALLBACK_ADMIN_EMAILS.map(e => e.toLowerCase()), ...fromEnv];
  return Array.from(new Set(all));
}

export interface AuthResult {
  ok: boolean;
  email?: string;
  error?: string;
  status?: number;
}

export async function verifyAdmin(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { ok: false, error: 'Kein Auth-Token übermittelt.', status: 401 };

  let email: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    email = decoded.email?.toLowerCase();
  } catch {
    return { ok: false, error: 'Ungültiger oder abgelaufener Token.', status: 401 };
  }

  if (!email || !adminEmails().includes(email)) {
    return { ok: false, error: 'Nicht autorisiert. Nur Admins erlaubt.', status: 403 };
  }
  return { ok: true, email };
}
