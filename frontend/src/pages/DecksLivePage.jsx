import React, { useEffect, useMemo, useState } from "react";
import BackButton from "../components/BackButton.jsx";
import { listLiveDecks } from "../services/api.js";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import DeckLabel from "../components/DeckLabel.jsx";

// ===== Helpers ==============================================================
function wrFromCounts(c = {}) {
  const W = Number(c.W || 0), L = Number(c.L || 0), T = Number(c.T || 0);
  const denom = W + L + T;
  if (!denom) return 0;
  return Math.round(((W + 0.5 * T) / denom) * 100);
}
function toTitleCase(s = "") { return s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase()); }
function clsx(...xs){ return xs.filter(Boolean).join(" "); }

// Datas
function normalizeLogDate(rec){
  const raw = rec?.createdAt || rec?.ts || rec?.playedAt || rec?.date || rec?.timeISO || "";
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    const n = Number(raw); if (!Number.isNaN(n)) return new Date(n);
  }
  let s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s + "T12:00:00";
  return new Date(s);
}
function formatDate(input) {
  if (!input) return "-";
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return "-";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(d);
  } catch (e) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }
}

// Nomes de deck — comparação estável
function normalizeDeckName(s = "") {
  return String(s)
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")        // remove apostrophes to collapse possessives (arven's -> arvens)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function deckMatches(row, deckKey) {
  const target = normalizeDeckName(deckKey);
  const candidates = [
    row.myDeck, row.deck, row.deckKey, row.deckName, row.playerDeck, row.userDeckName,
    row.userDeckKey, row.playerDeckName, row.miniDeck, row.deckkey, row.deck_title
  ];
  return candidates.some(v => normalizeDeckName(v || "") === target);
}

// Chips iguais aos de Oponentes
const CHIP = "px-2 py-0.5 rounded-md text-xs font-medium border";
function CountChip({ label, value }) {
  const t = String(label || "").toUpperCase();
  if (t === "W") return <span className={CHIP + " bg-green-900/40 text-green-300 border-green-800"}>W {value ?? 0}</span>;
  if (t === "L") return <span className={CHIP + " bg-rose-900/40 text-rose-300 border-rose-800"}>L {value ?? 0}</span>;
  return <span className={CHIP + " bg-amber-900/40 text-amber-300 border-amber-800"}>E {value ?? 0}</span>;
}
function renderWLChip(r){
  const v = String(r ?? "").trim().toUpperCase();
  const base = "inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold ring-1 ring-inset";
  if (v === "W") return <span className={base + " bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"}>W</span>;
  if (v === "L") return <span className={base + " bg-rose-500/10 text-rose-300 ring-rose-500/20"}>L</span>;
  return <span className={base + " bg-zinc-500/10 text-zinc-300 ring-zinc-500/20"}>E</span>;
}

// ====== Logs por deck (com filtro client-side garantido) ====================
async function fetchLogsByDeck({ deckKey, limit = 5, offset = 0 }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
  const headers = { "Content-Type": "application/json" };
  const qs = new URLSearchParams({ deck: deckKey, limit: String(limit), offset: String(offset), source: "all" }).toString();

  // Tenta com filtro server-side
  const res = await fetch(`${API_BASE}/api/live/logs?${qs}`, { credentials: "include", headers });
  let data = res.ok ? await res.json() : null;
  let rows = Array.isArray(data?.rows) ? data.rows : [];

  // Se o servidor não filtrou corretamente ou retornou vazio, filtramos localmente
  if (!rows.length || rows.some(r => !deckMatches(r, deckKey))) {
    const resAll = await fetch(`${API_BASE}/api/live/logs?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}&source=all`, { credentials: "include", headers });
    const all = resAll.ok ? await resAll.json() : null;
    const allRows = Array.isArray(all?.rows) ? all.rows : [];
    rows = allRows.filter(r => deckMatches(r, deckKey));
    data = all || { ok: true };
  }

  // Ordena por data (mais novo primeiro)
  rows.sort((a, b) => Number(b.createdAt ?? b.ts ?? 0) - Number(a.createdAt ?? a.ts ?? 0));

  return { ...data, rows, total: rows.length };
}

const PAGE_SIZE = 5;

// ===== Página ===============================================================
export default function DecksLivePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filtro simples
  const [filter, setFilter] = useState("all");
  const options = useMemo(() => (rows || []).map(r => r.deckKey || r.deck || "").filter(Boolean), [rows]);
  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    const fk = String(filter || "").toLowerCase();
    return rows.filter(r => String(r.deckKey || r.deck || "").toLowerCase() === fk);
  }, [rows, filter]);

  // Colapso
  const [expanded, setExpanded] = useState(null);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logsErr, setLogsErr] = useState("");
  const [logs, setLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await listLiveDecks();
        if (!mounted) return;
        const arr = Array.isArray(resp?.rows || resp) ? (resp.rows || resp) : [];
        setRows(arr);
      } catch (e) {
        if (mounted) setError(e?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Carrega logs ao expandir/paginar
  useEffect(() => {
    let mount = true;
    if (!expanded) return;
    setLogsBusy(true);
    setLogsErr("");
    fetchLogsByDeck({ deckKey: expanded, limit: PAGE_SIZE, offset: page*PAGE_SIZE })
      .then((data) => {
        if (!mount) return;
        const items = Array.isArray(data?.rows) ? data.rows : [];
        const mapped = items.map((x, i) => ({
          id: x.id || x._id || x.logId || `${expanded}-${page}-${i}`,
          date: formatDate(normalizeLogDate(x)),
          opponent: x.opponent || x.opponentName || x.name || x.opponent_username || x.opponentUser || "",
          oppDeck: x.oppDeck || x.opponentDeck || x.oppDeckName || x.opDeck || "",
          result: x.result || x.outcome || x.r || "",
        }));
        setLogs(mapped);
        setTotalLogs(Number(data?.total || mapped.length || 0));
      })
      .catch((e) => setLogsErr(e?.message || "Falha ao carregar logs"))
      .finally(() => setLogsBusy(false));
    return () => { mount = false; };
  }, [expanded, page]);

  const totalPages = Math.max(1, Math.ceil((totalLogs || 0) / PAGE_SIZE));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto text-zinc-100">
      <div className="mb-2"><BackButton to="#/tcg-live" label="Voltar ao TCG Live" /></div>
      <h1 className="text-2xl md:text-3xl font-semibold">Decks (TCG Live)</h1>
      <p className="text-zinc-400 text-sm mb-4">Desempenho por deck calculado a partir dos logs.</p>

      <header className="flex items-center justify-end gap-2 mb-3">
        <label className="text-sm text-zinc-300">Filtrar:</label>
        <select value={filter} onChange={e=>setFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
          <option value="all">Todos</option>
          {options.map((d) => <option key={d} value={d}>{toTitleCase(d)}</option>)}
        </select>
      </header>

      {error && <div className="text-rose-400 text-sm mb-3">Erro: {error}</div>}

      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-zinc-400 font-mono">
            <tr className="border-b border-zinc-800/60">
              <th className="px-4 py-3 text-left w-1/2">Deck</th>
              <th className="px-4 py-3 text-left w-1/4">Resultado</th>
              <th className="px-4 py-3 text-left w-1/6">Win Rate</th>
              <th className="px-4 py-3 text-right w-[10%]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(!filtered || filtered.length === 0) && !loading && (
              <tr><td className="px-4 py-6 text-zinc-400" colSpan={4}>Nenhum deck ainda.</td></tr>
            )}
            {filtered?.map((r, i) => {
              const countsRaw = (r.counts || r);
              const counts = {
                W: Number(countsRaw?.W ?? countsRaw?.w ?? countsRaw?.wins ?? r?.V ?? r?.v ?? 0),
                L: Number(countsRaw?.L ?? countsRaw?.l ?? countsRaw?.losses ?? r?.L ?? r?.l ?? 0),
                T: Number(countsRaw?.T ?? countsRaw?.t ?? countsRaw?.ties ?? countsRaw?.E ?? r?.D ?? r?.d ?? 0),
              };
              const wr = r.wr ?? wrFromCounts(counts);
              const deckKey = r.deckKey || r.deck || `deck-${i}`;
              const isOpen = expanded === deckKey;

              return (
                <React.Fragment key={deckKey}>
                  <tr className="border-b border-zinc-800/60">
                    <td className="px-4 py-3"><DeckLabel deckName={prettyDeckKey(deckKey)} pokemonHints={r.pokemons} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CountChip label="W" value={counts.W} />
                        <CountChip label="L" value={counts.L} />
                        <CountChip label="E" value={counts.T} />
                      </div>
                    </td>
                    <td className="px-4 py-3">{wr}%</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={()=>{
                          if (isOpen) { setExpanded(null); setPage(0); return; }
                          setExpanded(deckKey); setPage(0);
                        }}
                        className="inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        {isOpen ? "Ocultar" : "Detalhes"}
                      </button>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-zinc-800/60">
                      <td colSpan={4} className="px-4 py-3 bg-zinc-950/40">
                        <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                          <div className="grid grid-cols-12 items-center gap-2 tracking-wide text-zinc-400 mt-1 pb-2 border-b border-zinc-800/60">
                            <div className="col-span-2">Data</div>
                            <div className="col-span-4">Oponente</div>
                            <div className="col-span-4">Deck do Oponente</div>
                            <div className="col-span-1 text-center">Resultado</div>
                            <div className="col-span-1">Evento</div>
                          </div>

                          <div className="divide-y divide-zinc-900/60">
                            {logsBusy && <div className="py-8 text-center text-zinc-400 text-sm">Carregando…</div>}
                            {!logsBusy && !logsErr && logs.map(log => (
                              <a key={log.id} href={`#/tcg-live/logs/${encodeURIComponent(log.id)}`} className="grid grid-cols-12 items-center gap-2 py-2 text-sm hover:bg-zinc-800/30 rounded-md">
                                <div className="col-span-2">{log.date}</div>
                                <div className="col-span-4">{log.opponent}</div>
                                <div className="col-span-4"><DeckLabel deckName={prettyDeckKey(log.oppDeck || log.opponentDeck || "")} pokemonHints={log.opponentPokemons || log.oppPokemons} /></div>
                                <div className="col-span-1 text-center">{renderWLChip(log.result)}</div>
                                <div className="col-span-1">{/* evento entra depois */}</div>
                              </a>
                            ))}
                            {!logsBusy && !logsErr && logs.length===0 && (
                              <div className="py-8 text-center text-zinc-500 text-sm">Sem partidas</div>
                            )}
                            {!logsBusy && logsErr && (
                              <div className="py-8 text-center text-rose-400 text-sm">{logsErr}</div>
                            )}
                          </div>

                          {totalPages>1 && (
                            <div className="flex justify-end items-center gap-2 pt-3">
                              <span className="text-xs text-zinc-400">{totalLogs} partidas • Página {page+1} de {totalPages}</span>
                              <div className="flex items-center gap-2">
                                <button disabled={page<=0 || logsBusy}
                                  onClick={()=>setPage(p=>Math.max(0,p-1))}
                                  className="px-2 py-1 text-xs rounded-lg border border-zinc-700 bg-zinc-800/60 disabled:opacity-50">◀</button>
                                <button disabled={(page+1)>=totalPages || logsBusy}
                                  onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))}
                                  className="px-2 py-1 text-xs rounded-lg border border-zinc-700 bg-zinc-800/60 disabled:opacity-50">▶</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Placeholder para físico (mantido)
export function DecksTCGFisicoPage() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto text-zinc-100">
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Decks (Físico)</h1>
      <p className="text-zinc-400 text-sm">Integração pendente. Nenhum dado no momento.</p>
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4 mt-4 text-zinc-400">Em breve.</div>
    </div>
  );
}