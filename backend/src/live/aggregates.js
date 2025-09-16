import { db } from "../firestore.js";
import { countsAdd, countsOfResult, wrPercent } from "../utils/wr.js";

/** Garante ID seguro para usar em doc() */
function safeDocId(s) {
  return encodeURIComponent(String(s ?? ""));
}

/** Recalcula o agregado por dia */
export async function recomputeDay(date) {
  if (!date) return;
  const snap = await db.collection("liveEvents").where("date", "==", date).get();
  if (snap.empty) {
    // Remove o agregado se não houver mais partidas no dia
    try { await db.collection("liveDays").doc(date).delete(); } catch {}
    return;
  }
  let counts = { W: 0, L: 0, T: 0 };
  snap.forEach(d => { counts = countsAdd(counts, countsOfResult(d.data().result)); });
  const wr = wrPercent(counts);
  await db.collection("liveDays").doc(date).set({ date, counts, wr }, { merge: true });
}

/** Recalcula o agregado por deck */
export async function recomputeDeck(deckKey) {
  if (!deckKey) return;
  const snap = await db.collection("liveEvents").where("playerDeckKey", "==", deckKey).get();
  const docId = safeDocId(deckKey);
  if (snap.empty) {
    try { await db.collection("liveDecksAgg").doc(docId).delete(); } catch {}
    return;
  }
  let counts = { W: 0, L: 0, T: 0 };
  let games = 0;
  const pokemons = [];
  snap.forEach(d => {
    const ev = d.data();
    counts = countsAdd(counts, countsOfResult(ev.result));
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
  await db.collection("liveDecksAgg").doc(docId).set(
    { deckKey, games, counts, wr, pokemons },
    { merge: true }
  );
}

/** Recalcula todos os decks existentes em liveDecksAgg */
export async function recomputeAllDeckAggregates() {
  const deckKeys = new Set();
  try {
    const snap = await db.collection("liveDecksAgg").get();
    snap.forEach(doc => {
      const data = doc.data() || {};
      let key = data.deckKey;
      if (!key) {
        try {
          key = decodeURIComponent(doc.id);
        } catch (err) {
          console.error("[live recomputeAllDeckAggregates] failed to decode doc id", doc.id, err);
        }
      }
      if (key) deckKeys.add(key);
    });
  } catch (err) {
    console.error("[live recomputeAllDeckAggregates] failed to list deck keys", err);
    return [];
  }

  const processed = [];
  for (const key of deckKeys) {
    try {
      await recomputeDeck(key);
      processed.push(key);
    } catch (err) {
      console.error(`[live recomputeAllDeckAggregates] failed to recompute ${key}`, err);
    }
  }
  return processed;
}

/** Recalcula o agregado por oponente */
export async function recomputeOpponent(opponentName) {
  if (!opponentName) return;
  const snap = await db.collection("liveEvents").where("opponent", "==", opponentName).get();
  const docId = safeDocId(opponentName);
  if (snap.empty) {
    try { await db.collection("liveOpponentsAgg").doc(docId).delete(); } catch {}
    return;
  }
  let counts = { W: 0, L: 0, T: 0 };
  let games = 0;
  snap.forEach(d => {
    const ev = d.data();
    counts = countsAdd(counts, countsOfResult(ev.result));
    games += 1;
  });
  const wr = wrPercent(counts);
  await db.collection("liveOpponentsAgg").doc(docId).set(
    { opponent: opponentName, games, counts, wr },
    { merge: true }
  );
}

/** Recalcula agregados de torneio */
export async function recomputeTournament(tournamentId) {
  if (!tournamentId) return;
  const snap = await db.collection("liveEvents").where("tournamentId", "==", tournamentId).get();
  if (snap.empty) {
    try { await db.collection("liveTournamentsAgg").doc(tournamentId).delete(); } catch {}
    try { await db.collection("tournaments").doc(tournamentId).delete(); } catch {}
    return;
  }

  // Conta por deck dentro do torneio
  const perDeck = new Map();
  const add = (key, result) => {
    const cur = perDeck.get(key) || { W:0, L:0, T:0, games:0 };
    const inc = countsOfResult(result);
    cur.W += inc.W; cur.L += inc.L; cur.T += inc.T;
    cur.games += 1;
    perDeck.set(key, cur);
  };

  snap.forEach(d => {
    const ev = d.data();
    const deckKey = ev.playerDeckKey || ev.deckKey || "";
    add(deckKey, ev.result);
  });

  const decks = [];
  for (const [deckKey, c] of perDeck) {
    decks.push({ deckKey, counts: {W:c.W, L:c.L, T:c.T}, games: c.games, wr: wrPercent(c) });
  }

  await db.collection("liveTournamentsAgg").doc(tournamentId).set(
    { tournamentId, decks },
    { merge: true }
  );

  // Doc espelho mínimo (caso usem em outra tela)
  // Mantemos o doc, mas ele é removido no caso "empty" acima.
  await db.collection("tournaments").doc(tournamentId).set(
    { tournamentId, source: "live" },
    { merge: true }
  );
}

/** Recalcula todos os agregados afetados por um evento (para limpar/atualizar widgets). */
export async function recomputeAllForEvent(ev) {
  try {
    await Promise.all([
      recomputeDay(ev?.date),
      recomputeDeck(ev?.playerDeckKey),
      recomputeOpponent(ev?.opponent),
      recomputeTournament(ev?.tournamentId),
    ]);
  } catch (e) {
    console.error("[recomputeAllForEvent] failed", e);
  }
}
