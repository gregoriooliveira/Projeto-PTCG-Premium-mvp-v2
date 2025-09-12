import { randomUUID } from 'crypto';

// In-memory session store: sessionId -> { events: [], logs: [], lastAccess: number }
// TODO: Consider using external persistence (e.g., Redis) for production use.
const store = new Map();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; Secure; SameSite=Strict`);
  }
  if (!store.has(sid)) {
    store.set(sid, { events: [], logs: [], lastAccess: Date.now() });
  } else {
    store.get(sid).lastAccess = Date.now();
  }
  return store.get(sid);
}
