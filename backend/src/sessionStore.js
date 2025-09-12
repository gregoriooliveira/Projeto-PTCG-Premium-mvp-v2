import { randomUUID } from 'crypto';

// In-memory session store: sessionId -> { events: [], logs: [], lastAccess: number }
// Each list is capped at SESSION_MAX_ITEMS items.
// TODO: Consider using external persistence (e.g., Redis) for production use.
const store = new Map();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Limit how many events/logs we keep in memory per session.
export const SESSION_MAX_ITEMS = 100;

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of store.entries()) {
    if (now - session.lastAccess > SESSION_TTL_MS) {
      store.delete(sid);
    }
  }
}, CLEANUP_INTERVAL_MS);

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const [k, v] = part.split('=').map(s => s && s.trim());
    if (k) out[k] = decodeURIComponent(v || '');
  });
  return out;
}

export function getSession(req, res) {
  const cookies = parseCookies(req);
  let sid = cookies.sid;
  if (!sid) {
    sid = randomUUID();
    res.cookie('sid', sid, { httpOnly: true, path: '/', secure: true, sameSite: 'strict' });
  }
  let session = store.get(sid);
  if (!session) {
    session = { events: [], logs: [], lastAccess: Date.now() };
    store.set(sid, session);
  } else {
    session.lastAccess = Date.now();
  }
  return session;
}
