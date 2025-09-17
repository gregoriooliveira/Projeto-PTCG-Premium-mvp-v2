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

export const getPhysicalSummary = ({ limitDays } = {}) => {
  const params = new URLSearchParams();
  if (limitDays != null) params.set('limitDays', limitDays);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/api/physical/summary${query}`);
};

export const getPhysicalLogs = ({ limit = 200, offset = 0, opponent } = {}) => {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', limit);
  if (offset) params.set('offset', offset);
  if (opponent) params.set('opponent', opponent);
  const query = params.toString() ? `?${params.toString()}` : '';
  return api(`/api/physical/logs${query}`);
};

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
  const opponentName = String(opponent || "").trim();
  const normalizedOpponent = opponentName.toLowerCase();
  const keyFields = ['opponent','opponentName','name','opponent_username','opponentUser','opName'];

  const filterRowsByOpponent = (rows = []) => {
    const arr = Array.isArray(rows) ? rows : [];
    if (!normalizedOpponent) return arr;
    return arr.filter((row) =>
      keyFields.some((key) => String(row?.[key] || '').trim().toLowerCase() === normalizedOpponent)
    );
  };

  const markRowsWithSource = (rows = [], source) =>
    (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, source }));

  const countFilledFields = (row = {}) => {
    let score = 0;
    for (const [key, value] of Object.entries(row)) {
      if (key === 'source') continue;
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      score += 1;
    }
    return score;
  };

  const mergeLogEntries = (a = {}, b = {}) => {
    const scoreA = countFilledFields(a);
    const scoreB = countFilledFields(b);
    const [primary, secondary] = scoreB > scoreA ? [b, a] : [a, b];
    const merged = { ...primary };
    for (const [key, value] of Object.entries(secondary)) {
      if (value === undefined || value === null) continue;
      if (value === '' && value !== 0) continue;
      const current = merged[key];
      const isEmptyCurrent = current === undefined || current === null || (current === '' && current !== 0);
      if (isEmptyCurrent) merged[key] = value;
    }
    return merged;
  };

  const parseTimestamp = (row = {}) => {
    const candidates = [row.date, row.createdAt, row.ts];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) return parsed;
      const numeric = Number(candidate);
      if (Number.isFinite(numeric)) return numeric;
    }
    return 0;
  };

  const dedupeAndSortLogs = (rows = []) => {
    const map = new Map();
    const extras = [];

    for (const row of rows) {
      if (!row) continue;
      const id = row.id !== undefined && row.id !== null && row.id !== '' ? String(row.id) : '';
      const date = row.date !== undefined && row.date !== null && row.date !== '' ? String(row.date) : '';
      const createdAt = row.createdAt !== undefined && row.createdAt !== null && row.createdAt !== '' ? String(row.createdAt) : '';
      const key = id ? `id:${id}` : date ? `date:${date}` : createdAt ? `createdAt:${createdAt}` : '';
      if (!key) {
        extras.push(row);
        continue;
      }
      if (!map.has(key)) {
        map.set(key, row);
        continue;
      }
      const existing = map.get(key);
      map.set(key, mergeLogEntries(existing, row));
    }

    const combined = [...map.values(), ...extras];
    combined.sort((a, b) => parseTimestamp(b) - parseTimestamp(a));
    return combined;
  };

  const extractRows = (payload) => {
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload)) return payload;
    return [];
  };

  const wrapPayload = (payload, source) => {
    const rows = filterRowsByOpponent(extractRows(payload));
    return {
      ok: typeof payload?.ok === 'boolean' ? payload.ok : true,
      total: rows.length,
      rows: markRowsWithSource(rows, source),
    };
  };

  const fetchSourceLogs = async (source) => {
    const base = source === 'physical' ? '/api/physical/logs' : '/api/live/logs';
    const queryParams = [
      `limit=${encodeURIComponent(limit)}`,
      `offset=${encodeURIComponent(offset)}`,
    ];
    if (source === 'live') queryParams.push('source=all');

    const filteredParams = normalizedOpponent
      ? [`opponent=${encodeURIComponent(opponentName)}`, ...queryParams]
      : [...queryParams];

    const filteredUrl = `${base}?${filteredParams.join('&')}`;
    const fallbackUrl = `${base}?${queryParams.join('&')}`;

    const primary = await api(filteredUrl);
    const primaryWrapped = wrapPayload(primary, source);
    if (primaryWrapped.rows.length || !normalizedOpponent) return primaryWrapped;

    const fallback = await api(fallbackUrl);
    return wrapPayload(fallback, source);
  };

  const [live, physical] = await Promise.allSettled([
    fetchSourceLogs('live'),
    fetchSourceLogs('physical'),
  ]);

  const fulfilled = [];
  const errors = [];

  if (live.status === 'fulfilled') fulfilled.push(live.value);
  else if (live.status === 'rejected') errors.push(live.reason);

  if (physical.status === 'fulfilled') fulfilled.push(physical.value);
  else if (physical.status === 'rejected') errors.push(physical.reason);

  if (!fulfilled.length) {
    const err = errors.find(Boolean) || new Error('opponent_logs_failed');
    throw err;
  }

  const combinedRows = dedupeAndSortLogs(fulfilled.flatMap((entry) => entry.rows || []));
  const anyOk = fulfilled.some((entry) => entry.ok !== false);

  return {
    ok: anyOk,
    total: combinedRows.length,
    rows: combinedRows,
  };
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
