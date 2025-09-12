
import React, { useEffect, useState } from "react";
// Mantive somente o officialArtworkUrl (o getLiveSummary não existe no back atual)
import { officialArtworkUrl } from "../services/api.js";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import ResumoGeralWidget from "../components/widgets/ResumoGeralWidget.jsx";
import { Trophy, List, ClipboardList } from "lucide-react";
import ImportLogsModal from "../components/ImportLogsModal.jsx";

const API = import.meta.env.VITE_API_BASE_URL || "";

// Fallback UI primitives (sem shadcn): Card, CardContent, Button
const Card = ({ className = "", children }) => (
  <div className={`rounded-2xl bg-zinc-900 border border-zinc-700 shadow-lg ${className}`}>{children}</div>
);
const CardContent = ({ className = "", children }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);

function pct(num) {
  if (num == null) return 0;
  let n = Number(num);
  if (Number.isNaN(n)) return 0;
  if (n <= 1) n = n * 100; // aceita fração 0–1
  return Math.round(n * 10) / 10;
}

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
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error("not_json");
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeFromHome(homeJson) {
  if (!homeJson) return null;
  // Tenta encontrar blocos óbvios
  const recentLogs = safeArray(homeJson.recentLogs || homeJson.logs);
  const tournaments = safeArray(homeJson.recentTournaments || homeJson.tournaments);
  const topDecks = safeArray(homeJson.topDecks || homeJson.decks);

  // WR geral
  let W = 0, L = 0, T = 0;
  if (homeJson?.summary?.counts) {
    const c = homeJson.summary.counts;
    W = Number(c.W || c.w || 0);
    L = Number(c.L || c.l || 0);
    T = Number(c.T || c.t || 0);
  } else if (recentLogs.length) {
    for (const r of recentLogs) {
      const v = String(r.result || r.r || "").toUpperCase();
      if (v === "W") W++; else if (v === "L") L++; else T++;
    }
  }
  const total = W + L + T;
  const wr = total ? Math.round((W / total) * 1000) / 10 : 0;

  // topDeck
  let topDeck = { deckKey: "-", wr: 0, avatars: [] };
  if (topDecks.length) {
    const d0 = topDecks[0];
    const dCounts = d0.counts || {};
    const tdTot = (dCounts.W || 0) + (dCounts.L || 0) + (dCounts.T || 0);
    const tdWR = d0.wr != null ? pct(d0.wr) : (tdTot ? Math.round((dCounts.W || 0) / tdTot * 1000) / 10 : 0);
    topDeck = { deckKey: d0.deckKey || d0.key || d0.name || "-", wr: tdWR, avatars: d0.avatars || [] };
  }

  return {
    summary: { wr, counts: { total }, topDeck },
    recentLogs,
    topDecks: topDecks.map(d => ({
      deckKey: d.deckKey || d.key || d.name || "-",
      wr: pct(d.wr ?? 0),
      counts: d.counts || { W: 0, L: 0, T: 0 },
    })),
    recentTournaments: tournaments.map(t => ({
      dateISO: t.dateISO || t.date || "",
      name: t.name || t.tournamentName || "-",
      roundsCount: t.roundsCount ?? t.roundCount ?? 0,
      tournamentId: t.tournamentId || t.id || "",
    })),
  };
}

function normalizeFromLogs(logsJson) {
  const rows = safeArray(logsJson?.rows || logsJson);
  // Recorta só registros LIVE
  const liveRows = rows.filter(r => (r.source || r.origin || "live").toLowerCase().includes("live"));
  const recentLogs = liveRows
    .slice(0, 20)
    .map(r => ({
      dateISO: String(r.date || r.createdAt || "").slice(0, 10),
      playerDeck: r.deck || r.playerDeck || r.myDeck || "-",
      result: r.result || r.r || "",
      tournamentName: r.tournamentName || r.tournament || r.tournament_name || r.tourneyName || r.name || "",
      tournamentId: r.tournamentId || r.tId || r.tournament_id || r.id || "",
    }));

  // W/L/T
  let W = 0, L = 0, T = 0;
  for (const r of liveRows) {
    const v = String(r.result || r.r || "").toUpperCase();
    if (v === "W") W++; else if (v === "L") L++; else T++;
  }
  const total = W + L + T;
  const wr = total ? Math.round((W / total) * 1000) / 10 : 0;

  // agrega por deck
  const byDeck = new Map();
  for (const r of liveRows) {
    const name = (r.deck || r.playerDeck || r.myDeck || "-") + "";
    const v = String(r.result || r.r || "").toUpperCase();
    const agg = byDeck.get(name) || { W: 0, L: 0, T: 0 };
    if (v === "W") agg.W++; else if (v === "L") agg.L++; else agg.T++;
    byDeck.set(name, agg);
  }
  const topDecks = Array.from(byDeck.entries())
    .map(([deckKey, counts]) => {
      const tot = counts.W + counts.L + counts.T;
      const wr = tot ? Math.round((counts.W / tot) * 1000) / 10 : 0;
      return { deckKey, counts, wr };
    })
    .sort((a, b) => b.wr - a.wr)
    .slice(0, 5);

  return {
    summary: { wr, counts: { total }, topDeck: topDecks[0] ? { deckKey: topDecks[0].deckKey, wr: topDecks[0].wr, avatars: [] } : { deckKey: "-", wr: 0, avatars: [] } },
    recentLogs,
    topDecks,
    recentTournaments: [],
  };
}

export default function TCGLivePage() {
  const [showImport, setShowImport] = useState(false);
  const [summary, setSummary] = useState(null);

  // Abre o modal automaticamente se navegar via #/importar
  useEffect(() => {
    const openIfImport = () => {
      const hash = window.location.hash || "";
      if (hash.split("?")[0] === "#/importar") setShowImport(true);
    };
    openIfImport();
    window.addEventListener("hashchange", openIfImport);
    return () => window.removeEventListener("hashchange", openIfImport);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Tenta endpoint de HOME (mesma agregação da home)
      const home = await tryJson(`${API}/api/home?source=all&limit=5`)
               || await tryJson(`${API}/api/live/home?source=all&limit=5`);
      if (home) {
        const norm = normalizeFromHome(home);
        if (alive) setSummary(norm);
        return;
      }
      // 2) Fallback: agrega a partir dos logs LIVE
      const logs = await tryJson(`${API}/api/live/logs?source=all&limit=200`)
                || await tryJson(`${API}/api/live/logs?limit=200`);
      const norm = normalizeFromLogs(logs || {});
      if (alive) setSummary(norm);
    })();
    return () => { alive = false };
  }, []);

  function handleSavedLog(payload) {
    window.location.hash = `#/tcg-live/logs/${encodeURIComponent(payload.id)}`;
    setShowImport(false);
  }

  return (
    <div className="p-4 space-y-6">
      {/* Resumo Geral (padronizado) */}
      <ResumoGeralWidget
        title="TCG Live"
        variant="live"
        winRate={{ value: pct(summary?.summary?.wr ?? 0), label: "Win Rate" }}
        center={{ number: (summary?.summary?.counts?.total ?? 0), subtitle: "Logs importados" }}
        topDeck={{
          deckName: prettyDeckKey(summary?.summary?.topDeck?.deckKey || ""),
          winRate: pct(summary?.summary?.topDeck?.wr ?? 0),
          avatars: (summary?.summary?.topDeck?.avatars || []).slice(0,2).map(a =>
            (typeof a === "string" && a.startsWith("http")) ? a : officialArtworkUrl(a)
          ),
        }}
      />

      {/* Linha de dois widgets: O que tem aqui + Resumo de Torneios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Intro Widget - O que tem aqui */}
        <Card>
          <CardContent className="flex flex-col items-start space-y-4">
            <img src="/assets/tcglive-logo.png" alt="Pokémon TCG Live" className="w-32" />
            <p className="text-zinc-300 text-sm">
              Aqui você encontra todas as estatísticas e resultados de partidas do Pokémon TCG Live que foram importadas.
              Acompanhe seus resultados gerais, torneios online e desempenho por deck.
            </p>
          </CardContent>
        </Card>

        {/* Resumo de Torneios */}
        <Card>
          <CardContent>
            <h2 className="text-lg font-bold text-zinc-100 mb-3 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-400" /> <a href="#/tcg-live/torneios" className="hover:underline">Resumo de Torneios</a>
            </h2>
            <table className="w-full table-fixed text-sm text-left text-zinc-300">
              <colgroup>
                <col className="w-3/12" />
                <col className="w-6/12" />
                <col className="w-3/12" />
              </colgroup>
              <thead className="text-zinc-400 border-b border-zinc-700">
                <tr>
                  <th className="py-1">Data</th>
                  <th className="py-1">Torneio</th>
                  <th className="py-1 text-center">Rounds</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.recentTournaments || []).map((t, i) => {
                  const date = t.dateISO || t.date || "";
                  const name = t.name || t.tournamentName || "—";
                  const rounds = t.roundsCount ?? t.roundCount ?? 0;
                  const tid = t.tournamentId || t.id || "";
                  return (
                    <tr key={i}>
                      <td className="py-2"><span className="text-xs text-zinc-400">{date ? date.split("-").reverse().join("/") : "—"}</span></td>
                      <td><a href={tid ? `#/tcg-live/torneios/${tid}` : "#/tcg-live/torneios"} className="hover:underline">{name}</a></td>
                      <td className="text-center">{rounds}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Linha de dois widgets: Últimos Logs + Top 5 Decks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Últimos Logs Registrados */}
        <Card>
          <CardContent>
            <h2 className="text-lg font-bold text-zinc-100 mb-3 flex items-center gap-2">
              <List className="w-5 h-5 text-amber-400" /> Últimos Logs Registrados
            </h2>
            <table className="w-full table-fixed text-sm text-left text-zinc-300">
              <colgroup>
                <col className="w-3/12" />
                <col className="w-6/12" />
                <col className="w-3/12" />
              </colgroup>
              <thead className="text-zinc-400 border-b border-zinc-700">
                <tr>
                  <th className="py-1">Data</th>
                  <th className="py-1">Deck</th>
                  <th className="py-1 text-center">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.recentLogs || []).slice(0,5).map((log, i) => (
                  <tr key={i}>
                    <td className="py-2"><a className="hover:underline" href={`#/tcg-live/datas/${log.dateISO || ""}`}>{(log.dateISO || "").split("-").reverse().join("/")}</a></td>
                    <td>{log.playerDeck || log.deckName || "—"}</td>
                    <td className={`text-center font-bold ${log.result === 'W' ? 'text-green-400' : log.result === 'L' ? 'text-rose-400' : 'text-zinc-300'}`}>{log.result || "-"}</td>
                  </tr>
                ))}
                {(!summary?.recentLogs || summary.recentLogs.length === 0) && (
                  <tr><td colSpan={3} className="py-6 text-center text-zinc-500">Sem dados.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Top 5 Decks */}
        <Card>
          <CardContent>
            <h2 className="text-lg font-bold text-zinc-100 mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" /> <a href="#/tcg-live/decks" className="hover:underline">Top 5 Decks por Win Rate</a>
            </h2>
            <table className="w-full table-fixed text-sm text-left text-zinc-300">
              <colgroup>
                <col className="w-6/12" />
                <col className="w-3/12" />
                <col className="w-3/12" />
              </colgroup>
              <thead className="text-zinc-400 border-b border-zinc-700">
                <tr>
                  <th className="py-1">Deck</th>
                  <th className="py-1">Resultado</th>
                  <th className="py-1 text-center">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.topDecks || []).slice(0,5).map((d, i) => {
                  const counts = d.counts || { W:0, L:0, T:0 };
                  const wr = pct(d.wr ?? 0);
                  return (
                    <tr key={i}>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700" />
                          <span>{prettyDeckKey(d.deckKey) || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <span className="text-emerald-400 font-medium">{counts.W || 0}</span>
                        <span className="text-zinc-400 font-medium"> / </span>
                        <span className="text-rose-400 font-medium">{counts.L || 0}</span>
                        <span className="text-zinc-400 font-medium"> / </span>
                        <span className="text-amber-400 font-medium">{counts.T || 0}</span>
                      </td>
                      <td className="py-2 text-center text-zinc-300 font-bold">{wr.toFixed(1)}% WR</td>
                    </tr>
                  );
                })}
                {(!summary?.topDecks || summary.topDecks.length === 0) && (
                  <tr><td colSpan={3} className="py-6 text-center text-zinc-500">Sem dados.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Todos os Registros */}
      <Card>
        <CardContent>
          <h2 className="text-lg font-bold text-zinc-100 mb-3 flex items-center gap-2">
            <List className="w-5 h-5 text-purple-400" /> Todos os Registros
          </h2>
          <table className="w-full table-fixed text-sm text-left text-zinc-300">
            <colgroup>
              <col className="w-3/12" />
              <col className="w-6/12" />
              <col className="w-2/12" />
              <col className="w-1/12" />
            </colgroup>
            <thead className="text-zinc-400 border-b border-zinc-700">
              <tr>
                <th className="py-1">Data</th>
                <th className="py-1">Deck</th>
                <th className="py-1">Torneio</th>
                <th className="py-1 text-center">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.recentLogs || []).map((log, i) => (
                <tr key={i}>
                  <td className="py-2"><a className="hover:underline" href={`#/tcg-live/datas/${log.dateISO || ""}`}>{(log.dateISO || "").split("-").reverse().join("/")}</a></td>
                  <td>{log.playerDeck || log.deckName || "—"}</td>
                  <td>{(() => { const tName = log.tournamentName || log.tournament || log.tournament_name || ""; const tId = log.tournamentId || log.tId || ""; return tName ? (<a href={tId ? `#/tcg-live/torneios/${tId}` : "#/tcg-live/torneios"} className="hover:underline">{tName}</a>) : ("-"); })()}</td>
                  <td className={`text-center font-bold ${log.result === 'W' ? 'text-green-400' : log.result === 'L' ? 'text-rose-400' : 'text-zinc-300'}`}>{log.result || "-"}</td>
                </tr>
              ))}
              {(!summary?.recentLogs || summary.recentLogs.length === 0) && (
                <tr><td colSpan={4} className="py-6 text-center text-zinc-500">Sem dados.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal de Import */}
      {showImport && (
        <ImportLogsModal
          open={showImport}
          onClose={() => setShowImport(false)}
          onSaved={handleSavedLog}
        />
      )}
    </div>
  );
}
