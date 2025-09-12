import { api } from "./services/api.js";

const API_BASE = '/api/events';

let migrationDone = false;
async function migrateLegacy() {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const raw = localStorage.getItem('ptcg-premium:eventos');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      console.warn('Migrando eventos do localStorage para o servidor...');
      for (const ev of arr) {
        await createEvent(ev);
      }
    }
    localStorage.removeItem('ptcg-premium:eventos');
  } catch (err) {
    console.warn('Falha ao migrar eventos do localStorage', err);
  }
}

export async function getAllEvents() {
  await migrateLegacy();
  try {
    return await api(API_BASE);
  } catch (err) {
    console.warn('Falha ao carregar eventos', err);
    return [];
  }
}

export async function getEvent(id) {
  try {
    return await api(`${API_BASE}/${encodeURIComponent(id)}`);
  } catch (err) {
    console.warn('Falha ao obter evento', err);
    return null;
  }
}

export async function createEvent(ev) {
  try {
    return await api(API_BASE, { method: 'POST', body: JSON.stringify(ev) });
  } catch (err) {
    console.warn('Falha ao salvar evento', err);
    throw err;
  }
}

export async function updateEvent(id, patch) {
  try {
    return await api(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
  } catch (err) {
    console.warn('Falha ao atualizar evento', err);
    return null;
  }
}

export function getMatchesCount(ev) {
  if (Array.isArray(ev?.rounds)) return ev.rounds.length;
  if (ev?.stats?.totalMatches != null) return Number(ev.stats.totalMatches) || 0;
  const V = Number(ev?.V || 0), D = Number(ev?.D || 0), E = Number(ev?.E || 0);
  if (V || D || E) return V + D + E;
  return 0;
}
