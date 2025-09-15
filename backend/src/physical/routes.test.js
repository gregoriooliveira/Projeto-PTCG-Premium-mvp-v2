import { beforeEach, describe, expect, it, vi } from "vitest";

let eventsStore = {};

const db = {
  collection: () => ({
    doc: (id) => ({
      async get() {
        const exists = Object.prototype.hasOwnProperty.call(eventsStore, id);
        const snapshot = exists ? { ...eventsStore[id] } : undefined;
        return {
          exists,
          data: () => snapshot,
        };
      },
      async set(data) {
        eventsStore[id] = { ...(eventsStore[id] || {}), ...data };
      },
    }),
  }),
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
