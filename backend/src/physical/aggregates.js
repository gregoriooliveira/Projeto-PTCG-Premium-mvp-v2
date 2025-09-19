import { db } from "../firestore.js";
import { normalizeName } from "../utils/normalize.js";
import { countsAdd, countsOfResult, wrPercent } from "../utils/wr.js";

function normalizeCounts(source) {
  if (!source || typeof source !== "object") return null;
  const out = { W: 0, L: 0, T: 0 };
  let hasValue = false;
  for (const key of ["W", "L", "T"]) {
    if (source[key] == null) continue;
    const value = Number(source[key]);
    if (!Number.isFinite(value)) continue;
    out[key] = value;
    hasValue = true;
  }
  return hasValue ? out : null;
}

function countsFromResultsList(list) {
  if (!Array.isArray(list)) return null;
  const acc = { W: 0, L: 0, T: 0 };
  let hasValue = false;
  for (const item of list) {
    if (typeof item !== "string") continue;
    const token = item.trim().toUpperCase();
    if (!token) continue;
    if (token === "W") {
      acc.W += 1;
      hasValue = true;
    } else if (token === "L") {
      acc.L += 1;
      hasValue = true;
    } else if (token === "T") {
      acc.T += 1;
      hasValue = true;
    }
  }
  return hasValue ? acc : null;
}

function eventCounts(ev = {}) {
  return (
    normalizeCounts(ev.stats?.counts) ||
    normalizeCounts(ev.counts) ||
    normalizeCounts(ev.stats) ||
    countsFromResultsList(ev.results) ||
    countsOfResult(ev.result)
  );
}

function valueToMillis(value) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") {
      try {
        const result = value.toMillis();
        if (Number.isFinite(result)) return result;
      } catch {}
    }
    if (typeof value.getTime === "function") {
      const result = value.getTime();
      if (Number.isFinite(result)) return result;
    }
    if (typeof value.seconds === "number") {
      const seconds = Number(value.seconds);
      const nanos = Number(value.nanoseconds || value.nanosecond || value._nanoseconds || 0);
      if (Number.isFinite(seconds) && Number.isFinite(nanos)) {
        return seconds * 1000 + nanos / 1e6;
      }
      if (Number.isFinite(seconds)) return seconds * 1000;
    }
  }
  return 0;
}

function tournamentCandidateScore(ev = {}) {
  const rounds = Number(ev.roundsCount);
  const normalizedRounds = Number.isFinite(rounds) ? rounds : -1;
  const timestamp = Math.max(
    valueToMillis(ev.updatedAt),
    valueToMillis(ev.createdAt),
    valueToMillis(ev.dateISO),
    valueToMillis(ev.date),
    valueToMillis(ev.time)
  );
  return { rounds: normalizedRounds, timestamp };
}

function pickTournamentReference(current, candidate) {
  if (!candidate || typeof candidate !== "object") return current;
  if (!current || typeof current !== "object") return candidate;
  const curScore = tournamentCandidateScore(current);
  const nextScore = tournamentCandidateScore(candidate);
  if (nextScore.rounds > curScore.rounds) return candidate;
  if (nextScore.rounds < curScore.rounds) return current;
  if (nextScore.timestamp > curScore.timestamp) return candidate;
  return current;
}

function extractTournamentMeta(ev = {}) {
  const name =
    (typeof ev.tourneyName === "string" && ev.tourneyName) ||
    (typeof ev.tournamentName === "string" && ev.tournamentName) ||
    (typeof ev.name === "string" && ev.name) ||
    null;
  const dateISO =
    (typeof ev.dateISO === "string" && ev.dateISO) ||
    (typeof ev.date === "string" && ev.date) ||
    null;
  const format = typeof ev.format === "string" && ev.format ? ev.format : null;
  const deckKey =
    (typeof ev.playerDeckKey === "string" && ev.playerDeckKey) ||
    (typeof ev.deckKey === "string" && ev.deckKey) ||
    null;
  const deckName =
    (typeof ev.deckName === "string" && ev.deckName) ||
    (typeof ev.playerDeckName === "string" && ev.playerDeckName) ||
    (typeof ev.playerDeck === "string" && ev.playerDeck) ||
    (typeof ev.deck === "string" && ev.deck) ||
    null;
  const rounds = Number(ev.roundsCount);
  const roundsCount = Number.isFinite(rounds) ? rounds : null;
  return { name, dateISO, format, deck: deckKey, deckName, roundsCount };
}

/** Garante ID seguro para usar em doc() */
function safeDocId(s) {
  return encodeURIComponent(String(s ?? ""));
}

/** Recalcula o agregado por dia */
export async function recomputeDay(date) {
  if (!date) return;
  const snap = await db.collection("physicalEvents").where("date", "==", date).get();
  if (snap.empty) {
    // Remove o agregado se não houver mais partidas no dia
    try { await db.collection("physicalDays").doc(date).delete(); } catch {}
    return;
  }
  let counts = { W: 0, L: 0, T: 0 };
  snap.forEach((d) => {
    const evCounts = eventCounts(d.data()) || { W: 0, L: 0, T: 0 };
    counts = countsAdd(counts, evCounts);
  });
  const wr = wrPercent(counts);
  await db.collection("physicalDays").doc(date).set({ date, counts, wr }, { merge: true });
}

/** Recalcula o agregado por deck */
export async function recomputeDeck(deckKey) {
  if (!deckKey) return;
  const snap = await db.collection("physicalEvents").where("playerDeckKey", "==", deckKey).get();
  const docId = safeDocId(deckKey);
  if (snap.empty) {
    try { await db.collection("physicalDecksAgg").doc(docId).delete(); } catch {}
    return;
  }
  let counts = { W: 0, L: 0, T: 0 };
  let games = 0;
  const pokemons = [];
  snap.forEach(d => {
    const ev = d.data();
    const evCounts = eventCounts(ev) || { W: 0, L: 0, T: 0 };
    counts = countsAdd(counts, evCounts);
    games += 1;
    if (pokemons.length < 2 && Array.isArray(ev.pokemons)) {
      for (const raw of ev.pokemons) {
        if (pokemons.length >= 2) break;
        let slug = null;
        if (typeof raw === "string") {
          slug = raw;
        } else if (raw && typeof raw === "object") {
          if (typeof raw.slug === "string") slug = raw.slug;
          else if (typeof raw.name === "string") slug = raw.name;
          else if (typeof raw.id === "string") slug = raw.id;
        }
        if (typeof slug === "string") {
          const trimmed = slug.trim();
          if (trimmed && !pokemons.includes(trimmed)) pokemons.push(trimmed);
        }
      }
    }
  });
  const wr = wrPercent(counts);
  await db.collection("physicalDecksAgg").doc(docId).set(
    { deckKey, games, counts, wr, pokemons },
    { merge: true }
  );
}

/** Recalcula todos os decks existentes em physicalDecksAgg */
export async function recomputeAllDeckAggregates() {
  const deckKeys = new Set();
  try {
    const snap = await db.collection("physicalDecksAgg").get();
    snap.forEach(doc => {
      const data = doc.data() || {};
      let key = data.deckKey;
      if (!key) {
        try {
          key = decodeURIComponent(doc.id);
        } catch (err) {
          console.error("[recomputeAllDeckAggregates] failed to decode doc id", doc.id, err);
        }
      }
      if (key) deckKeys.add(key);
    });
  } catch (err) {
    console.error("[recomputeAllDeckAggregates] failed to list deck keys", err);
    return [];
  }

  const processed = [];
  for (const key of deckKeys) {
    try {
      await recomputeDeck(key);
      processed.push(key);
    } catch (err) {
      console.error(`[recomputeAllDeckAggregates] failed to recompute ${key}`, err);
    }
  }
  return processed;
}

/** Recalcula o agregado por oponente */
function normalizeOpponentName(value) {
  return normalizeName(typeof value === "string" ? value : "");
}

function mergePokemonHints(target = [], source = []) {
  const list = Array.isArray(target) ? [...target] : [];
  const set = new Set(list.map((v) => (typeof v === "string" ? v : "")));
  for (const raw of Array.isArray(source) ? source : []) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;
    if (!set.has(trimmed)) {
      set.add(trimmed);
      list.push(trimmed);
    }
    if (list.length >= 2) break;
  }
  return list.slice(0, 2);
}

export async function recomputeOpponent(opponentName) {
  const normalized = normalizeOpponentName(opponentName);
  if (!normalized) return;
  const docId = safeDocId(normalized);
  const snap = await db
    .collection("physicalEvents")
    .where("opponentsList", "array-contains", normalized)
    .get();

  if (snap.empty) {
    try { await db.collection("physicalOpponentsAgg").doc(docId).delete(); } catch {}
    return;
  }

  let counts = { W: 0, L: 0, T: 0 };
  const deckMap = new Map();
  let fallbackDeckName = "";
  let fallbackPokemons = [];

  snap.forEach((doc) => {
    const ev = doc.data() || {};
    const entries = Array.isArray(ev.opponentsAgg) ? ev.opponentsAgg : [];
    const entry = entries.find((item) => normalizeOpponentName(item?.opponentName || item?.opponent) === normalized);
    if (!entry) return;

    const entryCounts = entry?.counts && typeof entry.counts === "object"
      ? { W: Number(entry.counts.W) || 0, L: Number(entry.counts.L) || 0, T: Number(entry.counts.T) || 0 }
      : { W: 0, L: 0, T: 0 };
    counts = countsAdd(counts, entryCounts);

    const decks = Array.isArray(entry.decks) ? entry.decks : [];
    const mergeDeck = (deckData = {}, deckCounts = { W: 0, L: 0, T: 0 }, deckTotal = 0) => {
      const key = typeof deckData.deckKey === "string" && deckData.deckKey
        ? `key:${deckData.deckKey}`
        : (typeof deckData.deckName === "string" && deckData.deckName.trim())
          ? `name:${deckData.deckName.trim().toLowerCase()}`
          : Array.isArray(deckData.pokemons) && deckData.pokemons.length
            ? `pkm:${deckData.pokemons.join("+")}`
            : "unknown";

      const current = deckMap.get(key) || {
        deckKey: typeof deckData.deckKey === "string" ? deckData.deckKey : "",
        deckName: typeof deckData.deckName === "string" ? deckData.deckName : "",
        pokemons: [],
        counts: { W: 0, L: 0, T: 0 },
        total: 0,
      };

      current.counts = countsAdd(current.counts, deckCounts);
      current.total += deckTotal;
      if (deckData.deckKey && !current.deckKey) current.deckKey = deckData.deckKey;
      if (deckData.deckName && !current.deckName) current.deckName = deckData.deckName;
      current.pokemons = mergePokemonHints(current.pokemons, deckData.pokemons || []);

      deckMap.set(key, current);
    };

    if (decks.length) {
      decks.forEach((deck) => {
        const deckCounts = deck?.counts && typeof deck.counts === "object"
          ? { W: Number(deck.counts.W) || 0, L: Number(deck.counts.L) || 0, T: Number(deck.counts.T) || 0 }
          : { W: 0, L: 0, T: 0 };
        const deckTotal = typeof deck?.total === "number"
          ? deck.total
          : deckCounts.W + deckCounts.L + deckCounts.T;
        mergeDeck(
          {
            deckKey: typeof deck?.deckKey === "string" ? deck.deckKey : "",
            deckName: typeof deck?.deckName === "string" ? deck.deckName : "",
            pokemons: Array.isArray(deck?.pokemons) ? deck.pokemons : [],
          },
          deckCounts,
          deckTotal
        );
      });
    } else {
      mergeDeck(
        {
          deckKey: typeof entry?.topDeckKey === "string" ? entry.topDeckKey : "",
          deckName: typeof entry?.topDeckName === "string" ? entry.topDeckName : "",
          pokemons: Array.isArray(entry?.topPokemons) ? entry.topPokemons : [],
        },
        entryCounts,
        entryCounts.W + entryCounts.L + entryCounts.T
      );
    }

    if (typeof entry?.topDeckName === "string" && !fallbackDeckName) {
      fallbackDeckName = entry.topDeckName;
    }
    if (Array.isArray(entry?.topPokemons) && fallbackPokemons.length === 0) {
      fallbackPokemons = entry.topPokemons.slice(0, 2);
    }
  });

  const totalCounts = {
    W: counts.W || 0,
    L: counts.L || 0,
    T: counts.T || 0,
  };
  const total = totalCounts.W + totalCounts.L + totalCounts.T;
  if (!total) {
    try { await db.collection("physicalOpponentsAgg").doc(docId).delete(); } catch {}
    return;
  }
  const wr = wrPercent(totalCounts);

  let topDeck = null;
  for (const deck of deckMap.values()) {
    const deckTotal = typeof deck.total === "number"
      ? deck.total
      : (deck.counts.W || 0) + (deck.counts.L || 0) + (deck.counts.T || 0);
    if (!topDeck) {
      topDeck = deck;
      continue;
    }
    const currentTotal = typeof topDeck.total === "number"
      ? topDeck.total
      : (topDeck.counts.W || 0) + (topDeck.counts.L || 0) + (topDeck.counts.T || 0);
    if (deckTotal > currentTotal) {
      topDeck = deck;
    } else if (deckTotal === currentTotal) {
      const candidateHasKey = !!deck.deckKey;
      const currentHasKey = !!topDeck.deckKey;
      if (candidateHasKey && !currentHasKey) topDeck = deck;
    }
  }

  const topDeckKey = topDeck?.deckKey || "";
  const topDeckName = topDeck?.deckName || fallbackDeckName || "";
  const topPokemons = mergePokemonHints(topDeck?.pokemons || [], fallbackPokemons);

  await db.collection("physicalOpponentsAgg").doc(docId).set(
    {
      opponent: normalized,
      opponentName: normalized,
      counts: totalCounts,
      total,
      wr,
      games: total,
      topDeckKey: topDeckKey || null,
      topDeckName: topDeckName || null,
      topPokemons,
    },
    { merge: true }
  );
}

function extractOpponentNames(ev) {
  const names = new Set();
  if (!ev || typeof ev !== "object") return [];

  const direct = normalizeOpponentName(ev.opponent);
  if (direct) names.add(direct);

  const list = Array.isArray(ev.opponentsList) ? ev.opponentsList : [];
  for (const raw of list) {
    const norm = normalizeOpponentName(raw);
    if (norm) names.add(norm);
  }

  const agg = Array.isArray(ev.opponentsAgg) ? ev.opponentsAgg : [];
  for (const item of agg) {
    const norm = normalizeOpponentName(item?.opponentName || item?.opponent);
    if (norm) names.add(norm);
  }

  return Array.from(names);
}

/** Recalcula agregados de torneio */
export async function recomputeTournament(tournamentId) {
  if (!tournamentId) return;
  const snap = await db.collection("physicalEvents").where("tournamentId", "==", tournamentId).get();
  if (snap.empty) {
    try { await db.collection("physicalTournamentsAgg").doc(tournamentId).delete(); } catch {}
    try { await db.collection("tournaments").doc(tournamentId).delete(); } catch {}
    return;
  }

  // Conta por deck dentro do torneio
  const perDeck = new Map();
  const add = (key, inc) => {
    const cur = perDeck.get(key) || { W:0, L:0, T:0, games:0 };
    cur.W += inc.W || 0; cur.L += inc.L || 0; cur.T += inc.T || 0;
    cur.games += 1;
    perDeck.set(key, cur);
  };

  let totalCounts = { W: 0, L: 0, T: 0 };
  let referenceEvent = null;
  snap.forEach(d => {
    const ev = d.data();
    const deckKey = ev.playerDeckKey || ev.deckKey || "";
    const counts = eventCounts(ev) || { W: 0, L: 0, T: 0 };
    add(deckKey, counts);
    totalCounts = countsAdd(totalCounts, counts);
    referenceEvent = pickTournamentReference(referenceEvent, ev);
  });

  const decks = [];
  for (const [deckKey, c] of perDeck) {
    decks.push({ deckKey, counts: {W:c.W, L:c.L, T:c.T}, games: c.games, wr: wrPercent(c) });
  }

  const meta = extractTournamentMeta(referenceEvent || {});
  const wr = wrPercent(totalCounts);

  await db.collection("physicalTournamentsAgg").doc(tournamentId).set(
    {
      tournamentId,
      name: meta.name,
      dateISO: meta.dateISO,
      format: meta.format,
      deck: meta.deck,
      deckName: meta.deckName,
      roundsCount: meta.roundsCount,
      counts: totalCounts,
      wr,
      decks,
    },
    { merge: true }
  );

  // Doc espelho mínimo (caso usem em outra tela)
  // Mantemos o doc, mas ele é removido no caso "empty" acima.
  await db.collection("tournaments").doc(tournamentId).set(
    { tournamentId, source: "physical" },
    { merge: true }
  );
}

/** Recalcula todos os agregados afetados por um evento (para limpar/atualizar widgets). */
export async function recomputeAllForEvent(prevEv, nextEv) {
  const prev = arguments.length > 1 ? (prevEv || null) : null;
  const next = arguments.length > 1 ? (nextEv || null) : (prevEv || null);

  const dates = new Set();
  if (prev?.date) dates.add(prev.date);
  if (next?.date) dates.add(next.date);

  const deckKeys = new Set();
  if (prev?.playerDeckKey) deckKeys.add(prev.playerDeckKey);
  if (next?.playerDeckKey) deckKeys.add(next.playerDeckKey);

  const tournaments = new Set();
  if (prev?.tournamentId) tournaments.add(prev.tournamentId);
  if (next?.tournamentId) tournaments.add(next.tournamentId);

  const opponents = new Set();
  extractOpponentNames(prev).forEach((name) => opponents.add(name));
  extractOpponentNames(next).forEach((name) => opponents.add(name));

  try {
    await Promise.all([
      ...Array.from(dates).map((date) => recomputeDay(date)),
      ...Array.from(deckKeys).map((deck) => recomputeDeck(deck)),
      ...Array.from(tournaments).map((t) => recomputeTournament(t)),
      ...Array.from(opponents).map((name) => recomputeOpponent(name)),
    ]);
  } catch (e) {
    console.error("[recomputeAllForEvent] failed", e);
  }
}
