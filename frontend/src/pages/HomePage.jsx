import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Trophy, Users } from "lucide-react";
import ResumoGeralWidget from "../components/widgets/ResumoGeralWidget.jsx";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import { getHome, normalizeDeckKey, getOpponentLogs } from "../services/api.js";

/* ===================== UI PRIMITIVES ===================== */
const WidgetCard = ({ title, icon: Icon, iconClass = "", children, className = "" }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className={`rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4 ${className}`}
  >
    <div className="flex items-center gap-2 mb-3">
      {Icon && (
        <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700">
          <Icon size={16} className={iconClass} />
        </div>
      )}
      <h3 className="text-sm font-semibold tracking-wide text-zinc-200">{title}</h3>
    </div>
    {children}
  </motion.div>
);

const Pill = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300">
    {children}
  </span>
);

const WLTriplet = ({ W = 0, L = 0, T = 0 }) => (
  <div className="text-xl font-semibold text-zinc-200">
    <span className="text-emerald-400">{W}</span>
    <span className="mx-1 text-zinc-500">/</span>
    <span className="text-rose-400">{L}</span>
    <span className="mx-1 text-zinc-500">/</span>
    <span className="text-amber-400">{T}</span>
  </div>
);

/* ===================== WIDGETS ===================== */
const TopBarWidget = ({ home }) => {
  const counts = home?.summary?.counts || { W: 0, L: 0, T: 0, total: 0 };
  const wr = typeof home?.summary?.wr === "number" ? home.summary.wr : 0;
  const top = home?.summary?.topDeck || null;

  return (
    <div className="col-span-12">
      <ResumoGeralWidget
        title="Resumo Geral"
        variant="home"
        winRate={{ value: wr, label: "WIN RATE GERAL (LIVE + FÍSICO)" }}
        center={{ kda: { v: counts.W, d: counts.L, e: counts.T }, total: counts.total, subtitle: "Total de Partidas" }}
        topDeck={{
          deckName: prettyDeckKey(top?.deckKey || "") || "—",
          winRate: top?.wr || 0,
          avatars: top?.avatars || [],
          pokemons: top?.pokemons || [],
        }}
      />
    </div>
  );
};

const Last5DaysWidget = ({ home }) => {
  const rawLogs = Array.isArray(home?.recentLogs) ? home.recentLogs : [];
  const logs = rawLogs.filter((log) => log && typeof log === "object").slice(0, 5);

  const buildLogHref = (log) => {
    if (!log?.eventId) return null;
    if (log?.source === "live") return `#/tcg-live/logs/${encodeURIComponent(log.eventId)}`;
    if (log?.source === "physical") return `#/tcg-fisico/eventos/${encodeURIComponent(log.eventId)}`;
    return null;
  };

  const getResultClass = (result) => {
    if (result === "W") return "text-emerald-400";
    if (result === "L") return "text-rose-400";
    if (result === "T") return "text-amber-400";
    return "text-zinc-300";
  };

  return (
    <WidgetCard title="Últimos Registros" icon={CalendarDays} className="col-span-12 md:col-span-6">
      <div className="grid grid-cols-12 font-mono text-xs text-zinc-400 mb-2">
        <div className="col-span-3">Data</div>
        <div className="col-span-4">Partida</div>
        <div className="col-span-2 text-center">Resultado</div>
        <div className="col-span-3 text-right md:text-left">Decks</div>
      </div>

      <div className="space-y-2">
        {logs.length === 0 && <div className="text-sm text-zinc-400">Sem partidas ainda.</div>}
        {logs.map((log) => {
          const href = buildLogHref(log);
          const result = typeof log?.result === "string" ? log.result : "—";
          const resultClass = getResultClass(result);
          const name = typeof log?.name === "string" && log.name.trim().length > 0 ? log.name : "—";
          const date = typeof log?.dateISO === "string" && log.dateISO.trim().length > 0 ? log.dateISO : "—";
          const playerDeck = typeof log?.playerDeck === "string" && log.playerDeck.trim().length > 0 ? log.playerDeck : "—";
          const opponentDeck =
            typeof log?.opponentDeck === "string" && log.opponentDeck.trim().length > 0 ? log.opponentDeck : "—";
          const key = log.eventId || [log.dateISO, log.name].filter(Boolean).join("-") || date;

          return (
            <div
              key={key}
              className="grid grid-cols-12 items-start gap-2 py-2 border-b border-zinc-800/60 last:border-b-0"
            >
              <div className="col-span-3 text-sm text-zinc-200">{date}</div>
              <div className="col-span-4 text-sm text-zinc-200 truncate">
                {href ? (
                  <a href={href} className="hover:underline underline-offset-2">
                    {name}
                  </a>
                ) : (
                  name
                )}
              </div>
              <div className="col-span-2 flex justify-center">
                <Pill>
                  <span className={`font-semibold ${resultClass}`}>{result}</span>
                </Pill>
              </div>
              <div className="col-span-3 text-xs text-zinc-300 text-right md:text-left">
                <div className="truncate">{playerDeck}</div>
                <div className="truncate text-zinc-500">vs {opponentDeck}</div>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
};

const TopDecksWidget = ({ home }) => {
  const rows = Array.isArray(home?.topDecks) ? home.topDecks : [];
  return (
    <WidgetCard title="Top 5 Decks por Win Rate" icon={Trophy} iconClass="text-yellow-400" className="col-span-12 md:col-span-6">
      {/* Cabeçalho inserido */}
      <div className="grid grid-cols-12 font-mono text-xs text-zinc-400 mb-2">
        <div className="col-span-6">Deck</div>
        <div className="col-span-3 text-center">Resultado</div>
        <div className="col-span-3 text-right">WinRate</div>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={`${r.deckKey}-${i}`} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-zinc-800/60 last:border-b-0">
            <div className="col-span-6 flex items-center gap-3">
              <DeckLabel deckName={prettyDeckKey(r.deckKey)} pokemonHints={r.pokemons} />
            </div>
            <div className="col-span-3 flex justify-center"><WLTriplet {...(r.counts || { W:0, L:0, T:0 })} /></div>
            <div className="col-span-3 flex justify-end"><Pill>WR {r.wr}</Pill></div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};

/* ===================== FALLBACK DO TOP DECK POR OPONENTE ===================== */
async function enrichOpponentsWithTopDeck(home) {
  const list = Array.isArray(home?.topOpponents) ? [...home.topOpponents] : [];
  const enriched = await Promise.all(
    list.map(async (r) => {
      const already =
        r?.topDeck?.deckKey ||
        r?.topDeckKey ||
        normalizeDeckKey(r?.topDeckName || r?.topDeck || "");

      if (already) return r;

      try {
        const name = r?.opponentName || r?.name || r?.opponent || "";
        if (!name) return r;

        let res = null;
        try { res = await getOpponentLogs(name, 1, 0); }
        catch { res = await getOpponentLogs(name, { limit:1, offset:0 }); }

        const rows = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
        const first = rows[0];
        const deckStr = first?.opponentDeck || first?.oppDeck || "";
        const dk = normalizeDeckKey(deckStr || "");
        if (dk) return { ...r, topDeck: { deckKey: dk } };
      } catch {}

      return r;
    })
  );
  return enriched;
}

/* ===================== OPONENTES WIDGET ===================== */
const TopOpponentsWidget = ({ home }) => {
  const rows = Array.isArray(home?.topOpponents) ? home.topOpponents : [];
  return (
    <WidgetCard
      title={<a href="#/oponentes" className="hover:underline underline-offset-2">Oponentes mais frequentes</a>}
      icon={Users}
      className="col-span-12"
    >
      <div className="grid grid-cols-12 font-mono text-xs text-zinc-400 mb-2">
        <div className="col-span-3">OPONENTE</div>
        <div className="col-span-3 text-center">WIN RATE</div>
        <div className="col-span-2 text-center">Resultado</div>
        <div className="col-span-4 text-center">TOP DECK</div>
      </div>

      {rows.length === 0 && (
        <div className="text-sm text-zinc-400 py-3">Sem oponentes suficientes ainda.</div>
      )}

      {rows.map((r, i) => {
        const counts = r?.counts || { W: 0, L: 0, T: 0 };
        const wr = typeof r?.wr === "number" ? r.wr : 0;

        const keyFromData =
          r?.topDeck?.deckKey ||
          r?.topDeckKey ||
          normalizeDeckKey(r?.topDeckName || r?.topDeck || "");

        const rawLabel = keyFromData ? prettyDeckKey(keyFromData) : "—";
        const deckLabel = rawLabel.replace(/\s*\/+\s*\/+\s*/g, " / ");

        const hints = Array.isArray(r?.topPokemons)
          ? r.topPokemons
          : Array.isArray(r?.topDeck?.pokemons)
            ? r.topDeck.pokemons
            : undefined;

        return (
          <div key={`${r?.opponentName || r?.name || i}-${i}`} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-zinc-800/60 last:border-b-0">
            <div className="col-span-3 truncate">{r?.opponentName || r?.name || "—"}</div>
            <div className="col-span-3 text-center"><Pill>{wr}%</Pill></div>
            <div className="col-span-2 text-center"><WLTriplet {...counts} /></div>
            <div className="col-span-4 flex items-center justify-center">
              <DeckLabel deckName={deckLabel} pokemonHints={hints} />
            </div>
          </div>
        );
      })}
    </WidgetCard>
  );
};

/* ===================== PÁGINA ===================== */
export default function HomePage() {
  const [homeData, setHomeData] = useState(null);
  const [homeError, setHomeError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const h = await getHome("all", 5);
        const enrichedOpps = await enrichOpponentsWithTopDeck(h);
        if (mounted) setHomeData({ ...(h || {}), topOpponents: enrichedOpps });
      } catch (e) {
        if (mounted) setHomeError(e?.message || String(e));
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="p-3 md:p-6">
      <div className="grid grid-cols-12 gap-3 md:gap-4">
        <TopBarWidget home={homeData} />
        <Last5DaysWidget home={homeData} />
        <TopDecksWidget home={homeData} />
        <TopOpponentsWidget home={homeData} />
      </div>
      {homeError && <div className="text-rose-400 text-sm mt-3">Erro: {homeError}</div>}
    </div>
  );
}
