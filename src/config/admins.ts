// Ausgewiesene Admins. Diese E-Mail-Adressen überleben das "Live gehen"
// (Testmodus beenden) — alle anderen Spieler werden gelöscht.
// Serverseitig kann die Liste über die Netlify-Env-Var ADMIN_EMAILS
// (kommagetrennt) erweitert werden; dieser Wert ist der Fallback.
export const ADMIN_EMAILS = ['marketing@gwt.at', 'philipp_eckhardt@live.de'];

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
