import { db } from "../firestore.js";
import { countsAdd, countsOfResult, wrPercent } from "../utils/wr.js";

export async function recomputeDay(date) {
  const snap = await db.collection("liveEvents").where("date", "==", date).get();
  let counts = { W:0, L:0, T:0 };
  snap.forEach(doc => { counts = countsAdd(counts, countsOfResult(doc.data().result)); });
  const wr = wrPercent(counts);
  await db.collection("liveDays").doc(date).set({ date, counts, wr }, { merge: true });
}

export async function recomputeDeck(deckKey) {
  if (!deckKey) return;
  const snap = await db.collection("liveEvents").where("playerDeckKey","==", deckKey).get();
  let counts = { W:0, L:0, T:0 };
  snap.forEach(doc => { counts = countsAdd(counts, countsOfResult(doc.data().result)); });
  const wr = wrPercent(counts);
  // pick pokemons from catalog decks/{deckKey} if present
  let pokemons = [];
  const deckDoc = await db.collection("decks").doc(deckKey).get();
  if (deckDoc.exists && Array.isArray(deckDoc.data().spriteIds)) {
    pokemons = deckDoc.data().spriteIds.slice(0,2);
  }
  await db.collection("liveDecksAgg").doc(deckKey).set({ deckKey, counts, wr, pokemons }, { merge: true });
}

export async function recomputeOpponent(opponentName) {
  if (!opponentName) return;
  const snap = await db.collection("liveEvents").where("opponent","==", opponentName).get();
  let counts = { W:0, L:0, T:0 };
  const deckCounts = new Map();
  snap.forEach(doc => {
    const d = doc.data();
    counts = countsAdd(counts, countsOfResult(d.result));
    const key = d.opponentDeckKey || null;
    if (!key) return;
    deckCounts.set(key, (deckCounts.get(key)||0) + 1);
  });
  const wr = wrPercent(counts);
  let topDeckKey = null, max = 0;
  for (const [k,v] of deckCounts.entries()) if (v > max) { max = v; topDeckKey = k; }
  const total = counts.W + counts.L + counts.T;
  await db
    .collection("liveOpponentsAgg")
    .doc(opponentName)
    .set({ opponentName, counts, total, wr, topDeckKey }, { merge: true });
}


export async function recomputeTournament(tournamentId) {
  if (!tournamentId) return;
  const snap = await db.collection("liveEvents").where("tournamentId","==", tournamentId).get();
  let roundsCount = 0;
  const roundsSeen = new Set();
  let dateISO = null;
  let name = null;
  let limitlessId = null;
  let counts = { W:0, L:0, T:0 };
  let deckKeyCounts = new Map();

  snap.forEach(doc => {
    const d = doc.data();
    if (d.round) roundsSeen.add(d.round);
    if (!dateISO) dateISO = d.date;
    if (!name) name = d.tourneyName || d.limitlessId || tournamentId;
    if (!limitlessId && d.limitlessId) limitlessId = d.limitlessId;
    counts = countsAdd(counts, countsOfResult(d.result));
    const dk = d.playerDeckKey || null;
    if (dk) deckKeyCounts.set(dk, (deckKeyCounts.get(dk)||0)+1);
  });

  roundsCount = roundsSeen.size || snap.size;

  let deckKey = null, max = 0;
  for (const [k,v] of deckKeyCounts.entries()) if (v > max) { max = v; deckKey = k; }

  const wr = wrPercent(counts);
  await db.collection("liveTournamentsAgg").doc(tournamentId).set({
    tournamentId, dateISO, name, roundsCount, deckKey, counts, wr, limitlessId
  }, { merge: true });

  // mirror minimal doc in tournaments/
  await db.collection("tournaments").doc(tournamentId).set({ tournamentId, dateISO, name, source:"live" }, { merge: true });
}

export async function recomputeAllForEvent(ev) {
  await Promise.all([
    recomputeDay(ev.date),
    recomputeDeck(ev.playerDeckKey),
    recomputeOpponent(ev.opponent),
    recomputeTournament(ev.tournamentId)
  ]);
}
