import React, { useEffect, useMemo, useState } from "react";
import { getAllEvents, getMatchesCount } from "./eventsRepo.js";
import Toast from "./components/Toast.jsx";

const norm = s => String(s || "").trim();
const normalizeStore = (s) => norm(s)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();
const getStoreFromEvent = (ev) => ev.local || ev.storeOrCity || ev.storeName || "";

// Tipos de evento que são relacionados à loja (não torneios)
const LOJA_EVENT_TYPES = new Set(["Liga Local","Challenge","CLP","Cup","CUP","Clp"]);
function isStoreRelated(ev){
  const t = String(ev?.tipo || ev?.type || "").trim().toLowerCase();
  return t === "liga local" || t === "challenge" || t === "clp" || t === "cup";
}

const listEventsByStore = (storeName) => {
  const key = normalizeStore(storeName);
  const all = getAllEvents();
  let filtered = key ? all.filter(ev => normalizeStore(getStoreFromEvent(ev)) === key) : [];
  filtered = filtered.filter(isStoreRelated);
  return filtered.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
};


function parseHash() {
  // #/tcg-fisico/eventos/loja/:store?
  const raw = window.location.hash || "";
  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart.replace(/^#/, "");
  const params = new URLSearchParams(queryPart || "");
  const segments = path.split("/").filter(Boolean);
  return { path, segments, params };
}

function formatDatePt(dateYMD) {
  try {
    const [y, m, d] = (dateYMD || "").split("-").map(Number);
    const dt = new Date(y, (m - 1), d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return dateYMD; }
}

function getWLT(ev) {
  const V = Number(ev?.V ?? 0);
  const D = Number(ev?.D ?? 0);
  const E = Number(ev?.E ?? 0);
  if (V || D || E) return { V, D, E };
  if (Array.isArray(ev?.rounds)) {
    let v=0,d=0,e=0;
    for (const r of ev.rounds) {
      const res = r?.result || r?.res || r?.R || "";
      if (res === "V") v++; else if (res === "D") d++; else if (res === "E") e++;
    }
    return { V:v, D:d, E:e };
  }
  return { V:0, D:0, E:0 };
}

export default function StoreEventsPage() {
  const [allEvents, setAllEvents] = useState([]);
  const [storeParam, setStoreParam] = useState(""); // valor atual da seleção
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [sortMode, setSortMode] = useState("createdAt"); // "createdAt" | "name"
  const [toast, setToast] = useState({ message: "", type: "info" });
  const showToast = (message, type = "info") => setToast({ message, type });

  useEffect(() => {
    try {
      setAllEvents(getAllEvents());
      const { segments } = parseHash();
      // Esperado: ["tcg-fisico","eventos","loja",":store?"]
      const storeRaw = segments?.[3] ? decodeURIComponent(segments[3]) : "";
      setStoreParam(storeRaw);
    } catch (e) {
      console.warn("[Loja] falha ao carregar", e);
    }
  }, []);

  // Lojas únicas (dinâmico)
  const storeIndex = useMemo(() => {
    const m = new Map();
    for (const ev of allEvents) {
      if (!isStoreRelated(ev)) continue;
const raw = norm(getStoreFromEvent(ev));
      const key = normalizeStore(raw);
      if (key && !m.has(key)) m.set(key, raw);
    }
    return m;
  }, [allEvents]);

  const uniqueStores = useMemo(() => {
    return Array.from(storeIndex.values()).sort((a,b) => a.localeCompare(b, 'pt-BR'));
  }, [storeIndex]);


  // Ajusta storeParam para forma canônica baseada no índice
  React.useEffect(() => {
    if (!storeParam) return;
    const key = normalizeStore(storeParam);
    const display = storeIndex.get(key);
    if (display && display !== storeParam) setStoreParam(display);
  }, [storeIndex]);

  const events = useMemo(() => listEventsByStore(storeParam), [storeParam]);

  const allTypes = useMemo(() => {
    const set = new Set();
    for (const ev of events) {
      const t = ev.tipo || ev.type;
      if (t && String(t).trim()) set.add(String(t));
    }
    return ["Todos", ...Array.from(set).sort((a,b) => a.localeCompare(b, "pt-BR"))];
  }, [events]);

  const view = useMemo(() => {
    let arr = events.slice();
    if (typeFilter && typeFilter !== "Todos") {
      arr = arr.filter(ev => (ev.tipo || ev.type) === typeFilter);
    }
    if (sortMode === "name") {
      arr.sort((a,b) => (String(a.nome || a.name || "").localeCompare(String(b.nome || b.name || ""), "pt-BR")));
    } else {
      arr.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    return arr;
  }, [events, typeFilter, sortMode]);

  const onStoreChange = (e) => {
    const v = e.target.value;
    setStoreParam(v);
    const base = "#/tcg-fisico/eventos/loja";
    window.location.hash = v ? `${base}/${encodeURIComponent(v)}` : base;
  };

  const goBack = () => (window.location.hash = "#/tcg-fisico");

  const openEvent = (eventData) => {
    const id = eventData?.id;
    if (!id) {
      showToast("ID do evento não encontrado", "error");
      return;
    }
    const qs = new URLSearchParams();
    try { if (storeParam) qs.set('store', storeParam); } catch {}
    const d = eventData?.dia || eventData?.date;
    if (d) qs.set('date', d);
    const q = qs.toString();
    window.location.hash = `#/tcg-fisico/eventos/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
  };

  return (
    <>
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={goBack}
            className="text-sm px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition"
            aria-label="Voltar"
            title="Voltar"
          >
            ← Voltar
          </button>
          <div className="text-sm text-zinc-400">TCG Físico · Registros da loja</div>
        </div>

        {/* Título + seletor */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Loja:</label>
            <select
              value={storeParam}
              onChange={onStoreChange}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm"
            >
              <option value="">{`--Selecione uma Loja--`}</option>
              {uniqueStores.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <span className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300">
            Total eventos: {view.length}
          </span>
        </div>

        {/* Filtros e ordenação */}
        <div className="flex items-center justify-between mb-3">
          {/* Chips de Tipo */}
          <div className="flex flex-wrap gap-2">
            {allTypes.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-full border text-xs transition ${
                  typeFilter === t ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-zinc-900 text-zinc-200 border-zinc-700 hover:bg-zinc-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {/* Ordenação */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">Ordenar:</span>
            <button
              onClick={() => setSortMode(m => m === "createdAt" ? "name" : "createdAt")}
              className="px-3 py-1 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
              title="Alternar ordenação"
            >
              {sortMode === "createdAt" ? "Criação ↓" : "Evento (A→Z)"}
            </button>
          </div>
        </div>

        {/* Lista */}
        {!storeParam ? (
          <div className="text-zinc-400 text-sm">
            Selecione uma loja para ver os registros.
          </div>
        ) : view.length === 0 ? (
          <div className="text-zinc-400 text-sm">
            Nenhum evento encontrado para esta loja.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            {/* Header */}
            <div className="grid grid-cols-[1fr,1.6fr,0.6fr,0.2fr] gap-2 px-4 py-2 bg-zinc-800 text-sm text-zinc-300">
              <div>Dia</div>
              <div>Evento</div>
              <div className="text-right pr-2">Partidas</div>
              <div className="text-right"> </div>
            </div>

            <ul className="divide-y divide-zinc-800">
              {view.map((ev) => {
                const matches = getMatchesCount(ev);
                const evName = ev.nome || ev.name || "—";
                const fmt = ev.formato || ev.format;
                const { V, D, E } = getWLT(ev);
                return (
                  <li
                    key={ev.id}
                    onClick={() => openEvent(ev)}
                    className="grid grid-cols-[1fr,1.6fr,0.6fr,0.2fr] gap-2 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 cursor-pointer transition"
                  >
                    <div className="truncate">{formatDatePt(ev.dia || ev.date)}</div>
                    <div className="truncate flex items-center gap-2">
                      <span className="truncate">{evName}</span>
                      {fmt && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">
                          {fmt}
                        </span>
                      )}
                    </div>
                    <div className="text-right pr-2 flex items-center justify-end gap-2">
                      <span>{matches}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">{`${V}-${D}-${E}`}</span>
                    </div>
                    <div className="text-right text-zinc-400">→</div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
    {toast.message && (
      <Toast {...toast} onClose={() => setToast({ message: "", type: "info" })} />
    )}
    </>
  );
}
