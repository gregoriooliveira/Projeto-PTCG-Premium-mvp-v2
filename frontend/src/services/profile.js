import { api } from "./api.js";

const PROFILE_ENDPOINT = "/api/profile";
const STORAGE_KEY = "ptcg:profile";

const defaultProfile = Object.freeze({
  screenName: "",
  themePreference: "dark",
});

const normalizeProfile = (data = {}) => {
  const result = { ...defaultProfile };
  if (typeof data.screenName === "string") {
    result.screenName = data.screenName.trim();
  }
  if (data.themePreference === "light" || data.themePreference === "dark") {
    result.themePreference = data.themePreference;
  }
  return result;
};

const readCache = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeProfile(parsed);
  } catch {
    return null;
  }
};

const writeCache = (profile) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
};

export const clearProfileCache = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
};

export async function getProfile() {
  const cached = typeof window !== "undefined" ? readCache() : null;
  try {
    const payload = await api(PROFILE_ENDPOINT);
    const profile = normalizeProfile(payload);
    if (typeof window !== "undefined") {
      writeCache(profile);
    }
    return profile;
  } catch (err) {
    if (cached) {
      return cached;
    }
    if (err?.status === 404) {
      return { ...defaultProfile };
    }
    throw err;
  }
}

export async function updateProfile(updates = {}) {
  const payload = {};
  if (typeof updates.screenName === "string") {
    payload.screenName = updates.screenName.trim();
  }
  if (updates.themePreference === "light" || updates.themePreference === "dark") {
    payload.themePreference = updates.themePreference;
  }
  const body = Object.keys(payload).length ? JSON.stringify(payload) : undefined;
  const opts = body
    ? {
        method: "PATCH",
        body,
      }
    : { method: "PATCH", body: JSON.stringify({}) };
  const response = await api(PROFILE_ENDPOINT, opts);
  const merged = normalizeProfile({ ...payload, ...response });
  if (typeof window !== "undefined") {
    writeCache(merged);
  }
  return merged;
}

export async function deleteAccount() {
  await api(PROFILE_ENDPOINT, { method: "DELETE" });
  if (typeof window !== "undefined") {
    clearProfileCache();
  }
  return true;
}

export default {
  getProfile,
  updateProfile,
  deleteAccount,
  clearProfileCache,
};
