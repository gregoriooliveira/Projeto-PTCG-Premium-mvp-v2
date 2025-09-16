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

function normalizeCounts(source){
  if (!source || typeof source !== "object") return null;
  const out = { W: 0, L: 0, T: 0 };
  let hasValue = false;
  for (const key of ["W","L","T"]) {
    if (source[key] == null) continue;
    const n = Number(source[key]);
    if (Number.isFinite(n)) {
      out[key] = n;
      hasValue = true;
    }
  }
  return hasValue ? out : null;
}

function countsFromResultsList(list){
  if (!Array.isArray(list)) return null;
  const acc = { W: 0, L: 0, T: 0 };
  let hasValue = false;
  for (const item of list) {
    if (typeof item !== "string") continue;
    const token = item.trim().toUpperCase();
    if (!token) continue;
    if (token === "W") { acc.W += 1; hasValue = true; }
    else if (token === "L") { acc.L += 1; hasValue = true; }
    else if (token === "T") { acc.T += 1; hasValue = true; }
  }
  return hasValue ? acc : null;
}

function eventCounts(ev = {}){
  return (
    normalizeCounts(ev.counts) ||
    normalizeCounts(ev.stats?.counts) ||
    normalizeCounts(ev.stats) ||
    countsFromResultsList(ev.results) ||
    countsOfResult(ev.result)
  );
}

function normalizeNullableString(value) {
  if (value == null) return null;
  const normalized = normalizeName(value);
  return normalized ? normalized : null;
}

function normalizePatchDate(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateKeyFromTs(value.getTime());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return dateKeyFromTs(value);
  }
  const str = String(value).trim();
  if (!str) return null;
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(str)) return str;
  const br = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(str);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m}-${d}`;
  }
  const ts = Date.parse(str);
  if (!Number.isNaN(ts)) {
    return dateKeyFromTs(ts);
  }
  return undefined;
}

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
  let date;
  if (body.dia) {
    const diaStr = String(body.dia);
    const br = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(diaStr);
    if (br) {
      const [, d, m, y] = br;
      date = `${y}-${m}-${d}`;
    } else if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(diaStr)) {
      date = diaStr;
    } else {
      const ts = Date.parse(diaStr);
      date = Number.isNaN(ts) ? dateKeyFromTs(createdAt) : dateKeyFromTs(ts);
    }
  } else {
    date = dateKeyFromTs(createdAt);
  }
  const name = body.nome ? String(body.nome) : null;
  const type = body.tipo ? String(body.tipo) : null;
  const storeOrCity = body.local ? String(body.local) : null;
  const format = body.formato ? String(body.formato) : null;
  const classification = body.classificacao ? String(body.classificacao) : null;
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
    result, round, placement, rawLog, lang, pokemons,
    name, type, storeOrCity, format, classification
  };
  await db.collection("physicalEvents").doc(eventId).set(doc, { merge: true });
  await recomputeAllForEvent(null, doc);
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
  const docRef = db.collection("physicalEvents").doc(id);
  const ds = await docRef.get();
  if (!ds.exists) return res.status(404).json({ error:"not_found" });
  const current = ds.data() || {};
  if (!current.eventId) current.eventId = id;

  const update = {};
  if ("deckName" in req.body) { update.deckName = normalizeName(req.body.deckName); update.playerDeckKey = normalizeDeckKey(update.deckName); }
  if ("opponentDeck" in req.body) { update.opponentDeck = normalizeName(req.body.opponentDeck); update.opponentDeckKey = normalizeDeckKey(update.opponentDeck); }
  if ("you" in req.body) update.you = normalizeName(req.body.you);
  if ("opponent" in req.body) update.opponent = normalizeName(req.body.opponent);
  if ("round" in req.body) update.round = req.body.round;
  if ("placement" in req.body) update.placement = req.body.placement;
  if ("pokemons" in req.body) update.pokemons = Array.isArray(req.body.pokemons) ? req.body.pokemons.slice(0,2) : [];
  if ("result" in req.body) update.result = req.body.result;
  if ("name" in req.body) update.name = normalizeNullableString(req.body.name);
  if ("storeOrCity" in req.body) update.storeOrCity = normalizeNullableString(req.body.storeOrCity);
  if ("type" in req.body) update.type = normalizeNullableString(req.body.type);
  if ("format" in req.body) update.format = normalizeNullableString(req.body.format);
  if ("classification" in req.body) update.classification = normalizeNullableString(req.body.classification);
  if ("date" in req.body) {
    const normalizedDate = normalizePatchDate(req.body.date);
    if (normalizedDate !== undefined) update.date = normalizedDate;
  }

  await docRef.set(update, { merge: true });
  const updatedDoc = { ...current, ...update };
  if (!updatedDoc.eventId) updatedDoc.eventId = id;
  await recomputeAllForEvent(current, updatedDoc);

  res.json(updatedDoc);
});

/** Delete event */
r.delete("/events/:id", authMiddleware, async (req, res) => {
  const id = req.params.id;
  const docRef = db.collection("physicalEvents").doc(id);
  const ds = await docRef.get();
  if (!ds.exists) return res.status(404).json({ error:"not_found" });
  const d = ds.data();
  if (!d.eventId) d.eventId = id;
  const roundDeletionPromises = [];
  if (typeof docRef.collection === "function") {
    const roundsCol = docRef.collection("rounds");
    try {
      const roundsSnap = await roundsCol.get();
      const roundDocs = [];
      if (roundsSnap && typeof roundsSnap.forEach === "function") {
        roundsSnap.forEach((roundDoc) => roundDocs.push(roundDoc));
      } else if (roundsSnap && Array.isArray(roundsSnap.docs)) {
        roundDocs.push(...roundsSnap.docs);
      }
      for (const roundDoc of roundDocs) {
        if (roundDoc?.ref && typeof roundDoc.ref.delete === "function") {
          roundDeletionPromises.push(roundDoc.ref.delete());
        } else if (
          roundDoc?.id != null &&
          typeof roundsCol.doc === "function"
        ) {
          roundDeletionPromises.push(roundsCol.doc(roundDoc.id).delete());
        }
      }
    } catch (error) {
      console.error(`[physical/events:${id}] rounds cleanup failed`, error);
    }
  }
  if (roundDeletionPromises.length) {
    await Promise.all(roundDeletionPromises);
  }
  if (d.rawLogId) {
    try {
      await db.collection("rawLogs").doc(d.rawLogId).delete();
    } catch (error) {
      console.error(`[physical/events:${id}] rawLog cleanup failed`, error);
    }
  }
  await docRef.delete();
  await recomputeAllForEvent(d, null);
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

function extractOpponentName(value) {
  return normalizeName(typeof value === "string" ? value : "");
}

function extractPokemonSlugs(round = {}) {
  const out = [];
  const push = (value) => {
    if (!value) return;
    let slug = null;
    if (typeof value === "string") {
      slug = value;
    } else if (value && typeof value === "object") {
      if (typeof value.slug === "string") slug = value.slug;
      else if (typeof value.name === "string") slug = value.name;
      else if (typeof value.id === "string") slug = value.id;
    }
    if (!slug) return;
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) return;
    if (!out.includes(trimmed)) out.push(trimmed);
  };
  push(round.oppMonASlug);
  push(round.oppMonA);
  push(round.oppMonBSlug);
  push(round.oppMonB);
  return out.slice(0, 2);
}

function deckIdentifier({ deckKey = "", deckName = "", pokemons = [] }) {
  if (deckKey) return `key:${deckKey}`;
  const trimmedName = typeof deckName === "string" ? deckName.trim().toLowerCase() : "";
  if (trimmedName) return `name:${trimmedName}`;
  if (Array.isArray(pokemons) && pokemons.length) {
    return `pkm:${pokemons.join("+")}`;
  }
  return "unknown";
}

function mergePokemonHints(target = [], source = []) {
  if (!Array.isArray(target)) target = [];
  const set = new Set(target.map((s) => (typeof s === "string" ? s : "")));
  for (const raw of Array.isArray(source) ? source : []) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;
    set.add(trimmed);
    if (set.size >= 2) break;
  }
  return Array.from(set).slice(0, 2);
}

async function recomputeRoundsAgg(eventId) {
  const eventRef = db.collection("physicalEvents").doc(eventId);
  let prevData = {};
  try {
    const prevSnap = await eventRef.get();
    if (prevSnap.exists) {
      prevData = { ...prevSnap.data() };
    }
  } catch {}

  const col = eventRef.collection("rounds");
  const snap = await col.get();
  let counts = { W: 0, L: 0, T: 0 };
  const perOpponent = new Map();
  const perDeck = new Map();

  snap.forEach((d) => {
    const r = d.data() || {};
    const c = countsOfResult(r.result);
    counts = countsAdd(counts, c);

    const opponentName = extractOpponentName(r.opponentName || r.opponent);
    if (opponentName) {
      let oppEntry = perOpponent.get(opponentName);
      if (!oppEntry) {
        oppEntry = {
          counts: { W: 0, L: 0, T: 0 },
          decks: new Map(),
        };
        perOpponent.set(opponentName, oppEntry);
      }
      oppEntry.counts = countsAdd(oppEntry.counts, c);

      const deckKey = r.normOppDeckKey || normalizeDeckKey(r.opponentDeckName || "");
      const deckName = typeof r.opponentDeckName === "string" ? r.opponentDeckName.trim() : "";
      const pokemons = extractPokemonSlugs(r);
      const deckInfo = { deckKey: deckKey || "", deckName, pokemons };
      const deckId = deckIdentifier(deckInfo);
      let deckEntry = oppEntry.decks.get(deckId);
      if (!deckEntry) {
        deckEntry = {
          deckKey: deckKey || "",
          deckName: deckName || "",
          pokemons: Array.isArray(pokemons) ? [...pokemons] : [],
          counts: { W: 0, L: 0, T: 0 },
          total: 0,
        };
        oppEntry.decks.set(deckId, deckEntry);
      }
      deckEntry.counts = countsAdd(deckEntry.counts, c);
      deckEntry.total += (c.W || 0) + (c.L || 0) + (c.T || 0);
      if (deckKey && !deckEntry.deckKey) deckEntry.deckKey = deckKey;
      if (deckName && !deckEntry.deckName) deckEntry.deckName = deckName;
      deckEntry.pokemons = mergePokemonHints(deckEntry.pokemons, pokemons);
    }

    const deckKey = r.normOppDeckKey || normalizeDeckKey(r.opponentDeckName || "");
    if (deckKey) {
      const cur = perDeck.get(deckKey) || { W: 0, L: 0, T: 0 };
      perDeck.set(deckKey, countsAdd(cur, c));
    }
  });

  const wr = wrPercent(counts);

  const opponentsAgg = [];
  const opponentsList = [];
  for (const [opponentName, data] of perOpponent.entries()) {
    const entryCounts = {
      W: data.counts.W || 0,
      L: data.counts.L || 0,
      T: data.counts.T || 0,
    };
    const total = entryCounts.W + entryCounts.L + entryCounts.T;
    const decks = [];
    let topDeck = null;
    for (const deckEntry of data.decks.values()) {
      const deckCounts = {
        W: deckEntry.counts.W || 0,
        L: deckEntry.counts.L || 0,
        T: deckEntry.counts.T || 0,
      };
      const deckTotal = deckEntry.total || (deckCounts.W + deckCounts.L + deckCounts.T);
      const payload = {
        deckKey: deckEntry.deckKey || "",
        deckName: deckEntry.deckName || "",
        counts: deckCounts,
        total: deckTotal,
        pokemons: Array.isArray(deckEntry.pokemons) ? [...deckEntry.pokemons] : [],
      };
      decks.push(payload);
      if (!topDeck) {
        topDeck = payload;
      } else {
        const currentTotal = topDeck.total || 0;
        if (deckTotal > currentTotal) {
          topDeck = payload;
        } else if (deckTotal === currentTotal) {
          const hasKey = !!payload.deckKey;
          const topHasKey = !!topDeck.deckKey;
          if (hasKey && !topHasKey) topDeck = payload;
        }
      }
    }

    opponentsAgg.push({
      opponentName,
      counts: entryCounts,
      wr: wrPercent(entryCounts),
      total,
      decks,
      topDeckKey: topDeck?.deckKey || null,
      topDeckName: topDeck?.deckName || null,
      topPokemons: Array.isArray(topDeck?.pokemons) ? [...topDeck.pokemons] : [],
    });
    opponentsList.push(opponentName);
  }

  const decksAgg = [];
  for (const [deckKey, c] of perDeck.entries()) {
    decksAgg.push({ deckKey, counts: c, wr: wrPercent(c) });
  }

  const countsCopy = { W: counts.W || 0, L: counts.L || 0, T: counts.T || 0 };
  const nextData = {
    ...(prevData || {}),
    stats: { counts: countsCopy, wr },
    opponentsAgg,
    opponentsList,
    decksAgg,
    roundsCount: snap.size,
  };

  await eventRef.set({
    stats: { counts: countsCopy, wr },
    opponentsAgg,
    opponentsList,
    decksAgg,
    roundsCount: snap.size,
  }, { merge: true });

  const prevEvent = prevData ? { eventId, ...prevData } : { eventId };
  const nextEvent = { eventId, ...nextData };
  return { prevEvent, nextEvent };
}

r.get("/events/:eventId/rounds", async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "");
    if (!eventId) return res.status(400).json({ error: "invalid_event" });
    const snap = await db
      .collection("physicalEvents")
      .doc(eventId)
      .collection("rounds")
      .orderBy("number")
      .get();
    const rounds = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json(rounds);
  } catch (e) {
    console.error("[GET /physical/events/:eventId/rounds]", e);
    return res.status(500).json({ error: "rounds_list_failed" });
  }
});

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
    const agg = await recomputeRoundsAgg(eventId);
    await recomputeAllForEvent(agg?.prevEvent, agg?.nextEvent);
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
        opponentPokemons: ev.opponentPokemons || null,
        counts: eventCounts(ev),
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
      opponentPokemons: ev.opponentPokemons || null,
      counts: eventCounts(ev),
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