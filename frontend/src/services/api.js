const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

function getCsrfToken(){
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find(r => r.startsWith('csrfToken='))?.split('=')[1] || '';
}

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) };
  const token = getCsrfToken();
  if (token) headers['X-CSRF-Token'] = token;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...opts
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* Home */
export const getHome = (source='all', limit=5) => api(`/api/home?source=${encodeURIComponent(source)}&limit=${limit}`);

/* Live */
export const getLiveSummary = (limitDays=5) => api(`/api/live/summary?limitDays=${limitDays}`);
export const getLiveDay = (date) => api(`/api/live/days/${encodeURIComponent(date)}`);
export const postLiveEvent = (payload) => api(`/api/live/events`, { method:'POST', body: JSON.stringify(payload) });
export const getLiveEvent = (id) => api(`/api/live/events/${encodeURIComponent(id)}`);
export const patchLiveEvent = (id, payload) => api(`/api/live/events/${encodeURIComponent(id)}`, { method:'PATCH', body: JSON.stringify(payload) });
export const deleteLiveEvent = (id) => api(`/api/live/events/${encodeURIComponent(id)}`, { method:'DELETE' });
export const listLiveDecks = () => api(`/api/live/decks`);
export const listLiveTournaments = (query='') => api(`/api/live/tournaments${query?`?query=${encodeURIComponent(query)}`:''}`);
export const getLiveTournament = (id) => api(`/api/live/tournaments/${encodeURIComponent(id)}`);
export const suggestLiveTournaments = (q) => api(`/api/live/tournaments/suggest?q=${encodeURIComponent(q)}`);

/* Deck catalog */
export const getDeck = (id) => api(`/api/decks/${encodeURIComponent(id)}`);
export const patchDeck = (id, payload) => api(`/api/decks/${encodeURIComponent(id)}`, { method:'PATCH', body: JSON.stringify(payload) });

/* Helpers */
export function normalizeDeckKey(s=''){ return String(s).trim().replace(/\s+/g,' ').toLowerCase(); }
export function officialArtworkUrl(id){ return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`; }

/* Import Logs + Pokedex */
export const importLogsParse = (payload) => api(`/api/import-logs/parse`, { method:'POST', body: JSON.stringify(payload) });
export const importLogsCommit = (payload) => api(`/api/import-logs/commit`, { method:'POST', body: JSON.stringify(payload) });
export const searchPokemon = (q) => api(`/api/pokedex/search?q=${encodeURIComponent(q)}`);
export const getPokemonBySlug = (slug) => api(`/api/pokedex/by-slug/${encodeURIComponent(slug)}`);


/* Opponents */
export const getOpponentsAgg = () => api(`/api/live/opponents-agg?source=all`);
export const getOpponentLogs = async (opponent, limit=5, offset=0) => {
  // Primary: server-side filter
  const url = `/api/live/logs?opponent=${encodeURIComponent(opponent)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}&source=all`;
  const first = await api(url);
  if (first && first.ok && Array.isArray(first.rows) && first.rows.length) return first;

  // Fallback: fetch all and filter client-side when the server returns zero rows
  const allUrl = `/api/live/logs?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}&source=all`;
  const all = await api(allUrl);
  if (!all || !all.ok || !Array.isArray(all.rows)) return first || all;

  const name = String(opponent || '').trim().toLowerCase();
  const keyFields = ['opponent','opponentName','name','opponent_username','opponentUser','opName'];
  const rows = all.rows.filter(r => keyFields.some(k => String(r?.[k] || '').toLowerCase() === name));
  return { ...all, rows, total: rows.length };
};
