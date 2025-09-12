import React, { useEffect, useMemo, useState } from "react";
import { getAllLogs, addLog } from "./logsRepo.js";

/**
 * Modelo: Página TCG Live
 * - Armazena logs no servidor (chave de sessão)
 * - Widgets espelhando a estrutura do TCG Físico, mas filtrando somente LOGS ONLINE
 * - "Importar Log" substitui "Novo Registro"
 */

const getLogs = () => getAllLogs();

const norm = (s) => String(s || "").trim();
const normalizeDeck = (s) => norm(s).toLowerCase();
const todayYMD = () => {
  const d = new Date();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const asDate = (ymd) => new Date(ymd || 0);

function formatDatePt(dateYMD) {
  try {
    const [y, m, d] = (dateYMD || "").split("-").map(Number);
    const dt = new Date(y, (m - 1), d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return dateYMD; }
}

// Aggregations
function countWLT(logs){
  let W=0,L=0,T=0;
  for(const l of logs){
    const r = (l?.result || "").toUpperCase();
    if(r==="W") W++; else if(r==="L") L++; else if(r==="T") T++;
  }
  return {W,L,T};
}

function wrPct(logs){
  const {W,L,T} = countWLT(logs);
  const total = W+L+T;
  if(!total) return 0;
  return (W/total)*100;
}

// Group by tournament (name), considering date as first log date
function aggregateTournaments(logs){
  const map = new Map(); // key: tournamentName (normalized) + date; value: {name, date, logs: []}
  for(const l of logs){
    if(!l?.isTournament) continue;
    const name = norm(l?.tournamentName);
    if(!name) continue;
    const key = `${name}__${l?.playedAt || l?.date || ""}`;
    if(!map.has(key)) map.set(key, { name, date: l?.playedAt || l?.date || "", logs: [] });
    map.get(key).logs.push(l);
  }
  const arr = Array.from(map.values());
  arr.sort((a,b)=> asDate(b.date)-asDate(a.date));
  return arr;
}

export default function TcgLivePage(){
  const [logs, setLogs] = useState([]);
  const [showImport, setShowImport] = useState(false);

  // Import form state
  const [fDate, setFDate] = useState(todayYMD());
  const [fDeck, setFDeck] = useState("");
  const [fResult, setFResult] = useState("W");
  const [fIsTournament, setFIsTournament] = useState(false);
  const [fTournamentName, setFTournamentName] = useState("");
  const [fRound, setFRound] = useState("");

  useEffect(()=>{ getAllLogs().then(setLogs); }, []);

  const onSaveImport = () => {
    const entry = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      playedAt: fDate || todayYMD(),
      createdAt: Date.now(),
      deck: norm(fDeck),
      result: (fResult || "W").toUpperCase(), // W/L/T
      isTournament: !!fIsTournament,
      tournamentName: fIsTournament ? norm(fTournamentName) : "",
      round: fIsTournament ? norm(fRound) : "",
    };
    setLogs([entry, ...logs]);
    addLog(entry);
    setShowImport(false);
    // reset
    setFDate(todayYMD()); setFDeck(""); setFResult("W"); setFIsTournament(false); setFTournamentName(""); setFRound("");
  };

  // Summaries
  const total = logs.length;
  const {W,L,T} = countWLT(logs);
  const WR = wrPct(logs);

  // Tournaments summary (last 5)
  const tournaments = useMemo(()=> aggregateTournaments(logs).slice(0,5), [logs]);

  // Latest logs (last 10)
  const latestLogs = useMemo(()=> {
    const arr = logs.slice().sort((a,b)=> asDate(b.playedAt)-asDate(a.playedAt) || (b.createdAt||0)-(a.createdAt||0));
    return arr.slice(0,10);
  }, [logs]);

  // Top 5 Decks by WR
  const topDecks = useMemo(()=> {
    const byDeck = new Map();
    for(const l of logs){
      const key = normalizeDeck(l?.deck);
      if(!key) continue;
      if(!byDeck.has(key)) byDeck.set(key, []);
      byDeck.get(key).push(l);
    }
    const rows = [];
    for(const [key, arr] of byDeck){
      const w = wrPct(arr);
      rows.push({ deck: arr[0]?.deck || key, wr: w, games: arr.length });
    }
    rows.sort((a,b)=> b.wr - a.wr || b.games - a.games || a.deck.localeCompare(b.deck,"pt-BR"));
    return rows.slice(0,5);
  }, [logs]);

  const goBack = () => (window.location.hash = "#/");

  return (
    <div className="p-4 md:p-6 text-zinc-200">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200" aria-label="Voltar para Home" title="Voltar para Home">← Voltar</button>
        <div className="text-zinc-600">/</div>
        <div className="text-sm text-zinc-400">TCG Live</div>
        <button
          onClick={(e)=>{e.preventDefault(); location.hash="#/importar";}}
          className="ml-auto text-sm px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700"
          aria-label="Importar Log"
          title="Importar Log"
        >Importar Log</button>
      </div>

      {/* Resumo Geral */}
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4 mb-6">
        <div className="mb-3 text-zinc-300 font-semibold">Resumo Geral (TCG Online)</div>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-4 rounded-xl bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-sm text-zinc-400">Partidas</div>
            <div className="text-2xl font-semibold">{total}</div>
          </div>
          <div className="col-span-4 rounded-xl bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-sm text-zinc-400">Win Rate</div>
            <div className="text-2xl font-semibold">{WR.toFixed(1)}%</div>
          </div>
          <div className="col-span-4 rounded-xl bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-sm text-zinc-400">W / L / T</div>
            <div className="text-2xl font-semibold">{W} / {L} / {T}</div>
          </div>
        </div>
      </div>

      {/* Resumo de Torneios (somente logs com flag de torneio) */}
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4 mb-6">
        <div className="mb-3 text-zinc-300 font-semibold">Resumo de Torneios (Online)</div>
        <div className="grid grid-cols-12 gap-2 px-2 py-2 bg-zinc-800 text-sm text-zinc-300 rounded-t-xl">
          <div className="col-span-3">Dia</div>
          <div className="col-span-6">Nome do Torneio</div>
          <div className="col-span-3 text-right pr-2">Partidas</div>
        </div>
        <ul className="divide-y divide-zinc-800">
          {tournaments.map((t)=>{
            const matches = t.logs.length;
            return (
              <li key={t.name + t.date} className="grid grid-cols-12 gap-2 py-2 items-center">
                <div className="col-span-3 pl-2 text-zinc-300">{formatDatePt(t.date)}</div>
                <div className="col-span-6 text-zinc-100 truncate">{t.name}</div>
                <div className="col-span-3 text-right pr-2">{matches}</div>
              </li>
            );
          })}
          {tournaments.length === 0 && (
            <li className="py-6 text-center text-zinc-400">Nenhum torneio online encontrado</li>
          )}
        </ul>
      </div>

      {/* Últimos Logs Registrados */}
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4 mb-6">
        <div className="mb-3 text-zinc-300 font-semibold">Últimos Logs Registrados</div>
        <div className="grid grid-cols-12 gap-2 px-2 py-2 bg-zinc-800 text-sm text-zinc-300 rounded-t-xl">
          <div className="col-span-3">Dia</div>
          <div className="col-span-6">Deck</div>
          <div className="col-span-3 text-right pr-2">Resultado</div>
        </div>
        <ul className="divide-y divide-zinc-800">
          {latestLogs.map((l)=> (
            <li key={l.id} className="grid grid-cols-12 gap-2 py-2 items-center">
              <div className="col-span-3 pl-2 text-zinc-300">{formatDatePt(l.playedAt)}</div>
              <div className="col-span-6 text-zinc-100 truncate">{l.deck || "—"}</div>
              <div className="col-span-3 text-right pr-2">{(l.result||"").toUpperCase()}</div>
            </li>
          ))}
          {latestLogs.length === 0 && (
            <li className="py-6 text-center text-zinc-400">Nenhum log importado ainda</li>
          )}
        </ul>
      </div>

      {/* Top 5 Decks por Win Rate (apenas logs online) */}
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4 mb-6">
        <div className="mb-3 text-zinc-300 font-semibold">Top 5 Decks por Win Rate</div>
        <div className="grid grid-cols-12 gap-2 px-2 py-2 bg-zinc-800 text-sm text-zinc-300 rounded-t-xl">
          <div className="col-span-8">Deck</div>
          <div className="col-span-4 text-right pr-2">Win Rate</div>
        </div>
        <ul className="divide-y divide-zinc-800">
          {topDecks.map((r)=> (
            <li key={r.deck} className="grid grid-cols-12 gap-2 py-2 items-center">
              <div className="col-span-8 pl-2 text-zinc-100 truncate">{r.deck}</div>
              <div className="col-span-4 text-right pr-2">{r.wr.toFixed(1)}% <span className="text-xs text-zinc-400">({r.games})</span></div>
            </li>
          ))}
          {topDecks.length === 0 && (
            <li className="py-6 text-center text-zinc-400">Sem dados suficientes</li>
          )}
        </ul>
      </div>

      {/* Todos os registros */}
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4">
        <div className="mb-3 text-zinc-300 font-semibold">Todos os registros</div>
        <div className="grid grid-cols-12 gap-2 px-2 py-2 bg-zinc-800 text-sm text-zinc-300 rounded-t-xl">
          <div className="col-span-3">Dia</div>
          <div className="col-span-4">Deck</div>
          <div className="col-span-3">Torneio</div>
          <div className="col-span-2 text-right pr-2">Resultado</div>
        </div>
        <ul className="divide-y divide-zinc-800">
          {logs.slice().sort((a,b)=> asDate(b.playedAt)-asDate(a.playedAt) || (b.createdAt||0)-(a.createdAt||0)).map((l)=> (
            <li key={l.id} className="grid grid-cols-12 gap-2 py-2 items-center">
              <div className="col-span-3 pl-2 text-zinc-300">{formatDatePt(l.playedAt)}</div>
              <div className="col-span-4 text-zinc-100 truncate">{l.deck || "—"}</div>
              <div className="col-span-3 text-zinc-200 truncate">{l.isTournament ? (l.tournamentName || "—") : "—"}</div>
              <div className="col-span-2 text-right pr-2">{(l.result||"").toUpperCase()}</div>
            </li>
          ))}
          {logs.length === 0 && (
            <li className="py-6 text-center text-zinc-400">Nenhum registro encontrado</li>
          )}
        </ul>
      </div>

      {/* Modal Importar Log */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800 p-4">
            <div className="text-zinc-200 font-semibold mb-3">Importar Log</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Data</label>
                <input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Resultado</label>
                <select value={fResult} onChange={e=>setFResult(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2">
                  <option value="W">W</option>
                  <option value="L">L</option>
                  <option value="T">T</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Deck</label>
                <input type="text" value={fDeck} onChange={e=>setFDeck(e.target.value)} placeholder="Ex.: Gardevoir ex" className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2" />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <input id="isT" type="checkbox" checked={fIsTournament} onChange={e=>setFIsTournament(e.target.checked)} className="h-4 w-4" />
                <label htmlFor="isT" className="text-sm text-zinc-300">Log de torneio?</label>
              </div>
              {fIsTournament && (
                <>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Nome do Torneio</label>
                    <input type="text" value={fTournamentName} onChange={e=>setFTournamentName(e.target.value)} placeholder="Ex.: League Online #12" className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Round</label>
                    <input type="text" value={fRound} onChange={e=>setFRound(e.target.value)} placeholder="Ex.: 1, 2, Top8..." className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2" />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>setShowImport(false)} className="text-sm px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700">Cancelar</button>
              <button onClick={onSaveImport} className="text-sm px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
