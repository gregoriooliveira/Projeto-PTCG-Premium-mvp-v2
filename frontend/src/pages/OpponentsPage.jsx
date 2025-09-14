import React, { useEffect, useMemo, useState } from "react";
import { getOpponentsAgg, getOpponentLogs } from "../services/api.js";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";

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
function mapOpponent(item) {
  const counts = item?.counts || { W: 0, L: 0, T: 0 };
  const top = item?.topDeck || null;
  return {
    name: item?.opponentName || item?.name || item?.opponent || "",
    wr: Number(item?.wr) || 0,
    counts: { W: counts.W || 0, L: counts.L || 0, T: counts.T || 0 },
    topDeckKey: top?.deckKey || "",
    topDeckName: top?.deckName || "",
    topPokemons: Array.isArray(top?.pokemons) ? top.pokemons : undefined,
  };
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
  };
}

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
      const targets = list.filter(r => !r.topDeckKey && !r.topDeckName).slice(0, 20);
      await Promise.all(
        targets.map(async (r) => {
          try {
            const res = await getOpponentLogs(r.name, { limit: 1, offset: 0 });
            const arr = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
            const first = arr[0];
            const deckStr = first?.opponentDeck || first?.oppDeck || "";
            const dk = toDeckKey(deckStr || "");
            if (dk) r.topDeckKey = dk;
          } catch {}
        })
      );
      return list.map(r => ({ ...r }));
    }

    (async () => {
      setLoading(true); setError("");
      try {
        const payload = await getOpponentsAgg();
        const arr = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : [];
        const mapped = arr.map(mapOpponent).filter(r => r.name);
        if (!alive) return;

        setAll(mapped);
        const enriched = await enrichTopDecksFromLogs(mapped);
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
        setLogs(arr.map((x) => mapLog(x, expanded)));
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
      <div>
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
          // prioriza key; se vier só nome, normaliza pra key (evita "/ /")
          const headerDeckKey = r.topDeckKey || toDeckKey(r.topDeckName || "");
          return (
            <div key={r.name} className="py-3">
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-3 text-sm">
                  <a
                    href={`#/oponentes?op=${encodeURIComponent(r.name)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-200 hover:text-white underline"
                  >
                    {r.name}
                  </a>
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
                        href={`#/tcg-live/logs/${encodeURIComponent(log.id)}`}
                        className="grid grid-cols-12 items-center gap-2 py-2 text-sm"
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
