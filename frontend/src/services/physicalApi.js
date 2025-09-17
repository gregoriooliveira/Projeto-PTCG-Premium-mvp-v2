import { api } from "./api.js";

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
