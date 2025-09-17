import { db } from "../firestore.js";
import { countsAdd, countsOfResult, wrPercent } from "../utils/wr.js";

/** Garante ID seguro para usar em doc() */
function safeDocId(s) {
  return encodeURIComponent(String(s ?? ""));
}

function extractPokemonSlug(raw) {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    if (typeof raw.slug === "string" && raw.slug.trim()) return raw.slug.trim();
    if (typeof raw.name === "string" && raw.name.trim()) return raw.name.trim();
    if (typeof raw.id === "string" && raw.id.trim()) return raw.id.trim();
  }
  return "";
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
  snap.forEach(d => {
    const ev = d.data();
    counts = countsAdd(counts, countsOfResult(ev.result));
    games += 1;
  });
  const wr = wrPercent(counts);
  await db.collection("liveDecksAgg").doc(docId).set(
    { deckKey, games, counts, wr },
    { merge: true }
  );
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
  const perDeck = new Map();
  snap.forEach(d => {
    const ev = d.data();
    counts = countsAdd(counts, countsOfResult(ev.result));
    games += 1;
    const rawDeckKey = typeof ev.opponentDeckKey === "string" ? ev.opponentDeckKey.trim() : "";
    const rawDeckName = typeof ev.opponentDeck === "string" ? ev.opponentDeck.trim() : "";
    const deckKey = rawDeckKey || "";
    const deckName = rawDeckName || "";
    const mapKey = deckKey ? `key:${deckKey}` : deckName ? `name:${deckName}` : "__unknown__";
    let entry = perDeck.get(mapKey);
    if (!entry) {
      entry = {
        deckKey,
        deckName,
        games: 0,
        pokemons: new Set(),
      };
      perDeck.set(mapKey, entry);
    }
    entry.games += 1;
    if (deckKey && !entry.deckKey) entry.deckKey = deckKey;
    if (deckName && !entry.deckName) entry.deckName = deckName;
    if (Array.isArray(ev.opponentPokemons)) {
      for (const raw of ev.opponentPokemons) {
        const slug = extractPokemonSlug(raw);
        if (slug) entry.pokemons.add(slug);
      }
    }
  });
  const wr = wrPercent(counts);
  let topDeckKey = null;
  let topDeckName = null;
  let topPokemons = [];
  let bestEntry = null;
  for (const entry of perDeck.values()) {
    if (!bestEntry) {
      bestEntry = entry;
      continue;
    }
    if (entry.games > bestEntry.games) {
      bestEntry = entry;
      continue;
    }
    if (entry.games === bestEntry.games) {
      const entryHas = entry.deckKey || entry.deckName ? 1 : 0;
      const bestHas = bestEntry.deckKey || bestEntry.deckName ? 1 : 0;
      if (entryHas > bestHas) {
        bestEntry = entry;
      }
    }
  }
  if (bestEntry) {
    topDeckKey = bestEntry.deckKey ? bestEntry.deckKey : null;
    topDeckName = bestEntry.deckName ? bestEntry.deckName : null;
    topPokemons = Array.from(bestEntry.pokemons)
      .map(s => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .slice(0, 2);
  }
  const total = (counts.W || 0) + (counts.L || 0) + (counts.T || 0);
  await db.collection("liveOpponentsAgg").doc(docId).set(
    {
      opponent: opponentName,
      opponentName,
      games,
      total,
      counts,
      wr,
      topDeckKey,
      topDeckName,
      topPokemons,
    },
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
