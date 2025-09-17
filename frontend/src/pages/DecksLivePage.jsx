import React, { useEffect, useMemo, useState } from "react";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import BackButton from "../components/BackButton.jsx";

const API = import.meta.env.VITE_API_BASE_URL || "";

/* ============================ Helpers ============================ */
function cls(...xs) { return xs.filter(Boolean).join(" "); }

function safeArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result)) return payload.result;
  for (const v of Object.values(payload || {})) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  return [];
}
async function tryJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error("not_json");
    return await r.json();
  } catch { return null; }
}

function toDateISO(value) {
  if (!value && value !== 0) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(Number(value));
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function toDateTimeBR(v) {
  if (!v && v !== 0) return "-";
  let d;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) d = new Date(v + "T12:00:00");
  else d = new Date(Number(v));
  if (isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${hh}:${mi}`;
}

const wrFromCounts = ({ W=0, L=0, T=0 }) => {
  const tot = (W||0) + (L||0) + (T||0);
  return tot ? Math.round((W / tot) * 100) : 0;
};

function getTournamentNameFromLog(r) {
  return (
    r?.event ||
    r?.eventName ||
    r?.tournamentName ||
    r?.tournament ||
    r?.tournament_name ||
    r?.tourneyName ||
    ""
  );
}
function getTournamentIdFromLog(r) {
  return r?.tournamentId || r?.tId || r?.tournament_id || "";
}

/** Normaliza separadores “/” repetidos: "A / / B" -> "A / B", remove barras nas pontas e ajusta espaços. */
function collapseSlashes(name) {
  return String(name ?? "")
    .replace(/(?:\s*\/\s*){2,}/g, " / ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/^\s*\/\s*|\s*\/\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ============================ API wrappers ============================ */

async function listLiveDecks() {
  const d1 = await tryJson(`${API}/api/live/decks`);
  if (Array.isArray(d1) && d1.length) return d1;

  const logs = await tryJson(`${API}/api/live/logs?limit=2000`);
  const rows = safeArray(logs?.rows || logs).filter(r =>
    (r.source || r.origin || "live").toLowerCase().includes("live")
  );
  const map = new Map();
  for (const r of rows) {
    const key = r.deck || r.playerDeck || r.myDeck || "-";
    const v = String(r.result || r.r || "").toUpperCase();
    const agg = map.get(key) || { deckKey: key, counts: { W:0, L:0, T:0 } };
    if (v==="W") agg.counts.W++; else if (v==="L") agg.counts.L++; else agg.counts.T++;
    map.set(key, agg);
  }
  const arr = Array.from(map.values()).map(x => ({ deckKey: x.deckKey, counts: x.counts, wr: wrFromCounts(x.counts) }));
  arr.sort((a,b)=> b.wr - a.wr);
  return arr;
}

async function listLogsByDeck(deckKey) {
  const normalizedKey = String(deckKey || "").toLowerCase();
  const url = `${API}/api/live/decks/${encodeURIComponent(normalizedKey)}/logs`;
  const j = await tryJson(url);
  return safeArray(j).filter(r =>
    (r.source || r.origin || "live").toLowerCase().includes("live")
  );
}

/* ============================ UI bits ============================ */
function CountChip({ label, value }) {
  const color =
    label === "W" ? "bg-green-900/40 text-green-300 border-green-800" :
    label === "L" ? "bg-rose-900/40 text-rose-300 border-rose-800" :
                    "bg-amber-900/40 text-amber-300 border-amber-800";
  return (
    <span className={cls("px-2 py-0.5 rounded-md text-xs border", color)}>
      {label}{value ?? 0}
    </span>
  );
}

/* ============================ Page ============================ */

function DecksLivePage() {
  const [filter, setFilter] = useState("todos");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState(null);
  const [logsByDeck, setLogsByDeck] = useState({});
  const [loadingDeck, setLoadingDeck] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await listLiveDecks();
        if (alive) setRows(Array.isArray(data) ? data : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function expandDeck(deckKey) {
    const isOpen = expanded === deckKey;
    if (isOpen) { setExpanded(null); return; }
    setExpanded(deckKey);

    if (!logsByDeck[deckKey]) {
      try {
        setLoadingDeck(prev => ({ ...prev, [deckKey]: true }));
        const raw = await listLogsByDeck(deckKey);
        const norm = raw.map(r => ({
          id: r.id,
          createdAt: r.createdAt ?? r.date ?? null,
          dateISO: toDateISO(r.date || r.createdAt || r.dateISO),
          opponent: r.opponent || r.opp || "-",
          opponentDeck: r.opponentDeck || r.oppDeck || r.opponent_deck || "-",
          result: String(r.result || r.r || "-").toUpperCase(),
          eventName: getTournamentNameFromLog(r),
          tournamentId: getTournamentIdFromLog(r),
        }))
        .sort((a,b)=> String(b.createdAt||b.dateISO||"").localeCompare(String(a.createdAt||a.dateISO||"")));
        setLogsByDeck(prev => ({ ...prev, [deckKey]: norm }));
      } finally {
        setLoadingDeck(prev => ({ ...prev, [deckKey]: false }));
      }
    }
  }

  const filtered = useMemo(() => {
    const arr = [...rows];
    return arr;
  }, [rows, filter]);

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Substitui o link antigo por BackButton padrão */}
        <BackButton href="#/tcg-live" label="Voltar" />

        <header className="mb-4 mt-2 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Decks (TCG Live)</h1>
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Filtrar:</span>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1"
            >
              <option value="todos">Todos</option>
            </select>
          </label>
        </header>

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/70 text-zinc-400">
              <tr>
                <Th className="w-[40%]">Deck</Th>
                <Th className="w-[20%]">Resultado</Th>
                <Th className="w-[20%] text-center">Win Rate</Th>
                <Th className="w-[20%] text-right">Ações</Th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-zinc-400">Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-zinc-400">Nenhum deck encontrado.</td></tr>
              ) : filtered.map((r, i) => {
                const countsRaw = (r.counts || r);
                const counts = {
                  W: Number(countsRaw?.W ?? countsRaw?.w ?? countsRaw?.wins ?? r?.V ?? r?.v ?? 0),
                  L: Number(countsRaw?.L ?? countsRaw?.l ?? countsRaw?.losses ?? r?.L ?? r?.l ?? 0),
                  T: Number(countsRaw?.T ?? countsRaw?.t ?? countsRaw?.ties ?? countsRaw?.E ?? r?.D ?? r?.d ?? 0),
                };
                const wr = r.wr ?? wrFromCounts(counts);
                const deckKey = r.deckKey || r.deck || r.key || r.name || `deck-${i}`;
                const isOpen = expanded === deckKey;

                return (
                  <React.Fragment key={deckKey}>
                    <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
                      <Td>
                        <DeckLabel deckName={prettyDeckKey(deckKey)} pokemonHints={r.pokemons} />
                      </Td>
                      <Td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CountChip label="W" value={counts.W} />
                          <CountChip label="L" value={counts.L} />
                          <CountChip label="E" value={counts.T} />
                        </div>
                      </Td>
                      <Td className="text-center">{wr}%</Td>
                      <Td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => expandDeck(deckKey)}
                          className="inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                        >
                          {isOpen ? "Ocultar" : "Detalhes"}
                        </button>
                      </Td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-zinc-950/60">
                        <td colSpan={4} className="px-6 py-3">
                          <div className="overflow-hidden rounded-xl border border-zinc-800">
                            <table className="w-full text-sm">
                              <thead className="border-b border-zinc-800 text-zinc-400">
                                <tr>
                                  <th className="px-3 py-2 text-left">Data</th>
                                  <th className="px-3 py-2 text-left">Oponente</th>
                                  <th className="px-3 py-2 text-left">Deck do Oponente</th>
                                  <th className="px-3 py-2 text-center">Resultado</th>
                                  <th className="px-3 py-2 text-left">Evento</th>
                                </tr>
                              </thead>
                              <tbody>
                                {loadingDeck[deckKey] ? (
                                  <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-400">Carregando…</td></tr>
                                ) : (logsByDeck[deckKey] || []).length === 0 ? (
                                  <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-400">Sem partidas.</td></tr>
                                ) : (logsByDeck[deckKey] || []).map((log) => {
                                  const tName =
                                    log.eventName ||
                                    log.tournamentName ||
                                    log.tournament ||
                                    log.tournament_name ||
                                    log.tourneyName ||
                                    "";
                                  const tId = log.tournamentId || log.tId || log.tournament_id || "";

                                  const logHref = log?.id ? `#/tcg-live/logs/${encodeURIComponent(log.id)}` : null;

                                  const oppDeckDisplay = collapseSlashes(
                                    prettyDeckKey(log.opponentDeck || "-")
                                  );

                                  return (
                                    <tr key={log.id} className="border-b border-zinc-800 hover:bg-zinc-900/50">
                                      <td className="px-3 py-2">
                                        {logHref ? (
                                          <a href={logHref} className="block hover:underline">
                                            {toDateTimeBR(log.createdAt) ||
                                              (log.dateISO ? `${log.dateISO.split("-").reverse().join("/")} , 00:00` : "-")}
                                          </a>
                                        ) : (
                                          toDateTimeBR(log.createdAt) ||
                                          (log.dateISO ? `${log.dateISO.split("-").reverse().join("/")} , 00:00` : "-")
                                        )}
                                      </td>

                                      <td className="px-3 py-2">
                                        {logHref ? (
                                          <a href={logHref} className="block hover:underline">
                                            {log.opponent || "-"}
                                          </a>
                                        ) : (
                                          log.opponent || "-"
                                        )}
                                      </td>

                                      <td className="px-3 py-2">
                                        {logHref ? (
                                          <a href={logHref} className="block hover:underline">
                                            <DeckLabel deckName={oppDeckDisplay} />
                                          </a>
                                        ) : (
                                          <DeckLabel deckName={oppDeckDisplay} />
                                        )}
                                      </td>

                                      <td className="px-3 py-2 text-center">
                                        {logHref ? (
                                          <a href={logHref} className="inline-block hover:underline">
                                            <span
                                              className={cls(
                                                "px-2 py-0.5 rounded-md text-xs border",
                                                log.result === "W"
                                                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-700"
                                                  : log.result === "L"
                                                  ? "bg-rose-500/10 text-rose-300 border-rose-700"
                                                  : "bg-amber-500/10 text-amber-300 border-amber-700"
                                              )}
                                            >
                                              {log.result || "-"}
                                            </span>
                                          </a>
                                        ) : (
                                          <span
                                            className={cls(
                                              "px-2 py-0.5 rounded-md text-xs border",
                                              log.result === "W"
                                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-700"
                                                : log.result === "L"
                                                ? "bg-rose-500/10 text-rose-300 border-rose-700"
                                                : "bg-amber-500/10 text-amber-300 border-amber-700"
                                            )}
                                          >
                                            {log.result || "-"}
                                          </span>
                                        )}
                                      </td>

                                      <td className="px-3 py-2">
                                        {tName ? (
                                          tId ? (
                                            <a className="hover:underline" href={`#/tcg-live/torneios/${tId}`}>
                                              {tName}
                                            </a>
                                          ) : (
                                            tName
                                          )
                                        ) : (
                                          "-"
                                        )}
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
      </div>
    </div>
  );
}

/* ============================ UI atoms ============================ */
function Th({ children, className = "" }) {
  return <th className={cls("px-4 py-3 text-left font-medium", className)}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={cls("px-4 py-3 align-middle", className)}>{children}</td>;
}

/* ========= Exports ========= */
export default DecksLivePage;
export { DecksLivePage as DecksTCGLivePage, DecksLivePage as DecksTCGFisicoPage };
