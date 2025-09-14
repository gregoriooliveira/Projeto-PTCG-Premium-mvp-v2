import { api } from "./api.js";

export const postPhysicalEvent = (payload) =>
  api(`/api/physical/events`, { method: 'POST', body: JSON.stringify(payload) });

export const getPhysicalEvent = (id) =>
  api(`/api/physical/events/${encodeURIComponent(id)}`);

export const postPhysicalRound = (eventId, payload) =>
  api(`/api/physical/events/${encodeURIComponent(eventId)}/rounds`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
