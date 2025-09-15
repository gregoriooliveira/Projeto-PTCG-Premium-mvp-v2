import { beforeEach, describe, expect, it, vi } from "vitest";

let eventsStore = {};
let roundsStore = {};
let rawLogsStore = {};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deleteRound(eventId, roundId) {
  if (!roundsStore[eventId]) return;
  delete roundsStore[eventId][roundId];
  if (Object.keys(roundsStore[eventId]).length === 0) {
    delete roundsStore[eventId];
  }
}

function createRoundSnapshot(eventId, roundId, roundData) {
  return {
    id: roundId,
    data: () => clone(roundData),
    ref: {
      async delete() {
        deleteRound(eventId, roundId);
      },
    },
  };
}

const db = {
  collection: (collectionName) => {
    if (collectionName === "physicalEvents") {
      return {
        doc: (id) => ({
          async get() {
            const exists = Object.prototype.hasOwnProperty.call(
              eventsStore,
              id,
            );
            const snapshot = exists ? clone(eventsStore[id]) : undefined;
            return {
              exists,
              data: () => snapshot,
            };
          },
          async set(data, options = {}) {
            const current = eventsStore[id] || {};
            eventsStore[id] = options.merge
              ? { ...current, ...data }
              : clone(data);
          },
          async delete() {
            delete eventsStore[id];
          },
          collection(subcollectionName) {
            if (subcollectionName !== "rounds") {
              throw new Error(`Unsupported subcollection ${subcollectionName}`);
            }
            return {
              async get() {
                const eventRounds = roundsStore[id] || {};
                const entries = Object.entries(eventRounds);
                const snapshots = entries.map(([roundId, roundData]) =>
                  createRoundSnapshot(id, roundId, roundData),
                );
                return {
                  forEach(callback) {
                    snapshots.forEach((snapshot) => callback(snapshot));
                  },
                  docs: snapshots,
                };
              },
              doc: (roundId) => ({
                async delete() {
                  deleteRound(id, roundId);
                },
              }),
            };
          },
        }),
      };
    }
    if (collectionName === "rawLogs") {
      return {
        doc: (id) => ({
          async get() {
            const exists = Object.prototype.hasOwnProperty.call(
              rawLogsStore,
              id,
            );
            const snapshot = exists ? clone(rawLogsStore[id]) : undefined;
            return {
              exists,
              data: () => snapshot,
            };
          },
          async set(data) {
            rawLogsStore[id] = clone(data);
          },
          async delete() {
            delete rawLogsStore[id];
          },
        }),
      };
    }
    throw new Error(`Unsupported collection ${collectionName}`);
  },
};

const recomputeAllForEvent = vi.fn(async () => {});
const authMiddleware = vi.fn((req, res, next) => next());

vi.mock("../firestore.js", () => ({ db }));
vi.mock("./aggregates.js", () => ({ recomputeAllForEvent }));
vi.mock("../middleware/auth.js", () => ({ authMiddleware }));

const { default: router } = await import("./routes.js");

function getPatchHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === "/events/:id" && l.route.methods.patch,
  );
  return layer.route.stack[1].handle;
}

function getDeleteHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === "/events/:id" && l.route.methods.delete,
  );
  return layer.route.stack[1].handle;
}

function createRes() {
  return {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("physical routes PATCH /events/:id", () => {
  beforeEach(() => {
    eventsStore = {
      evt1: {
        eventId: "evt1",
        name: "Old Name",
        storeOrCity: "Old City",
        date: "2024-01-01",
        type: "Old Type",
        format: "Old Format",
        classification: "Old Classification",
        deckName: "Old Deck",
        playerDeckKey: "old deck",
        opponentDeck: "Old Opp Deck",
        opponentDeckKey: "old opp deck",
        you: "Ash",
        opponent: "Gary",
        createdAt: 1704067200000,
      },
    };
    roundsStore = {};
    rawLogsStore = {};
    recomputeAllForEvent.mockClear();
  });

  it("normalizes metadata fields and returns updated document", async () => {
    const handler = getPatchHandler();
    const req = {
      params: { id: "evt1" },
      body: {
        name: "  League   Challenge  ",
        storeOrCity: " São   Paulo ",
        date: "07/08/2024",
        type: " LC ",
        format: " Standard ",
        classification: "  Regional   Challenge ",
      },
    };
    const res = createRes();

    await handler(req, res);

    expect(res.body).toMatchObject({
      eventId: "evt1",
      name: "League Challenge",
      storeOrCity: "São Paulo",
      date: "2024-08-07",
      type: "LC",
      format: "Standard",
      classification: "Regional Challenge",
    });
    expect(eventsStore.evt1).toMatchObject({
      name: "League Challenge",
      storeOrCity: "São Paulo",
      date: "2024-08-07",
      type: "LC",
      format: "Standard",
      classification: "Regional Challenge",
    });
    expect(res.body).toEqual(eventsStore.evt1);
    expect(recomputeAllForEvent).toHaveBeenCalledOnce();
    expect(recomputeAllForEvent).toHaveBeenCalledWith(res.body);
  });

  it("clears metadata when blank values are provided", async () => {
    const handler = getPatchHandler();
    const req = {
      params: { id: "evt1" },
      body: {
        name: "",
        storeOrCity: "   ",
        date: "",
        type: null,
        format: "",
        classification: null,
      },
    };
    const res = createRes();

    await handler(req, res);

    expect(res.body).toMatchObject({
      name: null,
      storeOrCity: null,
      date: null,
      type: null,
      format: null,
      classification: null,
    });
    expect(eventsStore.evt1).toMatchObject({
      name: null,
      storeOrCity: null,
      date: null,
      type: null,
      format: null,
      classification: null,
    });
    expect(recomputeAllForEvent).toHaveBeenCalledWith(res.body);
  });
});

describe("physical routes DELETE /events/:id", () => {
  beforeEach(() => {
    eventsStore = {
      evt1: {
        eventId: "evt1",
        rawLogId: "raw1",
        name: "League Night",
      },
    };
    roundsStore = {
      evt1: {
        r1: { result: "W" },
        r2: { result: "L" },
      },
    };
    rawLogsStore = {
      raw1: { content: "some log" },
    };
    recomputeAllForEvent.mockClear();
  });

  it("deletes event document, rounds and raw log", async () => {
    const handler = getDeleteHandler();
    const req = { params: { id: "evt1" } };
    const res = createRes();
    const originalEvent = { ...eventsStore.evt1 };

    await handler(req, res);

    expect(res.body).toEqual({ ok: true });
    expect(eventsStore.evt1).toBeUndefined();
    expect(roundsStore.evt1).toBeUndefined();
    expect(rawLogsStore.raw1).toBeUndefined();
    expect(recomputeAllForEvent).toHaveBeenCalledOnce();
    expect(recomputeAllForEvent).toHaveBeenCalledWith(originalEvent);
  });
});
