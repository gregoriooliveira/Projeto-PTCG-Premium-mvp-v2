import { Router } from "express";
import { db } from "../firestore.js";
import { wrPercent, countsOfResult } from "../utils/wr.js";

const r = Router();

function sumCounts(a={W:0,L:0,T:0}, b={W:0,L:0,T:0}){
  return { W:(a.W||0)+(b.W||0), L:(a.L||0)+(b.L||0), T:(a.T||0)+(b.T||0) };
}
function total(c){ return (c.W||0)+(c.L||0)+(c.T||0); }

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

function normalizeDeckRow(deck = {}) {
  const counts = eventCounts(deck) || { W: 0, L: 0, T: 0 };
  const storedWr = Number(deck.wr);
  const wr = Number.isFinite(storedWr) ? storedWr : wrPercent(counts);
  const avatars = Array.isArray(deck.pokemons) ? deck.pokemons : [];
  return {
    deckKey: deck.deckKey,
    counts,
    wr,
    avatars,
    pokemons: avatars,
  };
}

async function sourceSummary(prefix, limitDays){
  // events
  const evSnap = await db.collection(`${prefix}Events`).get();
  const events = evSnap.docs.map(d=>d.data()).sort((a,b)=>b.createdAt-a.createdAt);
  let counts = {W:0,L:0,T:0};
  for (const e of events) counts = sumCounts(counts, {W: e.result==='W'?1:0, L: e.result==='L'?1:0, T: e.result==='T'?1:0});
  const recentLogs = events.slice(0,10).map(ev => ({
    eventId: ev.eventId,
    dateISO: ev.date,
    result: ev.result,
    playerDeck: ev.deckName,
    opponentDeck: ev.opponentDeck,
    counts: eventCounts(ev),
    name: prefix === "live"
      ? ((ev.you && ev.opponent)
          ? `${ev.you} vs ${ev.opponent}`
          : (ev.event || ev.tourneyName || ev.tournamentName || ev.eventName || ev.tournament || ev.eventId || ""))
      : (ev.name || ev.nome || ev.tourneyName || ev.tournamentName || ev.event || ev.eventName || ev.tournament || ev.eventId || ""),
    source: prefix,
  }));
  // days
  const daysSnap = await db.collection(`${prefix}Days`).orderBy("date","desc").limit(limitDays).get();
  const lastDays = daysSnap.docs.map(d=>d.data());
  // decks
  const decksSnap = await db.collection(`${prefix}DecksAgg`).get();
  const decks = decksSnap.docs
    .map(d => normalizeDeckRow(d.data()))
    .sort((a, b) => Number(b.wr || 0) - Number(a.wr || 0))
    .slice(0,5);
  // opponents
  const oppSnap = await db.collection(`${prefix}OpponentsAgg`).get();
  const topOpponents = oppSnap.docs.map(doc => {
    const d = doc.data();
    return {
      opponentName: d.opponentName || doc.id, counts: d.counts, wr: d.wr,
      topDeck: d.topDeckKey ? { deckKey: d.topDeckKey } : null
    };
  }).sort((a,b)=> (total(b.counts)-total(a.counts))).slice(0,5);
  /*__ENRICH_TOPDECK_POKEMONS__*/
  // Enrich topOpponents[].topDeck with pokemons from decks/{deckKey}
  for (let i=0;i<topOpponents.length;i++){
    const td = topOpponents[i].topDeck;
    if (td && td.deckKey){
      try {
        const ds = await db.collection(`${prefix}DecksAgg`).doc(td.deckKey).get();
        const info = ds.exists ? ds.data() : null;
        if (info && Array.isArray(info.pokemons)) {
          topOpponents[i].topDeck.pokemons = info.pokemons.slice(0,2);
        }
      } catch {}
    }
  }

  // tournaments
  const tourSnap = await db.collection(`${prefix}TournamentsAgg`).orderBy("dateISO","desc").limit(5).get();
  const recentTournaments = tourSnap.docs.map(d=>d.data());

  return {
    summary: {
      counts: { ...counts, total: total(counts) },
      wr: wrPercent(counts),
      topDeck: decks[0]
        ? {
            deckKey: decks[0].deckKey,
            wr: decks[0].wr,
            avatars: decks[0].avatars,
            pokemons: decks[0].pokemons,
            counts: decks[0].counts,
          }
        : null,
    },
    lastDays, topDecks: decks, topOpponents, recentTournaments, recentLogs
  };
}

function mergeHome(a, b, limitDays){
  // counts + wr
  const counts = sumCounts(a.summary.counts, b.summary.counts);
  const wr = wrPercent(counts);

  // lastDays (merge by date)
  const map = new Map();
  for (const d of a.lastDays) map.set(d.date, { ...d });
  for (const d of b.lastDays) {
    const prev = map.get(d.date) || { date: d.date, counts:{W:0,L:0,T:0}, wr:0 };
    const mergedCounts = sumCounts(prev.counts, d.counts);
    map.set(d.date, { date: d.date, counts: mergedCounts, wr: wrPercent(mergedCounts) });
  }
  const lastDays = Array.from(map.values()).sort((x,y)=> String(y.date).localeCompare(String(x.date))).slice(0, limitDays);

  // topDecks (merge by deckKey and recompute wr)
  const dm = new Map();
  for (const x of a.topDecks) dm.set(x.deckKey, { deckKey:x.deckKey, counts:{...x.counts}, avatars: x.avatars||[] });
  for (const x of b.topDecks) {
    const prev = dm.get(x.deckKey) || { deckKey:x.deckKey, counts:{W:0,L:0,T:0}, avatars:[] };
    prev.counts = sumCounts(prev.counts, x.counts);
    if ((prev.avatars||[]).length===0 && (x.avatars||[]).length) prev.avatars = x.avatars;
    dm.set(x.deckKey, prev);
  }
  const topDecks = Array.from(dm.values()).map(d => ({ deckKey:d.deckKey, counts:d.counts, wr: wrPercent(d.counts), avatars:d.avatars||[] })).sort((a,b)=>b.wr-a.wr).slice(0,5);

  // topOpponents (merge by opponentName)
  const om = new Map();
  for (const x of a.topOpponents) om.set(x.opponentName, { opponentName:x.opponentName, counts:{...x.counts}, wr:x.wr, topDeck:x.topDeck });
  for (const x of b.topOpponents) {
    const prev = om.get(x.opponentName) || { opponentName:x.opponentName, counts:{W:0,L:0,T:0}, topDeck:null };
    prev.counts = sumCounts(prev.counts, x.counts);
    prev.wr = wrPercent(prev.counts);
    if (!prev.topDeck && x.topDeck) prev.topDeck = x.topDeck;
    om.set(x.opponentName, prev);
  }
  const topOpponents = Array.from(om.values()).sort((a,b)=> (total(b.counts)-total(a.counts))).slice(0,5);

  // recentTournaments
  const recentTournaments = [...a.recentTournaments, ...b.recentTournaments].sort((x,y)=> String(y.dateISO).localeCompare(String(x.dateISO))).slice(0,5);

  // recentLogs (merge and slice)
  const recentLogs = [...a.recentLogs, ...b.recentLogs].sort((x,y)=> String(y.dateISO).localeCompare(String(x.dateISO))).slice(0,10);

  const topDeck = topDecks[0] ? { deckKey: topDecks[0].deckKey, wr: topDecks[0].wr, avatars: topDecks[0].avatars } : null;
  return { summary:{ counts, wr, topDeck }, lastDays, topDecks, topOpponents, recentTournaments, recentLogs };
}

/** GET /api/home?source=all|live|physical&limit=5 */
r.get("/home", async (req, res) => {
  const source = (req.query.source || "all").toString();
  const limitDays = Number(req.query.limit || 5);
  if (source === "live") {
    const live = await sourceSummary("live", limitDays);
    return res.json(live);
  }
  if (source === "physical") {
    const phys = await sourceSummary("physical", limitDays);
    return res.json(phys);
  }
  // all: merge live + physical (se physical não existir, retorna só live)
  const live = await sourceSummary("live", limitDays);
  let phys;
  try {
    phys = await sourceSummary("physical", limitDays);
  } catch (e) {
    // coleções physical podem não existir ainda: retorna live
    return res.json(live);
  }
  return res.json(mergeHome(live, phys, limitDays));
});

export default r;