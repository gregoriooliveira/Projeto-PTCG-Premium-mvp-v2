import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Trophy, Users } from "lucide-react";
import ResumoGeralWidget from "../components/widgets/ResumoGeralWidget.jsx";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import { getHome, normalizeDeckKey, getDeck, officialArtworkUrl } from "../services/api.js";
import {
  wlCounts,
  winRateFromCounts,
  topDeckByWinRate,
} from "../utils/matchStats.js";

// UI Primitives
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
        <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700"><Icon size={16} className={iconClass} /></div>
      )}
      <h3 className="text-sm font-semibold tracking-wide text-zinc-200">{title}</h3>
    </div>
    {children}
  </motion.div>
);

const Pill = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300">{children}</span>
);

const WLTriplet = ({ W, L, T }) => (
  <div className="text-xl font-semibold text-zinc-200">
    <span className="text-emerald-400">{W}</span>
    <span className="mx-1 text-zinc-500">/</span>
    <span className="text-rose-400">{L}</span>
    <span className="mx-1 text-zinc-500">/</span>
    <span className="text-amber-400">{T}</span>
  </div>
);

const DeckAvatar = ({ deckKey, size = 28 }) => {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const id = normalizeDeckKey(deckKey || "");
        if (!id) return;
        try {
          const doc = await getDeck(id);
          const spriteIds = Array.isArray(doc?.spriteIds) ? doc.spriteIds.slice(0, 2) : [];
          if (mounted) setUrls(spriteIds.map(officialArtworkUrl));
        } catch {
          if (mounted) setUrls([]);
        }
      } catch {
        if (mounted) setUrls([]);
      }
    })();
    return () => { mounted = false; };
  }, [deckKey]);

  if (!urls.length) return <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" style={{ width: size, height: size }} />;
  return (
    <div className="flex -space-x-2">
      {urls.map((u, i) => (
        <img key={i} src={u} alt={deckKey} className="rounded-full border border-zinc-700" style={{ width: size, height: size }} />
      ))}
    </div>
  );
};

// Feature Widgets
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
        topDeck={{ deckName: prettyDeckKey(top?.deckKey || "") || "—", winRate: top?.wr || 0, avatars: top?.avatars || [] }}
      />
    </div>
  );
};

const Last5DaysWidget = ({ home }) => {
  const days = Array.isArray(home?.lastDays) ? home.lastDays : [];
  return (
    <WidgetCard title="Últimos 5 dias (Todos)" icon={CalendarDays} className="col-span-12 md:col-span-6">
      <div className="space-y-2">
        {days.length === 0 && <div className="text-sm text-zinc-400">Sem partidas ainda.</div>}
        {days.map((d) => (
          <div key={d.date} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-zinc-800/60 last:border-b-0">
            <div className="col-span-4 text-sm text-zinc-200"><span>{d.date}</span></div>
            <div className="col-span-4 flex justify-center"><WLTriplet {...d.counts} /></div>
            <div className="col-span-4 flex justify-end"><Pill>WR {d.wr}</Pill></div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};

const TopDecksWidget = ({ home }) => {
  const rows = Array.isArray(home?.topDecks) ? home.topDecks : [];
  return (
    <WidgetCard title="Top 5 Decks por Win Rate" icon={Trophy} iconClass="text-yellow-400" className="col-span-12 md:col-span-6">
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={prettyDeckKey(r.deckKey)} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-zinc-800/60 last:border-b-0">
            <div className="col-span-6 flex items-center gap-3"><DeckLabel deckName={prettyDeckKey(r.deckKey)} pokemonHints={r.pokemons} /></div>
            <div className="col-span-3 flex justify-center"><WLTriplet {...r.counts} /></div>
            <div className="col-span-3 flex justify-end"><Pill>WR {r.wr}</Pill></div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};

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
        const counts = r.counts || { W: 0, L: 0, T: 0 };
        const wr = typeof r.wr === "number" ? r.wr : 0;
        const topDeckName =
          r.topDeckKey ||
          r.topDeck?.deckKey ||
          r.topDeckName ||
          r.topDeck?.name ||
          r.opponentDeck ||
          r.deckName ||
          "";
        const topDeckLabel = prettyDeckKey(topDeckName) || topDeckName || "—";
        const topDeckPokemons = Array.isArray(r.topPokemons)
          ? r.topPokemons
          : Array.isArray(r.topDeck?.pokemons)
            ? r.topDeck.pokemons
            : undefined;
        return (
          <div key={i} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-zinc-800/60 last:border-b-0">
            <div className="col-span-3 truncate">{r.opponentName}</div>
            <div className="col-span-3 text-center"><Pill>{wr}%</Pill></div>
            <div className="col-span-2 text-center"><WLTriplet {...counts} /></div>
            <div className="col-span-4 flex items-center justify-center">
              <DeckLabel deckName={topDeckLabel} pokemonHints={topDeckPokemons} />
            </div>
          </div>
        );
      })}
    </WidgetCard>
  );
};

export default function HomePage() {
  const [homeData, setHomeData] = useState(null);
  const [homeError, setHomeError] = useState("");
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const h = await getHome("all", 5);
        if (mounted) setHomeData(h);
      } catch (e) {
        if (mounted) setHomeError(e.message || String(e));
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

