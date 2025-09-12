import { getCsrfToken } from "./utils/csrf.js";

const API_BASE = '/api/live-logs';

let migrated = false;
async function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  try {
    const raw = localStorage.getItem('ptcg-premium:live-logs');
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      console.warn('Migrando logs do localStorage para o servidor...');
      for (const log of arr) {
        await addLog(log);
      }
    }
    localStorage.removeItem('ptcg-premium:live-logs');
  } catch (err) {
    console.warn('Falha ao migrar logs', err);
  }
}

export async function getAllLogs() {
  await migrateLegacy();
  try {
    const res = await fetch(API_BASE, { credentials: 'include' });
    if (!res.ok) throw new Error('fail');
    return await res.json();
  } catch (err) {
    console.warn('Falha ao carregar logs', err);
    return [];
  }
}

export async function addLog(log) {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify(log),
    });
    if (!res.ok) throw new Error('fail');
    return await res.json();
  } catch (err) {
    console.warn('Falha ao salvar log', err);
    return null;
  }
}
