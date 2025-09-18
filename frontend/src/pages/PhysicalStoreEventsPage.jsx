// src/pages/PhysicalStoreEventsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import ptBR from "date-fns/locale/pt-BR";

import { getEvent } from "../eventsRepo.js";
import { getPhysicalLogs } from "../services/api.js";
import { getPhysicalRounds } from "../services/physicalApi.js";
import { selectStoreFocusedMatches } from "../PhysicalPageV2.jsx";

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

const ALLOWED_EVENT_TYPE_KEYS = new Set(["local", "challenge", "cup"]);

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
    detail.date,
    detail.startDate,
    detail.startAt,
    detail.createdAt,
    detail.updatedAt,
    detail.ts,
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

const buildGroupedStoreEvents = (rowsByEventId, detailsMap, roundsMap) => {
  const storeMap = new Map();

  for (const [eventId, rows] of rowsByEventId.entries()) {
    if (!eventId) continue;

    const detail = detailsMap.get(eventId) || {};
    const sampleRow = rows[0] || {};

    const roundsCandidate = roundsMap.has(eventId) ? roundsMap.get(eventId) : detail.rounds;
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

    const eventEntry = {
      id: eventId,
      title,
      eventType: eventTypeRaw || sampleRow.eventType || eventTypeKey,
      eventTypeKey,
      date: timestamp,
      rounds,
      results: counts,
      detail,
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

function PartidasChips({ w = 0, l = 0, t = 0 }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-700/40">W {w}</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-rose-600/20 text-rose-400 border border-rose-700/40">L {l}</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-600/20 text-amber-400 border border-amber-700/40">E {t}</span>
    </div>
  );
}

export default function PhysicalStoreEventsPage() {
  const [selectedStore, setSelectedStore] = useState("");
  const [groupedEvents, setGroupedEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const logsResult = await fetchAllPhysicalLogs({ pageSize: DEFAULT_LOG_PAGE_SIZE });
        if (!isActive) return;

        const rows = Array.isArray(logsResult?.rows) ? logsResult.rows : [];
        const filteredRows = selectStoreFocusedMatches(rows);

        const rowsByEventId = new Map();
        for (const row of filteredRows) {
          const eventId = row?.eventId || row?.id;
          if (!eventId) continue;
          if (!rowsByEventId.has(eventId)) rowsByEventId.set(eventId, []);
          rowsByEventId.get(eventId).push(row);
        }

        const eventIds = Array.from(rowsByEventId.keys());
        const detailsMap = new Map();
        const roundsMap = new Map();
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
          if (!isActive) return;
          for (const [eventId, detail] of chunkResults) {
            detailsMap.set(eventId, detail);
          }
        }

        for (let i = 0; i < eventIds.length; i += CHUNK_SIZE) {
          const chunk = eventIds.slice(i, i + CHUNK_SIZE);
          const chunkRounds = await Promise.all(
            chunk.map(async (eventId) => {
              try {
                const rounds = await getPhysicalRounds(eventId);
                return [eventId, Array.isArray(rounds) ? rounds : []];
              } catch (err) {
                console.warn(`[PhysicalStoreEventsPage] falha ao carregar rounds do evento ${eventId}`, err);
                return [eventId, []];
              }
            }),
          );
          if (!isActive) return;
          for (const [eventId, rounds] of chunkRounds) {
            roundsMap.set(eventId, rounds);
          }
        }

        const grouped = buildGroupedStoreEvents(rowsByEventId, detailsMap, roundsMap);
        if (!isActive) return;
        setGroupedEvents(grouped);
      } catch (err) {
        if (!isActive) return;
        console.error("[PhysicalStoreEventsPage] falha ao carregar logs físicos", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setGroupedEvents([]);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, []);

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
            storeName: store.storeName,
            storeIdentifier: store.identifier,
            rounds: event.rounds,
            results: event.results,
          });
        }
      }
    }
    rows.sort((a, b) => (b.date || 0) - (a.date || 0));
    return rows;
  }, [groupedEvents]);

  const filtered = useMemo(() => {
    const byType = allEvents.filter((ev) =>
      ALLOWED_EVENT_TYPE_KEYS.has(ev.eventTypeKey || normalizeStoreEventTypeKey(ev.eventType)),
    );
    if (!selectedStore) return byType;
    return byType.filter((ev) => ev.storeIdentifier === selectedStore);
  }, [allEvents, selectedStore]);

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
          <div className="grid grid-cols-[1fr_1fr_1fr_120px] px-5 py-3 text-xs uppercase tracking-wide text-zinc-400 bg-zinc-900 border-b border-zinc-800">
            <div>Dia</div>
            <div>Evento</div>
            <div>Partidas</div>
            <div className="text-right">Ação</div>
          </div>

          {filtered.map((ev) => (
            <div key={ev.id} className="grid grid-cols-[1fr_1fr_1fr_120px] items-center px-5 py-4 border-b border-zinc-800/60 hover:bg-zinc-900/70 transition-colors">
              <div className="text-zinc-200">
                {ev.date ? format(new Date(ev.date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
              </div>
              <div className="text-zinc-300">{ev.title || ev.eventType}</div>
              <div><PartidasChips w={ev?.results?.w} l={ev?.results?.l} t={ev?.results?.t} /></div>
              <div className="text-right">
                <a
                  href={`#/tcg-fisico/eventos/${ev.id}`}
                  className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700"
                >
                  Detalhes
                </a>
              </div>
            </div>
          ))}

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
