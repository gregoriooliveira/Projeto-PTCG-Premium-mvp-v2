import React, { useEffect, useMemo, useState } from "react";
import { getOpponentsAgg, getOpponentLogs } from "../services/api.js";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";

// Helper hoisted so it's always defined before any render
function renderWLChip(r){
  const v = String(r ?? '').trim().toUpperCase();
  const base = "inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold ring-1 ring-inset";
  if (v === 'W') return <span className={base + " bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"}>W</span>;
  if (v === 'L') return <span className={base + " bg-rose-500/10 text-rose-300 ring-rose-500/20"}>L</span>;
  if (v === 'E' || v === 'T') return <span className={base + " bg-zinc-500/10 text-zinc-300 ring-zinc-500/20"}>E</span>;
  return <span className={base + " bg-zinc-500/10 text-zinc-300 ring-zinc-500/20"}>-</span>;
}



function clsx(...xs) { return xs.filter(Boolean).join(" "); }
function pct(n){ const x = Number(n)||0; return Math.round(x <= 1 ? x*100 : x); }

function MonBadge({ label }){
  const initials = React.useMemo(() => {
    const clean = String(label||"?").replace(/ex|V/gi,"").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const a = (parts[0]||"?").slice(0,1).toUpperCase();
    const b = (parts[1]||"").slice(0,1).toUpperCase();
    return (a+b).slice(0,2);
  }, [label]);
  return <div className="w-7 h-7 rounded-full bg-zinc-700/60 border border-zinc-600 flex items-center justify-center text-[11px] font-semibold text-zinc-100">{initials}</div>;
}
function PokemonPair({ names=[] }){
  const [a,b] = names;
  return <div className="flex items-center gap-2">{a?<MonBadge label={a}/>:null}{b?<MonBadge label={b}/>:null}</div>;
}

function Pill({ children }){
  return <span className="inline-flex items-center px-2.5 py-1 rounded-2xl border border-zinc-700 bg-zinc-800/60 text-zinc-100 text-xs">{children}</span>;
}
function WLTriplet({ w, l, e }){
  return (<div className="flex items-center gap-1 text-xs">
    <span className="px-2 py-0.5 rounded-md bg-green-900/40 text-green-300 border border-green-800">W {w||0}</span>
    <span className="px-2 py-0.5 rounded-md bg-rose-900/40 text-rose-300 border border-rose-800">L {l||0}</span>
    <span className="px-2 py-0.5 rounded-md bg-amber-900/40 text-amber-300 border border-amber-800">E {e||0}</span>
  </div>);
}
const PAGE_SIZE=5;

function pickOppRows(payload){
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload?.rows)) return payload.rows;
  if(Array.isArray(payload?.data)) return payload.data;
  if(Array.isArray(payload?.result)) return payload.result;
  if(Array.isArray(payload?.items)) return payload.items;
  for(const v of Object.values(payload||{})){
    if(Array.isArray(v)&&v.length&&typeof v[0]==="object") return v;
  }
  return [];
}
function pickLogRows(payload){
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload?.rows)) return payload.rows;
  if(Array.isArray(payload?.data)) return payload.data;
  if(Array.isArray(payload?.items)) return payload.items;
  if(Array.isArray(payload?.logs)) return payload.logs;
  if(Array.isArray(payload?.result)) return payload.result;
  if(Array.isArray(payload?.data?.items)) return payload.data.items;
  for(const v of Object.values(payload||{})){
    if(Array.isArray(v)&&v.length&&typeof v[0]==="object") return v;
  }
  return [];
}

function fromSlugToName(slug){

function renderWLChip(r){
  const v = String(r||'').trim().toUpperCase();
  const base = "inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold ring-1 ring-inset";
  if (v === 'W') return <span className={base + " bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"}>W</span>;
  if (v === 'L') return <span className={base + " bg-rose-500/10 text-rose-300 ring-rose-500/20"}>L</span>;
  if (v === 'E' || v === 'T') return <span className={base + " bg-zinc-500/10 text-zinc-300 ring-zinc-500/20"}>E</span>;
  return <span className={base + " bg-zinc-500/10 text-zinc-300 ring-zinc-500/20"}>-</span>;
}
  if(!slug) return "";
  try{
    return String(slug).replaceAll(/[%_+]/g," ").replaceAll("-"," ").replace(/\s+/g," ").trim();
  }catch{ return "";}
}

export default function OpponentsPage(){
  const [expanded,setExpanded]=useState(null);
  const [page,setPage]=useState(0);
  const [selectedOpponent,setSelectedOpponent]=useState("");
  const [rows,setRows]=useState([]);
  const [loadingAgg,setLoadingAgg]=useState(false);
  const [errorAgg,setErrorAgg]=useState("");
  const [logs,setLogs]=useState([]);
  const [totalLogs,setTotalLogs]=useState(0);
  const [logsBusy,setLogsBusy]=useState(false);
  const [logsErr,setLogsErr]=useState("");

  useEffect(()=>{
    let alive=true;
    setLoadingAgg(true);setErrorAgg("");
    getOpponentsAgg().then(json=>{
      if(!alive) return;
      let raw=pickOppRows(json);
      const normalized=(raw||[]).map(r=>({
        name:r.name||r.opponent||r.opponentName||r.id||"",
        wr:pct(r.winRate ?? r.wr ?? (r.counts&&typeof r.counts.W==="number"? r.counts.W/Math.max(1,(r.counts.W+(r.counts.L||0)+(r.counts.T||0))) : 0)),
        counts:{w:r.wins??r.W??(r.counts&&(r.counts.W))??0,l:r.losses??r.L??(r.counts&&(r.counts.L))??0,e:r.ties??r.T??(r.counts&&(r.counts.T))??0},
        topDeckKey:r.topDeckKey??(r.topDeck&&(r.topDeck.deckKey||r.topDeck.key))??r.deckKey??"",
        topDeckName:r.topDeckName??(r.topDeck&&(r.topDeck.deckName||r.topDeck.name))??r.deckName??'',
      topDeckLabel:(r.opponentDeck||r.topDeckName||fromSlugToName(r.topDeckKey)||''),
      topPokemons:Array.isArray(r.topPokemons)?r.topPokemons.slice(0,2):(Array.isArray(r.pokemons)?r.pokemons.slice(0,2):[]),
      }));
      const filtered=(selectedOpponent?normalized.filter(x=>x.name===selectedOpponent):normalized).sort((a,b)=>b.wr-a.wr);
      setRows(filtered);
    }).catch(e=>setErrorAgg(e?.message||"Falha ao carregar oponentes")).finally(()=>setLoadingAgg(false));
    return ()=>{alive=false;};
  },[selectedOpponent]);

  useEffect(()=>{
    if(!expanded){setLogs([]);setTotalLogs(0);return;}
    setLogsBusy(true);setLogsErr("");
    getOpponentLogs(expanded,10000,0).then(json=>{
      const raw=pickLogRows(json);
      const items=(raw||[]).map((x,i)=>({
        id:x.id||x._id||x.logId||`${expanded}-${i}`,
        date:x.date||x.ts||x.playedAt||x.createdAt||"",
        result:x.result||x.outcome||x.r||"",
        myDeck:x.myDeck||x.deck||x.deckName||x.playerDeck||"",
        oppDeck:(x.oppDeck||x.opponentDeck||x.oppDeckName||x.opponentDeckName||x.enemyDeck||x.vsDeck||x.opponentTopDeckName||"")||fromSlugToName(x.oppDeckKey||x.opponentDeckKey||""),
        score:x.score||x.placar||x.s||"",
        eventName:x.eventName||x.event||x.tournament||""
      }));
      setLogs(items);setTotalLogs(items.length);
    }).catch(e=>setLogsErr(e?.message||"Falha ao carregar logs")).finally(()=>setLogsBusy(false));
  },[expanded,page]);

  const allOpponents=useMemo(()=>Array.from(new Set(rows.map(r=>r.name))).sort((a,b)=>a.localeCompare(b)),[rows]);
  const totalPages=Math.max(1,Math.ceil(totalLogs/PAGE_SIZE));
  const pageSlice=logs.slice(0,PAGE_SIZE);

  function toggleExpand(name){setPage(0);setExpanded(c=>c===name?null:name);}

  return (<div className="min-h-[80vh] w-full bg-zinc-950 text-zinc-100 p-4 md:p-6">
    <div><h1 className="text-2xl md:text-3xl font-semibold">Oponentes</h1></div>
    <div className="mt-3 flex items-center gap-3">
      <label className="text-xs text-zinc-400">Filtrar por oponente:</label>
      <select value={selectedOpponent} onChange={e=>setSelectedOpponent(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm">
        <option value="">Todos</option>
        {allOpponents.map(n=><option key={n} value={n}>{n}</option>)}
      </select>
      {selectedOpponent && <button onClick={()=>setSelectedOpponent("")} className="px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800/60 text-sm hover:bg-zinc-800">Limpar</button>}
    </div>

    <div className="grid grid-cols-12 items-center gap-2 text-xs uppercase tracking-wide text-zinc-400 mt-6 pb-2 border-b border-zinc-800/60">
      <div className="col-span-3">Oponente</div><div className="col-span-2 text-center">Win Rate</div><div className="col-span-2 text-center">Resultado</div><div className="col-span-4 text-center" >Deck mais usado</div><div className="col-span-1 text-right">Ações</div>
    </div>

    <div className="divide-y divide-zinc-900/60">
      {rows.map(r=>(<div key={r.name} className="py-3">
        <div className="grid grid-cols-12 items-center gap-2">
          <div className="col-span-3 text-sm"><a href={`#/oponentes?op=${encodeURIComponent(r.name)}`} onClick={e=>e.stopPropagation()} className="text-zinc-200 hover:text-white underline">{r.name}</a></div>
          <div className="col-span-2 flex justify-center"><Pill>{r.wr}%</Pill></div>
          <div className="col-span-2 flex justify-center"><WLTriplet {...r.counts}/></div>
          <div className="col-span-4 flex justify-center">{<DeckLabel deckName={prettyDeckKey(r.topDeckKey || r.topDeckName || (r.topDeck && (r.topDeck.deckName || r.topDeck.name)) || "—")} pokemonHints={r.topPokemons} />}</div>
          <div className="col-span-1 flex justify-end"><button onClick={()=>toggleExpand(r.name)} className={clsx("px-3 py-1.5 rounded-xl border text-xs",expanded===r.name?"border-zinc-500 bg-zinc-800/80":"border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800")}>{expanded===r.name?"Ocultar":"Detalhes"}</button></div>
        </div>

        {expanded===r.name && (<div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Partidas contra {r.name}</h3><p className="text-xs text-zinc-400">Total: {totalLogs} partidas • Página {page+1} de {totalPages}</p></div></div>
          <div className="grid grid-cols-12 items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-400 mt-3 pb-2 border-b border-zinc-800/60">
            <div className="col-span-2">Data</div><div className="col-span-4">Meu deck</div><div className="col-span-4">Deck oponente</div><div className="col-span-1 text-center">Resultado</div><div className="col-span-1">Evento</div>
          </div>
          <div className="divide-y divide-zinc-900/60">
            {logsBusy&&<div className="py-8 text-center text-zinc-400 text-sm">Carregando…</div>}
            {!logsBusy&&!logsErr&&pageSlice.map(log=>(<a key={log.id} href={`#/tcg-live/logs/${encodeURIComponent(log.id)}`} className="grid grid-cols-12 items-center gap-2 py-2 text-sm">
              <div className="col-span-2">{log.date}</div><div className="col-span-4"><DeckLabel deckName={prettyDeckKey(log.myDeck || log.playerDeck || log.deckName || "")} pokemonHints={log.userPokemons || log.myPokemons} /></div><div className="col-span-4"><DeckLabel deckName={prettyDeckKey(log.oppDeck || log.opponentDeck || "")} pokemonHints={log.opponentPokemons || log.oppPokemons} /></div><div className="col-span-1 text-center">{renderWLChip(log.result)}</div><div className="col-span-1">{log.eventName}</div>
            </a>))}
            {!logsBusy&&!logsErr&&pageSlice.length===0&&<div className="py-8 text-center text-zinc-500 text-sm">Sem partidas</div>}
          </div>
        </div>)}
      </div>))}
    </div>
  </div>);
}