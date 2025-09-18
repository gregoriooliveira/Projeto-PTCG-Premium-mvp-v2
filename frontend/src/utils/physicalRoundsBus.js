export const PHYSICAL_ROUNDS_CHANGED = "physicalRounds:changed";

const subscribers = new Set();

export function emitPhysicalRoundsChanged(eventId) {
  const detail = { eventId: eventId ?? null, timestamp: Date.now() };
  subscribers.forEach((handler) => {
    try {
      handler(detail.eventId, detail);
    } catch {
      /* ignore subscriber errors */
    }
  });
  return subscribers.size;
}

export function subscribePhysicalRoundsChanged(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
