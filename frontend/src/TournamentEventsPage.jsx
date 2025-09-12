import React, { useEffect, useMemo, useState } from "react";
import { getAllEvents, getMatchesCount, updateEvent } from "./eventsRepo.js";

const norm = s => String(s || "").trim();
const normalizeCity = (s) => norm(s)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const getCityFromEvent = (ev) => ev.local || ev.city || ev.storeOrCity || "";
const getTypeFromEvent = (ev) => String(ev?.tipo || ev?.type || "").trim();

const ALLOWED_TOUR_TYPES = ["Regional","Special Event","Internacional","Mundial"];

// Lightweight hash reader (reuse app style, but local)
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || "");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

// Parse ?type= or #type= from the hash
function parseTypesFromHash(hash) {
  const h = hash || "";
  let m = h.match(/\?type=([^&#]+)/i);
  if (!m) m = h.match(/[#&]type=([^&]+)/i);
  if (!m) return [];
  return decodeURIComponent(m[1]).split(",").map(s=>s.trim()).filter(Boolean);
}

function formatDatePt(dateYMD) {
  try {
    const [y, m, d] = (dateYMD || "").split("-").map(Number);
    const dt = new Date(y, (m - 1), d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return dateYMD; }
}

function eventDateYMD(ev){ return ev?.dia || ev?.date || ''; }


export default function TournamentEventsPage() {
  const [all, setAll] = useState([]);
  const hash = useHash();

  // Load all events
  useEffect(() => { getAllEvents().then(setAll); }, []);

  const selectedTypes = useMemo(() => parseTypesFromHash(hash), [hash]);
  const selectedSet = useMemo(() => new Set(selectedTypes.filter(Boolean)), [selectedTypes]);

  const [sortMode, setSortMode] = useState('date');

  // Filter only tournaments + by selected type if present
  const events = useMemo(() => {
    let arr = all.filter(ev => ALLOWED_TOUR_TYPES.includes(getTypeFromEvent(ev)));
    if (selectedSet.size) {
      arr = arr.filter(ev => selectedSet.has(getTypeFromEvent(ev)));
    }
      if (sortMode === 'name') arr.sort((a,b)=> (a?.nome||'').localeCompare((b?.nome||''),'pt-BR'));
  else if (sortMode === 'date') arr.sort((a,b)=> new Date(eventDateYMD(b)) - new Date(eventDateYMD(a)));
  else arr.sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
  return arr;
}, [all, selectedSet, sortMode]);

  const goBack = () => (window.location.hash = "#/tcg-fisico");

  const openEvent = (ev) => {
    const id = ev?.id;
    if (!id) return;
    const state = { eventFromProps: ev };
    try {
      history.pushState(state, "", `#/tcg-fisico/eventos/${encodeURIComponent(id)}${selectedTypes.length ? ('?from=torneios&type=' + encodeURIComponent(selectedTypes.join(','))) : '?from=torneios'}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch {
      window.location.hash = `#/tcg-fisico/eventos/${encodeURIComponent(id)}${selectedTypes.length ? ('?from=torneios&type=' + encodeURIComponent(selectedTypes.join(','))) : '?from=torneios'}`;
    }
  };

  return (
    <div className="p-4 md:p-6 text-zinc-200">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200" aria-label="Voltar ao TCG Físico" title="Voltar ao TCG Físico">← Voltar</button>
        <div className="text-zinc-600">/</div>
        <div className="text-sm text-zinc-400">Torneios</div>
      </div>

      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4">
        <div className="flex items-center gap-3 mb-4">
  <label className="text-sm text-zinc-300" htmlFor="tipoSelect">Tipo de Evento:</label>
  <select id="tipoSelect"
    value={selectedTypes[0] || "Todos"}
    onChange={(e) => {
      const v = e.target.value;
      if (v === "Todos") window.location.hash = "#/tcg-fisico/torneios";
      else window.location.hash = `#/tcg-fisico/torneios?type=${encodeURIComponent(v)}`;
    }}
    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm"
    aria-label="Filtrar por tipo de evento"
  >
    <option value="Todos">Todos</option>
    {ALLOWED_TOUR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
  </select>
  <div className="ml-4 flex items-center gap-2">
    <label className="text-sm text-zinc-300" htmlFor="ordenarSelect">Ordenar:</label>
    <select id="ordenarSelect" value={sortMode} onChange={e=>setSortMode(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm" aria-label="Ordenar lista de torneios">
      <option value="date">Data do evento</option>
      <option value="createdAt">Criação</option>
      <option value="name">Nome</option>
    </select>
  </div>
  <button
    onClick={() => { try { navigator.clipboard.writeText(window.location.href); } catch(e) { /* no-op */ } }}
    className="ml-auto text-sm px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700"
    aria-label="Copiar link do filtro"
    title="Copiar link do filtro"
  >Copiar link do filtro</button>
</div>
<div className="border-t border-zinc-800 my-3" />

        <div className="overflow-auto">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-zinc-800 text-sm text-zinc-300 rounded-t-xl">
  <div className="col-span-3">Dia</div>
  <div className="col-span-5">Cidade</div>
  <div className="col-span-3 text-right pr-2">Partidas</div>
  <div className="col-span-1 text-right"> </div>
</div>
<ul className="divide-y divide-zinc-800">
            {events.map(ev => {
              const date = ev?.dia || ev?.date || "";
              const city = getCityFromEvent(ev);
              const V = Number(ev?.V || 0), D = Number(ev?.D || 0), E = Number(ev?.E || 0);
              const matches = getMatchesCount(ev);
              return (
                <li
                  key={ev.id}
                  className="grid grid-cols-12 gap-2 py-2 items-center hover:bg-zinc-900/60 cursor-pointer"
                  onClick={() => openEvent(ev)}
                >
                  <div className="col-span-3 pl-2 text-zinc-300">{formatDatePt(date)}</div>
                  <div className="col-span-5 text-zinc-100 truncate flex items-center gap-2">
  <span>{city || "—"}</span>
  {!city && (
    <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300" title="Cidade ausente">incompleto</span>
  )}
  {!city && (
    <button
      onClick={(e)=>{ e.stopPropagation(); const novo = prompt("Informe a Cidade para este torneio:"); if(!novo) return; try {
        updateEvent(ev.id, { local: novo }).then(() => {
          getAllEvents().then(setAll);
        });
      } catch(_){} }}
      className="text-[10px] px-2 py-0.5 rounded-xl bg-zinc-800 hover:bg-zinc-700"
      aria-label="Editar cidade do torneio"
      title="Editar cidade"
    >✎ editar</button>
  )}
</div>
                  <div className="col-span-3 text-right pr-2 flex items-center justify-end gap-2">
                    <span>{matches}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">{`${V}-${D}-${E}`}</span>
                  </div>
                  <div className="col-span-1 text-right text-zinc-400">→</div>
                </li>
              );
            })}
            {events.length === 0 && (
              <li className="py-6 text-center text-zinc-400">Nenhum torneio encontrado</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
