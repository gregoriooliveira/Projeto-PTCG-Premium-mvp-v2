import { api } from "./api.js";

export const listPhysicalDays = async () => {
  try {
    const payload = await api(`/api/physical/days`);
    if (Array.isArray(payload)) return { data: payload, error: null };
    if (payload && Array.isArray(payload.dates)) {
      return { data: payload.dates, error: null };
    }
    return { data: [], error: null };
  } catch (error) {
    return { data: [], error };
  }
};

export const getPhysicalDay = async (date) => {
  const key = typeof date === "string" ? date.trim() : "";
  if (!key) {
    const error = new Error("invalid_date");
    return { data: null, error };
  }
  try {
    const data = await api(`/api/physical/days/${encodeURIComponent(key)}`);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const postPhysicalEvent = (payload) =>
  api(`/api/physical/events`, { method: "POST", body: JSON.stringify(payload) });

export const getPhysicalEvent = (id) =>
  api(`/api/physical/events/${encodeURIComponent(id)}`);

export const getPhysicalRounds = (eventId) =>
  api(`/api/physical/events/${encodeURIComponent(eventId)}/rounds`);

export const deletePhysicalEvent = (id) =>
  api(`/api/physical/events/${encodeURIComponent(id)}`, { method: "DELETE" });

// POST /api/physical/events/:eventId/rounds
// Returns the saved round object from the backend
export const postPhysicalRound = async (eventId, payload) => {
  return api(`/api/physical/events/${encodeURIComponent(eventId)}/rounds`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const updatePhysicalRound = async (eventId, roundId, payload) => {
  return api(
    `/api/physical/events/${encodeURIComponent(eventId)}/rounds/${encodeURIComponent(roundId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
};

export const deletePhysicalRound = async (eventId, roundId) => {
  return api(
    `/api/physical/events/${encodeURIComponent(eventId)}/rounds/${encodeURIComponent(roundId)}`,
    {
      method: "DELETE",
    },
  );
};

export const listPhysicalTournaments = async (params = {}) => {
  let query = "";
  let type = "";
  if (typeof params === "string") {
    query = params;
  } else if (params && typeof params === "object") {
    if (params.query) query = params.query;
    if (params.type) type = params.type;
  }
  const usp = new URLSearchParams();
  if (query) usp.set("query", query);
  if (type) usp.set("type", type);
  const search = usp.toString();
  const suffix = search ? `?${search}` : "";
  return api(`/api/physical/tournaments${suffix}`);
};

export const suggestPhysicalTournaments = (query) =>
  api(`/api/physical/tournaments/suggest?query=${encodeURIComponent(query || "")}`);

export const getPhysicalTournament = (id) =>
  api(`/api/physical/tournaments/${encodeURIComponent(id)}`);
