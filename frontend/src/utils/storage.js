export function safeParse(json, fallback) {
  if (json == null) return fallback;
  try {
    const parsed = JSON.parse(json);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function getItem(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return safeParse(raw, fallback);
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('Falha ao salvar no localStorage', err);
    return false;
  }
}
