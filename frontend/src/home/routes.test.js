import { describe, expect, it, vi, beforeEach } from "vitest";

const { collection } = vi.hoisted(() => ({
  collection: vi.fn(),
}));

vi.mock("../firestore.js", () => ({
  db: { collection },
}));

import router from "./routes.js";

function makeDocs(items) {
  return items.map(item => ({
    data: () => item,
  }));
}

function makeQuery(items) {
  const docs = makeDocs(items);
  return {
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs }),
  };
}

function getHomeHandler() {
  const layer = router.stack.find(l => l.route?.path === "/home");
  if (!layer) throw new Error("Home route not found");
  return layer.route.stack[0].handle;
}

beforeEach(() => {
  collection.mockReset();
});

describe("/api/home", () => {
  it("derives counts and win rate for deck aggregates without stored stats", async () => {
    const deckData = {
      deckKey: "deck-1",
      pokemons: ["pikachu", "eevee"],
      results: ["W", "L", "W"],
    };

    const eventsDocs = makeDocs([
      {
        createdAt: 2,
        result: "W",
        eventId: "evt-1",
        deckName: "Deck 1",
        opponentDeck: "Other",
        you: "Ash",
        opponent: "Misty",
        date: "2024-01-01",
      },
    ]);

    const collections = {
      liveEvents: {
        get: vi.fn().mockResolvedValue({ docs: eventsDocs }),
      },
      liveDays: makeQuery([]),
      liveDecksAgg: {
        get: vi.fn().mockResolvedValue({ docs: makeDocs([deckData]) }),
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false }),
        }),
      },
      liveOpponentsAgg: {
        get: vi.fn().mockResolvedValue({ docs: [] }),
      },
      liveTournamentsAgg: makeQuery([]),
    };

    collection.mockImplementation(name => {
      const col = collections[name];
      if (!col) throw new Error(`Unexpected collection ${name}`);
      return col;
    });

    const handler = getHomeHandler();
    const req = { query: { source: "live" } };
    let body;
    const res = {
      json: payload => {
        body = payload;
        return payload;
      },
    };

    await handler(req, res);

    expect(body).toBeTruthy();
    expect(body.topDecks).toHaveLength(1);
    expect(body.topDecks[0].counts).toEqual({ W: 2, L: 1, T: 0 });
    expect(body.topDecks[0].wr).toBe(66.7);
    expect(body.summary.topDeck).toMatchObject({
      deckKey: "deck-1",
      wr: 66.7,
      avatars: ["pikachu", "eevee"],
      counts: { W: 2, L: 1, T: 0 },
    });
  });
});

