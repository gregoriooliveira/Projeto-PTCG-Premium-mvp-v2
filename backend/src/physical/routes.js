import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../firestore.js";
import { normalizeDeckKey, normalizeName } from "../utils/normalize.js";
import { wrPercent, countsAdd, countsOfResult } from "../utils/wr.js";
import { dateKeyFromTs } from "../utils/tz.js";
import { recomputeAllForEvent } from "./aggregates.js";
import { authMiddleware } from "../middleware/auth.js";

const r = Router();

function safeDocId(s){ try { return encodeURIComponent(String(s||"")); } catch { return String(s||"").replace(/[\/\.\#$\[\]]/g, "_"); } }

/** Create an event (log) */
r.post("/events", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const now = Date.now();
  const eventId = body.eventId || nanoid();
  const you = normalizeName(body.you || "you");
  const opponent = normalizeName(body.opponent || "");
  const deckName = normalizeName(body.deckName || "");
  const opponentDeck = normalizeName(body.opponentDeck || "");

  const playerDeckKey = normalizeDeckKey(deckName);
  const opponentDeckKey = normalizeDeckKey(opponentDeck);

  const createdAt = body.createdAt || now;
  const date = dateKeyFromTs(createdAt);
  const isOnlineTourney = !!body.isOnlineTourney;
  const limitlessId = body.limitlessId || null;
  const tourneyName = body.tourneyName || null;
  const tournamentId = limitlessId ? `limitless:${limitlessId}` : (tourneyName ? `manual:${tourneyName.toLowerCase().replace(/\s+/g,'-')}:${date}` : null);
  const result = body.result || null; // opcional (front pode calcular)
  const round = body.round || null;
  const placement = body.placement || null;
  const rawLog = body.rawLog || null;
  const lang = body.lang || "pt";
  const pokemons = Array.isArray(body.pokemons) ? body.pokemons.slice(0,2) : [];

  const doc = {
    eventId, source:"physical", createdAt, date,
    you, opponent, deckName, opponentDeck,
    playerDeckKey, opponentDeckKey,
    isOnlineTourney, limitlessId, tourneyName, tournamentId,
    result, round, placement, rawLog, lang, pokemons
  };
  await db.collection("physicalEvents").doc(eventId).set(doc, { merge: true });
  await recomputeAllForEvent(doc);
  res.status(201).json({ eventId });
});

/** Read event by id */
r.get("/events/:id", async (req, res) => {
  const id = String(req.params.id);
  console.log("[GET physical event]", id);
  const ds = await db.collection("physicalEvents").doc(id).get();
  if (!ds.exists) return res.status(404).json({ error: "not_found" });
  const ev = ds.data();
  let rawLog = null;
  if (ev.rawLogId) {
    try {
      const raw = await db.collection("rawLogs").doc(ev.rawLogId).get();
      if (raw.exists) rawLog = raw.data()?.content || null;
    } catch (e) {
      console.error("[physical/events:id] rawLog lookup failed", e);
    }
  }
  return res.json({ ...ev, rawLog });
});

/**
 * Update event
 * Accepts deckName, opponentDeck, you, opponent, round, placement, pokemons and result fields
 */
r.patch("/events/:id", authMiddleware, async (req, res) => {
  const id = req.params.id;
  const ds = await db.collection("physicalEvents").doc(id).get();
  if (!ds.exists) return res.status(404).json({ error:"not_found" });

  const update = {};
  if ("deckName" in req.body) { update.deckName = normalizeName(req.body.deckName); update.playerDeckKey = normalizeDeckKey(update.deckName); }
  if ("opponentDeck" in req.body) { update.opponentDeck = normalizeName(req.body.opponentDeck); update.opponentDeckKey = normalizeDeckKey(update.opponentDeck); }
  if ("you" in req.body) update.you = normalizeName(req.body.you);
  if ("opponent" in req.body) update.opponent = normalizeName(req.body.opponent);
  if ("round" in req.body) update.round = req.body.round;
  if ("placement" in req.body) update.placement = req.body.placement;
  if ("pokemons" in req.body) update.pokemons = Array.isArray(req.body.pokemons) ? req.body.pokemons.slice(0,2) : [];
  if ("result" in req.body) update.result = req.body.result;

  await db.collection("physicalEvents").doc(id).set(update, { merge: true });
  const nd = { ...ds.data(), ...update };
  await recomputeAllForEvent(nd);

  res.json({ ok:true });
});

/** Delete event */
r.delete("/events/:id", authMiddleware, async (req, res) => {
  const id = req.params.id;
  const ds = await db.collection("physicalEvents").doc(id).get();
  if (!ds.exists) return res.status(404).json({ error:"not_found" });
  const d = ds.data();
  await db.collection("physicalEvents").doc(id).delete();
  await recomputeAllForEvent(d);
  res.json({ ok:true });
});

function computeRoundResult(round = {}) {
  const { g1 = {}, g2 = {}, g3 = {}, flags = {} } = round;
  if (flags.bye || flags.noShow) return "W";
  let v = 0, l = 0;
  for (const g of [g1, g2, g3]) {
    if (g.result === "V") v += 1;
    else if (g.result === "D") l += 1;
  }
  if (v > l) return "W";
  if (l > v) return "L";
  return "T";
}

async function recomputeRoundsAgg(eventId) {
  const col = db.collection("physicalEvents").doc(eventId).collection("rounds");
  const snap = await col.get();
  let counts = { W: 0, L: 0, T: 0 };
  const byOpp = new Map();
  const byDeck = new Map();
  snap.forEach(d => {
    const r = d.data() || {};
    const c = countsOfResult(r.result);
    counts = countsAdd(counts, c);
    const opp = normalizeName(r.opponentName || "");
    if (opp) {
      const cur = byOpp.get(opp) || { W: 0, L: 0, T: 0 };
      byOpp.set(opp, countsAdd(cur, c));
    }
    const deckKey = r.normOppDeckKey || normalizeDeckKey(r.opponentDeckName || "");
    if (deckKey) {
      const cur = byDeck.get(deckKey) || { W: 0, L: 0, T: 0 };
      byDeck.set(deckKey, countsAdd(cur, c));
    }
  });
  const wr = wrPercent(counts);
  const opponentsAgg = [];
  for (const [opponent, c] of byOpp.entries()) {
    opponentsAgg.push({ opponent, counts: c, wr: wrPercent(c) });
  }
  const decksAgg = [];
  for (const [deckKey, c] of byDeck.entries()) {
    decksAgg.push({ deckKey, counts: c, wr: wrPercent(c) });
  }
  await db.collection("physicalEvents").doc(eventId).set({
    stats: { counts, wr },
    opponentsAgg,
    decksAgg,
    roundsCount: snap.size,
  }, { merge: true });
}

r.post("/events/:eventId/rounds", authMiddleware, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "");
    if (!eventId) return res.status(400).json({ error: "invalid_event" });
    const body = req.body || {};
    if (!body.g1 || !body.g1.result || !body.g1.order) {
      return res.status(400).json({ error: "invalid_round" });
    }
    const roundId = nanoid();
    const roundDoc = {
      roundId,
      number: body.number || null,
      opponentName: normalizeName(body.opponentName || ""),
      opponentDeckName: normalizeName(body.opponentDeckName || ""),
      oppMonA: body.oppMonA || null,
      oppMonB: body.oppMonB || null,
      oppMonASlug: body.oppMonASlug || null,
      oppMonBSlug: body.oppMonBSlug || null,
      normOppDeckKey: body.normOppDeckKey || normalizeDeckKey(body.opponentDeckName || ""),
      g1: body.g1 || {},
      g2: body.g2 || {},
      g3: body.g3 || {},
      flags: body.flags || {},
    };
    roundDoc.result = computeRoundResult(roundDoc);
    await db.collection("physicalEvents").doc(eventId)
      .collection("rounds").doc(roundId).set(roundDoc);
    await recomputeRoundsAgg(eventId);
    return res.status(201).json({ roundId, ...roundDoc });
  } catch (e) {
    console.error("[POST /physical/events/:eventId/rounds]", e);
    return res.status(500).json({ error: "round_create_failed" });
  }
});

/** Summary for /tcg-physical */

/** List recent events for widgets */
r.get("/events", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 10), 200));
    const snap = await db
      .collection("physicalEvents")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    const out = snap.docs.map(d => {
      const ev = d.data();
      return {
        eventId: ev.eventId,
        dateISO: ev.date || ev.dateISO,
        result: ev.result || null,
        playerDeck: ev.deckName || null,
        opponentDeck: ev.opponentDeck || null,
        userPokemons: ev.pokemons || ev.userPokemons || null,
        opponentPokemons: ev.opponentPokemons || null
      };
    });
    res.json(out);
  } catch (e) {
    console.error("[GET /physical/events]", e);
    res.status(500).json({ error: "events_list_failed" });
  }
});
r.get("/summary", async (req, res) => {
  const limitDays = Number(req.query.limitDays || 5);

  // Total counts based on aggregated days
  const totalsSnap = await db
    .collection("physicalDays")
    .orderBy("date", "desc")
    .limit(limitDays)
    .get();
  let totals = { W: 0, L: 0, T: 0 };
  totalsSnap.forEach(d => {
    totals = countsAdd(totals, d.data().counts || {});
  });

  // Recent logs
  const recentSnap = await db
    .collection("physicalEvents")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();
  const recentLogs = recentSnap.docs.map(d => {
    const ev = d.data();
    return {
      eventId: ev.eventId,
      dateISO: ev.date,
      result: ev.result,
      playerDeck: ev.deckName,
      opponentDeck: ev.opponentDeck,
      userPokemons: ev.pokemons || ev.userPokemons || null,
      opponentPokemons: ev.opponentPokemons || null
    };
  });

  // Last N days
  const daysSnap = await db
    .collection("physicalDays")
    .orderBy("date", "desc")
    .limit(limitDays)
    .get();
  const lastDays = daysSnap.docs.map(d => d.data());

  // Top decks
  const decksSnap = await db
    .collection("physicalDecksAgg")
    .orderBy("wr", "desc")
    .limit(5)
    .get();
  const decks = decksSnap.docs.map(d => {
    const x = d.data();
    return {
      deckKey: x.deckKey,
      counts: x.counts,
      wr: x.wr,
      avatars: x.pokemons || []
    };
  });

  // Top opponents
  const oppSnap = await db
    .collection("physicalOpponentsAgg")
    .orderBy("total", "desc")
    .limit(5)
    .get();
  const topOpponents = oppSnap.docs.map(d => {
    const x = d.data();
    return {
      opponentName: x.opponentName,
      counts: x.counts,
      wr: x.wr,
      topDeck: x.topDeckKey ? { deckKey: x.topDeckKey } : null
    };
  });

  // Recent tournaments
  const tourSnap = await db
    .collection("physicalTournamentsAgg")
    .orderBy("dateISO", "desc")
    .limit(5)
    .get();
  const recentTournaments = tourSnap.docs.map(d => d.data());

  const summary = {
    counts: { ...totals, total: totals.W + totals.L + totals.T },
    wr: wrPercent(totals),
    topDeck: decks[0]
      ? { deckKey: decks[0].deckKey, wr: decks[0].wr, avatars: decks[0].avatars }
      : null
  };

  res.json({ summary, lastDays, topDecks: decks, topOpponents, recentTournaments, recentLogs });
});

/** Day details */
r.get("/days/:date", async (req, res) => {
  const date = req.params.date;
  const snap = await db
    .collection("physicalEvents")
    .where("date", "==", date)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  const events = snap.docs.map(d => {
  const ev = d.data();
  return {
    eventId: ev.eventId,
    createdAt: ev.createdAt || null,
    time: ev.time || null,
    result: ev.result ?? null,
    playerDeck: ev.deckName ?? ev.deck ?? null,
    opponentDeck: ev.opponentDeck ?? null,
    opponent: ev.opponent || ev.opponentName || ev.opp || null,
    tournamentId: ev.tournamentId ?? null,
    tournamentName: ev.tourneyName || ev.limitlessId || null,
    round: ev.round || null
  };
});
  let counts = {W:0,L:0,T:0}; for (const e of events) counts = countsAdd(counts, countsOfResult(e.result));
  const wr = wrPercent(counts);
  res.json({ date, summary:{ counts, wr }, events });
});

/** Decks Live aggregated */
r.get("/decks", async (req, res) => {
  const deck = (req.query.deck || "").toString().trim();
  if (deck) {
    const dk = deck.toLowerCase();
    const doc = await db.collection("physicalDecksAgg").doc(dk).get();
    if (!doc.exists) return res.json([]);
    const d = doc.data();
    return res.json([{ deck: d.deckKey, v: d.counts.W, d: d.counts.L, e: d.counts.T, pokemons: d.pokemons||[], wr: d.wr, total: (d.counts.W+d.counts.L+d.counts.T) }]);
  }
  const snap = await db
    .collection("physicalDecksAgg")
    .orderBy("wr", "desc")
    .limit(50)
    .get();
  const out = snap.docs
    .map(x => x.data())
    .map(d => ({
      deck: d.deckKey,
      v: d.counts.W,
      d: d.counts.L,
      e: d.counts.T,
      pokemons: d.pokemons || [],
      wr: d.wr,
      total: d.counts.W + d.counts.L + d.counts.T
    }));
  res.json(out);
});

/** Tournaments list */
r.get("/tournaments", async (req, res) => {
  const q = (req.query.query || "").toString().toLowerCase();
  const snap = await db
    .collection("physicalTournamentsAgg")
    .orderBy("dateISO", "desc")
    .limit(50)
    .get();
  let arr = snap.docs.map(d => d.data());
  if (q) arr = arr.filter(t => (t.name||"").toLowerCase().includes(q) || (t.tournamentId||"").toLowerCase().includes(q));
  // Sort by date desc
  arr.sort((a,b)=> String(b.dateISO).localeCompare(String(a.dateISO)));
  res.json(arr);
});

/** Tournaments suggest (autocomplete) */
r.get("/tournaments/suggest", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().toLowerCase();
    const snap = await db
      .collection("physicalTournamentsAgg")
      .orderBy("dateISO", "desc")
      .limit(50)
      .get();
    let arr = snap.docs.map(d => d.data());
    if (q) {
      arr = arr.filter(t =>
        String(t.name||"").toLowerCase().includes(q) ||
        String(t.tournamentId||"").toLowerCase().includes(q) ||
        String(t.limitlessId||"").toLowerCase().includes(q)
      );
    }
    arr.sort((a,b)=> String(b.dateISO).localeCompare(String(a.dateISO)));
    res.json(arr.slice(0,10).map(t => ({
      id: t.tournamentId || t.id,
      name: t.name,
      dateISO: t.dateISO || null,
      limitlessId: t.limitlessId || null,
      roundsCount: t.roundsCount || 0
    })));
  } catch(e){
    console.error("[/tournaments/suggest]", e);
    res.status(500).json({ error: "suggest_failed" });
  }
});


/** Tournament detail */
r.get("/tournaments/:id", async (req, res) => {
  const id = req.params.id;
  const baseDoc = await db.collection("physicalTournamentsAgg").doc(id).get();
  const tournament = baseDoc.exists ? baseDoc.data() : { tournamentId: id };
  const snap = await db.collection("physicalEvents").where("tournamentId","==", id).orderBy("round").limit(200).get();
  const rounds = snap.docs.map(d => {
    const ev = d.data();
    return {
      id: ev.eventId, opponent: ev.opponent, opponentDeck: ev.opponentDeck,
      result: ev.result, round: ev.round, logId: ev.eventId
    };
  });
  res.json({ tournament, rounds });
});


/** Opponents aggregate (full list) */
r.get("/opponents-agg", async (req, res) => {
  try {
    const snap = await db
      .collection("physicalOpponentsAgg")
      .limit(500)
      .get();
    const out = [];
    for (const doc of snap.docs){
      const d = doc.data() || {};
      let topDeck = null;
      if (d.topDeckKey){
        const deckDoc = await db.collection("decks").doc(safeDocId(d.topDeckKey)).get();
        if (deckDoc.exists){
          const info = deckDoc.data() || {};
          topDeck = {
            deckKey: d.topDeckKey,
            deckName: info.name || null,
            pokemons: info.spriteIds || info.pokemons || null
          };
        } else {
          topDeck = { deckKey: d.topDeckKey };
        }
      }
      out.push({ opponentName: d.opponentName || doc.id, counts: d.counts, wr: d.wr, topDeck });
    }
    res.json(out.sort((a,b)=> (a.opponentName||'').localeCompare(b.opponentName||'')));
  } catch (e){
    console.error("[GET /physical/opponents-agg]", e);
    res.status(500).json({ error: "opponents_agg_failed" });
  }
});


/** Logs for a given deck (playerDeckKey) */
r.get("/decks/:deck/logs", async (req, res) => {
  try{
    const dk = String(req.params.deck || "").toLowerCase();
    if (!dk) return res.json([]);
    const snap = await db.collection("physicalEvents")
      .where("playerDeckKey","==", dk)
      .orderBy("createdAt","desc")
      .limit(200)
      .get();
    const logs = snap.docs.map(doc => {
      const ev = doc.data() || {};
      return {
        id: ev.eventId || ev.id || null,
        date: ev.date || ev.createdAt || null,
        createdAt: ev.createdAt || null,
        opponent: ev.opponent || ev.opponentName || null,
        opponentDeck: ev.opponentDeck || ev.opponentDeckName || null,
        result: ev.result || ev.outcome || null,
        round: ev.round || null,
        deckName: ev.deckName || ev.playerDeckName || null,
        eventName: ev.tourneyName || ev.tournamentName || ev.event || null,
        isOnlineTourney: !!ev.isOnlineTourney
      };
    });
    res.json(logs);
  }catch(e){
    console.error("[GET /physical/decks/:deck/logs]", e);
    res.status(500).json({ error: "deck_logs_failed" });
  }
});

export default r;

r.get("/logs", async (req, res) => {
  try {
    const q = req.query || {};
    const limit = Math.max(1, Math.min(Number(q.limit || 10000), 10000));
    const offset = Math.max(0, Number(q.offset || 0));
    const nameRaw = String(q.opponent || q.opponentName || q.name || q.q || "").trim();
    const name = normalizeName(nameRaw);

    let ref = db.collection("physicalEvents");
    if (name) ref = ref.where("opponent", "==", name);
    ref = ref.orderBy("createdAt", "desc").limit(limit + offset);

    const snap = await ref.get();
    const docs = snap.docs.map(d => d.data());
    const sliced = offset ? docs.slice(offset) : docs;

    const rows = sliced.slice(0, limit).map(ev => ({
      id: ev.eventId || ev.id || null,
      createdAt: ev.createdAt || ev.date || null,
      date: ev.date || ev.createdAt || null,
      deck: ev.deckName || ev.playerDeckName || ev.myDeck || null,
      opponentDeck: ev.opponentDeck || ev.opponentDeckName || ev.deck_opponent || null,
      score: ev.score || ev.placar || null,
      result: ev.result || ev.outcome || null,
      event: ev.event || ev.tournament || ev.tourneyName || ev.tournamentName || ev.physicalEvent || null,
      opponent: ev.opponent || ev.opponentName || ev.name || null,
      you: ev.you || ev.player || ev.user || null
    }));

    return res.json({ ok: true, total: docs.length, rows });
  } catch (e) {
    console.error("[GET /physical/logs]", e);
    return res.status(500).json({ ok:false, error:"logs_list_failed" });
  }
});

r.get("/decks/:id", async (req, res) => {
  try {
    const raw = String(req.params.id || "");
    const key = decodeURIComponent(raw);
    const snap = await db.collection("decks").doc(safeDocId(key)).get();
    if (!snap.exists) return res.status(404).json({ ok:false, error:"not_found" });
    const d = snap.data() || {};
    return res.json({ ok:true, key: d.key || key, name: d.name || null, spriteIds: d.spriteIds || d.pokemons || [] });
  } catch (e) {
    console.error("[GET /api/decks/:id]", e);
    return res.status(404).json({ ok:false });
  }
});