// src/pages/PhysicalStoreEventsPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import ptBR from "date-fns/locale/pt-BR";

import { getEvent } from "../eventsRepo.js";
import { getPhysicalLogs } from "../services/api.js";
import { getPhysicalRounds } from "../services/physicalApi.js";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import { selectStoreFocusedMatches, STORE_FOCUSED_EVENT_TYPES } from "../PhysicalPageV2.jsx";
import { dateKeyFromTs, tsFromDateKey } from "../utils/tz.js";
import { subscribePhysicalRoundsChanged } from "../utils/physicalRoundsBus.js";

// Função utilitária para normalizar strings
const slugify = (s = "") => s
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase();

const deriveStoreMetadata = (value) => {
  const name = String(value || "").trim();
  if (!name) {
    return { name: "", identifier: "" };
  }
  const slug = slugify(name);
  const fallback = name.toLowerCase().replace(/\s+/g, "-");
  const identifier = slug || fallback || name.toLowerCase();
  return { name, identifier };
};

const DEFAULT_LOG_PAGE_SIZE = 1000;
const MAX_LOG_PAGE_SIZE = 10000;
const MAX_LOG_REQUESTS = 200;

const clampPageSize = (value, fallback = DEFAULT_LOG_PAGE_SIZE) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const bounded = Math.floor(numeric);
  if (!Number.isFinite(bounded) || bounded <= 0) return fallback;
  return Math.min(bounded, MAX_LOG_PAGE_SIZE);
};

const parseDateValue = (value) => {
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isNaN(ts) ? null : ts;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const fromDateKey = tsFromDateKey(str);
  if (Number.isFinite(fromDateKey)) return fromDateKey;
  const numeric = Number(str);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(str);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeResultToken = (value) => {
  if (value == null) return null;
  const token = String(value).trim().toUpperCase();
  if (!token) return null;
  if (token === "W" || token === "V" || token.startsWith("WIN")) return "W";
  if (token === "L" || token === "D" || token.startsWith("LOS")) return "L";
  if (token === "T" || token === "E" || token.startsWith("EMP") || token.startsWith("TIE")) return "T";
  return null;
};

const normalizeStoreEventTypeKey = (value) => {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return "";
  if (token.includes("liga") || token.includes("league") || token.includes("local")) return "local";
  if (token.includes("amist")) return "local";
  if (token.includes("treino")) return "local";
  if (token === "clp" || token.includes("challenge")) return "challenge";
  if (token.includes("cup") || token.includes("copa")) return "cup";
  return token;
};

const ensurePokemonHints = (list) => {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (!entry) continue;
    let candidate = null;
    if (typeof entry === "string") candidate = entry;
    else if (typeof entry === "object") candidate = entry.slug || entry.name || entry.id || null;
    if (!candidate) continue;
    const value = String(candidate).trim();
    if (!value) continue;
    if (!out.includes(value)) out.push(value);
    if (out.length >= 4) break;
  }
  return out;
};

const toDeckKeySlug = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const deriveDeckLabel = ({ keyCandidates = [], nameCandidates = [] } = {}) => {
  const normalizedKeys = keyCandidates
    .map((candidate) => toDeckKeySlug(candidate))
    .filter(Boolean);
  for (const key of normalizedKeys) {
    const pretty = prettyDeckKey(key);
    if (pretty) return { label: pretty, key };
  }

  const normalizedFromNames = nameCandidates
    .map((candidate) => toDeckKeySlug(candidate))
    .filter(Boolean);
  for (const key of normalizedFromNames) {
    const pretty = prettyDeckKey(key);
    if (pretty) return { label: pretty, key };
  }

  const fallback = nameCandidates.find((name) => typeof name === "string" && name.trim());
  return { label: fallback ? fallback.trim() : "", key: "" };
};

const selectStoreNameFromDetail = (detail = {}, row = {}) => {
  const raw =
    detail.storeOrCity ||
    detail.local ||
    detail.storeName ||
    detail.store ||
    row.storeName ||
    row.storeOrCity ||
    row.store ||
    "";
  const value = String(raw || "").trim();
  return value || null;
};

const enrichLogRowWithDetail = (row = {}, detail = {}) => {
  const enriched = { ...row };
  const storeName = selectStoreNameFromDetail(detail, row);
  const normalizedStoreName = storeName || (typeof row?.storeName === "string" ? row.storeName.trim() : "");
  enriched.storeName = normalizedStoreName || "";

  const eventTypeCandidate =
    row?.eventType ||
    row?.type ||
    detail?.type ||
    detail?.tipo ||
    detail?.eventType ||
    detail?.kind ||
    "";
  if (eventTypeCandidate && !enriched.eventType) {
    enriched.eventType = eventTypeCandidate;
  }
  if (eventTypeCandidate && !enriched.type) {
    enriched.type = eventTypeCandidate;
  }

  return enriched;
};

const sumCounts = (counts = {}) => {
  const w = Number(counts?.w) || 0;
  const l = Number(counts?.l) || 0;
  const t = Number(counts?.t) || 0;
  return w + l + t;
};

const computeRoundOutcome = (round = {}) => {
  const flags = round?.flags || round;
  if (flags?.bye || flags?.noShow) return "W";
  const games = [round?.g1, round?.g2, round?.g3];
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const game of games) {
    const token = normalizeResultToken(game?.result);
    if (token === "W") wins += 1;
    else if (token === "L") losses += 1;
    else if (token === "T") ties += 1;
  }
  if (wins > losses) return "W";
  if (losses > wins) return "L";
  if (wins || losses || ties) return "T";
  return null;
};

const computeCountsFromRounds = (rounds = [], fallbackMatches = []) => {
  let w = 0;
  let l = 0;
  let t = 0;

  if (Array.isArray(rounds) && rounds.length) {
    for (const round of rounds) {
      const outcome = computeRoundOutcome(round);
      if (outcome === "W") w += 1;
      else if (outcome === "L") l += 1;
      else if (outcome === "T") t += 1;
    }
  }

  if (w || l || t) {
    return { w, l, t };
  }

  if (Array.isArray(fallbackMatches) && fallbackMatches.length) {
    for (const match of fallbackMatches) {
      const outcome =
        normalizeResultToken(match?.result) ||
        normalizeResultToken(match?.outcome) ||
        normalizeResultToken(match?.finalResult);
      if (outcome === "W") w += 1;
      else if (outcome === "L") l += 1;
      else if (outcome === "T") t += 1;
    }
  }

  return { w, l, t };
};

const extractEventTimestamp = (detail = {}, sampleRow = {}) => {
  const candidates = [
    detail.dateKey,
    detail.date,
    detail.startDate,
    detail.startAt,
    detail.createdAt,
    detail.updatedAt,
    detail.ts,
    sampleRow.dateKey,
    sampleRow.date,
    sampleRow.createdAt,
    sampleRow.updatedAt,
    sampleRow.ts,
  ];

  for (const value of candidates) {
    const ts = parseDateValue(value);
    if (ts != null) return ts;
  }

  return null;
};

const dayKeyFromTimestamp = (timestamp) => {
  if (timestamp == null) return "sem-data";
  if (Number.isFinite(timestamp)) {
    try {
      const key = dateKeyFromTs(timestamp);
      if (key) return key;
    } catch (err) {
      // ignore formatter issues and fallback to ISO logic below
    }
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "sem-data";
  return date.toISOString().slice(0, 10);
};

const fetchAllPhysicalLogs = async (options = {}) => {
  const { pageSize, ...rest } = options || {};
  const limit = clampPageSize(pageSize);
  const aggregatedRows = [];
  let offset = 0;
  let total = null;
  let iterations = 0;

  while (iterations < MAX_LOG_REQUESTS) {
    iterations += 1;
    const payload = await getPhysicalLogs({ ...rest, limit, offset });
    const chunk = Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
      ? payload
      : [];

    if (chunk.length) {
      aggregatedRows.push(...chunk);
    }

    if (typeof payload?.total === "number" && payload.total >= 0) {
      total = payload.total;
    }

    offset += chunk.length;

    const expectedTotal = typeof total === "number" && total >= 0 ? total : null;
    if (expectedTotal != null && offset >= expectedTotal) break;
    if (chunk.length < limit) break;
  }

  const ensuredTotal = typeof total === "number" && total >= 0 ? total : aggregatedRows.length;

  return { rows: aggregatedRows, total: ensuredTotal };
};

const buildGroupedStoreEvents = (events = [], roundsCache = new Map()) => {
  const storeMap = new Map();

  for (const entry of events) {
    if (!entry) continue;
    const eventId = entry?.id || entry?.eventId;
    if (!eventId) continue;

    const rows = Array.isArray(entry?.rows) ? entry.rows : [];
    const detail = entry?.detail || {};
    const sampleRow = rows[0] || {};

    const roundsEntry = roundsCache instanceof Map ? roundsCache.get(eventId) : null;
    const cachedRounds = roundsEntry && Array.isArray(roundsEntry.rounds) ? roundsEntry.rounds : null;
    const roundsCandidate = cachedRounds || detail.rounds;

    const rounds = Array.isArray(roundsCandidate) ? roundsCandidate : [];

    const storeNameRaw =
      detail.storeName ||
      detail.storeOrCity ||
      detail.local ||
      sampleRow.storeName ||
      sampleRow.store ||
      sampleRow.storeOrCity ||
      "";
    const { name: storeName, identifier: storeIdentifier } =
      deriveStoreMetadata(storeNameRaw);
    if (!storeName) continue;
    const storeKey = storeIdentifier || storeName.toLowerCase();

    const timestamp = extractEventTimestamp(detail, sampleRow);
    const dayKey = dayKeyFromTimestamp(timestamp);
    const dateKey = dayKey !== "sem-data" ? dayKey : null;

    const counts = computeCountsFromRounds(rounds, rows);

    const eventTypeRaw =
      detail.type ||
      detail.eventType ||
      detail.kind ||
      sampleRow.eventType ||
      sampleRow.type ||
      "";
    const eventTypeKey =
      normalizeStoreEventTypeKey(eventTypeRaw) ||
      normalizeStoreEventTypeKey(sampleRow.eventType) ||
      normalizeStoreEventTypeKey(sampleRow.type);
    const title =
      detail.name ||
      detail.title ||
      detail.eventName ||
      detail.tourneyName ||
      sampleRow.title ||
      sampleRow.eventName ||
      sampleRow.tourneyName ||
      sampleRow.notes ||
      eventId;

    if (eventTypeKey && !STORE_FOCUSED_EVENT_TYPES.has(eventTypeKey)) {
      continue;
    }

    const eventEntry = {
      id: eventId,
      title,
      eventType: eventTypeRaw || sampleRow.eventType || eventTypeKey,
      eventTypeKey,
      date: timestamp,
      dateKey,
      rounds,
      results: counts,
      detail,
      matches: rows,
      storeName,
      storeIdentifier: storeIdentifier || storeKey,
    };

    let storeEntry = storeMap.get(storeKey);
    if (!storeEntry) {
      storeEntry = {
        storeName,
        identifier: storeIdentifier || storeKey,
        days: new Map(),
      };
      storeMap.set(storeKey, storeEntry);
    }

    let dayEntry = storeEntry.days.get(dayKey);
    if (!dayEntry) {
      dayEntry = { day: dayKey, events: [] };
      storeEntry.days.set(dayKey, dayEntry);
    }

    dayEntry.events.push(eventEntry);
  }

  const dayToTimestamp = (day) => {
    if (!day || day === "sem-data") return 0;
    const parsed = Date.parse(day);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return Array.from(storeMap.values())
    .map((store) => ({
      storeName: store.storeName,
      identifier: store.identifier,
      days: Array.from(store.days.values())
        .map((day) => ({
          ...day,
          events: day.events.slice().sort((a, b) => (b.date || 0) - (a.date || 0)),
        }))
        .sort((a, b) => dayToTimestamp(b.day) - dayToTimestamp(a.day)),
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName, "pt-BR"));
};

function PartidasChips({ counts = {} }) {
  const w = Number(counts?.w) || 0;
  const l = Number(counts?.l) || 0;
  const t = Number(counts?.t) || 0;
  const total = sumCounts(counts);

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-700/40">W {w}</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-600/20 text-rose-400 border border-rose-700/40">L {l}</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 border border-amber-700/40">E {t}</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-700/30 text-zinc-300 border border-zinc-600/40">Total {total}</span>
    </div>
  );
}

const parseRoundNumber = (entry) => {
  const candidates = [entry?.number, entry?.roundNumber, entry?.round, entry?.idx, entry?.index];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
};

const computeOrderValue = (entry, fallbackIndex = 0) => {
  const roundNumber = parseRoundNumber(entry);
  if (roundNumber != null) return roundNumber;

  const timestampCandidates = [entry?.date, entry?.createdAt, entry?.updatedAt, entry?.ts, entry?.startAt];
  for (const value of timestampCandidates) {
    const parsed = parseDateValue(value);
    if (parsed != null) return parsed;
  }

  return fallbackIndex;
};

const buildMatchEntryFromRound = (round, index) => {
  const numericRound = parseRoundNumber(round);
  const roundLabel = numericRound != null ? `R${numericRound}` : `R${index + 1}`;
  const result = computeRoundOutcome(round);
  const opponentName =
    round?.opponentName ||
    round?.opponent ||
    round?.oppName ||
    round?.enemy ||
    "";

  const playerDeck = deriveDeckLabel({
    keyCandidates: [round?.playerDeckKey, round?.deckKey, round?.playerDeckSlug],
    nameCandidates: [round?.playerDeckName, round?.playerDeck, round?.deckName, round?.deck],
  });

  const opponentDeck = deriveDeckLabel({
    keyCandidates: [round?.opponentDeckKey, round?.oppDeckKey, round?.opponentDeckSlug],
    nameCandidates: [round?.opponentDeckName, round?.opponentDeck, round?.oppDeck, round?.deckOpponent],
  });

  const userPokemons = ensurePokemonHints(
    round?.userPokemons || round?.playerPokemons || round?.myPokemons || round?.pokemons,
  );
  const opponentPokemons = ensurePokemonHints(
    round?.opponentPokemons || round?.oppPokemons || round?.enemyPokemons,
  );

  return {
    id: round?.id || `round-${index}`,
    order: computeOrderValue(round, index),
    roundLabel,
    opponent: opponentName,
    playerDeck,
    opponentDeck,
    userPokemons,
    opponentPokemons,
    result: result || "",
  };
};

const buildMatchEntryFromLog = (match, index) => {
  const opponentName =
    match?.opponent ||
    match?.opponentName ||
    match?.enemy ||
    match?.opponentUser ||
    match?.opponent_username ||
    "";

  const playerDeck = deriveDeckLabel({
    keyCandidates: [match?.playerDeckKey, match?.deckKey, match?.deckSlug],
    nameCandidates: [
      match?.playerDeck,
      match?.deckName,
      match?.deck,
      match?.userDeck,
      match?.userDeckName,
    ],
  });

  const opponentDeck = deriveDeckLabel({
    keyCandidates: [match?.opponentDeckKey, match?.oppDeckKey, match?.opponentDeckSlug],
    nameCandidates: [
      match?.opponentDeck,
      match?.opponentDeckName,
      match?.oppDeck,
      match?.deckOpponent,
      match?.opponentDeckTitle,
    ],
  });

  const userPokemons = ensurePokemonHints(
    match?.userPokemons || match?.myPokemons || match?.pokemons || match?.playerPokemons,
  );
  const opponentPokemons = ensurePokemonHints(
    match?.opponentPokemons || match?.oppPokemons || match?.enemyPokemons,
  );

  const result =
    normalizeResultToken(match?.result) ||
    normalizeResultToken(match?.outcome) ||
    normalizeResultToken(match?.finalResult) ||
    "";

  const roundLabel = (() => {
    const numeric = parseRoundNumber(match);
    if (numeric != null) return `R${numeric}`;
    const name = match?.roundName || match?.stage;
    return name ? String(name) : `Jogo ${index + 1}`;
  })();

  return {
    id: match?.rowId || match?.logId || match?.id || `match-${index}`,
    order: computeOrderValue(match, index),
    roundLabel,
    opponent: opponentName,
    playerDeck,
    opponentDeck,
    userPokemons,
    opponentPokemons,
    result,
  };
};

const buildEventMatches = (event = {}, roundsEntry) => {
  const rounds = Array.isArray(roundsEntry?.rounds) ? roundsEntry.rounds : [];
  const hasRounds = rounds.length > 0;
  const matchesSource = hasRounds ? rounds : event?.matches;
  const normalized = Array.isArray(matchesSource) ? matchesSource : [];

  const mapped = hasRounds
    ? normalized.map((round, index) => buildMatchEntryFromRound(round, index))
    : normalized.map((match, index) => buildMatchEntryFromLog(match, index));

  return mapped
    .filter((entry) => entry && (entry.opponent || entry.playerDeck.label || entry.opponentDeck.label))
    .sort((a, b) => a.order - b.order);
};

export default function PhysicalStoreEventsPage() {
  const [selectedStore, setSelectedStore] = useState("");
  const [baseEvents, setBaseEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [roundsCache, setRoundsCache] = useState(() => new Map());
  const [expandedRows, setExpandedRows] = useState({});
  const expandedRowsRef = useRef({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    expandedRowsRef.current = expandedRows;
  }, [expandedRows]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const parse = () => {
      const hash = window.location.hash || "";
      const parts = hash.split("/");
      const idx = parts.findIndex((p) => p === "loja");
      const raw =
        idx !== -1 && parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : "";
      const { identifier } = deriveStoreMetadata(raw);
      setSelectedStore(identifier || "");
    };
    parse();
    window.addEventListener("hashchange", parse);
    return () => window.removeEventListener("hashchange", parse);
  }, []);

  const load = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const logsResult = await fetchAllPhysicalLogs({ pageSize: DEFAULT_LOG_PAGE_SIZE });
      if (!isMountedRef.current) return;

      const rows = Array.isArray(logsResult?.rows) ? logsResult.rows : [];

      const eventIdSet = new Set();
      for (const row of rows) {
        const eventId = row?.eventId || row?.id;
        if (eventId) {
          eventIdSet.add(eventId);
        }
      }

      const eventIds = Array.from(eventIdSet.values());
      const detailsMap = new Map();
      const CHUNK_SIZE = 8;

      for (let i = 0; i < eventIds.length; i += CHUNK_SIZE) {
        const chunk = eventIds.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunk.map(async (eventId) => {
            try {
              const detail = await getEvent(eventId);
              return [eventId, detail];
            } catch (err) {
              console.warn(`[PhysicalStoreEventsPage] falha ao carregar evento ${eventId}`, err);
              return [eventId, null];
            }
          }),
        );
        if (!isMountedRef.current) return;
        for (const [eventId, detail] of chunkResults) {
          detailsMap.set(eventId, detail || {});
        }
      }

      const enrichedRows = rows.map((row) => {
        const eventId = row?.eventId || row?.id;
        const detail = (eventId ? detailsMap.get(eventId) : null) || {};
        return enrichLogRowWithDetail(row, detail);
      });

      const filteredRows = selectStoreFocusedMatches(enrichedRows);

      const rowsByEventId = new Map();
      for (const row of filteredRows) {
        const eventId = row?.eventId || row?.id;
        if (!eventId) continue;
        if (!rowsByEventId.has(eventId)) rowsByEventId.set(eventId, []);
        rowsByEventId.get(eventId).push(row);
      }

      const events = Array.from(rowsByEventId.keys()).map((eventId) => ({
        id: eventId,
        rows: rowsByEventId.get(eventId) || [],
        detail: detailsMap.get(eventId) || {},
      }));
      if (!isMountedRef.current) return;
      setBaseEvents(events);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("[PhysicalStoreEventsPage] falha ao carregar logs físicos", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setBaseEvents([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ensureRoundsLoaded = useCallback(
    (eventId) => {
      if (!eventId) return;

      let shouldFetch = false;
      setRoundsCache((prev) => {
        const existing = prev.get(eventId);
        if (existing && (existing.status === "loading" || existing.status === "loaded")) {
          shouldFetch = false;
          return prev;
        }
        shouldFetch = true;
        const next = new Map(prev);
        next.set(eventId, {
          status: "loading",
          rounds: Array.isArray(existing?.rounds) ? existing.rounds : [],
        });
        return next;
      });

      if (!shouldFetch) return;

      (async () => {
        try {
          const rounds = await getPhysicalRounds(eventId);
          if (!isMountedRef.current) return;
          setRoundsCache((prev) => {
            const next = new Map(prev);
            next.set(eventId, {
              status: "loaded",
              rounds: Array.isArray(rounds) ? rounds : [],
            });
            return next;
          });
        } catch (err) {
          console.warn(
            `[PhysicalStoreEventsPage] falha ao carregar rounds do evento ${eventId}`,
            err,
          );
          if (!isMountedRef.current) return;
          setRoundsCache((prev) => {
            const next = new Map(prev);
            next.set(eventId, { status: "error", error: err, rounds: [] });
            return next;
          });
        }
      })();
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = subscribePhysicalRoundsChanged((eventId) => {
      if (!isMountedRef.current) return;

      setRoundsCache((prev) => {
        if (!eventId) {
          if (prev.size === 0) return prev;
          return new Map();
        }
        if (!prev.has(eventId)) return prev;
        const next = new Map(prev);
        next.delete(eventId);
        return next;
      });

      load();

      if (eventId && expandedRowsRef.current?.[eventId]) {
        Promise.resolve().then(() => ensureRoundsLoaded(eventId));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [load, ensureRoundsLoaded]);

  const groupedEvents = useMemo(
    () => buildGroupedStoreEvents(baseEvents, roundsCache),
    [baseEvents, roundsCache],
  );

  const stores = useMemo(
    () =>
      groupedEvents.map((store) => ({
        name: store.storeName,
        identifier: store.identifier,
      })),
    [groupedEvents],
  );

  const allEvents = useMemo(() => {
    const rows = [];
    for (const store of groupedEvents) {
      for (const day of store.days) {
        for (const event of day.events) {
          rows.push({
            id: event.id,
            title: event.title,
            eventType: event.eventType,
            eventTypeKey: event.eventTypeKey,
            date: event.date,
            storeName: event.storeName || store.storeName,
            storeIdentifier: event.storeIdentifier || store.identifier,
            rounds: event.rounds,
            results: event.results,
            matches: event.matches,
            detail: event.detail,
          });
        }
      }
    }
    rows.sort((a, b) => (b.date || 0) - (a.date || 0));
    return rows;
  }, [groupedEvents]);

  const filtered = useMemo(() => {
    const byType = allEvents.filter((ev) => {
      const normalized = ev.eventTypeKey || normalizeStoreEventTypeKey(ev.eventType);
      return !normalized || STORE_FOCUSED_EVENT_TYPES.has(normalized);
    });
    if (!selectedStore) return byType;
    return byType.filter((ev) => ev.storeIdentifier === selectedStore);
  }, [allEvents, selectedStore]);

  const toggleRow = useCallback(
    (eventId) => {
      if (!eventId) return;
      setExpandedRows((prev) => {
        const isExpanded = Boolean(prev[eventId]);
        const next = { ...prev, [eventId]: !isExpanded };
        if (!isExpanded) {
          Promise.resolve().then(() => ensureRoundsLoaded(eventId));
        }
        return next;
      });
    },
    [ensureRoundsLoaded],
  );

  return (
    <div className="min-h-screen w-full text-zinc-100 bg-zinc-950">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto px-6 pt-10 pb-4">
        <h1 className="text-3xl font-bold">Eventos por Loja</h1>
        <p className="text-zinc-400 mt-2">CLP, CUP, Challenge e Liga Local</p>
        <a href="#/tcg-fisico/torneios" className="inline-flex items-center gap-2 text-zinc-300 hover:text-white mt-3">
          <ChevronLeft size={18} /> Voltar
        </a>
      </div>

      {/* CONTROLS */}
      <div className="max-w-7xl mx-auto px-6 grid gap-4">
        {!selectedStore ? (
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Filtrar por loja:</label>
            <select
              className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-3"
              defaultValue=""
              onChange={(e) => {
                const identifier = e.target.value;
                if (!identifier) return;
                window.location.hash = `#/tcg-fisico/eventos/loja/${encodeURIComponent(
                  identifier,
                )}`;
              }}
            >
              <option value="" disabled>Selecione</option>
              {stores.map((store) => (
                <option
                  key={store.identifier || store.name}
                  value={store.identifier || store.name}
                >
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <button
            className="text-sm text-zinc-400 hover:text-white"
            onClick={() => (window.location.hash = "#/tcg-fisico/eventos/loja")}
          >
            Limpar filtro
          </button>
        )}

        {isLoading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            Carregando eventos físicos...
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
            Falha ao carregar eventos: {error.message || "erro inesperado"}
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-5">
            <div className="text-xs uppercase tracking-wide text-zinc-400">Eventos</div>
            <div className="mt-2 text-4xl font-semibold">{filtered.length}</div>
            <div className="text-xs mt-1 text-zinc-500">após filtros</div>
          </div>
          {/* Aqui pode-se calcular WR e Pontos como na página de torneios físico */}
        </div>

        {/* TABELA */}
        <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/50">
          <div className="grid grid-cols-[120px_1.4fr_1fr_1fr_160px] px-5 py-3 text-xs uppercase tracking-wide text-zinc-400 bg-zinc-900 border-b border-zinc-800">
            <div>Dia</div>
            <div>Evento</div>
            <div>Loja</div>
            <div>Partidas</div>
            <div className="text-right">Ação</div>
          </div>

          {filtered.map((ev) => {
            const isExpanded = Boolean(expandedRows[ev.id]);
            const roundsEntry = roundsCache.get(ev.id) || {};
            const matches = buildEventMatches(ev, roundsEntry);
            const roundStatus = roundsEntry?.status;
            const storeLabel = ev.storeName || ev.detail?.storeName || ev.detail?.storeOrCity || "—";
            const displayDate = (() => {
              if (ev.dateKey) {
                const [y, m, d] = ev.dateKey.split("-");
                if (y && m && d) {
                  return `${d}/${m}/${y}`;
                }
              }
              if (ev.date != null) {
                const dateObj = new Date(ev.date);
                if (!Number.isNaN(dateObj.getTime())) {
                  return format(dateObj, "dd/MM/yyyy", { locale: ptBR });
                }
              }
              return "—";
            })();

            const renderResultTone = (result) => {
              if (result === "W") return "text-emerald-400";
              if (result === "L") return "text-rose-400";
              if (result === "T") return "text-amber-300";
              return "text-zinc-300";
            };

            return (
              <div key={ev.id} className="border-b border-zinc-800/60">
                <div className="grid grid-cols-[120px_1.4fr_1fr_1fr_160px] items-center px-5 py-4 gap-4 hover:bg-zinc-900/70 transition-colors">
                  <div className="text-zinc-200">
                    {displayDate}
                  </div>
                  <div className="text-zinc-300 truncate" title={ev.title || ev.eventType}>
                    {ev.title || ev.eventType || "—"}
                  </div>
                  <div className="text-zinc-300 truncate" title={storeLabel}>
                    {storeLabel}
                  </div>
                  <div>
                    <PartidasChips counts={ev?.results} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRow(ev.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700 transition"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span>Partidas</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5">
                    <div className="mt-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/70 overflow-hidden">
                      <div className="grid grid-cols-[90px_1.2fr_1.2fr_1.2fr_70px] px-4 py-3 text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-900/80">
                        <div>Round</div>
                        <div>Oponente</div>
                        <div>Deck do Oponente</div>
                        <div>Seu Deck</div>
                        <div className="text-right">W/L/T</div>
                      </div>

                      {roundStatus === "loading" && (
                        <div className="px-4 py-4 text-sm text-zinc-300">Carregando partidas...</div>
                      )}

                      {roundStatus === "error" && (
                        <div className="px-4 py-4 text-sm text-rose-300 flex items-center justify-between gap-4">
                          <span>Falha ao carregar rounds deste evento.</span>
                          <button
                            type="button"
                            className="px-3 py-1 rounded-lg border border-rose-500/60 text-rose-200 hover:bg-rose-500/20"
                            onClick={() => ensureRoundsLoaded(ev.id)}
                          >
                            Tentar novamente
                          </button>
                        </div>
                      )}

                      {roundStatus !== "loading" && matches.length === 0 && (
                        <div className="px-4 py-4 text-sm text-zinc-300">Nenhuma partida registrada para este evento.</div>
                      )}

                      {matches.map((match) => {
                        const handleMatchClick = (event) => {
                          event.stopPropagation();
                          window.location.hash = `#/tcg-fisico/eventos/${ev.id}`;
                        };

                        return (
                          <button
                            type="button"
                            key={match.id}
                            onClick={handleMatchClick}
                            className="grid w-full grid-cols-[90px_1.2fr_1.2fr_1.2fr_70px] items-center px-4 py-3 text-left text-sm border-t border-zinc-800/50 bg-transparent transition-colors cursor-pointer hover:bg-zinc-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400/60"
                          >
                            <div className="text-zinc-400">{match.roundLabel}</div>
                            <div className="text-zinc-200 truncate" title={match.opponent || "—"}>
                              {match.opponent || "—"}
                            </div>
                            <div className="min-w-0">
                              <DeckLabel
                                deckName={match.opponentDeck.label || "—"}
                                pokemonHints={match.opponentPokemons}
                              />
                            </div>
                            <div className="min-w-0">
                              <DeckLabel
                                deckName={match.playerDeck.label || "—"}
                                pokemonHints={match.userPokemons}
                              />
                            </div>
                            <div className={`text-right font-semibold ${renderResultTone(match.result)}`}>
                              {match.result || "—"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && !isLoading && (
            <div className="p-6 text-zinc-400 text-sm">Nenhum evento encontrado.</div>
          )}
        </div>

        <div className="text-xs text-zinc-500 mt-3 mb-12">
          Regras: Pontos = 3·V + 1·E; WR = (V + 0,5·E) / (V + D + E). No Show e Bye contam como vitória.
        </div>
      </div>
    </div>
  );
}

/* Patch App.jsx
import PhysicalStoreEventsPage from "./pages/PhysicalStoreEventsPage.jsx";

else if (hash.startsWith("#/tcg-fisico/eventos/loja")) {
  return render(<PhysicalStoreEventsPage allEvents={physicalEventsArray} />);
}
*/
