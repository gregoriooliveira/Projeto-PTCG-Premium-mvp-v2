import { Router } from "express";
import { db } from "../firestore.js";
import { wrPercent, countsOfResult } from "../utils/wr.js";

const r = Router();

function sumCounts(a={W:0,L:0,T:0}, b={W:0,L:0,T:0}){
  return { W:(a.W||0)+(b.W||0), L:(a.L||0)+(b.L||0), T:(a.T||0)+(b.T||0) };
}
function total(c){ return (c.W||0)+(c.L||0)+(c.T||0); }

function extractPokemonSlug(raw) {
  let value = "";
  if (typeof raw === "string") value = raw;
  else if (raw && typeof raw === "object") {
    for (const key of ["slug", "name", "id"]) {
      const candidate = raw[key];
      if (typeof candidate === "string" && candidate.trim()) {
        value = candidate;
        break;
      }
    }
  }
  if (!value) return "";
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

function normalizePokemonHints(...sources) {
  const seen = new Set();
  const normalized = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const raw of source) {
      if (normalized.length >= 2) break;
      const slug = extractPokemonSlug(raw);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      normalized.push(slug);
    }
    if (normalized.length >= 2) break;
  }
  return normalized.length ? normalized : null;
}

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

async function sourceSummary(prefix, limitDays){
  // events
  const evSnap = await db.collection(`${prefix}Events`).get();
  const events = evSnap.docs.map(d=>d.data()).sort((a,b)=>b.createdAt-a.createdAt);
  let counts = {W:0,L:0,T:0};
  for (const e of events) {
    const current = eventCounts(e) || { W: 0, L: 0, T: 0 };
    counts = sumCounts(counts, current);
  }
  const recentLogs = events.slice(0,10).map(ev => ({
    eventId: ev.eventId,
    dateISO: ev.date,
    result: ev.result,
    playerDeck: ev.deckName,
    opponentDeck: ev.opponentDeck,
    userPokemons: normalizePokemonHints(ev.pokemons, ev.userPokemons),
    opponentPokemons: normalizePokemonHints(ev.opponentPokemons),
    counts: eventCounts(ev),
    name: prefix === "live"
      ? ((ev.you && ev.opponent)
          ? `${ev.you} vs ${ev.opponent}`
          : (ev.event || ev.tourneyName || ev.tournamentName || ev.eventName || ev.tournament || ev.eventId || ""))
      : (ev.name || ev.nome || ev.tourneyName || ev.tournamentName || ev.event || ev.eventName || ev.tournament || ev.eventId || ""),
    source: prefix
  }));
  // days
  const daysSnap = await db.collection(`${prefix}Days`).orderBy("date","desc").limit(limitDays).get();
  const eventUrlPrefix = prefix === "live" ? "#/tcg-live/logs" : "#/tcg-fisico/eventos";
  const lastDays = await Promise.all(daysSnap.docs.map(async (doc) => {
    const day = doc.data() || {};
    const dateKey = day.date;
    let event = null;
    if (dateKey) {
      try {
        const dayEventsSnap = await db
          .collection(`${prefix}Events`)
          .where("date", "==", dateKey)
          .get();
        const dayEvents = dayEventsSnap.docs
          .map(d => d.data())
          .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
        const latestEvent = dayEvents[0];
        if (latestEvent) {
          const eventId = latestEvent.eventId || latestEvent.id || null;
          let displayName;
          if (prefix === "live") {
            const you = latestEvent.you || "";
            const opp = latestEvent.opponent || "";
            displayName = you && opp ? `${you} vs ${opp}` : (latestEvent.event || latestEvent.tourneyName || latestEvent.tournamentName || latestEvent.eventName || latestEvent.tournament || eventId || null);
          } else {
            displayName = latestEvent.name || latestEvent.nome || latestEvent.tourneyName || latestEvent.tournamentName || latestEvent.event || latestEvent.eventName || latestEvent.tournament || eventId || null;
          }
          const url = eventId ? `${eventUrlPrefix}/${encodeURIComponent(eventId)}` : null;
          if (displayName || url) event = { name: displayName, url };
        }
      } catch (e) {
        console.error(`[home] failed to fetch ${prefix} event for ${dateKey}`, e);
      }
    }
    return { ...day, event: event || null };
  }));
  // decks
  const decksSnap = await db.collection(`${prefix}DecksAgg`).get();
  const decks = decksSnap.docs
    .map((doc) => doc.data() || {})
    .map((d) => {
      const counts = normalizeCounts(d.counts) || { W: 0, L: 0, T: 0 };
      const storedWr = Number.isFinite(d?.wr) ? d.wr : null;
      const wr = storedWr ?? wrPercent(counts);
      const pokemons = Array.isArray(d.pokemons) ? d.pokemons : [];
      return {
        deckKey: d.deckKey,
        counts,
        wr,
        avatars: pokemons,
        pokemons,
      };
    })
    .sort((a, b) => {
      const wrDiff = b.wr - a.wr;
      if (wrDiff !== 0) return wrDiff;
      return total(b.counts) - total(a.counts);
    })
    .slice(0, 5);
  // opponents
  const oppSnap = await db.collection(`${prefix}OpponentsAgg`).get();
  const topOpponents = oppSnap.docs.map(doc => {
    const d = doc.data() || {};
    const counts = d.counts || {};
    const inferredTotal =
      typeof d.total === "number"
        ? d.total
        : typeof d.games === "number"
          ? d.games
          : (counts.W || 0) + (counts.L || 0) + (counts.T || 0);
    const rawTopPokemons = Array.isArray(d.topPokemons) ? d.topPokemons : [];
    const normalizedPokemons = rawTopPokemons
      .map(p => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean)
      .slice(0, 2);
    const rawTopDeckKey = typeof d.topDeckKey === "string" ? d.topDeckKey.trim() : "";
    const rawTopDeckName = typeof d.topDeckName === "string" ? d.topDeckName.trim() : "";
    const hasDeckInfo = !!(rawTopDeckKey || rawTopDeckName || normalizedPokemons.length);
    const topDeck = hasDeckInfo
      ? {
          deckKey: rawTopDeckKey || null,
          deckName: rawTopDeckName || null,
          pokemons: normalizedPokemons.length ? normalizedPokemons : undefined,
        }
      : null;
    return {
      opponentName: d.opponentName || d.opponent || doc.id,
      counts,
      wr: d.wr,
      games: typeof d.games === "number" ? d.games : inferredTotal,
      total: inferredTotal,
      topDeckKey: rawTopDeckKey || null,
      topDeckName: rawTopDeckName || null,
      topPokemons: normalizedPokemons,
      topDeck,
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

  const summaryCounts = { ...counts, total: total(counts) };
  const topDeck = decks[0]
    ? {
        deckKey: decks[0].deckKey,
        wr: decks[0].wr,
        avatars: decks[0].avatars,
        pokemons: decks[0].pokemons,
      }
    : null;
  return {
    summary: { counts: summaryCounts, wr: wrPercent(counts), topDeck },
    lastDays,
    topDecks: decks,
    topOpponents,
    recentTournaments,
    recentLogs,
  };
}

function mergeHome(a, b, limitDays){
  // counts + wr
  const counts = sumCounts(a.summary.counts, b.summary.counts);
  const wr = wrPercent(counts);

  // lastDays (merge by date)
  const map = new Map();
  for (const d of a.lastDays) {
    const event = d && d.event ? { ...d.event } : null;
    map.set(d.date, { ...d, event });
  }
  for (const d of b.lastDays) {
    const prev = map.get(d.date) || { date: d.date, counts:{W:0,L:0,T:0}, wr:0, event:null };
    const mergedCounts = sumCounts(prev.counts || {}, d.counts || {});
    const mergedEvent = prev.event || d.event || null;
    map.set(d.date, {
      date: d.date,
      counts: mergedCounts,
      wr: wrPercent(mergedCounts),
      event: mergedEvent ? { ...mergedEvent } : null
    });
  }
  const lastDays = Array.from(map.values()).sort((x,y)=> String(y.date).localeCompare(String(x.date))).slice(0, limitDays);

  // topDecks (merge by deckKey and recompute wr)
  const dm = new Map();
  for (const x of a.topDecks) {
    dm.set(x.deckKey, {
      deckKey: x.deckKey,
      counts: { ...x.counts },
      avatars: x.avatars || [],
      pokemons: x.pokemons || [],
    });
  }
  for (const x of b.topDecks) {
    const prev = dm.get(x.deckKey) || { deckKey:x.deckKey, counts:{W:0,L:0,T:0}, avatars:[], pokemons:[] };
    prev.counts = sumCounts(prev.counts, x.counts);
    if ((prev.avatars||[]).length===0 && (x.avatars||[]).length) prev.avatars = x.avatars;
    if ((!Array.isArray(prev.pokemons) || prev.pokemons.length===0) && (x.pokemons||[]).length) prev.pokemons = x.pokemons;
    dm.set(x.deckKey, prev);
  }
  const topDecks = Array.from(dm.values())
    .map(d => ({ deckKey:d.deckKey, counts:d.counts, wr: wrPercent(d.counts), avatars:d.avatars||[], pokemons:d.pokemons||[] }))
    .sort((a,b)=>{
      const wrDiff = b.wr - a.wr;
      if (wrDiff !== 0) return wrDiff;
      return total(b.counts) - total(a.counts);
    })
    .slice(0,5);

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
  function cloneRecentLog(log = {}) {
    const copy = { ...log };
    if (Array.isArray(log.userPokemons)) copy.userPokemons = [...log.userPokemons];
    if (Array.isArray(log.opponentPokemons)) copy.opponentPokemons = [...log.opponentPokemons];
    return copy;
  }
  const recentLogs = [
    ...(Array.isArray(a.recentLogs) ? a.recentLogs.map(cloneRecentLog) : []),
    ...(Array.isArray(b.recentLogs) ? b.recentLogs.map(cloneRecentLog) : [])
  ].sort((x,y)=> String(y.dateISO).localeCompare(String(x.dateISO))).slice(0,10);

  const topDeck = topDecks[0] ? { deckKey: topDecks[0].deckKey, wr: topDecks[0].wr, avatars: topDecks[0].avatars, pokemons: topDecks[0].pokemons } : null;
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