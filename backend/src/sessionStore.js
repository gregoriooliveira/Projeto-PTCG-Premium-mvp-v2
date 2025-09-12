import { randomUUID } from 'crypto';

// In-memory session store: sessionId -> { events: [], logs: [] }
const store = new Map();

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
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/`);
  }
  if (!store.has(sid)) {
    store.set(sid, { events: [], logs: [] });
  }
  return store.get(sid);
}
