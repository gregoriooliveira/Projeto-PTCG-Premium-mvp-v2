// src/pages/PhysicalStoreEventsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import ptBR from "date-fns/locale/pt-BR";

// Função utilitária para normalizar strings
const slugify = (s = "") => s
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase();

const ALLOWED_TYPES = ["CLP", "CUP", "Challenge", "Liga Local"];

function PartidasChips({ w = 0, l = 0, t = 0 }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-700/40">W {w}</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-rose-600/20 text-rose-400 border border-rose-700/40">L {l}</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-600/20 text-amber-400 border border-amber-700/40">E {t}</span>
    </div>
  );
}

export default function PhysicalStoreEventsPage({ allEvents = [] }) {
  const [selectedStore, setSelectedStore] = useState("");

  useEffect(() => {
    const parse = () => {
      const hash = window.location.hash || "";
      const parts = hash.split("/");
      const idx = parts.findIndex((p) => p === "loja");
      const slug = idx !== -1 && parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : "";
      setSelectedStore(slug);
    };
    parse();
    window.addEventListener("hashchange", parse);
    return () => window.removeEventListener("hashchange", parse);
  }, []);

  const stores = useMemo(() => {
    const set = new Set();
    allEvents.forEach((ev) => {
      if (!ALLOWED_TYPES.includes(ev.eventType)) return;
      if (ev.storeName) set.add(ev.storeName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allEvents]);

  const filtered = useMemo(() => {
    const byType = allEvents.filter((ev) => ALLOWED_TYPES.includes(ev.eventType));
    if (!selectedStore) return byType;
    return byType.filter((ev) => slugify(ev.storeName) === selectedStore);
  }, [allEvents, selectedStore]);

  return (
    <div className="min-h-screen w-full text-zinc-100 bg-zinc-950">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto px-6 pt-10 pb-4">
        <h1 className="text-3xl font-bold">Eventos por Loja</h1>
        <p className="text-zinc-400 mt-2">CLP, CUP, Challenge e Liga Local</p>
        <a href="#/tcg-fisico/torneios" className="inline-flex items-center gap-2 text-zinc-300 hover:text-white mt-3">
          <ChevronLeft size={18} /> Voltar
        </a>
      </div>

      {/* CONTROLS */}
      <div className="max-w-7xl mx-auto px-6 grid gap-4">
        {!selectedStore ? (
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Filtrar por loja:</label>
            <select
              className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-3"
              defaultValue=""
              onChange={(e) => {
                const slug = e.target.value;
                if (!slug) return;
                window.location.hash = `#/tcg-fisico/eventos/loja/${slug}`;
              }}
            >
              <option value="" disabled>Selecione</option>
              {stores.map((name) => (
                <option key={name} value={slugify(name)}>{name}</option>
              ))}
            </select>
          </div>
        ) : (
          <button
            className="text-sm text-zinc-400 hover:text-white"
            onClick={() => (window.location.hash = "#/tcg-fisico/eventos/loja")}
          >
            Limpar filtro
          </button>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-5">
            <div className="text-xs uppercase tracking-wide text-zinc-400">Eventos</div>
            <div className="mt-2 text-4xl font-semibold">{filtered.length}</div>
            <div className="text-xs mt-1 text-zinc-500">após filtros</div>
          </div>
          {/* Aqui pode-se calcular WR e Pontos como na página de torneios físico */}
        </div>

        {/* TABELA */}
        <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/50">
          <div className="grid grid-cols-[1fr_1fr_1fr_120px] px-5 py-3 text-xs uppercase tracking-wide text-zinc-400 bg-zinc-900 border-b border-zinc-800">
            <div>Dia</div>
            <div>Evento</div>
            <div>Partidas</div>
            <div className="text-right">Ação</div>
          </div>

          {filtered.map((ev) => (
            <div key={ev.id} className="grid grid-cols-[1fr_1fr_1fr_120px] items-center px-5 py-4 border-b border-zinc-800/60 hover:bg-zinc-900/70 transition-colors">
              <div className="text-zinc-200">
                {ev.date ? format(new Date(ev.date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
              </div>
              <div className="text-zinc-300">{ev.title || ev.eventType}</div>
              <div><PartidasChips w={ev?.results?.w} l={ev?.results?.l} t={ev?.results?.t} /></div>
              <div className="text-right">
                <a
                  href={`#/tcg-fisico/eventos/${ev.id}`}
                  className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700"
                >
                  Detalhes
                </a>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="p-6 text-zinc-400 text-sm">Nenhum evento encontrado.</div>
          )}
        </div>

        <div className="text-xs text-zinc-500 mt-3 mb-12">
          Regras: Pontos = 3·V + 1·E; WR = (V + 0,5·E) / (V + D + E). No Show e Bye contam como vitória.
        </div>
      </div>
    </div>
  );
}

/* Patch App.jsx
import PhysicalStoreEventsPage from "./pages/PhysicalStoreEventsPage.jsx";

else if (hash.startsWith("#/tcg-fisico/eventos/loja")) {
  return render(<PhysicalStoreEventsPage allEvents={physicalEventsArray} />);
}
*/
