// src/pages/PhysicalDateEventsPage.jsx
import { useEffect, useMemo, useState } from "react";

// Helpers
const slugify = (s = "") =>
  s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const parseDateFromHash = () => {
  // Supports: #/tcg-fisico/eventos/data/2025-08-31 OR #/tcg-live/datas/2025-08-31
  const hash = (window.location.hash || "").replace(/^#\/?/, ""); // remove leading #/
  const parts = hash.split("/");
  // try to find a date-like token (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const found = parts.find((p) => dateRegex.test(p));
  return found || new Date().toISOString().slice(0, 10);
};

const readAllEvents = () => {
  // Try retrieve from localStorage (real data later); fallback to a rich fake dataset
  try {
    const raw = localStorage.getItem("ptcg-physical-events");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    // ignore
  }
  // Fallback: sample events of mixed types so you can validate the UI
  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      id: "evt-st-001",
      type: "store", // store | tournament | single
      storeName: "Liga Local Centro",
      location: "São Paulo, SP",
      eventName: "Liga Semanal – Standard",
      date: today,
      matches: 4,
    },
    {
      id: "evt-tr-002",
      type: "tournament",
      storeName: "Regional Open",
      location: "Campinas, SP",
      eventName: "Open de Inverno",
      date: today,
      matches: 6,
    },
    {
      id: "evt-solo-003",
      type: "single",
      storeName: "Avulso (sem loja)",
      location: "Online",
      eventName: "Friendly Bo3 vs @RivalZ",
      date: today,
      matches: 3,
    },
    {
      id: "evt-st-004",
      type: "store",
      storeName: "Liga Local Norte",
      location: "Manaus, AM",
      eventName: "Treino Standard",
      date: today,
      matches: 2,
    },
  ];
};

const TypeBadge = ({ type }) => {
  const map = {
    store: { label: "Loja", cls: "bg-emerald-500/15 text-emerald-300" },
    tournament: { label: "Torneio", cls: "bg-indigo-500/15 text-indigo-300" },
    single: { label: "Avulso", cls: "bg-amber-500/15 text-amber-300" },
  };
  const cfg = map[type] || { label: type, cls: "bg-zinc-500/15 text-zinc-300" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

export default function PhysicalDateEventsPage() {
  const [all, setAll] = useState([]);
  const dateStr = useMemo(() => parseDateFromHash(), [window.location.hash]);

  useEffect(() => {
    setAll(readAllEvents());
  }, []);

  const rows = useMemo(
    () => all.filter((e) => (e?.date || "").slice(0, 10) === dateStr),
    [all, dateStr]
  );

  const goto = (hash) => {
    window.location.hash = hash;
  };

  const formatHeaderDate = (d) => {
    try {
      const dt = new Date(d + "T00:00:00");
      return dt.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      return d;
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto text-zinc-100">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goto("#/tcg-fisico")}
            className="rounded-xl px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 transition"
          >
            ← Voltar
          </button>
          <div className="text-sm text-zinc-400">Datas · Físico</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">Data</div>
          <div className="text-lg font-semibold">{formatHeaderDate(dateStr)}</div>
        </div>
      </div>

      {/* Card */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl shadow-lg">
        <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold">Eventos do dia</h2>
          <div className="text-xs text-zinc-400">Sem filtros · listagem completa</div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 text-xs uppercase tracking-wide text-zinc-400">
          <div className="col-span-5 sm:col-span-5">Loja/Local</div>
          <div className="col-span-5 sm:col-span-5">Evento</div>
          <div className="col-span-2 sm:col-span-2 text-right">Matches</div>
        </div>
        <div className="h-px bg-zinc-800" />

        {/* Rows */}
        <div className="divide-y divide-zinc-800">
          {rows.length === 0 && (
            <div className="px-4 sm:px-6 py-10 text-center text-zinc-400">
              Nenhum evento encontrado para <span className="font-medium text-zinc-200">{dateStr}</span>.
            </div>
          )}

          {rows.map((e) => (
            <div key={e.id} className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-4 items-center">
              {/* Loja/Local */}
              <div className="col-span-5 sm:col-span-5 flex items-center gap-2 min-w-0">
                <TypeBadge type={e.type} />
                <div className="truncate">
                  {/* Opcional: linkar para a página da loja, se existir */}
                  {e.type === "store" ? (
                    <a
                      href={`#/tcg-fisico/loja/${slugify(e.storeName)}`}
                      className="hover:underline"
                    >
                      {e.storeName}
                    </a>
                  ) : (
                    <span>{e.storeName}</span>
                  )}
                  <div className="text-xs text-zinc-400 truncate">{e.location || "—"}</div>
                </div>
              </div>

              {/* Evento */}
              <div className="col-span-5 sm:col-span-5 min-w-0">
                <a
                  href={`#/tcg-fisico/eventos/${e.id}`}
                  className="hover:underline font-medium truncate block"
                  title={e.eventName}
                >
                  {e.eventName}
                </a>
                <div className="text-xs text-zinc-500 truncate">ID: {e.id}</div>
              </div>

              {/* Matches */}
              <div className="col-span-2 sm:col-span-2 text-right font-semibold">
                {e.matches ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ========================= App.jsx patch =========================
// 1) Import the page at the top of src/App.jsx
//    import PhysicalDateEventsPage from "./pages/PhysicalDateEventsPage.jsx";
//
// 2) In your hash-based router, add one of the matchers below.
//    Prefer the explicit path first. Keep both to be flexible with existing links.
//
//    if (hash.startsWith('#/tcg-fisico/eventos/data/')) {
//      return <PhysicalDateEventsPage />;
//    }
//    if (hash.startsWith('#/tcg-live/datas/')) { // opcional: compartilhar visual do Live
//      return <PhysicalDateEventsPage />;
//    }
//
// 3) (Opcional) Quando você criar/registrar eventos reais, salve-os em
//    localStorage.setItem('ptcg-physical-events', JSON.stringify([...]))
//    com o seguinte shape mínimo por item:
//    {
//      id: string,
//      type: 'store' | 'tournament' | 'single',
//      storeName: string,
//      location: string,
//      eventName: string,
//      date: 'YYYY-MM-DD',
//      matches: number
//    }
//    Assim a página passa a listar dados reais automaticamente por data.
