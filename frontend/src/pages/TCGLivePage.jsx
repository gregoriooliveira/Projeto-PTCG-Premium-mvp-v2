import React, { useEffect, useState } from "react";
import { officialArtworkUrl } from "../services/api.js";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import ResumoGeralWidget from "../components/widgets/ResumoGeralWidget.jsx";
import { Trophy, List, ClipboardList } from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL || "";

/* ---------------- UI helpers ---------------- */
const Card = ({ className = "", children }) => (
  <div className={`rounded-2xl bg-zinc-900 border border-zinc-700 shadow-lg ${className}`}>{children}</div>
);
const CardContent = ({ className = "", children }) => <div className={`p-4 ${className}`}>{children}</div>;

function pct(num) {
  if (num == null) return 0;
  let n = Number(num);
  if (Number.isNaN(n)) return 0;
  if (n <= 1) n = n * 100;
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

/* ---------------- torneios/logs helpers ---------------- */
function toDateISO(value) {
  if (!value && value !== 0) return "";
  // já veio ISO?
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  // timestamp numérico
  const d = new Date(Number(value));
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

/** Nome “canônico” de torneio/evento a partir de um log */
function getTournamentNameFromLog(r) {
  return (
    r?.eventName ||
    r?.tournamentName ||
    r?.tournament ||
    r?.tournament_name ||
    r?.tourneyName ||
    r?.event ||
    ""
  );
}
/** ID “canônico” de torneio (nunca usar id do log) */
function getTournamentIdFromLog(r) {
  return r?.tournamentId || r?.tId || r?.tournament_id || "";
}

/** Deriva torneios APENAS quando existir tournamentId OU nome (inclui `event`) */
function deriveTournamentsFromLogs(logsJson) {
  const rows = safeArray(logsJson?.rows || logsJson).filter(r =>
    (r.source || r.origin || "live").toLowerCase().includes("live")
  );

  const byKey = new Map();

  for (const r of rows) {
    const tId = getTournamentIdFromLog(r);
    const tName = getTournamentNameFromLog(r) || null;

    if (!tId && !tName) continue; // só é torneio se tiver id ou nome

    const key = tId || `name:${tName}`;
    const dateISO = toDateISO(r.date || r.createdAt || r.dateISO);

    const v = String(r.result || r.r || "").toUpperCase();
    const prev = byKey.get(key) || {
      id: tId || "",
      tournamentId: tId || "",
      name: tName || "-",
      dateISO,
      deckKey: r.deck || r.playerDeck || r.myDeck || "-",
      format: r.format || r.gameType || r.ruleset || "-",
      counts: { W: 0, L: 0, T: 0 },
    };
    if (v === "W") prev.counts.W++;
    else if (v === "L") prev.counts.L++;
    else prev.counts.T++;

    if (dateISO && (!prev.dateISO || prev.dateISO < dateISO)) prev.dateISO = dateISO;
    byKey.set(key, prev);
  }

  const arr = Array.from(byKey.values()).map(t => {
    const tot = (t.counts.W || 0) + (t.counts.L || 0) + (t.counts.T || 0);
    return { ...t, wr: tot ? Math.round((t.counts.W / tot) * 100) : 0 };
  });
  arr.sort((a, b) => String(b.dateISO || "").localeCompare(String(a.dateISO || "")));
  return arr;
}

/** Normaliza resposta do /home */
function normalizeFromHome(homeJson) {
  if (!homeJson) return null;

  const rawLogs = safeArray(homeJson.recentLogs || homeJson.logs);
  const tournaments = safeArray(homeJson.recentTournaments || homeJson.tournaments);
  const topDecks = safeArray(homeJson.topDecks || homeJson.decks);

  // Logs do HOME (usados pelos cards de cima; o widget "Todos os Registros" NÃO usa mais esses)
  const recentLogs = rawLogs
    .filter(r => (r.source || r.origin || "live").toLowerCase().includes("live"))
    .slice(0, 50)
    .map(r => ({
      dateISO: toDateISO(r.dateISO || r.date || r.createdAt),
      playerDeck: r.deck || r.playerDeck || r.myDeck || "-",
      result: r.result || r.r || "",
      eventName: r.eventName || r.event || getTournamentNameFromLog(r) || "",
      tournamentName: getTournamentNameFromLog(r) || "",
      tournamentId: getTournamentIdFromLog(r),
    }));

  // WR geral
  let W = 0,
    L = 0,
    T = 0;
  if (homeJson?.summary?.counts) {
    const c = homeJson.summary.counts;
    W = Number(c.W || c.w || 0);
    L = Number(c.L || c.l || 0);
    T = Number(c.T || c.t || 0);
  } else if (recentLogs.length) {
    for (const r of recentLogs) {
      const v = String(r.result || r.r || "").toUpperCase();
      if (v === "W") W++;
      else if (v === "L") L++;
      else T++;
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
    const tdWR = d0.wr != null ? pct(d0.wr) : tdTot ? Math.round(((dCounts.W || 0) / tdTot) * 1000) / 10 : 0;
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

/** Normaliza resposta do /live/logs para usos gerais */
function normalizeFromLogs(logsJson) {
  const rows = safeArray(logsJson?.rows || logsJson);
  const liveRows = rows.filter(r => (r.source || r.origin || "live").toLowerCase().includes("live"));

  const recentLogs = liveRows.slice(0, 50).map(r => ({
    dateISO: toDateISO(r.date || r.createdAt || r.dateISO),
    playerDeck: r.deck || r.playerDeck || r.myDeck || "-",
    result: r.result || r.r || "",
    eventName: r.eventName || r.event || "",
    tournamentName: getTournamentNameFromLog(r) || "",
    tournamentId: getTournamentIdFromLog(r),
  }));

  // W/L/T
  let W = 0,
    L = 0,
    T = 0;
  for (const r of liveRows) {
    const v = String(r.result || r.r || "").toUpperCase();
    if (v === "W") W++;
    else if (v === "L") L++;
    else T++;
  }
  const total = W + L + T;
  const wr = total ? Math.round((W / total) * 1000) / 10 : 0;

  // agrega por deck
  const byDeck = new Map();
  for (const r of liveRows) {
    const name = (r.deck || r.playerDeck || r.myDeck || "-") + "";
    const v = String(r.result || r.r || "").toUpperCase();
    const agg = byDeck.get(name) || { W: 0, L: 0, T: 0 };
    if (v === "W") agg.W++;
    else if (v === "L") agg.L++;
    else agg.T++;
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
    summary: {
      wr,
      counts: { total },
      topDeck: topDecks[0]
        ? { deckKey: topDecks[0].deckKey, wr: topDecks[0].wr, avatars: [] }
        : { deckKey: "-", wr: 0, avatars: [] },
    },
  };
}

export default function TCGLivePage() {
  const [summary, setSummary] = useState(null);
  const [logsForTable, setLogsForTable] = useState([]); // <- fonte EXCLUSIVA do widget "Todos os Registros"
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    let alive = true;

    // 1) Carrega dados principais (home ou fallback)
    (async () => {
      let norm = null;
      const home = await tryJson(`${API}/api/home?source=live&limit=5`);
      if (home) {
        norm = normalizeFromHome(home);
      } else {
        const logs =
          (await tryJson(`${API}/api/live/logs?source=live&limit=200`)) ||
          (await tryJson(`${API}/api/live/logs?limit=200`));
        // usamos só o summary daqui; "Todos os Registros" terá sua própria busca separada
        norm = { ...normalizeFromLogs(logs || {}), recentTournaments: [] };
      }

      // 2) Tenta lista dedicada de torneios (para o widget "Resumo de Torneios")
      if (!norm.recentTournaments || norm.recentTournaments.length === 0) {
        const tjson =
          (await tryJson(`${API}/api/live/tournaments?limit=5`)) ||
          (await tryJson(`${API}/api/tournaments?limit=5`));
        let tournaments = [];
        if (tjson) {
          const list = safeArray(tjson);
          tournaments = list
            .map(t => ({
              dateISO: t.dateISO || t.date || "",
              name: t.name || t.tournamentName || "-",
              roundsCount:
                (t.counts && (t.counts.W || 0) + (t.counts.L || 0) + (t.counts.T || 0)) ||
                t.roundsCount ||
                t.roundCount ||
                0,
              tournamentId: t.id || t.tournamentId || "",
            }))
            .slice(0, 5);
        }
        // 3) fallback real a partir dos logs (derivação)
        if (tournaments.length === 0) {
          const logs = await tryJson(`${API}/api/live/logs?limit=500`);
          const derived = deriveTournamentsFromLogs(logs || {});
          tournaments = derived.slice(0, 5).map(t => ({
            dateISO: t.dateISO,
            name: t.name,
            roundsCount: (t.counts?.W || 0) + (t.counts?.L || 0) + (t.counts?.T || 0),
            tournamentId: t.tournamentId || t.id || "",
          }));
        }
        norm = { ...norm, recentTournaments: tournaments };
      }

      if (alive) setSummary(norm);
    })();

    // 4) Carrega EXCLUSIVAMENTE os logs para o widget "Todos os Registros"
    (async () => {
      try {
        setLoadingLogs(true);
        const logsJson =
          (await tryJson(`${API}/api/live/logs?limit=500`)) ||
          (await tryJson(`${API}/api/live/logs?source=live&limit=500`));
        const rows = safeArray(logsJson?.rows || logsJson)
          .filter(r => (r.source || r.origin || "live").toLowerCase().includes("live"))
          .map(r => ({
            dateISO: toDateISO(r.date || r.createdAt || r.dateISO),
            playerDeck: r.deck || r.playerDeck || r.myDeck || "-",
            result: r.result || r.r || "",
            // torneio
            eventName:
              r.event ||
              r.eventName ||
              r.tournamentName ||
              r.tournament ||
              r.tournament_name ||
              r.tourneyName ||
              "",
            tournamentId: getTournamentIdFromLog(r),
          }))
          .sort((a, b) => String(b.dateISO || "").localeCompare(String(a.dateISO || "")));
        if (alive) setLogsForTable(rows);
      } finally {
        if (alive) setLoadingLogs(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="p-4 space-y-6">
      <ResumoGeralWidget
        title="TCG Live"
        variant="live"
        winRate={{ value: pct(summary?.summary?.wr ?? 0), label: "Win Rate" }}
        center={{ number: summary?.summary?.counts?.total ?? 0, subtitle: "Logs importados" }}
        topDeck={{
          deckName: prettyDeckKey(summary?.summary?.topDeck?.deckKey || ""),
          winRate: pct(summary?.summary?.topDeck?.wr ?? 0),
          avatars: (summary?.summary?.topDeck?.avatars || [])
            .slice(0, 2)
            .map(a => (typeof a === "string" && a.startsWith("http") ? a : officialArtworkUrl(a))),
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <ClipboardList className="w-5 h-5 text-blue-400" />{" "}
              <a href="#/tcg-live/torneios" className="hover:underline">
                Resumo de Torneios
              </a>
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
                      <td className="py-2">
                        <span className="text-xs text-zinc-400">
                          {date ? date.split("-").reverse().join("/") : "—"}
                        </span>
                      </td>
                      <td>
                        {tid ? (
                          <a href={`#/tcg-live/torneios/${tid}`} className="hover:underline">
                            {name}
                          </a>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="text-center">{rounds}</td>
                    </tr>
                  );
                })}
                {(!summary?.recentTournaments || summary.recentTournaments.length === 0) && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-zinc-500">
                      Sem dados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Últimos Logs */}
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
                {(summary?.recentLogs || [])
                  .slice(0, 5)
                  .map((log, i) => (
                    <tr key={i}>
                      <td className="py-2">
                        <a className="hover:underline" href={`#/tcg-live/datas/${log.dateISO || ""}`}>
                          {(log.dateISO || "").split("-").reverse().join("/")}
                        </a>
                      </td>
                      <td>
                        <DeckLabel deckName={prettyDeckKey(log.playerDeck || log.deckName || "—")} />
                      </td>
                      <td
                        className={`text-center font-bold ${
                          log.result === "W"
                            ? "text-green-400"
                            : log.result === "L"
                            ? "text-rose-400"
                            : "text-zinc-300"
                        }`}
                      >
                        {log.result || "-"}
                      </td>
                    </tr>
                  ))}
                {(!summary?.recentLogs || summary.recentLogs.length === 0) && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-zinc-500">
                      Sem dados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Top 5 Decks */}
        <Card>
          <CardContent>
            <h2 className="text-lg font-bold text-zinc-100 mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />{" "}
              <a href="#/tcg-live/decks" className="hover:underline">
                Top 5 Decks por Win Rate
              </a>
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
                {(summary?.topDecks || [])
                  .slice(0, 5)
                  .map((d, i) => {
                    const counts = d.counts || { W: 0, L: 0, T: 0 };
                    const wr = pct(d.wr ?? 0);
                    return (
                      <tr key={i}>
                        <td className="py-2">
                          <DeckLabel deckName={prettyDeckKey(d.deckKey)} />
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
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-zinc-500">
                      Sem dados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ---------------- Todos os Registros (usa /api/live/logs) ---------------- */}
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
              {loadingLogs ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    Carregando…
                  </td>
                </tr>
              ) : logsForTable.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    Sem dados.
                  </td>
                </tr>
              ) : (
                logsForTable.map((log, i) => {
                  const tName =
                    log.eventName ||
                    log.tournamentName ||
                    log.tournament ||
                    log.tournament_name ||
                    log.tourneyName ||
                    "";
                  const tId = log.tournamentId || "";

                  return (
                    <tr key={i}>
                      <td className="py-2">
                        <a className="hover:underline" href={`#/tcg-live/datas/${log.dateISO || ""}`}>
                          {(log.dateISO || "").split("-").reverse().join("/")}
                        </a>
                      </td>
                      <td>
                        <DeckLabel deckName={prettyDeckKey(log.playerDeck || log.deckName || "—")} />
                      </td>
                      <td>
                        {tName ? (
                          tId ? (
                            <a href={`#/tcg-live/torneios/${tId}`} className="hover:underline">
                              {tName}
                            </a>
                          ) : (
                            tName
                          )
                        ) : (
                          "-"
                        )}
                      </td>
                      <td
                        className={`text-center font-bold ${
                          log.result === "W"
                            ? "text-green-400"
                            : log.result === "L"
                            ? "text-rose-400"
                            : "text-zinc-300"
                        }`}
                      >
                        {log.result || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
