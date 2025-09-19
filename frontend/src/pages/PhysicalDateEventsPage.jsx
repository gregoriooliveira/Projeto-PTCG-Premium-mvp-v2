import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPhysicalDay, listPhysicalDays } from "../services/physicalApi.js";

const TypeBadge = ({ type }) => {
  const normalized = typeof type === "string" ? type.toLowerCase() : "";
  const map = {
    store: { label: "Loja", cls: "bg-emerald-500/15 text-emerald-300" },
    league: { label: "Liga", cls: "bg-cyan-500/15 text-cyan-300" },
    tournament: { label: "Torneio", cls: "bg-indigo-500/15 text-indigo-300" },
    single: { label: "Avulso", cls: "bg-amber-500/15 text-amber-300" },
    practice: { label: "Treino", cls: "bg-sky-500/15 text-sky-300" },
  };
  const fallback = { label: type || "Evento", cls: "bg-zinc-500/15 text-zinc-300" };
  const cfg = map[normalized] || fallback;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const formatHeaderDate = (date) => {
  if (!date) return "—";
  try {
    const dt = new Date(`${date}T00:00:00`);
    return dt.toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch (e) {
    return date;
  }
};

const formatOptionDate = (date) => {
  if (!date) return date;
  try {
    const dt = new Date(`${date}T00:00:00`);
    return dt.toLocaleDateString("pt-BR", {
      weekday: "short",
      month: "2-digit",
      day: "2-digit",
    });
  } catch (e) {
    return date;
  }
};

const computeMatches = (event = {}) => {
  if (typeof event.matches === "number" && Number.isFinite(event.matches)) {
    return event.matches;
  }
  const countsSource =
    (event.counts && typeof event.counts === "object" && event.counts) ||
    (event.stats && typeof event.stats === "object" && event.stats.counts);
  if (countsSource) {
    let total = 0;
    let hasValue = false;
    for (const key of ["W", "L", "T"]) {
      const value = Number(countsSource[key]);
      if (!Number.isFinite(value)) continue;
      total += value;
      hasValue = true;
    }
    if (hasValue) return total;
  }
  if (event.roundsCount != null) {
    const rc = Number(event.roundsCount);
    if (Number.isFinite(rc)) return rc;
  }
  if (Array.isArray(event.results)) {
    return event.results.length;
  }
  return null;
};

const resolveEventName = (event = {}) => {
  const candidates = [
    event.name,
    event.tournamentName,
    event.tournamentId,
    event.classification,
    event.playerDeck,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return event.eventId ? `Evento ${event.eventId}` : "Evento";
};

const resolveLocation = (event = {}) => {
  const candidates = [
    event.storeOrCity,
    event.storeName,
    event.location,
    event.city,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

export default function PhysicalDateEventsPage() {
  const navigate = useNavigate();
  const { dateParam } = useParams();

  const [dates, setDates] = useState([]);
  const [datesLoading, setDatesLoading] = useState(true);
  const [datesError, setDatesError] = useState(null);

  const [dayData, setDayData] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState(null);

  const selectedDateLabel = useMemo(
    () => formatHeaderDate(dateParam),
    [dateParam]
  );

  useEffect(() => {
    let isActive = true;
    const loadDays = async () => {
      setDatesLoading(true);
      setDatesError(null);
      const { data, error } = await listPhysicalDays();
      if (!isActive) return;
      if (error) {
        setDates([]);
        setDatesError(error);
      } else {
        setDates(Array.isArray(data) ? data : []);
      }
      setDatesLoading(false);
    };
    loadDays();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (datesLoading) return;
    if (!dates.length) return;
    if (datesError) return;
    if (!dateParam) {
      navigate(`/tcg-fisico/eventos/data/${dates[0]}`, { replace: true });
      return;
    }
    if (!dates.includes(dateParam)) {
      navigate(`/tcg-fisico/eventos/data/${dates[0]}`, { replace: true });
    }
  }, [dateParam, dates, datesError, datesLoading, navigate]);

  useEffect(() => {
    if (!dateParam) {
      setDayData(null);
      setDayLoading(false);
      setDayError(null);
      return;
    }
    if (dates.length && !dates.includes(dateParam)) {
      setDayLoading(false);
      return;
    }
    let isActive = true;
    const loadDay = async () => {
      setDayLoading(true);
      setDayError(null);
      const { data, error } = await getPhysicalDay(dateParam);
      if (!isActive) return;
      if (error) {
        setDayData(null);
        setDayError(error);
      } else {
        setDayData(data);
      }
      setDayLoading(false);
    };
    loadDay();
    return () => {
      isActive = false;
    };
  }, [dateParam, dates]);

  const handleSelectChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (!value) return;
      navigate(`/tcg-fisico/eventos/data/${value}`);
    },
    [navigate]
  );

  const events = Array.isArray(dayData?.events) ? dayData.events : [];
  const matchesSummary = useMemo(() => {
    if (!dayData?.summary?.counts) return null;
    const { W = 0, L = 0, T = 0 } = dayData.summary.counts;
    return W + L + T;
  }, [dayData]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto text-zinc-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/tcg-fisico")}
            className="rounded-xl px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 transition"
          >
            ← Voltar
          </button>
          <div className="text-sm text-zinc-400">Datas · Físico</div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-4">
          <div className="text-right">
            <div className="text-xs text-zinc-400">Data selecionada</div>
            <div className="text-lg font-semibold capitalize">
              {selectedDateLabel}
            </div>
            {matchesSummary != null && (
              <div className="text-xs text-zinc-500">
                Total de partidas: {matchesSummary}
              </div>
            )}
          </div>
          <div className="min-w-[180px]">
            <label htmlFor="physical-date-select" className="sr-only">
              Selecionar data
            </label>
            <select
              id="physical-date-select"
              value={dateParam ?? ""}
              onChange={handleSelectChange}
              disabled={datesLoading || !dates.length}
              className="w-full bg-zinc-900/80 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {(!dateParam || !dates.includes(dateParam)) && (
                <option value="" disabled>
                  {datesLoading ? "Carregando datas..." : "Selecione uma data"}
                </option>
              )}
              {dateParam && !dates.includes(dateParam) && (
                <option value={dateParam} disabled>
                  {formatOptionDate(dateParam)}
                </option>
              )}
              {dates.map((date) => (
                <option key={date} value={date}>
                  {formatOptionDate(date)}
                </option>
              ))}
            </select>
            {datesError && (
              <div className="mt-1 text-xs text-rose-400">
                Erro ao carregar dias disponíveis.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl shadow-lg">
        <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-base sm:text-lg font-semibold">Eventos do dia</h2>
          <div className="text-xs text-zinc-400">Datas com registros confirmados</div>
        </div>

        <div className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-3 text-xs uppercase tracking-wide text-zinc-400">
          <div className="col-span-5 sm:col-span-5">Loja/Local</div>
          <div className="col-span-5 sm:col-span-5">Evento</div>
          <div className="col-span-2 sm:col-span-2 text-right">Matches</div>
        </div>
        <div className="h-px bg-zinc-800" />

        <div className="divide-y divide-zinc-800">
          {dayLoading && (
            <div className="px-4 sm:px-6 py-10 text-center text-zinc-400">
              Carregando eventos...
            </div>
          )}

          {!dayLoading && dayError && (
            <div className="px-4 sm:px-6 py-10 text-center text-rose-400">
              Não foi possível carregar os eventos para esta data.
            </div>
          )}

          {!dayLoading && !dayError && events.length === 0 && (
            <div className="px-4 sm:px-6 py-10 text-center text-zinc-400">
              Nenhum evento encontrado para <span className="font-medium text-zinc-200">{dateParam}</span>.
            </div>
          )}

          {!dayLoading && !dayError &&
            events.map((event) => {
              const matches = computeMatches(event);
              const location = resolveLocation(event);
              const name = resolveEventName(event);
              return (
                <button
                  key={event.eventId}
                  type="button"
                  onClick={() => navigate(`/tcg-fisico/eventos/${event.eventId}`)}
                  className="w-full grid grid-cols-12 gap-2 px-4 sm:px-6 py-4 items-center text-left hover:bg-zinc-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 transition"
                >
                  <div className="col-span-5 sm:col-span-5 flex items-center gap-2 min-w-0">
                    <TypeBadge type={event.type} />
                    <div className="truncate">
                      <div className="font-medium truncate">
                        {location || "—"}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        {event.classification || event.format || event.opponent || ""}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-5 sm:col-span-5 min-w-0">
                    <div className="font-medium truncate" title={name}>
                      {name}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      ID: {event.eventId}
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-2 text-right font-semibold">
                    {matches != null ? matches : "—"}
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
