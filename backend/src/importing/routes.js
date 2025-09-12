
import { Router } from "express";
import { db } from "../firestore.js";
import { parseLog } from "./parser.js";
import { suggestFromParsed } from "./suggestor.js";
import { getPokemonBySlug, searchPokemon } from "../services/pokedex.js";
import { sha256 } from "../utils/hash.js";
import { recomputeAllForEvent } from "../live/aggregates.js";


function slugifyName(s=""){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"");
}
const r = Router();

function slugifyDeckKey(name=""){
  return String(name||"")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/['’]/g,"")        // remove apóstrofos
    .replace(/[\/]+/g," ")      // remove barras
    .replace(/[^a-z0-9]+/g,"-") // qualquer separador -> -
    .replace(/-+/g,"-")         // múltiplos -
    .replace(/^-|-$/g,"");      // trim -
}


function deriveResult(rawLog, you, opponent) {
  try {
    const raw = String(rawLog||"").toLowerCase();
    const youL = String(you||"").toLowerCase();
    const oppL = String(opponent||"").toLowerCase();
    const m = raw.match(/([a-z0-9' _.-]+)\s+wins?\s+the\s+(match|game)/i);
    if (m) {
      const who = m[1].trim().toLowerCase();
      if (youL && who.includes(youL)) return "W";
      if (oppL && who.includes(oppL)) return "L";
    }
    if (youL && (raw.includes(youL+" wins") || raw.includes(youL+" won"))) return "W";
    if (youL && (raw.includes(youL+" loses") || raw.includes(youL+" lost"))) return "L";
    return null;
  } catch { return null; }
}


r.get("/pokedex/search", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    if (q.length < 2) return res.json([]);
    const items = await searchPokemon(q);
    res.json(items);
  } catch (e) {
    console.error("[pokedex/search]", e);
    res.status(500).json({ error: "search_failed" });
  }
});

r.get("/pokedex/by-slug/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "");
    const item = await getPokemonBySlug(slug);
    if (!item) return res.status(404).json({ error:"not_found" });
    res.json({ slug: item.slug, name: item.name, image: item.imageUrl });
  } catch (e) {
    console.error("[pokedex/by-slug]", e);
    res.status(500).json({ error: "lookup_failed" });
  }
});

r.post("/import-logs/parse", async (req, res) => {
  try {
    const { rawLog = "" } = req.body || {};
    const parsed = parseLog(rawLog);
    const sug = await suggestFromParsed(parsed, rawLog);
    res.json({
      detected: { player: parsed.players.player, opponent: parsed.players.opponent },
      suggestions: {
        playerDeckName: sug.playerDeckName || null,
        opponentDeckName: sug.opponentDeckName || null,
        playerPokemons: sug.playerPokemons || [],
        opponentPokemons: sug.opponentPokemons || []
      },
      features: { language: parsed.language }
    });
  } catch (e) {
    console.error("[import-logs/parse]", e);
    res.status(500).json({ error: "parse_failed" });
  }
});

r.post("/import-logs/commit", async (req, res) => {
  try {
    const body = req.body || {};
    const now = Date.now();
    const createdAt = now;
    const date = new Date(now).toISOString().slice(0,10);

    const rawLog = String(body.rawLog || "");
    const hash = sha256(rawLog);

    const players = body.players || {};
    const userHandle = String(players.user?.handle || players.user || "");
    const oppHandle = String(players.opponent?.handle || players.opponent || "");

    const computedResult = body.result ?? deriveResult(rawLog, userHandle, oppHandle);

    const decks = body.decks || {};
    const userDeckName = String(decks.userDeckName || "").trim();
    const oppDeckName = String(decks.opponentDeckName || "").trim();

    // Compute deck keys from names (slugified)
    const playerDeckKey = slugifyDeckKey(userDeckName);
    const opponentDeckKey = oppDeckName ? slugifyDeckKey(oppDeckName) : null;
    if (!playerDeckKey) return res.status(400).json({ error: "playerDeckKey_required" });

    const mainPokemons = body.mainPokemons || {};
    const userPokes = Array.isArray(mainPokemons.user) ? mainPokemons.user.filter(Boolean).slice(0,2) : [];
    const oppPokes = Array.isArray(mainPokemons.opponent) ? mainPokemons.opponent.filter(Boolean).slice(0,2) : [];

    const meta = body.meta || {};
    const source = meta.source || "tcg-live";
    const tournamentOnline = !!meta.tournamentOnline;
    // Tournament metadata from body.meta.tournament OR top-level fields
    let round = null, tournamentId = null, tourneyName = null, limitlessId = null;
    if (tournamentOnline) {
      const t = (meta && meta.tournament) ? meta.tournament : {};
      const tRound = (t && t.round != null) ? t.round : (body.round ?? body.tournamentRound ?? null);
      if (tRound != null && !isNaN(Number(tRound))) round = Number(tRound);

      const lid = (t && t.platform === "limitless" && t.id) ? t.id : (body.limitlessId ?? null);
      const tname = (t && t.name) ? t.name : (body.tourneyName ?? null);

      if (lid) {
        limitlessId = String(lid).trim();
        tournamentId = `limitless:${limitlessId}`;
      } else if (tname) {
        tourneyName = String(tname).trim();
        const slug = slugifyName(tourneyName);
        tournamentId = `manual:${slug}:${date}`;
      }
    }


    if (!userHandle || !oppHandle) return res.status(400).json({ error: "missing_handles" });
    if (!userDeckName) return res.status(400).json({ error: "missing_user_deck" });
    if (!userPokes[0] || !oppPokes[0]) return res.status(400).json({ error: "missing_main_pokemons" });

    const batch = db.batch();

    const rawRef = db.collection("rawLogs").doc(hash);
    batch.set(rawRef, { id: hash, language: body.language || "auto", content: rawLog, hash, createdAt }, { merge: true });

    const matchId = hash.slice(0,12);
    const matchRef = db.collection("liveEvents").doc(matchId);
    batch.set(matchRef, {
      eventId: matchId, source:"live", createdAt, date,
      you: userHandle, opponent: oppHandle,
      deckName: userDeckName, opponentDeck: oppDeckName || null,
      playerDeckKey: playerDeckKey,
      opponentDeckKey: opponentDeckKey,
      isOnlineTourney: tournamentOnline,
      result: computedResult, round, placement: null,
      tournamentId, tourneyName, limitlessId,
      rawLogId: hash, lang: body.language || "auto",
      pokemons: userPokes, opponentPokemons: oppPokes
    }, { merge: true });

    await batch.commit();
    await recomputeAllForEvent({ date, playerDeckKey, opponent: oppHandle, tournamentId });

    res.json({ matchId, created: true, derived: { points: 0, winRateImpact: 0 } });
  } catch (e) {
    console.error("[import-logs/commit]", e);
    res.status(500).json({ error: "commit_failed" });
  }
});

export default r;

r.post("/commit", (req,res)=>{ const b=req.body||{}; if(!b.deckName||!String(b.deckName).trim()) return res.status(400).json({ ok:false, error:"deckName obrigatório" }); return res.json({ ok:true, id: "evt_"+Date.now().toString(36), matchId: "evt_"+Date.now().toString(36) }); });
