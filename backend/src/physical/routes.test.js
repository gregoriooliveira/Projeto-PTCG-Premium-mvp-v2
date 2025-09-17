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
      const coerceComparableValue = (value) => {
        if (value === undefined || value === null) {
          return { type: "null", value: null };
        }
        if (typeof value === "number" && Number.isFinite(value)) {
          return { type: "number", value };
        }
        if (value instanceof Date) {
          return { type: "number", value: value.getTime() };
        }
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) return { type: "string", value: "" };
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric)) {
            return { type: "number", value: numeric };
          }
          const parsed = Date.parse(trimmed);
          if (!Number.isNaN(parsed)) {
            return { type: "number", value: parsed };
          }
          return { type: "string", value: trimmed };
        }
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          return { type: "number", value: numeric };
        }
        return { type: "string", value: String(value) };
      };

      const compareValues = (a, b) => {
        const av = coerceComparableValue(a);
        const bv = coerceComparableValue(b);
        if (av.value === null && bv.value === null) return 0;
        if (av.value === null) return -1;
        if (bv.value === null) return 1;
        if (av.type === "string" || bv.type === "string") {
          return String(av.value).localeCompare(String(bv.value));
        }
        return Number(av.value) - Number(bv.value);
      };

      const matchesFilter = (data, { field, op, value }) => {
        const fieldValue = data?.[field];
        if (op === "==") return fieldValue === value;
        if (op === "array-contains") {
          return Array.isArray(fieldValue) && fieldValue.includes(value);
        }
        throw new Error(`Unsupported operator ${op}`);
      };

      const runQuery = ({ filters = [], orderBys = [], limitValue = null } = {}) => {
        let entries = Object.entries(eventsStore);
        if (filters.length) {
          entries = entries.filter(([, data]) =>
            filters.every((filter) => matchesFilter(data, filter)),
          );
        }
        const sorted = orderBys.length
          ? [...entries].sort((aEntry, bEntry) => {
              for (const { field, direction } of orderBys) {
                const dir = String(direction || "asc").toLowerCase() === "desc" ? -1 : 1;
                const cmp = compareValues(aEntry[1]?.[field], bEntry[1]?.[field]);
                if (cmp !== 0) return cmp * dir;
              }
              return aEntry[0] < bEntry[0] ? -1 : aEntry[0] > bEntry[0] ? 1 : 0;
            })
          : [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        const limited =
          typeof limitValue === "number" && Number.isFinite(limitValue)
            ? sorted.slice(0, limitValue)
            : sorted;
        const docs = limited.map(([id, data]) => ({
          id,
          data: () => clone(data),
        }));
        return {
          docs,
          forEach(callback) {
            docs.forEach((doc) => callback(doc));
          },
        };
      };

      const createQuery = (state = { filters: [], orderBys: [], limitValue: null }) => ({
        where(field, op, value) {
          return createQuery({
            filters: [...state.filters, { field, op, value }],
            orderBys: state.orderBys,
            limitValue: state.limitValue,
          });
        },
        orderBy(field, direction = "asc") {
          return createQuery({
            filters: state.filters,
            orderBys: [...state.orderBys, { field, direction }],
            limitValue: state.limitValue,
          });
        },
        limit(n) {
          const numeric = Number(n);
          return createQuery({
            filters: state.filters,
            orderBys: state.orderBys,
            limitValue: Number.isFinite(numeric) ? numeric : state.limitValue,
          });
        },
        async get() {
          return runQuery(state);
        },
      });

      const baseQuery = createQuery();

      return {
        doc: (id) => ({
          async get() {
            const exists = Object.prototype.hasOwnProperty.call(eventsStore, id);
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
            const getSnapshots = () => {
              const eventRounds = roundsStore[id] || {};
              const entries = Object.entries(eventRounds);
              return entries.map(([roundId, roundData]) =>
                createRoundSnapshot(id, roundId, roundData),
              );
            };
            const buildResult = (snapshots) => ({
              forEach(callback) {
                snapshots.forEach((snapshot) => callback(snapshot));
              },
              docs: snapshots,
              size: snapshots.length,
            });
            return {
              async get() {
                const snapshots = getSnapshots();
                return buildResult(snapshots);
              },
              orderBy(field, direction = "asc") {
                const dir = String(direction || "asc").toLowerCase() === "desc" ? -1 : 1;
                return {
                  async get() {
                    const snapshots = getSnapshots().sort((a, b) => {
                      const aData = a.data() || {};
                      const bData = b.data() || {};
                      const av = aData[field];
                      const bv = bData[field];
                      if (av == null && bv == null) {
                        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
                      }
                      if (av == null) return -1 * dir;
                      if (bv == null) return 1 * dir;
                      if (av === bv) {
                        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
                      }
                      if (typeof av === "number" && typeof bv === "number") {
                        return (av - bv) * dir;
                      }
                      return String(av).localeCompare(String(bv)) * dir;
                    });
                    return buildResult(snapshots);
                  },
                };
              },
              doc: (roundId) => ({
                async get() {
                  const eventRounds = roundsStore[id] || {};
                  const current = eventRounds[roundId];
                  const exists = current !== undefined;
                  const snapshot = exists ? clone(current) : undefined;
                  return {
                    exists,
                    data: () => snapshot,
                  };
                },
                async set(data, options = {}) {
                  const eventRounds = roundsStore[id] || {};
                  const nextData = clone(data);
                  if (!nextData.roundId) {
                    nextData.roundId = roundId;
                  }
                  const current = eventRounds[roundId];
                  const merged = options.merge
                    ? { ...(current ? clone(current) : {}), ...nextData }
                    : nextData;
                  roundsStore[id] = { ...eventRounds, [roundId]: merged };
                },
                async delete() {
                  deleteRound(id, roundId);
                },
              }),
            };
          },
        }),
        where: baseQuery.where,
        orderBy: baseQuery.orderBy,
        limit: baseQuery.limit,
        async get() {
          return runQuery();
        },
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

function getRoundPatchHandler() {
  const layer = router.stack.find(
    (l) =>
      l.route &&
      l.route.path === "/events/:eventId/rounds/:roundId" &&
      l.route.methods.patch,
  );
  return layer.route.stack[1].handle;
}

function getDeleteHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === "/events/:id" && l.route.methods.delete,
  );
  return layer.route.stack[1].handle;
}

function getLogsHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === "/logs" && l.route.methods.get,
  );
  return layer.route.stack[0].handle;
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
    const original = clone(eventsStore.evt1);

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
    const [prevArg, nextArg] = recomputeAllForEvent.mock.calls[0];
    expect(prevArg).toMatchObject(original);
    expect(nextArg).toEqual(res.body);
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
    const original = clone(eventsStore.evt1);

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
    const [prevArg, nextArg] = recomputeAllForEvent.mock.calls[0];
    expect(prevArg).toMatchObject(original);
    expect(nextArg).toEqual(res.body);
  });
});

describe("physical routes PATCH /events/:eventId/rounds/:roundId", () => {
  beforeEach(() => {
    eventsStore = {
      evt1: {
        eventId: "evt1",
        createdAt: 1704067200000,
      },
    };
    roundsStore = {
      evt1: {
        "round-1": {
          roundId: "round-1",
          number: 1,
          opponentName: "Brock",
          opponentDeckName: "Rock Deck",
          normOppDeckKey: "rock deck",
          g1: { result: "V", order: "1st" },
          g2: { result: "", order: "" },
          g3: { result: "", order: "" },
          flags: { noShow: false, bye: false, id: false },
          result: "W",
        },
      },
    };
    rawLogsStore = {};
    recomputeAllForEvent.mockClear();
  });

  it("updates stored round without duplicating entries", async () => {
    const handler = getRoundPatchHandler();
    const req = {
      params: { eventId: "evt1", roundId: "round-1" },
      body: {
        number: 1,
        opponentName: "Misty",
        opponentDeckName: "Water Control",
        oppMonA: { slug: "staryu", name: "Staryu" },
        oppMonASlug: "staryu",
        g1: { result: "D", order: "2nd" },
        g2: { result: "V", order: "1st" },
        g3: { result: "", order: "" },
        flags: { id: true },
      },
    };
    const res = createRes();

    await handler(req, res);

    expect(res.body).toMatchObject({
      roundId: "round-1",
      number: 1,
      opponentName: "Misty",
      opponentDeckName: "Water Control",
    });
    expect(res.body.result).toBe("T");
    expect(Object.keys(roundsStore.evt1)).toEqual(["round-1"]);
    expect(roundsStore.evt1["round-1"]).toMatchObject({
      roundId: "round-1",
      opponentName: "Misty",
      opponentDeckName: "Water Control",
      result: "T",
      flags: { id: true, noShow: false, bye: false },
    });
    expect(eventsStore.evt1.stats.counts).toEqual({ W: 0, L: 0, T: 1 });
    expect(recomputeAllForEvent).toHaveBeenCalledOnce();
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
    const [prevArg, nextArg] = recomputeAllForEvent.mock.calls[0];
    expect(prevArg).toMatchObject(originalEvent);
    expect(nextArg).toBeNull();
  });
});

describe("physical routes GET /logs", () => {
  beforeEach(() => {
    eventsStore = {};
    roundsStore = {};
    rawLogsStore = {};
    recomputeAllForEvent.mockClear();
  });

  it("merges results using opponentsAgg data when querying by opponent name", async () => {
    eventsStore = {
      evt1: {
        eventId: "evt1",
        createdAt: 2000,
        date: "2024-06-01",
        deckName: "Pika Control",
        pokemons: ["pikachu"],
        opponentsList: ["Brock"],
        opponentsAgg: [
          {
            opponentName: "Brock",
            counts: { W: 1, L: 0, T: 0 },
            decks: [
              {
                deckKey: "fighting deck",
                deckName: "Fighting Deck",
                pokemons: ["machamp"],
                counts: { W: 1, L: 0, T: 0 },
                total: 1,
              },
            ],
            topDeckKey: "fighting deck",
            topDeckName: "Fighting Deck",
            topPokemons: ["machamp"],
          },
        ],
        event: "League Challenge",
      },
    };

    const handler = getLogsHandler();
    const res = createRes();

    await handler({ query: { opponent: "Brock", limit: "5" } }, res);

    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.rows).toHaveLength(1);
    const [row] = res.body.rows;
    expect(row).toMatchObject({
      eventId: "evt1",
      deck: "Pika Control",
      opponentDeck: "Fighting Deck",
      result: "W",
      source: "physical",
    });
    expect(row.userPokemons).toEqual(["pikachu"]);
    expect(row.opponentPokemons).toEqual(["machamp"]);
    expect(row.pokemons).toEqual(expect.arrayContaining(["pikachu", "machamp"]));
    expect(row.event ?? row.eventName).toBe("League Challenge");
  });

  it("falls back to rounds data when aggregated opponent block is unavailable", async () => {
    eventsStore = {
      evt2: {
        eventId: "evt2",
        createdAt: 3000,
        deckName: "Charizard Control",
        pokemons: ["charizard"],
        opponent: "Jessie",
        event: "Local League",
      },
    };
    roundsStore = {
      evt2: {
        r1: {
          opponentName: "Jessie",
          opponentDeckName: "Team Rocket",
          result: "L",
          oppMonASlug: "ekans",
        },
      },
    };

    const handler = getLogsHandler();
    const res = createRes();

    await handler({ query: { opponent: "Jessie", limit: "5" } }, res);

    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.rows).toHaveLength(1);
    const [row] = res.body.rows;
    expect(row).toMatchObject({
      eventId: "evt2",
      opponentDeck: "Team Rocket",
      result: "L",
      source: "physical",
    });
    expect(row.userPokemons).toEqual(["charizard"]);
    expect(row.opponentPokemons).toEqual(["ekans"]);
    expect(row.pokemons).toEqual(expect.arrayContaining(["charizard", "ekans"]));
  });

  it("deduplicates events returned by multiple queries", async () => {
    eventsStore = {
      evt3: {
        eventId: "evt3",
        createdAt: 4000,
        deckName: "Blastoise Control",
        pokemons: ["blastoise"],
        opponent: "James",
        opponentsList: ["James"],
        opponentsAgg: [
          {
            opponentName: "James",
            counts: { W: 0, L: 1, T: 0 },
            topDeckKey: "control",
            topDeckName: "Control",
            topPokemons: ["weezing"],
          },
        ],
        event: "City League",
      },
    };

    const handler = getLogsHandler();
    const res = createRes();

    await handler({ query: { opponent: "James", limit: "5" } }, res);

    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.rows).toHaveLength(1);
    const [row] = res.body.rows;
    expect(row.eventId).toBe("evt3");
    expect(row.result).toBe("L");
    expect(row.source).toBe("physical");
    expect(row.pokemons).toEqual(expect.arrayContaining(["blastoise", "weezing"]));
  });
});
