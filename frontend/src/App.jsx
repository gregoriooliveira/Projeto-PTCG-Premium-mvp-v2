import OpponentsPage from './pages/OpponentsPage.jsx';
import TCGLivePage from "./pages/TCGLivePage.jsx";
import { prettyDeckKey } from "./services/prettyDeckKey.js";
import {getHome, normalizeDeckKey, getDeck, officialArtworkUrl,} from "./services/api.js";
import PhysicalDateEventsPage from "./pages/PhysicalDateEventsPage.jsx";
import TournamentsLivePage from "./pages/TournamentsLivePage.jsx";
import React, { useMemo, useState, useRef, useEffect } from "react";
import TCGLiveDatePage from "./pages/TCGLiveDatePage.jsx";
import TCGLiveLogDetail from "./pages/TCGLiveLogDetail.jsx";
import { motion } from "framer-motion";
import ResumoGeralWidget from "./components/widgets/ResumoGeralWidget.jsx";
import ImportLogsModal from "./components/ImportLogsModal.jsx";
import PhysicalTournamentsMock from "./pages/PhysicalTournamentsMock.jsx";
import DecksTCGLivePage, { DecksTCGFisicoPage } from "./pages/DecksLivePage.jsx";
import {
  Home as HomeIcon,
  Gamepad2,
  Upload,
  Trophy,
  Settings,
  ChevronRight,
  BarChart3,
  Users,
  CalendarDays,
} from "lucide-react";
import PhysicalStoreEventsPage from "./pages/PhysicalStoreEventsPage.jsx";
import PhysicalPageV2 from "./PhysicalPageV2.jsx";
import EventPhysicalSummaryPage from "./EventPhysicalSummaryPage.jsx";
import TcgLivePage from "./TcgLivePage.jsx";
import TournamentEventsPage from "./TournamentEventsPage.jsx";
import Router from './Router.jsx';
import StoreEventsPage from "./StoreEventsPage.jsx";

import NovoRegistroDialog from "./components/NovoRegistroDialog.jsx";
import {
  wlCounts,
  winRateFromCounts,
  topDeckByWinRate,
  byKey,
  dateKeyMDY,
  mostUsedDeckOf,
} from "./utils/matchStats.js";
import {
  generateMockMatches,
  spriteUrlsFor,
} from "./mocks/decks.js";

import DeckLabel from "./components/DeckLabel.jsx";

/*****************************\
 *  PTCG Premium v2 — Shell   *
 *  Home + Widgets (single)   *
 *  Desktop & Mobile          *
 *  Tailwind + framer-motion  *
 ******************************/
/***************************************************
 * UI Primitives
 ***************************************************/
const SidebarItem = ({ icon: Icon, label, active = false, onClick }) => (
  <button
    onClick={onClick}
    className={`group flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors
      ${active ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"}`}
  >
    <Icon size={18} className="opacity-80" />
    <span>{label}</span>
    <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
  </button>
);

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

const Stat = ({ label, value, align = "left" }) => (
  <div className={`flex flex-col ${align === "right" ? "items-end" : align === "center" ? "items-center" : "items-start"}`}>
    <div className="text-2xl md:text-3xl font-bold text-white leading-tight">{value}</div>
    <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
  </div>
);

const Pill = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300">{children}</span>
);

// Link suave: cor padrão, negrito, sem sublinhado; sublinha no hover
const LinkSoftUnderline = ({ href = '#', title, children }) => (
  <a href={href} title={title} className="text-zinc-200 font-semibold no-underline hover:underline underline-offset-2">{children}</a>
);

function WLTriplet({ W, L, T }) {
  return (
    <div className="text-xl font-semibold text-zinc-200">
      <span className="text-emerald-400">{W}</span>
      <span className="mx-1 text-zinc-500">/</span>
      <span className="text-rose-400">{L}</span>
      <span className="mx-1 text-zinc-500">/</span>
      <span className="text-amber-400">{T}</span>
    </div>
  );
}

const DeckAvatar = ({ deckKey, size = 28 }) => {
  const [urls, setUrls] = React.useState([]);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const id = normalizeDeckKey(deckKey || '');
        if (!id) return;
        try {
          const doc = await getDeck(id);
          const spriteIds = Array.isArray(doc?.spriteIds) ? doc.spriteIds.slice(0,2) : [];
          if (mounted) setUrls(spriteIds.map(officialArtworkUrl));
        } catch (e) {
          if (mounted) setUrls([]);
        }
      } catch {
        if (mounted) setUrls([]);
      }
    })();
    return () => { mounted = false; }
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


/***************************************************
 * Feature Widgets (Home)
 ***************************************************/
const TopBarWidget = ({ home }) => {
  const counts = home?.summary?.counts || { W:0,L:0,T:0,total:0 };
  const wr = typeof home?.summary?.wr === 'number' ? home.summary.wr : 0;
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


const SourceSummaryWidget = ({ title, matches }) => {
  const counts = useMemo(() => wlCounts(matches), [matches]);
  const wr = useMemo(() => winRateFromCounts(counts), [counts]);
  const top = useMemo(() => topDeckByWinRate(matches), [matches]);

  // deduz variant pela origem dos matches
  const isFisico = (matches && matches[0]?.mode === "manual");
  const variant = isFisico ? "fisico" : "live";

  return (
    <div className="col-span-12 md:col-span-6">
      <ResumoGeralWidget
        title={title}
        variant={variant}
        winRate={{ value: wr, label: "WIN RATE" }}
        center={{ number: counts.total, subtitle: "Total de Partidas" }}
        topDeck={{
          deckName: prettyDeckKey(top?.deckKey || "") || "—",
          winRate: top?.winRate || 0,
          avatars: ["/assets/icons/dragapult.png", "/assets/icons/gardevoir.png"]
        }}
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
        {rows.length === 0 && <div className="text-sm text-zinc-400">Insira partidas para ver o ranking.</div>}
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
      title={(<a href="#/oponentes" className="hover:underline underline-offset-2">Oponentes mais frequentes</a>)}
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
        const topDeckKey = r?.topDeck?.deckKey || "";
        const topDeckPokemons = Array.isArray(r?.topDeck?.pokemons) ? r.topDeck.pokemons : undefined;
        return (
          <div key={i} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-zinc-800/60 last:border-b-0">
            <div className="col-span-3 truncate">{r.opponentName}</div>
            <div className="col-span-3 text-center"><Pill>{wr}%</Pill></div>
            <div className="col-span-2 text-center"><WLTriplet {...counts} /></div>
            <div className="col-span-4 flex items-center justify-center">
              <DeckLabel deckName={prettyDeckKey(topDeckKey) || "—"} pokemonHints={topDeckPokemons} />
            </div>
          </div>
        );
      })}
    </WidgetCard>
  );
};


/***************************************************
 * Shell & Layout
 ***************************************************/
const Sidebar = ({ current, onNavigate }) => (
  <aside className="h-full w-64 shrink-0 hidden md:flex flex-col gap-2 p-3 bg-zinc-950/80 border-r border-zinc-800">
    <div className="px-3 py-4">
      <div className="text-lg font-bold text-white">PTCG Premium</div>
      <div className="text-xs text-zinc-400">v2 • App Shell</div>
    </div>
    <nav className="flex-1 space-y-1">
      <SidebarItem icon={HomeIcon} label="Home" active={current === "home"} onClick={() => { window.location.hash = "#/"; onNavigate("home"); }} />
      <SidebarItem icon={Gamepad2} label="Pokémon TCG Live" active={current === "live"} onClick={() => { window.location.hash = "#/tcg-live"; onNavigate("live"); }} />
      <SidebarItem icon={Trophy} label="Pokémon TCG Físico" active={current === "physical"} onClick={() => { window.location.hash = "#/tcg-fisico"; onNavigate("physical"); }} />
      <div className="pt-2 border-t border-zinc-800/60" />
      <SidebarItem icon={Upload} label="Importar Log" onClick={() => { window.__ptcgImportDialogOpen && window.__ptcgImportDialogOpen(); }} />

      <SidebarItem icon={CalendarDays} label="Novo Registro" onClick={() => {
        try {
          const open = window.__ptcgNovoRegistroDialogRef?.open;
          if (typeof open === 'function') {
            try {
              const raw = location.hash || "";
              const segs = raw.split("?")[0].replace(/^#/, "").split("/").filter(Boolean);
              const dia = (segs[0]==="tcg-fisico" && segs[1]==="eventos" && segs[2]==="data" && segs[3]) ? segs[3] : undefined;
              open(dia ? { dia } : undefined);
            } catch { open(); }
            return;
          }
        } catch (e) { /* no-op */ }
        try { sessionStorage.setItem('ptcg:openNovoRegistro', '1'); } catch {}
        // Sempre navegar para a raiz #/tcg-fisico para garantir montagem, inclusive se estiver em subrotas /eventos/...
        if (location.hash !== '#/tcg-fisico') { location.hash = "#/tcg-fisico"; }
      }} />

      <div className="pt-2 border-t border-zinc-800/60" />
      <SidebarItem icon={Settings} label="Configurações" active={current === "settings"} onClick={() => { window.location.hash = "#/config"; onNavigate("settings"); }} />
    </nav>
    <div className="px-3 pb-3 text-[11px] text-zinc-500">© 2025 PTCG Premium</div>
  </aside>
);

const MobileTopbar = ({ onMenu }) => (
  <div className="md:hidden sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
    <div className="flex items-center justify-between px-3 py-3">
      <button onClick={onMenu} className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200">Menu</button>
      <div className="text-white font-semibold">PTCG Premium</div>
      <div className="w-[64px]" />
    </div>
  </div>
);

const Drawer = ({ open, onClose, children }) => (
  <div className={`md:hidden fixed inset-0 z-30 ${open ? "" : "pointer-events-none"}`}>
    <div className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
    <div className={`absolute inset-y-0 left-0 w-72 bg-zinc-950 border-r border-zinc-800 transform transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="p-3">{children}</div>
    </div>
  </div>
);

/***************************************************
 * Pages
 ***************************************************/
const HomePage = () => {
  const [homeData, setHomeData] = useState(null);
  const [homeError, setHomeError] = useState('');
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const h = await getHome('all', 5);
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
};


const Placeholder = ({ title }) => (
  <div className="p-6">
    <WidgetCard title={title}>
      <div className="text-sm text-zinc-400">Em breve: conteúdo desta página.</div>
    </WidgetCard>
  </div>
);

/***************************************************
 * Root
 ***************************************************/
export default function App() {
  // Global Import Logs modal state
  const [showImport, setShowImport] = useState(false);
  const openImport = () => setShowImport(true);

  // Expose a global opener so any button can open the modal from anywhere
  useEffect(() => {
    window.__ptcgImportDialogOpen = openImport;
    const onHash = () => {
      const h = window.location.hash || "";
      if (h.split("?")[0] === "#/importar") setShowImport(true);
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);


  const novoRegistroRef = useRef(null);
  useEffect(() => {
    try {
      window.__ptcgNovoRegistroDialogRef = {
        open: () => { try { return novoRegistroRef.current?.open?.(); } catch(e){} },
        close: () => { try { return novoRegistroRef.current?.close?.(); } catch(e){} },
      };
      return () => { try { delete window.__ptcgNovoRegistroDialogRef; } catch(e){} };
    } catch {}
  }, []);
  useEffect(() => {
    // Auto-abertura global baseada em sessionStorage (funciona em QUALQUER página)
    const KEY = 'ptcg:openNovoRegistro';
    const tryOpen = () => {
      try {
        if (typeof sessionStorage === 'undefined') return;
        if (sessionStorage.getItem(KEY) !== '1') return;
        const open = window.__ptcgNovoRegistroDialogRef?.open;
        if (typeof open === 'function') {
          open();
          sessionStorage.removeItem(KEY);
        }
      } catch {}
    };
    tryOpen();
    const onHash = () => setTimeout(tryOpen, 0);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const hash = useHashRoute();
  const hashParts = parseHash(hash);
// --- Lightweight hash routing ---
function useHashRoute() {
  const [hash, setHash] = React.useState(() => window.location.hash || "");
  React.useEffect(() => {
    const onHash = () => setHash(window.location.hash || "");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

function parseHash(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').map(decodeURIComponent).map(seg => String(seg).split('?')[0].split('#')[0]);
return parts.filter(Boolean);
}

const PageShell = ({ title, children }) => (
  <div className="p-6">
    <WidgetCard title={title}>
      <div className="text-sm text-zinc-300">{children}</div>
    </WidgetCard>
  </div>
);

const DayPage = ({ mdy }) => (
  <PageShell title={"Resumo do dia " + mdy}>
    Esta é uma página placeholder para o dia <span className="font-semibold">{mdy}</span>.<br/>
    No futuro, exibiremos todas as partidas e métricas deste dia.
  </PageShell>
);

const DeckPage = ({ name }) => (
  <PageShell title={"Deck: " + name}>
    Placeholder do deck <span className="font-semibold">{name}</span>.<br/>
    Mostraremos estatísticas, linha do tempo de partidas e matchups.
  </PageShell>
);

const OpponentPage = ({ name }) => (
  <PageShell title={"Oponente: " + name}>
    Placeholder do oponente <span className="font-semibold">{name}</span>.<br/>
    Lista de confrontos, decks usados e WR.
  </PageShell>
);

const RegistroPage = ({ id }) => (
  <PageShell title={"Registro: " + id}>
    Placeholder de registro <span className="font-semibold">{id}</span>.<br/>
    Detalharemos: data, loja, tipo de evento, resultado, deck, observações.
  </PageShell>
);

  const [current, setCurrent] = useState("home");

  // Sync sidebar 'current' with location.hash
  function parseHashRoute() {
    const hash = (window.location.hash || '#/').slice(2); // drop "#/"
    const parts = hash.split('/');
    const root = parts[0] || '';
    if (root === '' || root === undefined) return 'home';
    if (root === 'tcg-live') return 'live';
    if (root === 'tcg-fisico') return 'physical';
    if (root === 'importar') return 'import';
    if (root === 'config') return 'settings';
    return 'home';
  }
  React.useEffect(() => {
    const sync = () => setCurrent(parseHashRoute());
    sync(); // initial sync
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [matches] = useState([]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-neutral-950 to-black text-zinc-200">
      <MobileTopbar onMenu={() => setMobileOpen(true)} />
      <div className="mx-auto max-w-[1600px] flex">
        <Sidebar current={current} onNavigate={setCurrent} />

        {/* Mobile Drawer */}
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
          <div className="px-1 py-2">
            <div className="text-lg font-bold mb-3">PTCG Premium</div>
            <nav className="space-y-1">
              <SidebarItem icon={HomeIcon} label="Home" active={current === "home"} onClick={() => { window.location.hash = "#/"; setCurrent("home"); setMobileOpen(false); }} />
              <SidebarItem icon={Gamepad2} label="Pokémon TCG Live" active={current === "live"} onClick={() => { window.location.hash = "#/tcg-live"; setCurrent("live"); setMobileOpen(false); }} />
              <SidebarItem icon={Trophy} label="Pokémon TCG Físico" active={current === "physical"} onClick={() => { window.location.hash = "#/tcg-fisico"; setCurrent("physical"); setMobileOpen(false); }} />
              <SidebarItem icon={Upload} label="Importar Log" onClick={() => { window.__ptcgImportDialogOpen && window.__ptcgImportDialogOpen(); }} />
              <div className="pt-2 border-t border-zinc-800/60" />
              <SidebarItem icon={Settings} label="Configurações" active={current === "settings"} onClick={() => { window.location.hash = "#/config"; setCurrent("settings"); setMobileOpen(false); }} />
            </nav>
          </div>
        </Drawer>

        {/* Main content */}
<main className="flex-1">
          {/* Hash routes take precedence if present */}
          {hashParts.length > 0 ? (

            // Decks routes (Canvas template)
            (hashParts[0] === 'tcg-live' && hashParts[1] === 'logs' && hashParts[2]) ? <TCGLiveLogDetail logId={hashParts[2]} /> :
            (hashParts[0] === 'tcg-live' && hashParts[1] === 'decks') ? <DecksTCGLivePage /> :
            (hashParts[0] === 'tcg-fisico' && hashParts[1] === 'decks') ? <DecksTCGFisicoPage /> :

            hashParts[0] === 'day' ? <DayPage mdy={hashParts.slice(1).join('/')} /> :
            hashParts[0] === 'deck' ? <DeckPage name={hashParts.slice(1).join('/')} /> :
            hashParts[0] === 'opponent' ? <OpponentPage name={hashParts.slice(1).join('/')} /> :
            hashParts[0] === 'registro' ? <RegistroPage id={hashParts[1] || ''} /> :
            hashParts[0] === 'oponentes' ? <OpponentsPage matches={matches} /> :
                        (hashParts[0] === 'tcg-fisico' && hashParts[1] === 'eventos' && hashParts[2] === 'loja') ? <PhysicalStoreEventsPage /> :
            (hashParts[0] === 'tcg-fisico' && hashParts[1] === 'eventos' && hashParts[2] === 'data') ? <PhysicalDateEventsPage /> :
            (hashParts[0] === 'tcg-fisico' && hashParts[1] === 'torneios') ? <PhysicalTournamentsMock /> :
            hashParts[0] === 'tcg-fisico' && hashParts[1] === 'eventos' ? <EventPhysicalSummaryPage /> :
            hashParts[0] === 'eventos' ? <EventPhysicalSummaryPage /> :
            (hashParts[0] === 'tcg-live' && hashParts[1] === 'torneios') ? <TournamentsLivePage /> :
            hashParts[0] === 'tcg-live' ? (hashParts[1] === 'datas' ? <TCGLiveDatePage dateParam={hashParts[2]} /> : <TCGLivePage />) :
            hashParts[0] === 'tcg-fisico' ? <PhysicalPageV2 /> :
            
            hashParts[0] === 'config' ? <Placeholder title="Configurações" /> :
            <HomePage />
          ) : (
            <>
              {current === "home" && <HomePage />}
              {current === "live" && (() => { const hash = (window.location.hash||"#/").slice(2); const parts = hash.split("/"); if (parts[1]==="logs" && parts[2]) { return <TCGLiveLogDetail logId={parts[2]} /> } return <TCGLivePage /> })() }
              {current === "physical" && <PhysicalPageV2 />}
              
              {current === "settings" && <Placeholder title="Configurações" />}
            </>
          )}
</main>
      <NovoRegistroDialog ref={novoRegistroRef} renderTrigger={false} />
      <ImportLogsModal isOpen={showImport} onClose={() => setShowImport(false)} onSaved={(p) => { setShowImport(false); window.location.hash = `#/tcg-live/logs/${p.id}`; }} />
      </div>
    </div>
  );
}

// injected route for /tcg-fisico/torneios
// ensure this is reachable within your render function
/* ROUTE_INJECT_START */
// if (parts[0] === "tcg-fisico" && parts[1] === "torneios") { return <PhysicalTournamentsMock />; }
/* ROUTE_INJECT_END */