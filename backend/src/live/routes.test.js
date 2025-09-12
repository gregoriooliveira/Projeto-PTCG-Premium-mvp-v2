import { describe, it, expect, vi } from 'vitest';

// In-memory store for events
const events = {
  evt1: {
    eventId: 'evt1',
    you: 'Old You',
    opponent: 'Old Opp',
    deckName: 'deck',
    opponentDeck: 'oppdeck',
    playerDeckKey: 'deck',
    opponentDeckKey: 'oppdeck',
    date: '2024-01-01'
  }
};

// Mock Firestore db
const db = {
  collection: () => ({
    doc: (id) => ({
      async get() {
        return { exists: !!events[id], data: () => events[id] };
      },
      async set(data) {
        events[id] = { ...(events[id] || {}), ...data };
      }
    })
  })
};

const recomputeAllForEvent = vi.fn(async () => {});
const authMiddleware = vi.fn((req, res, next) => next());

vi.mock('../firestore.js', () => ({ db }));
vi.mock('./aggregates.js', () => ({ recomputeAllForEvent }));
vi.mock('../middleware/auth.js', () => ({ authMiddleware }));

const { default: router } = await import('./routes.js');

function getPatchHandler() {
  const layer = router.stack.find(l => l.route && l.route.path === '/events/:id' && l.route.methods.patch);
  return layer.route.stack[1].handle;
}

function createRes() {
  return {
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
}

describe('live routes PATCH /events/:id', () => {
  it('updates player names and recomputes aggregates', async () => {
    const handler = getPatchHandler();
    const req = { params: { id: 'evt1' }, body: { you: ' New You ', opponent: 'New Opp ' } };
    const res = createRes();

    await handler(req, res);

    expect(events.evt1.you).toBe('New You');
    expect(events.evt1.opponent).toBe('New Opp');
    expect(res.body).toEqual({ ok: true });
    expect(recomputeAllForEvent).toHaveBeenCalledOnce();
    expect(recomputeAllForEvent.mock.calls[0][0].you).toBe('New You');
    expect(recomputeAllForEvent.mock.calls[0][0].opponent).toBe('New Opp');
  });
});

