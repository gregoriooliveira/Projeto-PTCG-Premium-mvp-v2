const API_BASE = '/api/events';

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

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
    const res = await fetch(API_BASE, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('fail');
    return await res.json();
  } catch (err) {
    console.warn('Falha ao carregar eventos', err);
    return [];
  }
}

export async function getEvent(id) {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Falha ao obter evento', err);
    return null;
  }
}

export async function createEvent(ev) {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify(ev),
    });
    if (!res.ok) throw new Error('fail');
    return await res.json();
  } catch (err) {
    console.warn('Falha ao salvar evento', err);
    throw err;
  }
}

export async function updateEvent(id, patch) {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('fail');
    return await res.json();
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
