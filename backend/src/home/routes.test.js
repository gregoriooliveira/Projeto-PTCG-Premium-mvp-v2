import { describe, it, expect, vi, beforeEach } from 'vitest';

const eventDocs = [
  {
    eventId: 'evt-with-counts',
    createdAt: 20,
    date: '2024-04-01',
    counts: { W: 2, L: 1 },
    deckName: 'Deck A',
    opponentDeck: 'Deck B',
    result: 'W'
  },
  {
    eventId: 'evt-with-results',
    createdAt: 10,
    date: '2024-03-20',
    results: ['W', 'L', 'T', 'W'],
    deckName: 'Deck C',
    opponentDeck: 'Deck D'
  }
];

const decksDocs = [
  {
    deckKey: 'deck-1',
    counts: { W: 10, L: 5, T: 0 },
    wr: 66.7,
    pokemons: ['pikachu']
  }
];

function createSnapshot(items) {
  return {
    docs: items.map((data) => ({
      data: () => data
    }))
  };
}

let collectionHandlers;

beforeEach(() => {
  collectionHandlers = {
    physicalEvents: {
      async get() {
        return createSnapshot(eventDocs);
      }
    },
    physicalDays: {
      orderBy() {
        return {
          limit() {
            return {
              async get() {
                return createSnapshot([]);
              }
            };
          }
        };
      }
    },
    physicalDecksAgg: {
      async get() {
        return createSnapshot(decksDocs);
      },
      doc() {
        return {
          async get() {
            return { exists: false };
          }
        };
      }
    },
    physicalOpponentsAgg: {
      async get() {
        return createSnapshot([]);
      }
    },
    physicalTournamentsAgg: {
      orderBy() {
        return {
          limit() {
            return {
              async get() {
                return createSnapshot([]);
              }
            };
          }
        };
      }
    }
  };
});

const db = {
  collection(name) {
    const handler = collectionHandlers[name];
    if (!handler) throw new Error(`Unknown collection ${name}`);
    return handler;
  }
};

vi.mock('../firestore.js', () => ({ db }));

const { default: router } = await import('./routes.js');

function getHomeHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/home' && l.route.methods.get
  );
  return layer.route.stack[0].handle;
}

function createRes() {
  return {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

describe('home routes GET /home', () => {
  it('aggregates counts from events for summary totals and win rate', async () => {
    const handler = getHomeHandler();
    const req = { query: { source: 'physical', limit: '5' } };
    const res = createRes();

    await handler(req, res);

    expect(res.body.summary.counts).toEqual({ W: 4, L: 2, T: 1, total: 7 });
    expect(res.body.summary.wr).toBe(57.1);
    expect(res.body.summary.topDeck).toEqual({
      deckKey: 'deck-1',
      wr: 66.7,
      avatars: ['pikachu'],
      pokemons: ['pikachu']
    });
  });
});
