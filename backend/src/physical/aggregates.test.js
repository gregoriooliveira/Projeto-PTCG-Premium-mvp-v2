import { beforeEach, describe, expect, it, vi } from 'vitest';

let eventDocs;
let daySetMock;
let deckSetMock;
let tournamentSetMock;
let mirrorSetMock;
let collectionHandlers;

const collectionMock = vi.fn((name) => {
  const handler = collectionHandlers[name];
  if (!handler) throw new Error(`Unknown collection ${name}`);
  return handler;
});

vi.mock('../firestore.js', () => ({
  db: {
    collection: collectionMock
  }
}));

const createSnapshot = (items) => ({
  empty: items.length === 0,
  forEach(callback) {
    for (const item of items) callback({ data: () => item });
  },
  docs: items.map((item) => ({ data: () => item }))
});

const { recomputeDay, recomputeDeck, recomputeTournament } = await import('./aggregates.js');

beforeEach(() => {
  eventDocs = [];
  daySetMock = vi.fn();
  deckSetMock = vi.fn();
  tournamentSetMock = vi.fn();
  mirrorSetMock = vi.fn();

  const queryFor = (field, value) => {
    return eventDocs.filter((ev) => {
      switch (field) {
        case 'date':
          return ev.date === value;
        case 'playerDeckKey':
          return ev.playerDeckKey === value;
        case 'tournamentId':
          return ev.tournamentId === value;
        default:
          return true;
      }
    });
  };

  collectionHandlers = {
    physicalEvents: {
      where: vi.fn((field, _op, value) => ({
        async get() {
          return createSnapshot(queryFor(field, value));
        }
      }))
    },
    physicalDays: {
      doc: vi.fn(() => ({
        set: daySetMock,
        delete: vi.fn()
      }))
    },
    physicalDecksAgg: {
      doc: vi.fn(() => ({
        set: deckSetMock,
        delete: vi.fn()
      }))
    },
    physicalTournamentsAgg: {
      doc: vi.fn(() => ({
        set: tournamentSetMock,
        delete: vi.fn()
      }))
    },
    tournaments: {
      doc: vi.fn(() => ({
        set: mirrorSetMock,
        delete: vi.fn()
      }))
    }
  };

  collectionMock.mockClear();
});

describe('physical aggregates eventCounts integration', () => {
  it('uses stats counts when recomputing day aggregates', async () => {
    eventDocs.push({
      date: '2024-05-01',
      stats: { counts: { W: 2, L: 1 } }
    });

    await recomputeDay('2024-05-01');

    expect(daySetMock).toHaveBeenCalledTimes(1);
    expect(daySetMock).toHaveBeenCalledWith(
      { date: '2024-05-01', counts: { W: 2, L: 1, T: 0 }, wr: 66.7 },
      { merge: true }
    );
  });

  it('derives deck counts and win rate from stats counts', async () => {
    eventDocs.push({
      playerDeckKey: 'deck-123',
      stats: { counts: { W: 3, L: 1 } }
    });

    await recomputeDeck('deck-123');

    expect(deckSetMock).toHaveBeenCalledTimes(1);
    expect(deckSetMock).toHaveBeenCalledWith(
      { deckKey: 'deck-123', games: 1, counts: { W: 3, L: 1, T: 0 }, wr: 75, pokemons: [] },
      { merge: true }
    );
  });

  it('aggregates tournament decks using derived counts', async () => {
    eventDocs.push({
      tournamentId: 'tour-1',
      playerDeckKey: 'deck-abc',
      stats: { counts: { W: 2, L: 0, T: 1 } }
    });

    await recomputeTournament('tour-1');

    expect(tournamentSetMock).toHaveBeenCalledTimes(1);
    expect(tournamentSetMock).toHaveBeenCalledWith(
      {
        tournamentId: 'tour-1',
        decks: [
          { deckKey: 'deck-abc', counts: { W: 2, L: 0, T: 1 }, games: 1, wr: 66.7 }
        ]
      },
      { merge: true }
    );
    expect(mirrorSetMock).toHaveBeenCalledWith(
      { tournamentId: 'tour-1', source: 'physical' },
      { merge: true }
    );
  });
});
