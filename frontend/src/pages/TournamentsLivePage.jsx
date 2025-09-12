// src/pages/TournamentsLivePage.jsx
// Template do usuário — adaptado para uma ÚNICA rota (#/tcg-live/torneios?query=...)
// com dados reais do backend, autocomplete e linha colapsável.

import React, { useEffect, useMemo, useState } from "react";
import { listLiveTournaments, suggestLiveTournaments, getLiveTournament } from "../services/api.js";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import DeckLabel from "../components/DeckLabel.jsx";

// ===== Helpers =====
const WR = (w=0, l=0, t=0) => {
  const tot = (w||0) + (l||0) + (t||0);
  if (!tot) return 0;
  return Math.round(((w) / tot) * 100); // fórmula combinada: W/(W+L+T)*100
};
const PTS = (w=0, _l=0, t=0) => 3 * (w||0) + (t||0);
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(String(iso) + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
};
function getQueryFromHash(){
  try {
    const h = window.location.hash || "";
    const q = h.includes("?") ? h.split("?")[1] : "";
    const usp = new URLSearchParams(q);
    return usp.get("query") || "";
  } catch { return ""; }
}

// ===== Página principal (única) =====
export default function TournamentsLivePage() {
  // Busca / filtros
  const [q, setQ] = useState("");  // status e formato ficam só visuais por enquanto
  const [status, setStatus] = useState("todos");
  const [format, setFormat] = useState("todos");

  // Autocomplete
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // Dados
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Colapso (detalhes)
  const [openId, setOpenId] = useState(null);
  const [openRounds, setOpenRounds] = useState({});

  // Carrega na montagem e quando o hash muda (?query=...)
  useEffect(()=>{
    const apply = async (query) => {
      try {
        setLoading(true);
        const data = await listLiveTournaments(query || "");
        setRows(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    };
    const initial = getQueryFromHash();
    if (initial) {
      setQ(initial);
      apply(initial);
    } else {
      apply("");  // tudo
    }
    const onHash = () => {
      const q2 = getQueryFromHash();
      setQ(q2);
      apply(q2);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Handlers de busca / autocomplete
  async function onChangeQuery(e){
    const v = e.target.value;
    setQ(v);
    setSuggestionsOpen(!!v && v.length >= 2);
    if (v && v.length >= 2) {
      try { setSuggestions(await suggestLiveTournaments(v)); } catch {}
    } else {
      setSuggestions([]);
    }
    try { setRows(await listLiveTournaments(v)); } catch {}
  }
  async function selectSuggestion(s){
    const v = s?.id || s?.name || "";
    setQ(v);
    setSuggestionsOpen(false);
    setSuggestions([]);
    try { setRows(await listLiveTournaments(v)); } catch {}
    // atualiza URL com ?query=
    try {
      const base = "#/tcg-live/torneios";
      window.location.hash = v ? `${base}?query=${encodeURIComponent(v)}` : base;
    } catch {}
  }

  // Linhas filtradas visuais (status/format mantenho apenas cosmético)
  const filtered = useMemo(()=>{
    let arr = [...rows];
    if (status !== "todos") {
      arr = arr.filter(() => true);
    }
    if (format !== "todos") {
      arr = arr.filter(() => true);
    }
    arr.sort((a,b)=> String(b.dateISO||b.date||"").localeCompare(String(a.dateISO||a.date||"")));
    return arr;
  }, [rows, status, format]);

  // Agregados
  const aggregates = useMemo(()=>{
    const a = filtered.reduce((acc, t)=>{
      const c = t.counts || { W: t.wins||0, L: t.losses||0, T: t.ties||0 };
      acc.count += 1;
      acc.w += c.W||0; acc.l += c.L||0; acc.t += c.T||0;
      acc.matches += (c.W||0)+(c.L||0)+(c.T||0);
      return acc;
    }, { count:0, matches:0, w:0, l:0, t:0 });
    return { ...a, wr: WR(a.w, a.l, a.t), pts: PTS(a.w, a.l, a.t) };
  }, [filtered]);

  async function toggleOpen(id){
    if (openId === id){ setOpenId(null); return; }
    setOpenId(id);
    if (!openRounds[id]){
      try {
        const d = await getLiveTournament(id);
        setOpenRounds(prev => ({...prev, [id]: Array.isArray(d?.rounds) ? d.rounds : [] }));
      } catch {}
    }
  }

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <a href="#/tcg-live/torneios" className="hover:underline">
                Torneios — TCG Live
              </a>
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Importe logs para criar novos torneios. Informe o Limitless ID, ou marque que não possui para inserir manualmente o nome.
            </p>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative md:col-span-3">
            <input
              value={q}
              onChange={onChangeQuery}
              placeholder="Buscar por torneio (nome) ou ID (limitless:..., manual:...)" 
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            {suggestionsOpen && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
                {suggestions.map(s => (
                  <button key={s.id} onClick={()=>selectSuggestion(s)}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800">
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">Nenhum torneio encontrado.</td>
                </tr>
              ) : (
                filtered.map((t, i) => {
                  const counts = t.counts || { W: t.wins||0, L: t.losses||0, T: t.ties||0 };
                  const wr = t.wr ?? WR(counts.W, counts.L, counts.T);
                  const dateISO = t.dateISO || t.date || "";
                  const name = t.name || t.tournamentName || "—";
                  const format = t.format || "—";
                  const deck = prettyDeckKey(t.deckKey || t.deck || "—");
                  const id = t.id || t.tournamentId || "";

                  return (
                    <React.Fragment key={id || i}>
                      <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
                        <Td>{fmtDate(dateISO)}</Td>
                        <Td>
                          <span className="truncate font-medium">{name}</span>
                        </Td>
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
                          {id ? (
                            <button onClick={()=>toggleOpen(id)} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">
                              {openId===id ? "Fechar" : "Detalhes"}
                            </button>
                          ) : <span className="text-zinc-600">—</span>}
                        </Td>
                      </tr>
                      {openId===id && (
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
                                  {(openRounds[id]||[]).map(r => (
                                    <tr key={r.id} className="border-b border-zinc-800 hover:bg-zinc-900/60 cursor-pointer" onClick={()=>{ window.location.hash = `#/tcg-live/logs/${r.id}`; }}>
                                      <td className="px-3 py-2">{r.round || "-"}</td>
                                      <td className="px-3 py-2">
                                        {r.opponent || "-"}
                                      </td>
                                      <td className="px-3 py-2"><DeckLabel deckName={prettyDeckKey(r.opponentDeck || "-")} pokemonHints={r.opponentPokemons || r.oppPokemons} /></td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded-md text-xs border ${
                                          r.result==='W'?'bg-emerald-500/10 text-emerald-300 border-emerald-700':
                                          r.result==='L'?'bg-rose-500/10 text-rose-300 border-rose-700':
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
                })
              )}
            </tbody>
          </table>
        </section>

        <p className="mt-4 text-xs text-zinc-500">
          Regras: Pontos=3·W+1·T; WR=W/(W+L+T). Status/Formato ficam para depois.
        </p>
      </div>
    </div>
  );
}

// ===== UI helpers =====
function Th({ children, className = "" }) {
  return <th className={`px-4 py-3 text-left font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}
function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}
