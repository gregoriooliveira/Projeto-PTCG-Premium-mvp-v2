import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import BackButton from "../components/BackButton.jsx";
import EditLogModal from "../components/EditLogModal.jsx";
import Toast from "../components/Toast.jsx";
import { deleteLiveEvent, getLiveEvent } from "../services/api.js";

/** --- UI helpers --- **/
function Chip({ children, tone = "zinc", small=false, sub=false, strong=false, className="" }){
  const tones = {
    zinc: "bg-zinc-800 text-zinc-200 border-zinc-700",
    green: strong ? "bg-green-500 text-black border-green-500" : "bg-emerald-900/40 text-emerald-300 border-emerald-600/40",
    rose:  strong ? "bg-rose-500 text-white border-rose-500"   : "bg-rose-900/40 text-rose-300 border-rose-600/40",
    amber: "bg-amber-900/40 text-amber-300 border-amber-600/40",
  };
  return (
    <span className={`${small?"px-1.5 py-0 text-[10px]":"px-2 py-0.5 text-xs"} inline-flex items-center rounded-full border ${tones[tone]} ${sub?"relative top-1":""} ${className}`}>
      {children}
    </span>
  );
}

function SectionCard({ title, subtitle, tone = "neutral", children }){
  const borders = { neutral:"border-zinc-800 bg-zinc-900/60", you:"border-emerald-700 bg-emerald-950/40", opp:"border-sky-700 bg-sky-950/40" };
  return (
    <div className={`border ${borders[tone]||borders.neutral} rounded-2xl p-4 md:p-5 shadow-sm`}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-zinc-100 font-semibold tracking-tight">{title}</h3>
        {subtitle && <div className="text-xs text-zinc-400">{subtitle}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ActionRow({ text, results }){
  const [open, setOpen] = useState(false);
  const has = Array.isArray(results) && results.length>0;
  return (
    <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="px-3 py-2 text-sm text-zinc-200">{text}</div>
        {has ? (
          <button onClick={()=>setOpen(o=>!o)} className="px-3 py-2 text-zinc-400 hover:text-zinc-200" aria-label={open?"Recolher":"Expandir"}>{open?"▼":"▶"}</button>
        ) : (
          <span className="px-3 py-2 text-zinc-700">—</span>
        )}
      </div>
      {has && open && (
        <div className="px-4 pb-3">
          <ul className="mt-1 space-y-1 pl-4">
            {results.map((r,i)=> <li key={i} className="text-sm text-zinc-300">• {r.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** --- Parser --- **/
// Gera setup, turnos e resultados (linhas que começam com '>', '-', '•' viram filhos)
function parseTimeline(raw = "", youName = "", oppName = "") {
  const lines = String(raw||"").replace(/\r/g, "").split(/\n+/).map(s => s.trim());
  const out = { setup: [], turns: [], finalLine: null };
  let mode = "setup"; let current = null;

  const turnRegexes = [
    /^(?:TURN|TURNO)\s*#?\s*(\d+)\s*[-–]?\s*(.*)$/i,
    /^Turn\s*(\d+)\s*[-–]?\s*(.*)$/i
  ];

  for (const ln of lines) {
    if (!ln) continue;
    if (/^RESULTADO/i.test(ln)) { mode = "result"; continue; }

    // início de turno
    let tm = null;
    for (const rx of turnRegexes) { const m = ln.match(rx); if (m) { tm = m; break; } }
    if (tm) { mode = "turn"; const no = Number(tm[1]); const player = (tm[2]||"").trim(); current = { no, player, actions: [] }; out.turns.push(current); continue; }

    if (mode === "setup") { out.setup.push({ text: ln }); continue; }

    if (mode === "turn" && current) {
      if (/^(?:>|\-|\u2022)\s+/.test(ln)) {
        const last = current.actions[current.actions.length-1];
        if (last) { last.results = last.results||[]; last.results.push({ text: ln.replace(/^(?:>|\-|\u2022)\s+/, "") }); }
        else { current.actions.push({ text: ln.replace(/^(?:>|\-|\u2022)\s+/, ""), results: [] }); }
      } else {
        current.actions.push({ text: ln, results: [] });
      }
      continue;
    }

    if (mode === "result") { out.finalLine = ln; }
  }

  if (out.turns.length === 0 && out.setup.length === 0 && raw) out.setup = lines.map(text => ({ text }));
  return out;
}

// Winner: pega o nome imediatamente antes de "wins"/"won".
function inferWinnerFromRaw(raw = "") {
  const m = String(raw||"").match(/([A-Za-zÀ-ÿ'’\- ]+?)\s+(?:wins|won)\./i);
  return m ? m[1].trim() : null;
}

/** --- Page --- **/
export default function TCGLiveLogDetail(){
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  const logId = parts[2];

  const [ev, setEv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try{
        const data = await getLiveEvent(logId);
        if (cancel) return;
        setEv(data || null);
      }catch(e){
        console.error("Failed to load event", e);
        if (!cancel) setEv(null);
      }finally{
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [logId]);

  const refreshEvent = async () => {
    try {
      const data = await getLiveEvent(logId);
      setEv(data || null);
    } catch (e) {
      console.error("Failed to refresh event", e);
    }
  };

  const timeline = useMemo(() => {
    if (!ev?.rawLog) return { setup: [], turns: [], finalLine: null };
    return parseTimeline(ev.rawLog, ev.you, ev.opponent);
  }, [ev]);

  const youName = ev?.you || "Você";
  const oppName = ev?.opponent || "Oponente";

  // Quem joga primeiro (se vier do backend)
  const firstPlayer =
    ev?.firstPlayer === youName ? "you" :
    ev?.firstPlayer === oppName ? "opp" : null;

  // Winner absoluto (backend > rawLog)
  const winnerName = (ev?.winner && String(ev.winner).trim())
    ? ev.winner
    : inferWinnerFromRaw(ev?.rawLog || "");

  // Resultado relativo por lado — só se winnerName bater com um dos nomes
  const youRes = winnerName
    ? (winnerName.toLowerCase() === String(youName).toLowerCase() ? "W"
       : winnerName.toLowerCase() === String(oppName).toLowerCase() ? "L"
       : null)
    : null;

  const oppRes = winnerName
    ? (winnerName.toLowerCase() === String(oppName).toLowerCase() ? "W"
       : winnerName.toLowerCase() === String(youName).toLowerCase() ? "L"
       : null)
    : null;

  // Deck labels com fallback
  const label = (deckName, mons) => (deckName && String(deckName).trim())
      ? deckName
      : (Array.isArray(mons) && mons.slice(0,2).map(x=>x.name||x).filter(Boolean).join(" / ")) || "—";
  const youDeck = label(ev?.deckName, (ev?.pokemons||[]).filter(p=>p.side==="you"));
  const oppDeck = label(ev?.opponentDeck, (ev?.pokemons||[]).filter(p=>p.side==="opponent"));

  const toneForTurn = (player) => (String(player||"").toLowerCase().includes(String(youName).toLowerCase())) ? "you" : "opp";

  const handleEdit = () => {
    setEditOpen(true);
  };

  const handleDelete = async () => {
    if (!window.confirm("Deseja realmente excluir este evento?")) return;
    try {
      await deleteLiveEvent(logId);
      setToast({ message: "Evento excluído", type: "success" });
      window.location.hash = "#/tcg-live";
    } catch (e) {
      console.error("Failed to delete event", e);
      const msg = e?.message || "Falha ao excluir";
      setToast({ message: msg, type: "error" });
    }
  };

  if (!ev && loading) {
    return <div className="max-w-5xl mx-auto px-4 py-6 text-zinc-400">Carregando evento…</div>;
  }

  return (
    <>
    <div className="max-w-5xl mx-auto px-4 py-6">
      <BackButton href="#/tcg-live" title="Voltar" />

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          {/* Você: W/L ANTES do nome */}
          {youRes && (youRes === "W" ? <Chip tone="green" strong>W</Chip> : <Chip tone="rose" strong>L</Chip>)}
          <span>{youName}</span>
          {/* Você: 1st/2nd após o nome */}
          {firstPlayer && <Chip small sub tone="zinc">{firstPlayer === "you" ? "1st" : "2nd"}</Chip>}
          <span className="text-zinc-500 mx-2">vs</span>
          {/* Oponente: 1st/2nd antes do nome */}
          {firstPlayer && <Chip small sub tone="zinc">{firstPlayer === "opp" ? "1st" : "2nd"}</Chip>}
          <span>{oppName}</span>
          {/* Oponente: W/L depois do nome */}
          {oppRes && (oppRes === "W" ? <Chip tone="green" strong>W</Chip> : <Chip tone="rose" strong>L</Chip>)}
        </h1>

        {/* Exportar .txt do log bruto */}
        {ev?.rawLog && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleEdit}
              className="px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
              aria-label="Editar"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
              aria-label="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const blob = new Blob([ev.rawLog], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `evento-${logId}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 text-zinc-200 text-sm hover:bg-zinc-800"
              aria-label="Exportar log"
            >
              Exportar .txt
            </button>
          </div>
        )}
      </div>

      {/* Linha de decks com fallback e link de oponente */}
      <div className="mt-1 text-sm text-zinc-400">
        <span className="inline-block">{youDeck}</span>
        <span className="mx-2">vs</span>
        <span className="inline-block">{oppDeck}</span>
        {oppName && (
          <a className="ml-3 underline decoration-zinc-500 hover:text-zinc-200" href={`#/oponentes?op=${encodeURIComponent(oppName)}`}>
            abrir oponente
          </a>
        )}
      </div>

      {/* Setup neutro */}
      <div className="mt-5">
        <SectionCard title="Setup" subtitle="Fase de preparação" tone="neutral">
          {timeline.setup.length === 0 ? (
            <div className="text-sm text-zinc-400">Sem dados de setup</div>
          ) : (
            <ul className="space-y-1 pl-1">
              {timeline.setup.map((s,i)=> <li key={i} className="text-sm text-zinc-300">- {s.text}</li>)}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Turnos com colapso por ação */}
      <div className="mt-4 space-y-4">
        {timeline.turns.map((t, idx) => (
          <SectionCard key={idx} title={`Turn #${t.no} — ${t.player}`} tone={toneForTurn(t.player)}>
            <div className="space-y-2">
              {t.actions.map((a,i)=> <ActionRow key={i} text={a.text} results={a.results} />)}
            </div>
          </SectionCard>
        ))}
      </div>

      {/* Resultado final */}
      {(winnerName || timeline.finalLine) && (
        <div className="mt-4 text-sm text-zinc-300">
          <span className="text-zinc-400 mr-2">Resultado:</span>
          <Chip tone={youRes === "W" ? "green" : "rose"} strong>
            {timeline.finalLine || ((winnerName || "") + " wins.")}
          </Chip>
        </div>
      )}
    </div>
    <EditLogModal
      isOpen={editOpen}
      logId={logId}
      ev={ev}
      onClose={() => setEditOpen(false)}
      onSaved={async () => {
        await refreshEvent();
        setEditOpen(false);
      }}
    />
    <Toast
      message={toast?.message}
      type={toast?.type}
      onClose={() => setToast(null)}
    />
    </>
  );
}
