import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  listPhysicalTournaments,
  suggestPhysicalTournaments,
  getPhysicalTournament,
} from "../services/physicalApi.js";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import DeckLabel from "../components/DeckLabel.jsx";
import { subscribePhysicalRoundsChanged } from "../utils/physicalRoundsBus.js";

const API = import.meta.env.VITE_API_BASE_URL || "";
const BASE_HASH = "#/tcg-fisico/torneios";

const TOURNAMENT_TYPE_OPTIONS = [
  {
    value: "regional",
    label: "Regional",
    keywords: ["regional", "regional championship", "regional championships"],
  },
  {
    value: "special",
    label: "Special Event",
    keywords: ["special", "special event", "special events"],
  },
  {
    value: "international",
    label: "International",
    keywords: [
      "international",
      "international championship",
      "international championships",
      "internacional",
      "internacional championship",
      "internacional championships",
    ],
  },
  {
    value: "worlds",
    label: "Worlds",
    keywords: [
      "worlds",
      "world championship",
      "world championships",
      "mundial",
      "campeonato mundial",
    ],
  },
];

const normalizeAscii = (value) =>
  typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

const normalizeTypeFilter = (value) => {
  const ascii = normalizeAscii(value);
  if (!ascii) return null;
  for (const option of TOURNAMENT_TYPE_OPTIONS) {
    if (option.keywords.some((keyword) => ascii === keyword || ascii.includes(keyword))) {
      return option.value;
    }
  }
  return null;
};

const getTypeLabel = (value) => {
  const normalized = normalizeTypeFilter(value);
  if (!normalized) return "";
  const option = TOURNAMENT_TYPE_OPTIONS.find((item) => item.value === normalized);
  return option ? option.label : "";
};

const buildSearchParams = (queryValue, typeValue) => {
  const normalizedType = normalizeTypeFilter(typeValue);
  const normalizedQuery = typeof queryValue === "string" ? queryValue.trim() : "";
  return {
    query: normalizedType ? "" : normalizedQuery,
    type: normalizedType,
  };
};

const buildHashFromSearch = (queryValue, typeValue) => {
  try {
    const params = new URLSearchParams();
    const normalizedType = normalizeTypeFilter(typeValue);
    const normalizedQuery = typeof queryValue === "string" ? queryValue.trim() : "";
    if (normalizedQuery) params.set("query", normalizedQuery);
    if (normalizedType) params.set("type", getTypeLabel(normalizedType));
    const search = params.toString();
    return `${BASE_HASH}${search ? `?${search}` : ""}`;
  } catch {
    return BASE_HASH;
  }
};

const normalizeSearchPayload = (params) => {
  if (typeof params === "string") return buildSearchParams(params, null);
  if (params && typeof params === "object") {
    const queryCandidate =
      params.query != null ? params.query : params.q != null ? params.q : "";
    const typeCandidate =
      params.type != null
        ? params.type
        : params.typeFilter != null
          ? params.typeFilter
          : null;
    return buildSearchParams(queryCandidate, typeCandidate);
  }
  return buildSearchParams("", null);
};

// ===== Helpers =====
const WR = (w = 0, l = 0, t = 0) => {
  const tot = (w || 0) + (l || 0) + (t || 0);
  return tot ? Math.round(((w || 0) / tot) * 100) : 0;
};
const PTS = (w = 0, _l = 0, t = 0) => 3 * (w || 0) + (t || 0);
const fmtDate = (iso) =>
  iso
    ? new Date(String(iso) + "T12:00:00").toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : "—";

async function tryJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function safeArray(p) {
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.tournaments)) return p.tournaments;
  if (Array.isArray(p?.suggestions)) return p.suggestions;
  if (Array.isArray(p?.rows)) return p.rows;
  if (Array.isArray(p?.data)) return p.data;
  if (Array.isArray(p?.items)) return p.items;
  if (Array.isArray(p?.result)) return p.result;
  for (const v of Object.values(p || {})) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  return [];
}

const normalizeCounts = (payload) => {
  const source = payload || {};
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const W = toNumber(source.W ?? source.w ?? source.wins ?? source.win ?? source.V ?? source.v ?? 0);
  const L = toNumber(source.L ?? source.l ?? source.losses ?? source.loss ?? source.D ?? source.d ?? 0);
  const T = toNumber(source.T ?? source.t ?? source.ties ?? source.tie ?? source.E ?? source.e ?? source.draws ?? 0);
  return { W, L, T };
};

const computeWr = (counts) => {
  const { W = 0, L = 0, T = 0 } = counts || {};
  const total = W + L + T;
  return total > 0 ? Math.round((W / total) * 100) : 0;
};

const normalizeTournament = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const counts = normalizeCounts(entry.counts);
  const rawDate = entry.dateISO || entry.date || entry.day || "";
  const dateISO = rawDate ? String(rawDate).slice(0, 10) : "";
  const name = entry.name || entry.title || entry.tournament || entry.event || "";
  const format = entry.format || entry.eventType || entry.type || entry.category || "";
  const deck = entry.deck || entry.deckName || entry.playerDeck || entry.playerDeckName || entry.deckKey || entry.deckSlug || "";
  const pokemonHints = entry.pokemonHints || entry.pokemons || entry.pokemon || entry.deckPokemons || null;
  const idCandidates = [
    entry.tournamentId,
    entry.id,
    entry.eventId,
    entry.slug,
    entry.limitlessId,
    entry.identifier,
  ]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);
  const fallbackKey = [dateISO, name].filter(Boolean).join("|");
  const key = idCandidates[0] || fallbackKey;
  if (!key) return null;
  return {
    id: key,
    tournamentId: idCandidates[0] || "",
    dateISO,
    name: name || "—",
    format: format || "—",
    deck,
    pokemonHints,
    counts,
    wr: computeWr(counts),
  };
};

const deriveResultFromCounts = (counts = {}) => {
  const { W = 0, L = 0, T = 0 } = counts || {};
  if (W > 0 && L === 0 && T === 0) return "W";
  if (L > 0 && W === 0 && T === 0) return "L";
  if (T > 0 && W === 0 && L === 0) return "T";
  return "";
};

const normalizeRound = (round, index = 0) => {
  if (!round || typeof round !== "object") return null;
  const counts = normalizeCounts(round.counts);
  const opponent = round.opponent || round.opponentName || round.enemy || round.opp || "";
  const opponentDeck = round.opponentDeck || round.opponentDeckName || round.oppDeck || round.deckOpponent || "";
  const rawResult =
    (typeof round.result === "string" ? round.result : "") ||
    (typeof round.outcome === "string" ? round.outcome : "") ||
    (typeof round.finalResult === "string" ? round.finalResult : "");
  const normalizedResult = (rawResult ? rawResult.trim().toUpperCase() : "") || deriveResultFromCounts(counts) || "-";
  const roundNumber = round.round ?? round.roundNumber ?? round.number ?? round.roundIndex ?? null;
  const logIdCandidates = [
    round.logId,
    round.logID,
    round.log_id,
    round.eventId,
    round.eventID,
    round.matchLogId,
    round.matchId,
    round.id,
  ]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);
  const logId = logIdCandidates[0] || "";

  const id =
    (round.id && String(round.id).trim()) ||
    logId ||
    (round.matchLogId ? String(round.matchLogId).trim() : "") ||
    (round.matchId ? String(round.matchId).trim() : "") ||
    (round.eventMatchId ? String(round.eventMatchId).trim() : "") ||
    (round.eventId ? `${round.eventId}-${roundNumber ?? index + 1}` : "") ||
    `round-${index}`;
  return {
    id,
    round: roundNumber ?? index + 1,
    opponent: opponent || "—",
    opponentDeck: opponentDeck || "",
    opponentPokemons: round.opponentPokemons || round.oppPokemons,
    eventId: round.eventId || logId || round.matchId || "",
    logId,
    result: normalizedResult,
  };
};

const fetchPhysicalTournaments = async (params = {}) => {
  const search = normalizeSearchPayload(params);
  const mapEntries = (payload) => safeArray(payload).map(normalizeTournament).filter(Boolean);
  try {
    const payload = await listPhysicalTournaments(search);
    const arr = mapEntries(payload);
    if (arr.length) return arr;
  } catch {}
  const usp = new URLSearchParams();
  if (search.query) usp.set("query", search.query);
  if (search.type) usp.set("type", search.type);
  const suffix = usp.toString();
  const fallback = await tryJson(
    `${API}/api/physical/tournaments${suffix ? `?${suffix}` : ""}`,
  );
  return mapEntries(fallback);
};

const fetchPhysicalTournamentRounds = async (id) => {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key) return [];
  const mapRounds = (payload) => safeArray(payload).map((round, index) => normalizeRound(round, index)).filter(Boolean);
  try {
    const payload = await getPhysicalTournament(key);
    const rounds = mapRounds(payload?.rounds ?? payload);
    if (rounds.length) return rounds;
    const tournamentRounds = mapRounds(payload?.tournament);
    if (tournamentRounds.length) return tournamentRounds;
  } catch {}
  const fallback = await tryJson(`${API}/api/physical/tournaments/${encodeURIComponent(key)}`);
  return mapRounds(fallback?.rounds ?? fallback?.tournament ?? fallback);
};

function getSearchFromHash() {
  try {
    const h = window.location.hash || "";
    if (!h.startsWith(BASE_HASH)) return { query: "", type: null };
    const q = h.includes("?") ? h.split("?")[1] : "";
    const usp = new URLSearchParams(q);
    const queryRaw = usp.get("query") || "";
    const typeRaw = usp.get("type");
    const normalizedQuery = typeof queryRaw === "string" ? queryRaw.trim() : "";
    const normalizedTypeFromParam = normalizeTypeFilter(typeRaw);
    if (normalizedTypeFromParam) {
      return { query: "", type: normalizedTypeFromParam };
    }
    const normalizedTypeFromQuery = normalizeTypeFilter(normalizedQuery);
    if (normalizedTypeFromQuery) {
      return { query: "", type: normalizedTypeFromQuery };
    }
    return { query: normalizedQuery, type: null };
  } catch {
    return { query: "", type: null };
  }
}

// ===== Página principal =====
export default function TournamentsLivePage() {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [status, setStatus] = useState("todos");
  const [format, setFormat] = useState("todos");

  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState(null);
  const [openRounds, setOpenRounds] = useState({});

  const ignoreHashChangeRef = useRef(false);

  const syncHash = useCallback((queryValue, typeValue) => {
    try {
      const nextHash = buildHashFromSearch(queryValue, typeValue);
      const currentHash = window.location.hash || "";
      if (nextHash !== currentHash) {
        ignoreHashChangeRef.current = true;
        window.location.hash = nextHash;
      }
    } catch {}
  }, []);

  const runSearch = useCallback(async (searchParams = {}) => {
    try {
      setLoading(true);
      const data = await fetchPhysicalTournaments(searchParams);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const buildSuggestionList = (entries = []) =>
    (Array.isArray(entries) ? entries : [])
      .slice(0, 10)
      .map((t, index) => ({
        key: t.tournamentId || t.id || `${t.name || "torneio"}-${index}`,
        id: t.tournamentId || t.id || "",
        name: t.name || "—",
        dateISO: t.dateISO || "",
      }));

  useEffect(() => {
    let cancelled = false;
    const apply = async (searchParams) => {
      try {
        setLoading(true);
        const data = await fetchPhysicalTournaments(searchParams);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const initial = getSearchFromHash();
    setTypeFilter(initial.type);
    const initialInput = initial.query || (initial.type ? getTypeLabel(initial.type) : "");
    setQ(initialInput);
    apply(initial);
    syncHash(initial.query, initial.type);
    const onHash = () => {
      if (ignoreHashChangeRef.current) {
        ignoreHashChangeRef.current = false;
        return;
      }
      const next = getSearchFromHash();
      setTypeFilter(next.type);
      const nextInput = next.query || (next.type ? getTypeLabel(next.type) : "");
      setQ(nextInput);
      setSuggestionsOpen(false);
      setSuggestions([]);
      apply(next);
      syncHash(next.query, next.type);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHash);
    };
  }, [syncHash]);

  useEffect(() => {
    const unsubscribe = subscribePhysicalRoundsChanged(async (eventId) => {
      const normalizedEventId = (() => {
        if (typeof eventId === "string") return eventId.trim();
        if (eventId == null) return "";
        return String(eventId).trim();
      })();

      setOpenRounds((prev) => {
        if (!normalizedEventId) {
          if (Object.keys(prev).length === 0) return prev;
          return {};
        }
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedEventId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedEventId];
        return next;
      });

      await runSearch(buildSearchParams(q, typeFilter));

      if (!openId) return;

      try {
        const rounds = await fetchPhysicalTournamentRounds(openId);
        setOpenRounds((prev) => ({
          ...prev,
          [openId]: Array.isArray(rounds) ? rounds : [],
        }));
      } catch {
        setOpenRounds((prev) => ({
          ...prev,
          [openId]: [],
        }));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [openId, q, runSearch, typeFilter]);

  async function onChangeQuery(e) {
    const rawValue = e.target.value;
    const trimmed = rawValue.trim();
    const detectedType = normalizeTypeFilter(trimmed);
    const displayValue = detectedType ? getTypeLabel(detectedType) : rawValue;
    setQ(displayValue);
    setTypeFilter(detectedType);
    const shouldOpen = !detectedType && trimmed.length >= 2;
    setSuggestionsOpen(shouldOpen);
    if (shouldOpen) {
      try {
        const payload = await suggestPhysicalTournaments(trimmed);
        const normalized = safeArray(payload).map(normalizeTournament).filter(Boolean);
        const list = normalized.length
          ? normalized
          : await fetchPhysicalTournaments({ query: trimmed });
        setSuggestions(buildSuggestionList(list));
      } catch {
        const fallbackList = await fetchPhysicalTournaments({ query: trimmed });
        setSuggestions(buildSuggestionList(fallbackList));
      }
    } else {
      setSuggestions([]);
    }
    const searchParams = buildSearchParams(displayValue, detectedType);
    await runSearch(searchParams);
    syncHash(searchParams.query, searchParams.type);
  }

  async function selectSuggestion(s) {
    const v = s?.name || s?.id || "";
    setQ(v);
    setTypeFilter(null);
    setSuggestionsOpen(false);
    setSuggestions([]);
    const searchParams = buildSearchParams(v, null);
    await runSearch(searchParams);
    syncHash(searchParams.query, searchParams.type);
  }

  const filtered = useMemo(() => {
    let arr = [...rows];
    if (typeFilter) {
      arr = arr.filter((t) => {
        const rawType = t?.format || t?.eventType || t?.type;
        return normalizeTypeFilter(rawType) === typeFilter;
      });
    }
    if (status !== "todos") { arr = arr.filter(() => true); }
    if (format !== "todos") { arr = arr.filter(() => true); }
    arr.sort((a,b)=> String(b.dateISO || b.date || "").localeCompare(String(a.dateISO || a.date || "")));
    return arr;
  }, [rows, status, format, typeFilter]);

  const aggregates = useMemo(() => {
    const a = filtered.reduce((acc, t) => {
      const c = normalizeCounts(t.counts);
      acc.count += 1;
      acc.w += c.W || 0;
      acc.l += c.L || 0;
      acc.t += c.T || 0;
      acc.matches += (c.W || 0) + (c.L || 0) + (c.T || 0);
      return acc;
    }, { count: 0, matches: 0, w: 0, l: 0, t: 0 });
    return { ...a, wr: WR(a.w, a.l, a.t), pts: PTS(a.w, a.l, a.t) };
  }, [filtered]);

  async function toggleOpen(id) {
    const key = typeof id === "string" ? id : "";
    if (!key) return;
    if (openId === key) { setOpenId(null); return; }
    setOpenId(key);
    if (!openRounds[key]) {
      try {
        const rounds = await fetchPhysicalTournamentRounds(key);
        setOpenRounds((prev) => ({ ...prev, [key]: Array.isArray(rounds) ? rounds : [] }));
      } catch {
        setOpenRounds((prev) => ({ ...prev, [key]: [] }));
      }
    }
  }

  const buildRoundHref = (round) => {
    if (!round || typeof round !== "object") return null;
    const targetRaw = round.logId || round.eventId || round.id || "";
    const targetId = typeof targetRaw === "string" ? targetRaw.trim() : String(targetRaw || "").trim();
    if (!targetId) return null;
    const encodedId = encodeURIComponent(targetId);

    let params = new URLSearchParams();
    try {
      const currentHash = window.location.hash || "";
      const queryPart = currentHash.includes("?") ? currentHash.split("?")[1] : "";
      if (queryPart) {
        const currentParams = new URLSearchParams(queryPart);
        const keysToPreserve = ["from", "type", "store", "date", "query"];
        keysToPreserve.forEach((key) => {
          const value = currentParams.get(key);
          if (value) params.set(key, value);
        });
      }
    } catch {
      params = new URLSearchParams();
    }

    if (!params.has("from")) params.set("from", "torneios");
    const suffix = params.toString();
    return `#/tcg-fisico/eventos/${encodedId}${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            <a href={BASE_HASH} className="hover:underline">Torneios — TCG Físico</a>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Acompanhe o desempenho em torneios presenciais registrados. Busque pelo nome ou identificador para filtrar rapidamente os resultados.
          </p>
        </header>

        <section className="mb-6">
          <div className="relative">
            <input
              value={q}
              onChange={onChangeQuery}
              placeholder="Buscar por torneio físico (nome ou ID)"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            {suggestionsOpen && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
                {suggestions.map((s) => (
                  <button
                    key={s.key || s.id || s.name}
                    onClick={() => selectSuggestion(s)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800"
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-zinc-500">{fmtDate(s.dateISO)} · {s.id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi label="Torneios" value={aggregates.count} hint="após filtros" />
          <Kpi label="Win Rate" value={`${aggregates.wr}%`} hint={`${aggregates.w}W • ${aggregates.l}L • ${aggregates.t}T`} />
          <Kpi label="Pontos" value={aggregates.pts} hint={`${aggregates.matches} partidas`} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/70 text-zinc-400">
              <tr>
                <Th>Data</Th>
                <Th>Torneio</Th>
                <Th className="hidden md:table-cell">Formato</Th>
                <Th className="hidden md:table-cell">Deck</Th>
                <Th className="text-center">Resultado</Th>
                <Th className="text-center">WR</Th>
                <Th className="text-right">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400">Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400">Nenhum torneio encontrado.</td></tr>
              ) : filtered.map((t, i) => {
                const counts = normalizeCounts(t.counts);
                const wr = Number.isFinite(t.wr) ? t.wr : WR(counts.W, counts.L, counts.T);
                const dateISO = t.dateISO || "";
                const name = t.name || "—";
                const format = t.format || "—";
                const deckLabel = prettyDeckKey(t.deck || "") || "—";
                const tournamentId = t.tournamentId || t.id || "";
                const rowKey = tournamentId || `${name}-${dateISO}-${i}`;
                const canOpen = Boolean(tournamentId);
                const rounds = openRounds[tournamentId] || [];

                return (
                  <React.Fragment key={rowKey}>
                    <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
                      <Td>{fmtDate(dateISO)}</Td>
                      <Td><span className="truncate font-medium">{name}</span></Td>
                      <Td className="hidden md:table-cell text-zinc-300">{format}</Td>
                      <Td className="hidden md:table-cell text-zinc-300"><DeckLabel deckName={deckLabel} pokemonHints={t.pokemonHints} /></Td>
                      <Td className="text-center">
                        <div className="inline-flex items-center gap-1 text-xs">
                          <span className="px-2 py-0.5 rounded-md bg-green-900/40 text-green-300 border border-green-800">W{counts.W}</span>
                          <span className="px-2 py-0.5 rounded-md bg-rose-900/40 text-rose-300 border border-rose-800">L{counts.L}</span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-900/40 text-amber-300 border border-amber-800">T{counts.T}</span>
                        </div>
                      </Td>
                      <Td className="text-center">{wr}%</Td>
                      <Td className="px-4 py-3 text-right">
                        {canOpen ? (
                          <button
                            type="button"
                            onClick={() => toggleOpen(tournamentId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700 transition"
                          >
                            {openId === tournamentId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>Partidas</span>
                          </button>
                        ) : <span className="text-zinc-600">—</span>}
                      </Td>
                    </tr>
                    {openId === tournamentId && (
                      <tr className="bg-zinc-950/60">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="text-sm text-zinc-300">Partidas</div>
                          <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800">
                            <table className="w-full text-sm">
                              <thead className="border-b border-zinc-800 text-zinc-400">
                                <tr>
                                  <th className="px-3 py-2 text-left">Round</th>
                                  <th className="px-3 py-2 text-left">Oponente</th>
                                  <th className="px-3 py-2 text-left">Deck do oponente</th>
                                  <th className="px-3 py-2 text-center">Resultado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rounds.length === 0 ? (
                                  <tr><td colSpan={4} className="px-3 py-3 text-center text-zinc-500">Sem partidas registradas.</td></tr>
                                ) : rounds.map((r, idx) => {
                                  const roundHref = buildRoundHref(r);
                                  const roundKey = r.id || r.logId || `${tournamentId}-round-${idx}`;
                                  const rowClass = roundHref ? "border-b border-zinc-800 hover:bg-zinc-900/60 cursor-pointer" : "border-b border-zinc-800";
                                  const onClick = roundHref
                                    ? (event) => {
                                        event?.stopPropagation?.();
                                        try {
                                          window.location.hash = roundHref;
                                        } catch {}
                                      }
                                    : undefined;
                                  return (
                                    <tr key={roundKey} className={rowClass} onClick={onClick}>
                                      <td className="px-3 py-2">{r.round || "-"}</td>
                                      <td className="px-3 py-2">{r.opponent || "-"}</td>
                                      <td className="px-3 py-2"><DeckLabel deckName={prettyDeckKey(r.opponentDeck || "-")} pokemonHints={r.opponentPokemons || r.oppPokemons} /></td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded-md text-xs border ${
                                          r.result === 'W' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-700' :
                                          r.result === 'L' ? 'bg-rose-500/10 text-rose-300 border-rose-700' :
                                                            'bg-amber-500/10 text-amber-300 border-amber-700'
                                        }`}>{r.result || "-"}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </section>

        <p className="mt-4 text-xs text-zinc-500">Regras: Pontos=3·W+1·T; WR=W/(W+L+T).</p>
      </div>
    </div>
  );
}
// ===== UI helpers =====
function Th({ children, className = "" }) { return <th className={`px-4 py-3 text-left font-medium ${className}`}>{children}</th>; }
function Td({ children, className = "" }) { return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>; }
function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}
