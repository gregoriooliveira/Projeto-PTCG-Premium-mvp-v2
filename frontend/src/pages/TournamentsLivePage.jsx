import React, { useEffect, useMemo, useState } from "react";
import { listLiveTournaments, suggestLiveTournaments, getLiveTournament } from "../services/api.js";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import DeckLabel from "../components/DeckLabel.jsx";

const API = import.meta.env.VITE_API_BASE_URL || "";

// ===== Helpers =====
const WR  = (w=0,l=0,t=0) => { const tot=(w||0)+(l||0)+(t||0); return tot ? Math.round((w/tot)*100) : 0; };
const PTS = (w=0,_l=0,t=0) => 3*(w||0)+(t||0);
const fmtDate = (iso) => iso ? new Date(String(iso)+"T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

async function tryJson(url){
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return await r.json();
  } catch { return null; }
}
function safeArray(p){
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.rows)) return p.rows;
  if (Array.isArray(p?.data)) return p.data;
  if (Array.isArray(p?.items)) return p.items;
  if (Array.isArray(p?.result)) return p.result;
  for (const v of Object.values(p||{})) {
    if (Array.isArray(v) && v.length && typeof v[0]==="object") return v;
  }
  return [];
}

// === Deriva torneios apenas quando houver id de torneio OU nome (inclui `event`)
function deriveTournamentsFromLogs(logsJson, query=""){
  const rows = safeArray(logsJson?.rows || logsJson).filter(r => (r.source || r.origin || "live").toLowerCase().includes("live"));
  const map = new Map();
  for (const r of rows){
    const tId   = r.tournamentId || r.tId || r.tournament_id || null; // nunca usar r.id (id do log)
    const tName = r.tournamentName || r.tournament || r.tournament_name || r.tourneyName || r.event || null;
    if (!tId && !tName) continue;

    const key = tId || `name:${tName}`;
    const dateISO = String(r.date || r.createdAt || "").slice(0,10);
    const entry = map.get(key) || {
      id: tId || "",               // pode ficar vazio (vamos usar key virtual no UI)
      tournamentId: tId || "",
      name: tName || "-",
      dateISO,
      format: r.format || r.gameType || r.ruleset || "-",
      deckKey: r.deck || r.playerDeck || r.myDeck || "-",
      counts: { W:0, L:0, T:0 },
    };
    const v = String(r.result || r.r || "").toUpperCase();
    if (v==="W") entry.counts.W++; else if (v==="L") entry.counts.L++; else entry.counts.T++;
    if (dateISO && (!entry.dateISO || entry.dateISO < dateISO)) entry.dateISO = dateISO;
    map.set(key, entry);
  }
  let arr = Array.from(map.values()).map(t=>{
    const tot = (t.counts.W||0)+(t.counts.L||0)+(t.counts.T||0);
    return { ...t, wr: tot ? Math.round((t.counts.W/tot)*100) : 0 };
  });
  if (query){
    const q=query.toLowerCase();
    arr = arr.filter(t => String(t.name).toLowerCase().includes(q) || String(t.id).includes(q));
  }
  arr.sort((a,b)=> String(b.dateISO||"").localeCompare(String(a.dateISO||"")));
  return arr;
}

async function listLiveTournamentsLocal(query=""){
  try {
    const r = await listLiveTournaments(query);
    if (Array.isArray(r) && r.length) return r;
  } catch {}
  const e1 = await tryJson(`${API}/api/live/tournaments${query?`?query=${encodeURIComponent(query)}`:""}`);
  if (Array.isArray(e1) && e1.length) return e1;
  const e2 = await tryJson(`${API}/api/tournaments${query?`?query=${encodeURIComponent(query)}`:""}`);
  if (Array.isArray(e2) && e2.length) return e2;
  const logs = await tryJson(`${API}/api/live/logs?limit=1000`);
  return deriveTournamentsFromLogs(logs || {}, query);
}

// === NOVO: aceita id real OU id virtual "name:<nome>"
async function getLiveTournamentLocal(idOrKey){
  // Se for um id virtual baseado em nome
  if (typeof idOrKey === "string" && idOrKey.startsWith("name:")){
    const name = idOrKey.slice(5).toLowerCase();
    const logs = await tryJson(`${API}/api/live/logs?limit=2000`);
    const rows = safeArray(logs?.rows || logs).filter(r => {
      const nm = (r.tournamentName || r.tournament || r.tournament_name || r.tourneyName || r.event || "").toLowerCase();
      return nm && nm === name;
    });
    const rounds = rows.map((r,idx)=>({
      id: r.id || `${idOrKey}|${idx+1}`,
      round: r.round || r.rnd || (idx+1),
      deck: r.myDeck || r.deck || "-",
      opponent: r.opponent || r.opp || "-",
      opponentDeck: r.opponentDeck || r.oppDeck || r.opponent_deck || "-",
      result: String(r.result || r.r || "-").toUpperCase(),
      gameOrder: r.gameOrder || r.order || "-",
    }));
    const dateISO = String(rows[0]?.date || rows[0]?.createdAt || "").slice(0,10);
    const counts = rounds.reduce((a,r)=>{ if(r.result==="W") a.W++; else if(r.result==="L") a.L++; else a.T++; return a; }, {W:0,L:0,T:0});
    return { id: idOrKey, name: idOrKey.slice(5), dateISO, counts, rounds };
  }

  // Fluxo com ID real de torneio
  try {
    const r = await getLiveTournament(idOrKey);
    if (r && (Array.isArray(r.rounds) || r.id)) return r;
  } catch {}
  const e1 = await tryJson(`${API}/api/live/tournaments/${idOrKey}`);
  if (e1 && (Array.isArray(e1.rounds) || e1.id)) return e1;

  // Fallback por ID real dentro dos logs
  const logs = await tryJson(`${API}/api/live/logs?limit=2000`);
  const rows = safeArray(logs?.rows || logs).filter(r => (r.tournamentId || r.tId || r.tournament_id) == idOrKey);
  const rounds = rows.map((r,idx)=>({
    id: r.id || `${idOrKey}|${idx+1}`,
    round: r.round || r.rnd || (idx+1),
    deck: r.myDeck || r.deck || "-",
    opponent: r.opponent || r.opp || "-",
    opponentDeck: r.opponentDeck || r.oppDeck || r.opponent_deck || "-",
    result: String(r.result || r.r || "-").toUpperCase(),
    gameOrder: r.gameOrder || r.order || "-",
  }));
  const name = rows[0]?.tournamentName || rows[0]?.tournament || rows[0]?.event || `Torneio #${String(idOrKey).slice(-6)}`;
  const dateISO = String(rows[0]?.date || rows[0]?.createdAt || "").slice(0,10);
  const counts = rounds.reduce((a,r)=>{ if(r.result==="W") a.W++; else if(r.result==="L") a.L++; else a.T++; return a; }, {W:0,L:0,T:0});
  return { id: idOrKey, name, dateISO, counts, rounds };
}

function getQueryFromHash(){
  try {
    const h = window.location.hash || "";
    const q = h.includes("?") ? h.split("?")[1] : "";
    const usp = new URLSearchParams(q);
    return usp.get("query") || "";
  } catch { return ""; }
}

// ===== Página principal =====
export default function TournamentsLivePage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos");
  const [format, setFormat] = useState("todos");

  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState(null);
  const [openRounds, setOpenRounds] = useState({});

  useEffect(()=>{
    const apply = async (query) => {
      try { setLoading(true); const data = await listLiveTournamentsLocal(query||""); setRows(Array.isArray(data)?data:[]); }
      finally { setLoading(false); }
    };
    const initial = getQueryFromHash();
    if (initial){ setQ(initial); apply(initial); } else { apply(""); }
    const onHash = ()=>{ const q2 = getQueryFromHash(); setQ(q2); apply(q2); };
    window.addEventListener("hashchange", onHash);
    return ()=>window.removeEventListener("hashchange", onHash);
  }, []);

  async function onChangeQuery(e){
    const v = e.target.value;
    setQ(v);
    setSuggestionsOpen(!!v && v.length>=2);
    if (v && v.length>=2){
      try {
        const s = await suggestLiveTournaments(v);
        setSuggestions(Array.isArray(s)&&s.length ? s : (await listLiveTournamentsLocal(v)).slice(0,10).map(t=>({id:t.id||t.tournamentId,name:t.name,dateISO:t.dateISO})));
      } catch {
        const s2 = (await listLiveTournamentsLocal(v)).slice(0,10).map(t=>({id:t.id||t.tournamentId,name:t.name,dateISO:t.dateISO}));
        setSuggestions(s2);
      }
    } else {
      setSuggestions([]);
    }
    try { setRows(await listLiveTournamentsLocal(v)); } catch {}
  }
  async function selectSuggestion(s){
    const v = s?.name || s?.id || "";
    setQ(v); setSuggestionsOpen(false); setSuggestions([]);
    try { setRows(await listLiveTournamentsLocal(v)); } catch {}
    try { const base="#/tcg-live/torneios"; window.location.hash = v ? `${base}?query=${encodeURIComponent(v)}` : base; } catch {}
  }

  const filtered = useMemo(()=>{
    let arr = [...rows];
    if (status!=="todos") { arr = arr.filter(()=>true); }
    if (format!=="todos") { arr = arr.filter(()=>true); }
    arr.sort((a,b)=> String(b.dateISO||b.date||"").localeCompare(String(a.dateISO||a.date||"")));
    return arr;
  }, [rows, status, format]);

  const aggregates = useMemo(()=>{
    const a = filtered.reduce((acc,t)=>{
      const c = t.counts || { W:t.wins||0, L:t.losses||0, T:t.ties||0 };
      acc.count += 1;
      acc.w += c.W||0; acc.l += c.L||0; acc.t += c.T||0;
      acc.matches += (c.W||0)+(c.L||0)+(c.T||0);
      return acc;
    }, {count:0, matches:0, w:0, l:0, t:0});
    return { ...a, wr: WR(a.w,a.l,a.t), pts: PTS(a.w,a.l,a.t) };
  }, [filtered]);

  // Agora aceita id real ou virtual "name:<nome>"
  async function toggleOpen(idOrKey){
    if (openId === idOrKey){ setOpenId(null); return; }
    setOpenId(idOrKey);
    if (!openRounds[idOrKey]){
      try {
        const d = await getLiveTournamentLocal(idOrKey);
        setOpenRounds(prev => ({...prev, [idOrKey]: Array.isArray(d?.rounds) ? d.rounds : [] }));
      } catch {
        setOpenRounds(prev => ({...prev, [idOrKey]: [] }));
      }
    }
  }

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            <a href="#/tcg-live/torneios" className="hover:underline">Torneios — TCG Live</a>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Importe logs para criar novos torneios. Informe o Limitless ID, ou marque que não possui para inserir manualmente o nome.
          </p>
        </header>

        <section className="mb-6">
          <div className="relative">
            <input
              value={q}
              onChange={onChangeQuery}
              placeholder="Buscar por torneio (nome) ou ID (limitless:..., manual:...)"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            {suggestionsOpen && suggestions.length>0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
                {suggestions.map(s=>(
                  <button
                    key={s.id}
                    onClick={()=>selectSuggestion(s)}
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
              ) : filtered.length===0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400">Nenhum torneio encontrado.</td></tr>
              ) : filtered.map((t,i)=>{
                const counts = t.counts || { W:t.wins||0, L:t.losses||0, T:t.ties||0 };
                const wr = t.wr ?? WR(counts.W,counts.L,counts.T);
                const dateISO = t.dateISO || t.date || "";
                const name = t.name || t.tournamentName || "—";
                const format = t.format || "—";
                const deck = prettyDeckKey(t.deckKey || t.deck || "—");
                const realId = t.id || t.tournamentId || "";
                const keyForToggle = realId || (name ? `name:${name}` : "");

                const canOpen = !!keyForToggle;

                return (
                  <React.Fragment key={realId || name || i}>
                    <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
                      <Td>{fmtDate(dateISO)}</Td>
                      <Td><span className="truncate font-medium">{name}</span></Td>
                      <Td className="hidden md:table-cell text-zinc-300">{format}</Td>
                      <Td className="hidden md:table-cell text-zinc-300"><DeckLabel deckName={deck} pokemonHints={t.pokemons} /></Td>
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
                          <button onClick={()=>toggleOpen(keyForToggle)} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">
                            {openId===keyForToggle ? "Fechar" : "Detalhes"}
                          </button>
                        ) : <span className="text-zinc-600">—</span>}
                      </Td>
                    </tr>
                    {openId===keyForToggle && (
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
                                {(openRounds[keyForToggle]||[]).map(r=>(
                                  <tr key={r.id} className="border-b border-zinc-800 hover:bg-zinc-900/60 cursor-pointer" onClick={()=>{ window.location.hash = `#/tcg-live/logs/${r.id}`; }}>
                                    <td className="px-3 py-2">{r.round || "-"}</td>
                                    <td className="px-3 py-2">{r.opponent || "-"}</td>
                                    <td className="px-3 py-2"><DeckLabel deckName={prettyDeckKey(r.opponentDeck || "-")} pokemonHints={r.opponentPokemons || r.oppPokemons} /></td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`px-2 py-0.5 rounded-md text-xs border ${
                                        r.result==='W' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-700' :
                                        r.result==='L' ? 'bg-rose-500/10 text-rose-300 border-rose-700' :
                                                          'bg-amber-500/10 text-amber-300 border-amber-700'
                                      }`}>{r.result || "-"}</span>
                                    </td>
                                  </tr>
                                ))}
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
