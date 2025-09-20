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
    eventId: 'evt-with-stats-counts',
    createdAt: 15,
    date: '2024-03-25',
    stats: { counts: { W: 1, L: 0, T: 1 } },
    deckName: 'Deck Stats',
    opponentDeck: 'Deck Opp'
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

let decksDocs;

function createSnapshot(items) {
  return {
    docs: items.map((data) => ({
      data: () => data
    }))
  };
}

let collectionHandlers;

beforeEach(() => {
  decksDocs = [
    {
      deckKey: 'deck-1',
      counts: { W: 10, L: 5, T: 0 },
      wr: 66.7,
      pokemons: ['pikachu']
    }
  ];
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

    expect(res.body.summary.counts).toEqual({ W: 5, L: 2, T: 2, total: 9 });
    expect(res.body.summary.wr).toBe(55.6);
    expect(res.body.summary.topDeck).toEqual({
      deckKey: 'deck-1',
      wr: 66.7,
      avatars: ['pikachu'],
      pokemons: ['pikachu']
    });
  });

  it('derives deck win rate and counts when missing from aggregate data', async () => {
    decksDocs.push({
      deckKey: 'deck-derived',
      counts: { W: 3, L: 0, T: 0 },
      pokemons: ['eevee']
    });
    decksDocs.push({
      deckKey: 'deck-empty',
      pokemons: ['snorlax']
    });

    const handler = getHomeHandler();
    const req = { query: { source: 'physical', limit: '5' } };
    const res = createRes();

    await handler(req, res);

    const derivedDeck = res.body.topDecks.find((d) => d.deckKey === 'deck-derived');
    expect(derivedDeck).toMatchObject({
      counts: { W: 3, L: 0, T: 0 },
      wr: 100,
      avatars: ['eevee'],
      pokemons: ['eevee']
    });

    expect(res.body.summary.topDeck).toEqual({
      deckKey: 'deck-derived',
      wr: 100,
      avatars: ['eevee'],
      pokemons: ['eevee']
    });

    const emptyDeck = res.body.topDecks.find((d) => d.deckKey === 'deck-empty');
    expect(emptyDeck).toMatchObject({
      counts: { W: 0, L: 0, T: 0 },
      wr: 0
    });
  });

  it('orders decks with equal win rate by total games', async () => {
    decksDocs.splice(
      0,
      decksDocs.length,
      {
        deckKey: 'deck-higher-total',
        counts: { W: 6, L: 3, T: 0 },
        wr: 66.7,
        pokemons: ['mew']
      },
      {
        deckKey: 'deck-lower-total',
        counts: { W: 2, L: 1, T: 0 },
        wr: 66.7,
        pokemons: ['mewtwo']
      }
    );

    const handler = getHomeHandler();
    const req = { query: { source: 'physical', limit: '5' } };
    const res = createRes();

    await handler(req, res);

    expect(res.body.topDecks.map((d) => d.deckKey)).toEqual([
      'deck-higher-total',
      'deck-lower-total'
    ]);

    expect(res.body.summary.topDeck).toEqual({
      deckKey: 'deck-higher-total',
      wr: 66.7,
      avatars: ['mew'],
      pokemons: ['mew']
    });
  });
});
