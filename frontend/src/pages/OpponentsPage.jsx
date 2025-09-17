import React, { useEffect, useMemo, useState } from "react";
import { getOpponentsAgg, getOpponentLogs } from "../services/api.js";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import BackButton from "../components/BackButton.jsx";

/* ---------- helpers ---------- */
function toDeckKey(s = "") {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/\s*\/\s*/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const Pill = ({ children }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-2xl border border-zinc-700 bg-zinc-800/60 text-zinc-100 text-xs">
    {children}
  </span>
);
const WLTriplet = ({ W = 0, L = 0, T = 0 }) => (
  <div className="flex items-center gap-1 text-xs">
    <span className="px-2 py-0.5 rounded-md bg-green-900/40 text-green-300 border border-green-800">W {W}</span>
    <span className="px-2 py-0.5 rounded-md bg-rose-900/40 text-rose-300 border border-rose-800">L {L}</span>
    <span className="px-2 py-0.5 rounded-md bg-amber-900/40 text-amber-300 border border-amber-800">E {T}</span>
  </div>
);
const renderWLChip = (r) => {
  const v = String(r ?? "").trim().toUpperCase();
  const base = "inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold ring-1 ring-inset";
  if (v === "W") return <span className={base + " bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"}>W</span>;
  if (v === "L") return <span className={base + " bg-rose-500/10 text-rose-300 ring-rose-500/20"}>L</span>;
  if (v === "E" || v === "T") return <span className={base + " bg-zinc-500/10 text-zinc-300 ring-zinc-500/20"}>E</span>;
  return <span className={base + " bg-zinc-500/10 text-zinc-300 ring-zinc-500/20"}>-</span>;
};

/* ---------- mappers ---------- */
function normalizeCounts(counts = {}) {
  return {
    W: Number(counts?.W) || 0,
    L: Number(counts?.L) || 0,
    T: Number(counts?.T) || 0,
  };
}

function sumCounts(a = {}, b = {}) {
  const A = normalizeCounts(a);
  const B = normalizeCounts(b);
  return { W: A.W + B.W, L: A.L + B.L, T: A.T + B.T };
}

function wrFromCounts({ W = 0, L = 0, T = 0 } = {}) {
  const total = W + L + T;
  if (!total) return 0;
  return Math.round((W / total) * 1000) / 10;
}

function normalizeWr(raw, counts) {
  const n = Number(raw);
  if (Number.isFinite(n)) {
    const clamped = Math.max(0, Math.min(100, n));
    return Math.round(clamped * 10) / 10;
  }
  return wrFromCounts(counts);
}

function normalizeTopDeck(raw) {
  if (!raw) return undefined;
  const deckKey = raw.deckKey ? String(raw.deckKey).trim() : "";
  const deckName = raw.deckName ? String(raw.deckName).trim() : "";
  const pokemons = Array.isArray(raw.pokemons) ? [...raw.pokemons] : undefined;
  if (!deckKey && !deckName && !(pokemons && pokemons.length)) return undefined;
  return { deckKey, deckName, pokemons: pokemons && pokemons.length ? pokemons : undefined };
}

function deckCompleteness(deck) {
  if (!deck) return 0;
  let score = 0;
  if (deck.deckKey) score += 3;
  if (deck.deckName) score += 2;
  if (Array.isArray(deck.pokemons) && deck.pokemons.length) score += 1;
  return score;
}

function mergeTopDecks(prev, next) {
  const a = normalizeTopDeck(prev);
  const b = normalizeTopDeck(next);
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;

  const [primary, secondary] = deckCompleteness(b) > deckCompleteness(a) ? [b, a] : [a, b];
  const merged = {
    deckKey: primary.deckKey || secondary.deckKey || "",
    deckName: primary.deckName || secondary.deckName || "",
    pokemons:
      Array.isArray(primary.pokemons) && primary.pokemons.length
        ? [...primary.pokemons]
        : Array.isArray(secondary.pokemons) && secondary.pokemons.length
          ? [...secondary.pokemons]
          : undefined,
  };
  return normalizeTopDeck(merged);
}

function applyTopDeck(opponent, deck) {
  const normalizedDeck = normalizeTopDeck(deck);
  return {
    ...opponent,
    topDeck: normalizedDeck,
    topDeckKey: normalizedDeck?.deckKey || "",
    topDeckName: normalizedDeck?.deckName || "",
    topPokemons: normalizedDeck?.pokemons,
  };
}

function buildOpponent({ name = "", counts = {}, wr, topDeck }) {
  const safeCounts = normalizeCounts(counts);
  const safeWr = normalizeWr(wr, safeCounts);
  return applyTopDeck(
    {
      name,
      counts: safeCounts,
      wr: safeWr,
    },
    topDeck
  );
}

function cloneOpponent(item) {
  if (!item) return buildOpponent({ name: "", counts: {} });
  return buildOpponent({ name: item.name, counts: item.counts, wr: item.wr, topDeck: item.topDeck });
}

function extractTopDeck(item = {}) {
  const top = typeof item.topDeck === "object" && item.topDeck ? item.topDeck : {};
  const pokemonsSource =
    top.pokemons ?? item.topPokemons ?? item.pokemons ?? item.spriteIds;
  return normalizeTopDeck({
    deckKey: top.deckKey || item.topDeckKey || item.deckKey || "",
    deckName: top.deckName || item.topDeckName || item.deckName || "",
    pokemons: Array.isArray(pokemonsSource) ? pokemonsSource : undefined,
  });
}

function mapOpponent(item) {
  const counts = normalizeCounts(item?.counts);
  const name = String(item?.opponentName || item?.name || item?.opponent || "").trim();
  return buildOpponent({
    name,
    counts,
    wr: normalizeWr(item?.wr, counts),
    topDeck: extractTopDeck(item),
  });
}

function combineOpponents(list) {
  const grouped = new Map();
  for (const item of list) {
    if (!item?.name) continue;
    const existing = grouped.get(item.name);
    if (!existing) {
      grouped.set(item.name, {
        name: item.name,
        counts: normalizeCounts(item.counts),
        topDeck: normalizeTopDeck(item.topDeck),
      });
      continue;
    }
    const counts = sumCounts(existing.counts, item.counts);
    const topDeck = mergeTopDecks(existing.topDeck, item.topDeck);
    grouped.set(item.name, { name: item.name, counts, topDeck });
  }
  return Array.from(grouped.values())
    .map((entry) =>
      buildOpponent({
        name: entry.name,
        counts: entry.counts,
        wr: wrFromCounts(entry.counts),
        topDeck: entry.topDeck,
      })
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapLog(x, opponentName) {
  return {
    id: x.id || x._id || x.logId || `${opponentName}-${x.date || Math.random()}`,
    date: x.date || x.createdAt || x.ts || "",
    result: x.result || x.outcome || "",
    myDeck: x.deck || x.deckName || x.playerDeck || x.myDeck || "",
    oppDeck: x.opponentDeck || x.oppDeck || "",
    eventName: x.eventName || x.tournament || x.event || "",
    userPokemons: x.userPokemons || x.myPokemons,
    opponentPokemons: x.opponentPokemons || x.oppPokemons,
    source: x.source === "physical" ? "physical" : "live",
  };
}

function parseLogTimestamp(log = {}) {
  const candidates = [log.date, log.createdAt, log.ts];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function sortLogsByDate(list = []) {
  const arr = Array.isArray(list) ? [...list] : [];
  return arr.sort((a, b) => parseLogTimestamp(b) - parseLogTimestamp(a));
}

const buildLogHref = (log = {}) => {
  const id = log?.id ? String(log.id) : "";
  if (!id) return "#";
  const encoded = encodeURIComponent(id);
  return log?.source === "physical"
    ? `#/tcg-fisico/eventos/${encoded}`
    : `#/tcg-live/logs/${encoded}`;
};

// normaliza nome/key para exibição correta
const displayDeck = (nameOrKey = "") => prettyDeckKey(toDeckKey(nameOrKey));

const PAGE_SIZE = 5;

export default function OpponentsPage() {
  const [all, setAll] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logsErr, setLogsErr] = useState("");
  const [page, setPage] = useState(0);

  // carrega agregados + enriquece topDeck quando vier nulo, pegando 1 log
  useEffect(() => {
    let alive = true;

    async function enrichTopDecksFromLogs(list) {
      const targets = list.filter((r) => !r.topDeckKey && !r.topDeckName).slice(0, 20);
      if (!targets.length) return list.map((item) => cloneOpponent(item));

      const updates = await Promise.all(
        targets.map(async (item) => {
          try {
            const res = await getOpponentLogs(item.name, { limit: 1, offset: 0 });
            const arr = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
            const first = arr[0];
            if (!first) return null;
            const deckStr = first?.opponentDeck || first?.oppDeck || "";
            const dk = toDeckKey(deckStr || "");
            if (!dk) return null;
            const pokemons = first?.opponentPokemons || first?.oppPokemons;
            const deck = normalizeTopDeck({
              deckKey: dk,
              deckName: deckStr || "",
              pokemons: Array.isArray(pokemons) ? pokemons : undefined,
            });
            if (!deck) return null;
            return { name: item.name, topDeck: deck };
          } catch {
            return null;
          }
        })
      );

      const updateMap = new Map();
      for (const entry of updates) {
        if (!entry?.name || !entry.topDeck) continue;
        updateMap.set(entry.name, entry.topDeck);
      }

      return list.map((item) => {
        const updateDeck = updateMap.get(item.name);
        const mergedDeck = mergeTopDecks(item.topDeck, updateDeck);
        return buildOpponent({
          name: item.name,
          counts: item.counts,
          wr: item.wr,
          topDeck: mergedDeck,
        });
      });
    }

    (async () => {
      setLoading(true); setError("");
      try {
        const payload = await getOpponentsAgg();
        const arr = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : [];
        const mapped = arr.map(mapOpponent).filter(r => r.name);
        const combined = combineOpponents(mapped);
        if (!alive) return;

        setAll(combined);
        const enriched = await enrichTopDecksFromLogs(combined);
        if (!alive) return;
        setAll(enriched);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "Falha ao carregar oponentes");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  // filtro por oponente
  useEffect(() => {
    const next = selected ? all.filter((r) => r.name === selected) : all;
    setRows(next);
  }, [all, selected]);

  // carrega logs ao expandir
  useEffect(() => {
    if (!expanded) {
      setLogs([]); setPage(0);
      return;
    }
    setLogsBusy(true); setLogsErr("");
    getOpponentLogs(expanded, { limit: 200, offset: 0 })
      .then((res) => {
        const arr = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
        const sorted = sortLogsByDate(arr);
        setLogs(sorted.map((x) => mapLog(x, expanded)));
      })
      .catch((e) => setLogsErr(e?.message || "Falha ao carregar logs"))
      .finally(() => setLogsBusy(false));
  }, [expanded]);

  const names = useMemo(
    () => Array.from(new Set(all.map((r) => r.name))).sort((a, b) => a.localeCompare(b)),
    [all]
  );

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const pageSlice = logs.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="min-h-[80vh] w-full bg-zinc-950 text-zinc-100 p-4 md:p-6">
      {/* Botão voltar padrão */}
      <BackButton href="#" label="Voltar" />

      <div className="mt-2">
        <h1 className="text-2xl md:text-3xl font-semibold">Oponentes</h1>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="text-xs text-zinc-400">Filtrar por oponente:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          {names.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {selected && (
          <button
            onClick={() => setSelected("")}
            className="px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800/60 text-sm hover:bg-zinc-800"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 items-center gap-2 text-xs uppercase tracking-wide text-zinc-400 mt-6 pb-2 border-b border-zinc-800/60">
        <div className="col-span-3">OPONENTE</div>
        <div className="col-span-2 text-center">WIN RATE</div>
        <div className="col-span-2 text-center">RESULTADO</div>
        <div className="col-span-4 text-center">DECK MAIS USADO</div>
        <div className="col-span-1 text-right">AÇÕES</div>
      </div>

      {loading && <div className="py-10 text-center text-zinc-400 text-sm">Carregando…</div>}
      {error && !loading && <div className="py-10 text-center text-rose-400 text-sm">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm">Sem oponentes para exibir</div>
      )}

      <div className="divide-y divide-zinc-900/60">
        {rows.map((r) => {
          const headerDeckKey = r.topDeckKey || toDeckKey(r.topDeckName || "");
          return (
            <div key={r.name} className="py-3">
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-3 text-sm">
                  {/* Nome como texto simples em negrito (sem link/underline) */}
                  <span className="font-semibold text-zinc-100">{r.name}</span>
                </div>
                <div className="col-span-2 flex justify-center"><Pill>{r.wr}%</Pill></div>
                <div className="col-span-2 flex justify-center"><WLTriplet {...r.counts} /></div>
                <div className="col-span-4 flex justify-center">
                  <DeckLabel
                    deckName={headerDeckKey ? prettyDeckKey(headerDeckKey) : "—"}
                    pokemonHints={r.topPokemons}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => setExpanded((prev) => (prev === r.name ? null : r.name))}
                    className={
                      "px-3 py-1.5 rounded-xl border text-xs " +
                      (expanded === r.name
                        ? "border-zinc-500 bg-zinc-800/80"
                        : "border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800")
                    }
                  >
                    {expanded === r.name ? "Ocultar" : "Detalhes"}
                  </button>
                </div>
              </div>

              {expanded === r.name && (
                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Partidas contra {r.name}</h3>
                      <p className="text-xs text-zinc-400">
                        Total: {logs.length} partidas • Página {page + 1} de {Math.max(1, totalPages)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-400 mt-3 pb-2 border-b border-zinc-800/60">
                    <div className="col-span-2">Data</div>
                    <div className="col-span-4">Meu deck</div>
                    <div className="col-span-4">Deck oponente</div>
                    <div className="col-span-1 text-center">Resultado</div>
                    <div className="col-span-1">Evento</div>
                  </div>

                  <div className="divide-y divide-zinc-900/60">
                    {logsBusy && <div className="py-8 text-center text-zinc-400 text-sm">Carregando…</div>}
                    {!logsBusy && !logsErr && pageSlice.map((log) => (
                      <a
                        key={log.id}
                        href={buildLogHref(log)}
                        className="grid grid-cols-12 items-center gap-2 py-2 text-sm transition-colors hover:bg-zinc-900/50"
                      >
                        <div className="col-span-2">{log.date}</div>
                        <div className="col-span-4">
                          <DeckLabel
                            deckName={displayDeck(log.myDeck || "") || "—"}
                            pokemonHints={log.userPokemons}
                          />
                        </div>
                        <div className="col-span-4">
                          <DeckLabel
                            deckName={displayDeck(log.oppDeck || "") || "—"}
                            pokemonHints={log.opponentPokemons}
                          />
                        </div>
                        <div className="col-span-1 text-center">{renderWLChip(log.result)}</div>
                        <div className="col-span-1">{log.eventName}</div>
                      </a>
                    ))}
                    {!logsBusy && !logsErr && pageSlice.length === 0 && (
                      <div className="py-8 text-center text-zinc-500 text-sm">Sem partidas</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
