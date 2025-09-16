const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '');

/* CSRF helpers */
function getCsrfToken(){
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find(r => r.startsWith('csrfToken='))?.split('=')[1] || '';
}

async function ensureCsrf(){
  let token = getCsrfToken();
  if (token) return token;
  const res = await fetch(`${API_BASE}/api/health`, { credentials:'include', cache:'no-store' });
  token = getCsrfToken() || res.headers.get('x-csrf-token') || '';
  return token;
}

/* Core fetch wrapper */
export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) };
  const method = (opts.method || 'GET').toUpperCase();
  let token = getCsrfToken();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    if (!token) token = await ensureCsrf();
    if (token) headers['X-CSRF-Token'] = token;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
    cache: opts.cache || 'no-store',
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw Object.assign(new Error(json?.error || res.statusText), { status: res.status, body: json });
  }
  return json;
}

/* Home */
export const getHome = ({ source='all', limit=5 } = {}) => api(`/api/home?source=${encodeURIComponent(source)}&limit=${encodeURIComponent(limit)}`);

/* Live summary & day */
export const getLiveSummary = ({ source='all', limit=5 } = {}) => api(`/api/live/summary?source=${encodeURIComponent(source)}&limit=${encodeURIComponent(limit)}`);
export const getLiveDay = (date) => api(`/api/live/days/${encodeURIComponent(date)}`);

/* Live events (CRUD) */
export const postLiveEvent = (payload) => api(`/api/live/events`, { method:'POST', body: JSON.stringify(payload) });
export const getLiveEvent = (id) => api(`/api/live/events/${encodeURIComponent(id)}`);
export const patchLiveEvent = (id, payload) => api(`/api/live/events/${encodeURIComponent(id)}`, { method:'PATCH', body: JSON.stringify(payload) });
export const deleteLiveEvent = (id) => api(`/api/live/events/${encodeURIComponent(id)}`, { method:'DELETE' });

/* Decks */
export const listLiveDecks = () => api(`/api/live/decks`);
export const getDeck = (id) => api(`/api/live/decks/${encodeURIComponent(id)}`);
export const patchDeck = (id, payload) => api(`/api/decks/${encodeURIComponent(id)}`, { method:'PATCH', body: JSON.stringify(payload) }); // backend pode não suportar PATCH de deck; manter compat

/* Tournaments */
export const listLiveTournaments = () => api(`/api/live/tournaments`);
export const getLiveTournament = (id) => api(`/api/live/tournaments/${encodeURIComponent(id)}`);
export const suggestLiveTournaments = (query) => api(`/api/live/tournaments/suggest?query=${encodeURIComponent(query||'')}`);

/* Opponents */
const unwrapOpponentsAgg = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  return [];
};

export const getLiveOpponentsAgg = () => api(`/api/live/opponents-agg`);
export const getPhysicalOpponentsAgg = () => api(`/api/physical/opponents-agg`);

export const getOpponentsAgg = async () => {
  const [live, physical] = await Promise.allSettled([
    getLiveOpponentsAgg(),
    getPhysicalOpponentsAgg(),
  ]);

  const chunks = [];
  if (live.status === "fulfilled") chunks.push(unwrapOpponentsAgg(live.value));
  if (physical.status === "fulfilled") chunks.push(unwrapOpponentsAgg(physical.value));

  if (chunks.length) {
    return chunks.flat();
  }

  const reasons = [live.status === "rejected" ? live.reason : null, physical.status === "rejected" ? physical.reason : null];
  const err = reasons.find(Boolean) || new Error("opponents_agg_failed");
  throw err;
};

export const getOpponentLogs = async (opponent, { limit=5, offset=0 } = {}) => {
  // Primário: servidor filtra
  const url = `/api/live/logs?opponent=${encodeURIComponent(opponent||'')}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}&source=all`;
  try {
    const first = await api(url);
    if (first && first.ok && Array.isArray(first.rows) && first.rows.length) return first;
    // Fallback: busca todos e filtra no cliente se servidor não retornou (compatibilidade)
    const all = await api(`/api/live/logs?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}&source=all`);
    if (!all || !Array.isArray(all.rows)) return first || all;
    const keyFields = ['opponent','opponentName','name','opponent_username','opponentUser','opName'];
    const name = String(opponent||'').trim().toLowerCase();
    const rows = all.rows.filter(r => keyFields.some(k => String(r?.[k]||'').toLowerCase() === name));
    return { ...all, rows, total: rows.length, ok: true };
  } catch (e) {
    throw e;
  }
};

/* Importing */
export const importLogsParse = (payload) => api(`/api/import-logs/parse`, { method:'POST', body: JSON.stringify(payload) });
export const importLogsCommit = (payload) => api(`/api/import-logs/commit`, { method:'POST', body: JSON.stringify(payload) });

/* Pokédex helpers */
export const searchPokemon = (q) => api(`/api/pokedex/search?q=${encodeURIComponent(q||'')}`);
export const getPokemonBySlug = (slug) => api(`/api/pokedex/by-slug/${encodeURIComponent(slug||'')}`);

/* Helpers */
export function normalizeDeckKey(s=''){ return String(s).trim().replace(/\s+/g,' ').toLowerCase(); }
export function officialArtworkUrl(id){ return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`; }
