import React, { useMemo, useState, useEffect } from "react";
import Toast from "./components/Toast.jsx";
import BackButton from "./components/BackButton";
import PokemonAutocomplete from "./components/PokemonAutocomplete";
import DeckLabel from "./components/DeckLabel.jsx";
import DeckModal from "./components/DeckModal.jsx";
import { getEvent, updateEvent, deleteEvent } from "./eventsRepo.js";
import {
  postPhysicalRound,
  getPhysicalRounds,
  updatePhysicalRound,
  deletePhysicalRound,
} from "./services/physicalApi.js";
import { getPokemonIcon, FALLBACK } from "./services/pokemonIcons.js";
import { emitPhysicalRoundsChanged } from "./utils/physicalRoundsBus.js";

// helper: get store slug from hash query
const getStoreFromHash = () => {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash || "";
  const q = hash.split("?")[1] || "";
  const params = new URLSearchParams(q);
  return params.get("store") || "";
};


/** ------------------------------------------------------------
 * PTCG Premium — Evento Físico (Resumo + Rounds)
 * - WinRate = (V + 0.5*E) / Total
 * - No show / Bye => “W” explícito
 * - Linha do round clicável (expand)
 * - Espaçamento entre rounds (mt-0.5)
 * - Editar/Excluir no topo
 * ------------------------------------------------------------ */


// Helper: extract event id from location.hash (supports .../eventos/:id)
function extractEventIdFromHash() {
  try {
    const h = window.location.hash || "";
    const m = h.match(/^#\/(?:[^/]+\/)*eventos\/([^/?]+)(?:\?.*)?$/);
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

// Map legacy/new payload from storage to the shape used on the page
function mapIncomingEvent(ev, hashId) {
  if (!ev) return null;
  const mapped = {
    id: ev.id || ev.eventId || hashId || "evt-demo-001",
    name: ev.name || ev.nome || ev.tourneyName || "—",
    storeOrCity: ev.storeOrCity || ev.storeName || ev.local || "—",
    date: ev.date || ev.dia || ev.createdAt || "—",
    type: ev.type || ev.tipo || "—",
    format: ev.format || ev.formato || "—",
    classification:
      ev.classification ||
      ev.classificacao ||
      ev.colocacao ||
      ev.placing ||
      ev.rank ||
      "—",
    deck: {
      deckName: ev.deckName || ev.deck?.deckName || "",
      pokemon1: ev.pokemons?.[0] || ev.deck?.pokemon1 || "",
      pokemon2: ev.pokemons?.[1] || ev.deck?.pokemon2 || "",
    },
  };
  return mapped;
}
const RESULT_COLORS = {
  V: "bg-emerald-600 text-white",
  D: "bg-rose-600 text-white",
  E: "bg-amber-500 text-black",
};

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function Labeled({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-wide opacity-70">{label}</span>
      {children}
    </label>
  );
}

function ToggleGroup({ value, onChange, options }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1 rounded-xl border text-sm",
            value === o.value ? "border-white/80 font-semibold" : "opacity-70 hover:opacity-100"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DeckAvatar({ name = "", src = "", title = "" }) {
  if (src) {
    return (
      <img
        src={src}
        alt={title || name || "Deck"}
        className="w-8 h-8 rounded-xl object-contain bg-neutral-100 dark:bg-neutral-800 border"
      />
    );
  }
  const initials = (name || "?")
    .split(/\s|-/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 border flex items-center justify-center text-xs font-bold"
      title={title || name}
    >
      {initials || "?"}
    </div>
  );
}

function ResultBadge({ res }) {
  if (!res) return null;
  return (
    <span className={cn("px-2 py-1 rounded-lg text-xs font-semibold", RESULT_COLORS[res])}>{res}</span>
  );
}

function TagToggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-xl border text-sm transition",
        active ? "bg-indigo-600 text-white border-indigo-500 shadow" : "hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}

// ---------- Domain helpers ----------
function normalizePokemonPair(p1, p2) {
  const a = p1?.slug || p1?.name || p1;
  const b = p2?.slug || p2?.name || p2;
  if (!a && !b) return "";
  if (a && !b) return a;
  if (!a && b) return b;
  const [x, y] = [a, b].sort((i, j) => i.localeCompare(j));
  return `${x}/${y}`;
}

function computeMatchResult(round = {}) {
  const flags = round?.flags || round;
  if (flags?.bye || flags?.noShow) return "V";
  const games = [round?.g1 ?? {}, round?.g2 ?? {}, round?.g3 ?? {}];
  let v = 0,
    d = 0,
    e = 0;
  for (const g of games) {
    if (g.result === "V") v++;
    else if (g.result === "D") d++;
    else if (g.result === "E") e++;
  }
  if (v > d) return "V";
  if (d > v) return "D";
  return "E";
}

function pointsForMatch(matchResult) {
  if (matchResult === "V") return 3;
  if (matchResult === "E") return 1;
  return 0;
}

function computeTournamentWinRate(V, D, E) {
  const total = V + D + E;
  if (!total) return 0;
  return Math.round(((V + 0.5 * E) / total) * 100);
}

export default function EventPhysicalSummaryPage({ eventFromProps }) {
  const [toast, setToast] = useState({ message: "", type: "info" });
  const showToast = (message, type = "info") => setToast({ message, type });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingRound, setIsDeletingRound] = useState(false);
  // --- Voltar ao dia (quando vier do resumo do dia) ---
  const __qsHash = React.useMemo(() => {
    try {
      const raw = window.location.hash || "";
      const parts = raw.split("?");
      return new URLSearchParams(parts[1] || "");
    } catch { return new URLSearchParams(); }
  }, []);
  const __fromDate = __qsHash.get("date");
  const __backToDay = React.useCallback(() => {
    if (!__fromDate) return;
    window.location.hash = `#/tcg-fisico/eventos/data/${encodeURIComponent(__fromDate)}`;
  }, [__fromDate]);

  const __fromStore = __qsHash.get("store");
  const __fromTourType = __qsHash.get("type");
  const __fromRoute = __qsHash.get("from");
  const __hrefToStore = __fromStore ? `#/tcg-fisico/eventos/loja/${encodeURIComponent(__fromStore)}` : "";
  const __hrefToDay = __fromDate ? `#/tcg-fisico/eventos/data/${encodeURIComponent(__fromDate)}` : "";
  const __hrefToTournaments = `#/tcg-fisico/torneios${__fromTourType ? `?type=${encodeURIComponent(__fromTourType)}` : ""}`;
  const __backToTournaments = React.useCallback(() => {
    const base = "#/tcg-fisico/torneios";
    const t = __fromTourType ? `?type=${encodeURIComponent(__fromTourType)}` : "";
    window.location.hash = `${base}${t}`;
  }, [__fromTourType]);
  const __backToStore = React.useCallback(() => {
    if (!__fromStore) return;
    window.location.hash = `#/tcg-fisico/eventos/loja/${encodeURIComponent(__fromStore)}`;
  }, [__fromStore]);


  // Fallback de evento para dev
  const defaultEvent = {
    id: "evt-demo-001",
    name: "Liga Semanal",
    storeOrCity: "Locals",
    date: "2025-08-20",
    type: "Locals",
    format: "SVI-WHT/BLK",
    deck: {
      deckName: "",
      pokemon1: "",
      pokemon2: "",
    },
  };

  // IMPORTANTE: manter dados no estado para edição sem mutar const
  const [eventData, setEventData] = useState(defaultEvent);
  const eventId = React.useMemo(() => extractEventIdFromHash(), []);
  useEffect(() => {
    try {
      const fromHist = window.history?.state?.eventFromProps;
      if (fromHist) {
        setEventData({ ...defaultEvent, ...mapIncomingEvent(fromHist, eventId) });
        return;
      }
    } catch {}
    if (eventId) {
      getEvent(eventId).then((ev) => {
        if (ev) setEventData({ ...defaultEvent, ...mapIncomingEvent(ev, eventId) });
      });
    }
  }, [eventId]);

  const [rounds, setRounds] = useState([]);
  useEffect(() => {
    if (!eventId) return;
    getPhysicalRounds(eventId)
      .then((rs) => {
        const safeRounds = Array.isArray(rs)
          ? rs.map((r) => ({
              ...r,
              g1: r?.g1 || {},
              g2: r?.g2 || {},
              g3: r?.g3 || {},
            }))
          : [];
        setRounds(safeRounds);
      })
      .catch((err) => {
        console.error("Falha ao carregar rounds", err);
        setRounds([]);
      });
  }, [eventId]);
  const [editRoundIndex, setEditRoundIndex] = useState(null);
  const [editingDeck, setEditingDeck] = useState(false);

  const isEditing = editRoundIndex !== null;
  const editingNumber = isEditing ? (rounds[editRoundIndex]?.number ?? (editRoundIndex + 1)) : null;
  const [expandedRoundId, setExpandedRoundId] = useState(null);
  const [showForm, setShowForm] = useState(true);

  const [editingEvent, setEditingEvent] = useState(false);
  const [eventDraft, setEventDraft] = useState(null);

  const [form, setForm] = useState({
    opponentName: "",
    opponentDeckName: "",
    oppMonA: null,
    oppMonB: null,
    g1: { result: "", order: "" },
    g2: { result: "", order: "" },
    g3: { result: "", order: "" },
    noShow: false,
    bye: false,
    id: false,
    roundId: null,
    roundNumber: null,
  });

  const [iconMap, setIconMap] = useState({});

  const stats = useMemo(() => {
    let V = 0, D = 0, E = 0, points = 0;
    for (const r of rounds) {
      const res = computeMatchResult(r);
      if (res === "V") V += 1; else if (res === "D") D += 1; else E += 1;
      points += pointsForMatch(res);
    }
    const total = V + D + E;
    const winRate = computeTournamentWinRate(V, D, E);
    return { V, D, E, points, total, winRate };
  }, [rounds]);

  function resetForm() {
    setForm({
      opponentName: "",
      opponentDeckName: "",
      oppMonA: null,
      oppMonB: null,
      g1: { result: "", order: "" },
      g2: { result: "", order: "" },
      g3: { result: "", order: "" },
      noShow: false,
      bye: false,
      id: false,
      roundId: null,
      roundNumber: null,
    });
  }

  async function deleteCurrentRound() {
    if (editRoundIndex === null) return;
    const target = Array.isArray(rounds) ? rounds[editRoundIndex] : null;
    if (!target) {
      resetForm();
      setEditRoundIndex(null);
      return;
    }
    if (!eventData?.id) {
      showToast("ID do evento não encontrado", "error");
      return;
    }
    const roundIdentifier = target.roundId || target.id || null;
    if (!roundIdentifier) {
      showToast("ID do round não encontrado", "error");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("Excluir este round?")) {
      return;
    }

    try {
      setIsDeletingRound(true);
      await deletePhysicalRound(eventData.id, roundIdentifier);
      const expandedId = target.id || target.roundId || null;
      setRounds((prev) => {
        if (!Array.isArray(prev)) return [];
        return prev.filter((r) => (r?.roundId || r?.id) !== roundIdentifier);
      });
      setExpandedRoundId((prev) => (expandedId && prev === expandedId ? null : prev));
      showToast("Round excluído com sucesso!", "success");
      emitPhysicalRoundsChanged(eventData.id);
      resetForm();
      setEditRoundIndex(null);
    } catch (err) {
      console.error("Falha ao excluir round", err);
      showToast("Não foi possível excluir o round. Tente novamente.", "error");
    } finally {
      setIsDeletingRound(false);
    }
  }

  useEffect(() => {
    const slugs = [];
    for (const r of rounds) {
      const s1 = r.oppMonASlug || r.oppMonA?.slug || r.oppMonA;
      const s2 = r.oppMonBSlug || r.oppMonB?.slug || r.oppMonB;
      if (s1) slugs.push(s1);
      if (s2) slugs.push(s2);
    }
    slugs.forEach((slug) => {
      if (!(slug in iconMap)) {
        getPokemonIcon(slug).then((src) => {
          setIconMap((prev) => ({ ...prev, [slug]: src === FALLBACK ? null : src }));
        });
      }
    });
  }, [rounds, iconMap]);

  function setGame(idx, key, value) {
    setForm((f) => {
      const copy = { ...f, g1: { ...f.g1 }, g2: { ...f.g2 }, g3: { ...f.g3 } };
      copy[`g${idx}`][key] = value;
      if (copy.noShow || copy.bye) {
        copy.g1.result = "V";
        copy.g1.order = copy.g1.order || "1st";
        copy.g2 = { result: "", order: "" };
        copy.g3 = { result: "", order: "" };
      }
      return copy;
    });
  }

  function canShowGame2() {
    return !!form.g1.result && !(form.noShow || form.bye || form.id);
  }
  function canShowGame3() {
    if (!canShowGame2()) return false;
    if (!form.g2.result) return false;
    const v = [form.g1.result, form.g2.result].filter((r) => r === "V").length;
    const d = [form.g1.result, form.g2.result].filter((r) => r === "D").length;
    return v === d;
  }

  function currentMatchPreview() {
    if (form.id) {
      const res = "E";
      const pts = pointsForMatch(res);
      return { res, pts };
    }
    const res = computeMatchResult(form);
    const pts = pointsForMatch(res);
    return { res, pts };
  }


  function startEditRound(idx){
    try { setShowForm(true); } catch(e) {}
    const r = rounds[idx];
    if(!r) return;
    setForm({
      opponentName: r.opponentName || "",
      opponentDeckName: r.opponentDeckName || "",
      oppMonA: r.oppMonA
        ? (typeof r.oppMonA === "object" ? r.oppMonA : { slug: r.oppMonA, name: r.oppMonA })
        : null,
      oppMonB: r.oppMonB
        ? (typeof r.oppMonB === "object" ? r.oppMonB : { slug: r.oppMonB, name: r.oppMonB })
        : null,
      g1: { ...(r?.g1 || { result: "", order: "" }) },
      g2: { ...(r?.g2 || { result: "", order: "" }) },
      g3: { ...(r?.g3 || { result: "", order: "" }) },
      noShow: r.flags?.noShow || false,
      bye: r.flags?.bye || false,
      id: !!r.flags?.id,
      roundId: r.roundId || r.id || null,
      roundNumber: typeof r.number === "number" ? r.number : idx + 1,
    });
    setEditRoundIndex(idx);
    try{ document.getElementById("round-form")?.scrollIntoView({behavior:"smooth"}); }catch{}
  } 
  async function validateAndSave() {
    if (!eventData?.id) {
      showToast("ID do evento não encontrado", "error");
      return;
    }
  // Regra: Se ID selecionado, oponente é obrigatório; deck não é obrigatório
  if (form.id) {
    if (!form.opponentName || !form.opponentName.trim()) {
      alert("Oponente é obrigatório quando ID está selecionado.");
      return;
    }
  }
    const errors = [];
    if (!(form.noShow || form.bye || form.id)) {
      if (!form.oppMonA) errors.push("Selecione o Pokémon principal do oponente (obrigatório).");
    }
    if (!form.g1.result || !form.g1.order) errors.push("Preencha resultado e ordem do Jogo 1.");
    // Jogo 2 e 3 são opcionais: não exigir preenchimento completo
    // if (canShowGame2()) { /* optional */ }
    // if (canShowGame3()) { /* optional */ }
    if (errors.length > 0) { alert(errors.join("\n")); return; }

    const editingRound =
      editRoundIndex !== null && Array.isArray(rounds) ? rounds[editRoundIndex] : null;
    const preservedId =
      editingRound?.roundId || editingRound?.id || form.roundId || null;
    const preservedNumberRaw =
      editingRound?.number ?? form.roundNumber ?? null;
    const fallbackNumber = Array.isArray(rounds) ? rounds.length + 1 : 1;
    const parsedNumber = Number(preservedNumberRaw);
    const roundNumber = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : fallbackNumber;
    const roundId = preservedId || `r-${roundNumber}`;

    const round = {
      id: roundId,
      roundId,
      number: roundNumber,
      opponentName: form.opponentName?.trim() || "",
      opponentDeckName: form.opponentDeckName?.trim() || "",
      oppMonA: form.oppMonA || undefined,
      oppMonB: form.oppMonB || undefined,
      oppMonASlug:
        form.oppMonA?.slug || (typeof form.oppMonA === "string" ? form.oppMonA : undefined),
      oppMonBSlug:
        form.oppMonB?.slug || (typeof form.oppMonB === "string" ? form.oppMonB : undefined),
      normOppDeckKey: normalizePokemonPair(form.oppMonA, form.oppMonB) || "",
      g1: { ...form.g1 },
      g2: canShowGame2() ? { ...form.g2 } : { result: "", order: "" },
      g3: canShowGame3() ? { ...form.g3 } : { result: "", order: "" },
      flags: { noShow: form.noShow, bye: form.bye, id: form.id },
    };
    let saved;
    try {
      if (editingRound) {
        saved = await updatePhysicalRound(eventData.id, roundId, round);
      } else {
        saved = await postPhysicalRound(eventData.id, round);
      }
    } catch (err) {
      console.error("Falha ao salvar round", err);
      showToast("Não foi possível salvar o round. Tente novamente.", "error");
      return; // exit without altering state
    }

    const finalRound = {
      ...(editingRound || {}),
      ...round,
      ...(saved || {}),
      id: saved?.roundId || saved?.id || roundId,
      roundId: saved?.roundId || round.roundId || saved?.id || roundId,
      number:
        saved?.number != null && !Number.isNaN(saved.number)
          ? saved.number
          : roundNumber,
    };

    if (editRoundIndex !== null) {
      setRounds((rs) =>
        Array.isArray(rs)
          ? rs.map((it, i) => (i === editRoundIndex ? { ...it, ...finalRound } : it))
          : [finalRound]
      );
      setEditRoundIndex(null);
    } else {
      setRounds((rs) =>
        Array.isArray(rs) ? [...rs, finalRound] : [finalRound]
      );
      if (!Array.isArray(rounds) || rounds.length === 0) setShowForm(false);
    }
    emitPhysicalRoundsChanged(eventData.id);
    resetForm();
  }

  function rowToneFor(res) {
    if (res === "V") return "bg-emerald-700/80 text-white";
    if (res === "D") return "bg-rose-700/80 text-white";
    return "bg-amber-700/80 text-black";
  }

  const matchPreview = currentMatchPreview();

  return (
    <>
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Voltar à loja (visível se ?store=) */}
{__fromStore && (
        <div className="mb-3">
          </div>
      )}

      {/* Voltar ao dia (visível se ?date=YYYY-MM-DD) */}
{__fromDate && (
        <div className="mb-3">
          </div>
      )}

      {/* Voltar aos torneios (visível se ?from=torneios, preserva ?type=) */}
      {(__fromRoute === 'torneios' || __fromTourType) && (
        <div className="mb-3">
          </div>
      )}

      {/* HEADER */}

      {/* Back to stores (optional by query) */}
      <a
        href={(getStoreFromHash() ? `#/tcg-fisico/eventos/loja/${getStoreFromHash()}` : "#/tcg-fisico/eventos/loja")}
        className="inline-flex items-center gap-2 text-zinc-300 hover:text-white mb-3"
      >
        ← Voltar para Lojas
      </a>
      <div className="relative flex items-start justify-between">
        <div>
          <div className="mb-2"><BackButton href={__hrefToStore || __hrefToDay || __hrefToTournaments || "#/tcg-fisico"} label={__fromStore ? `Voltar à loja (${__fromStore})` : (__fromDate ? `Voltar ao dia (${__fromDate})` : "Voltar ao TCG Físico")} /></div>
<h1 className="text-3xl md:text-4xl font-extrabold">{eventData.name}</h1>
          <div className="text-sm opacity-80 mt-1">
            {eventData.date ? new Date(eventData.date).toLocaleDateString() : "—"}
          </div>
          <div className="flex gap-2 mt-2">
            <span className="text-xs px-2 py-1 rounded-full border opacity-90">
              {eventData.storeName || eventData.storeOrCity || eventData.city || "—"}
            </span>
            <span className="text-xs px-2 py-1 rounded-full border opacity-90">
              {eventData.type || "—"}
            </span>
            <span className="text-xs px-2 py-1 rounded-full border opacity-90">
              {eventData.format || "—"}
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 mr-3"></div>
          {/* Edit / Delete */}
          <div className="absolute -top-3 -left-20 flex items-center gap-1">
            <button
              type="button"
              className="px-1 py-0.5 text-[10px] rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              title="Editar evento"
              onClick={() => {
                setEventDraft({ ...eventData });
                setEditingEvent(true);
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className="px-1 py-0.5 text-[10px] rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Excluir evento"
              disabled={isDeleting}
              onClick={async () => {
                if (isDeleting) return;
                if (!confirm("Excluir este evento?")) return;
                if (!eventData?.id) {
                  showToast("ID do evento não encontrado", "error");
                  return;
                }
                let shouldRedirect = false;
                try {
                  setIsDeleting(true);
                  await deleteEvent(eventData.id);
                  showToast("Evento excluído com sucesso!", "success");
                  shouldRedirect = true;
                } catch (err) {
                  console.warn("Falha ao excluir evento", err);
                  showToast("Não foi possível excluir o evento. Tente novamente.", "error");
                } finally {
                  setIsDeleting(false);
                  if (shouldRedirect) {
                    window.location.hash = "#/tcg-fisico";
                  }
                }
              }}
            >
              🗑
            </button>
          </div>

          {/* placar do torneio + avatar */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-3xl md:text-4xl font-extrabold">{stats.V}-{stats.D}-{stats.E}</div>
              <div className="flex flex-col items-end text-xs opacity-70 text-right">WR {stats.winRate}%</div>
              {eventData.classification && eventData.classification !== "—" ? (
                <div className="text-lg font-bold text-right mt-8">{eventData.classification}</div>
              ) : null}
              {eventData.deck?.deckName && (
                <div className="mt-2 flex justify-end">
                  <DeckLabel
                    deckName={eventData.deck.deckName}
                    pokemonHints={[eventData.deck.pokemon1, eventData.deck.pokemon2]}
                  />
                </div>
              )}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  onClick={() => setEditingDeck(true)}
                >
                  Deck
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LISTA DE ROUNDS */}
      <div className="mt-6 rounded-xl overflow-hidden border">
        <div className="grid grid-cols-12 bg-neutral-800 text-neutral-200 px-4 py-2 text-sm">
          <div className="col-span-2">Round</div>
          <div className="col-span-4">Opponent</div>
          <div className="col-span-4">Deck</div>
          <div className="col-span-2 text-right">Result</div>
        </div>

        {rounds.length === 0 && (
          <div className="px-4 py-6 text-sm opacity-70">Sem rounds ainda. Preencha abaixo para adicionar.</div>
        )}

        {rounds.map((r, idx) => {
          const res = computeMatchResult(r);
          const forcedW = r.flags?.noShow || r.flags?.bye;
          const resStr = forcedW
            ? "W"
            : `${r.g1?.result || ""}${r.g2?.result || ""}${r.g3?.result || ""}`.trim();
          const slugA =
            r.oppMonASlug ||
            (r.oppMonA && typeof r.oppMonA === "object" ? r.oppMonA.slug : r.oppMonA);
          const slugB =
            r.oppMonBSlug ||
            (r.oppMonB && typeof r.oppMonB === "object" ? r.oppMonB.slug : r.oppMonB);

          return (
            <div
              key={r.id}
              className={cn(
                "grid grid-cols-12 items-center px-4 py-3 text-sm rounded-md cursor-pointer",
                rowToneFor(res),
                idx > 0 ? "mt-0.5" : ""
              )}
              onClick={() => setExpandedRoundId(expandedRoundId === r.id ? null : r.id)}
            >
              <div className="col-span-2 font-semibold">R{r.number}</div>
              <div className="col-span-4">
                <span className="font-medium">{r.opponentName || "—"}</span>
              </div>
              <div className="col-span-4 flex items-center gap-2">
                {r.oppMonA ? (
                  <DeckAvatar
                    name={typeof r.oppMonA === "object" ? r.oppMonA.name : r.oppMonA}
                    src={iconMap[slugA] || undefined}
                  />
                ) : null}
                {r.oppMonB ? (
                  <DeckAvatar
                    name={typeof r.oppMonB === "object" ? r.oppMonB.name : r.oppMonB}
                    src={iconMap[slugB] || undefined}
                  />
                ) : null}
                <span className="opacity-90">
                  {r.opponentDeckName || r.normOppDeckKey || (forcedW ? (r.flags?.noShow ? "No show" : "Bye") : "—")}
                </span>
              </div>
              <div className="col-span-2 text-right font-bold tracking-wide">
                {resStr || (res === "V" ? "W" : res === "D" ? "L" : "T")}
              </div>

              {expandedRoundId === r.id && (
                <div className="col-span-12 bg-zinc-900/60 border border-zinc-800 rounded-md mt-2 p-3 text-zinc-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm opacity-70">Detalhes</div>
                    <button className="text-xs underline opacity-80 hover:opacity-100" onClick={(e)=>{e.stopPropagation?.(); startEditRound(idx);}}>Editar</button>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <div><span className="opacity-70">Oponente:</span> <strong>{r.opponentName || "—"}</strong></div>
                    <div><span className="opacity-70">Deck:</span> <strong>{r.opponentDeckName || r.normOppDeckKey || "—"}</strong></div>
                    {(r.flags?.noShow || r.flags?.bye || r.flags?.id) && (
                      <div className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                        {r.flags?.noShow ? "No show" : (r.flags?.bye ? "Bye" : "ID")}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>J1: {r.g1?.result || "—"} {r.g1?.order ? `(${r.g1?.order})` : ""}</div>
                    <div>J2: {r.g2?.result || "—"} {r.g2?.order ? `(${r.g2?.order})` : ""}</div>
                    <div>J3: {r.g3?.result || "—"} {r.g3?.order ? `(${r.g3?.order})` : ""}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FORM */}
      <div id="round-form" className="mt-6 border rounded-2xl p-5 bg-neutral-900/40">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{isEditing ? `Edit Round ${editingNumber}` : `Round ${rounds.length + 1}`}</h2>
          <button className="text-xs px-3 py-1 rounded-xl border opacity-80" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Ocultar" : "Adicionar Rounds"}
          </button>
        </div>

        {showForm && (
          <div className="mt-4">
            {/* Nomes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Labeled label="Nome do Oponente">
                <input
                  type="text"
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100 shadow-inner"
                  value={form.opponentName}
                  onChange={(e) => setForm((f) => ({ ...f, opponentName: e.target.value }))}
                  placeholder="Ex.: Marina / João"
                />
              </Labeled>
              <Labeled label="Nome do Deck do Oponente">
                <input
                  type="text"
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100 shadow-inner"
                  value={form.opponentDeckName}
                  onChange={(e) => setForm((f) => ({ ...f, opponentDeckName: e.target.value }))}
                  placeholder="Ex.: Dragapult Box, Tera Box..."
                />
              </Labeled>

            </div>

            {/* Deck oponente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <PokemonAutocomplete
                label="Pokémon do Oponente (principal)"
                required
                value={form.oppMonA}
                onChange={(p) => setForm((f) => ({ ...f, oppMonA: p }))}
                placeholder="Selecione o Pokémon"
              />
              <PokemonAutocomplete
                label="Pokémon do Oponente (secundário – opcional)"
                value={form.oppMonB}
                onChange={(p) => setForm((f) => ({ ...f, oppMonB: p }))}
                placeholder="Selecione o Pokémon"
              />

            </div>

            {/* G1 */}
            <div className="mt-6">
              <div className="font-semibold">Game 1</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase opacity-70">W L T</span>
                  <ToggleGroup
                    value={form.g1.result}
                    onChange={(v) => setGame(1, "result", v)}
                    options={[{ label: "W", value: "V" }, { label: "L", value: "D" }, { label: "T", value: "E" }]}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase opacity-70">1st 2nd</span>
                  <ToggleGroup
                    value={form.g1.order}
                    onChange={(v) => setGame(1, "order", v)}
                    options={[{ label: "1st", value: "1st" }, { label: "2nd", value: "2nd" }]}
                  />
                </div>
              </div>
            </div>

            {/* G2 */}
            {canShowGame2() && (
              <div className="mt-4">
                <div className="font-semibold">Game 2</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase opacity-70">W L T</span>
                    <ToggleGroup
                      value={form.g2.result}
                      onChange={(v) => setGame(2, "result", v)}
                      options={[{ label: "W", value: "V" }, { label: "L", value: "D" }, { label: "T", value: "E" }]}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase opacity-70">1st 2nd</span>
                    <ToggleGroup
                      value={form.g2.order}
                      onChange={(v) => setGame(2, "order", v)}
                      options={[{ label: "1st", value: "1st" }, { label: "2nd", value: "2nd" }]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* G3 */}
            {canShowGame3() && (
              <div className="mt-4">
                <div className="font-semibold">Game 3</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase opacity-70">W L T</span>
                    <ToggleGroup
                      value={form.g3.result}
                      onChange={(v) => setGame(3, "result", v)}
                      options={[{ label: "W", value: "V" }, { label: "L", value: "D" }, { label: "T", value: "E" }]}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase opacity-70">1st 2nd</span>
                    <ToggleGroup
                      value={form.g3.order}
                      onChange={(v) => setGame(3, "order", v)}
                      options={[{ label: "1st", value: "1st" }, { label: "2nd", value: "2nd" }]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tags + Preview */}

            <div className="flex items-center gap-2 mt-3">


<div className="flex items-center gap-2">
  <TagToggle
    active={form.noShow}
    onClick={() => setForm((f) => ({
      ...f,
      noShow: !f.noShow,
      bye: false,
      id: false,
      g1: { result: "V", order: f.g1?.order || "1st" },
      g2: { result: "", order: "" },
      g3: { result: "", order: "" },
    }))}
    title="No show"
  >No show</TagToggle>

  <TagToggle
    active={form.bye}
    onClick={() => setForm((f) => ({
      ...f,
      bye: !f.bye,
      noShow: false,
      id: false,
      g1: { result: "V", order: f.g1?.order || "1st" },
      g2: { result: "", order: "" },
      g3: { result: "", order: "" },
    }))}
    title="Bye"
  >Bye</TagToggle>

  <TagToggle
    active={form.id}
    onClick={() => setForm((f) => ({
      ...f,
      id: !f.id,
      noShow: false,
      bye: false,
      g1: { result: "E", order: f.g1?.order || "1st" },
      g2: { result: "", order: "" },
      g3: { result: "", order: "" },
    }))}
    title="ID (empate)"
  >ID</TagToggle>
</div>

              <div className="ml-auto flex items-center gap-2 text-sm">
                <span className="opacity-70">Preview:</span>
                <ResultBadge res={matchPreview.res} />
                <span>Pontos <strong>{matchPreview.pts}</strong></span>
              </div>
            </div>

            {/* Ações */}
            <div className="mt-6 flex gap-3">
              <button className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold" onClick={validateAndSave}>{isEditing ? "Save edit" : "Add round"}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl border"
                onClick={() => {
                  resetForm();
                  setEditRoundIndex(null);
                }}
              >
                Cancel
              </button>
              {isEditing ? (
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl border border-rose-600 text-rose-200 hover:bg-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={deleteCurrentRound}
                  disabled={isDeletingRound}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {editingDeck && (
        <DeckModal
          initialDeck={eventData.deck}
          onCancel={() => setEditingDeck(false)}
          onSave={async (deck) => {
            if (!eventData?.id) {
              showToast("ID do evento não encontrado", "error");
              return;
            }
            try {
              const updated = await updateEvent(eventData.id, {
                deckName: deck.deckName,
                pokemons: [deck.pokemon1, deck.pokemon2],
              });
              if (!updated) {
                throw new Error("Deck update returned empty response");
              }
              const mapped = mapIncomingEvent(updated, eventData.id);
              const serverDeck = mapped?.deck;
              const hasServerDeck = !!(
                serverDeck &&
                (serverDeck.deckName || serverDeck.pokemon1 || serverDeck.pokemon2)
              );
              const nextDeck = hasServerDeck
                ? serverDeck
                : {
                    deckName: deck.deckName,
                    pokemon1: deck.pokemon1,
                    pokemon2: deck.pokemon2,
                  };
              setEventData((prev) => ({ ...prev, deck: nextDeck }));
              setEditingDeck(false);
              showToast("Deck atualizado com sucesso!", "success");
            } catch (err) {
              console.error("Falha ao atualizar deck", err);
              showToast("Não foi possível atualizar o deck. Tente novamente.", "error");
            }
          }}
        />
      )}

      {/* Modal de edição do evento */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-[min(560px,90vw)]">
            <h3 className="text-lg font-bold mb-3">Editar evento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Labeled label="Nome do torneio">
                <input
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100"
                  value={eventDraft?.name || ""}
                  onChange={(e) => setEventDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </Labeled>
              <Labeled label="Nome da loja / cidade">
                <input
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100"
                  value={eventDraft?.storeName ?? eventDraft?.storeOrCity ?? ""}
                  onChange={(e) => setEventDraft((d) => ({ ...d, storeName: e.target.value, storeOrCity: e.target.value }))}
                />
              </Labeled>
              <Labeled label="Data">
                <input
                  type="date"
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100"
                  value={(eventDraft?.date || "").slice(0, 10)}
                  onChange={(e) => setEventDraft((d) => ({ ...d, date: e.target.value }))}
                />
              </Labeled>
              <Labeled label="Tipo do evento">
                <input
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100"
                  value={eventDraft?.type || ""}
                  onChange={(e) => setEventDraft((d) => ({ ...d, type: e.target.value }))}
                />
              </Labeled>
              <Labeled label="Formato do jogo">
                <input
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100"
                  value={eventDraft?.format || ""}
                  onChange={(e) => setEventDraft((d) => ({ ...d, format: e.target.value }))}
                />
              </Labeled>
              <Labeled label="Classificação">
                <input
                  className="border border-zinc-700 rounded-xl px-3 py-2 bg-zinc-900 text-zinc-100"
                  value={eventDraft?.classification || ""}
                  onChange={(e) => setEventDraft((d) => ({ ...d, classification: e.target.value }))}
                />
              </Labeled>
            </div>
            <div className="mt-4 flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200" onClick={() => setEditingEvent(false)}>
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                onClick={async () => {
                  if (!eventData?.id) {
                    showToast("ID do evento não encontrado", "error");
                    return;
                  }
                  if (!eventDraft) {
                    showToast("Dados do evento não encontrados", "error");
                    return;
                  }
                  const patch = {
                    name: eventDraft.name ?? eventData.name ?? "",
                    storeOrCity:
                      (eventDraft.storeOrCity ?? eventDraft.storeName) ??
                      eventData.storeOrCity ??
                      eventData.storeName ??
                      "",
                    date: eventDraft.date ?? eventData.date ?? "",
                    type: eventDraft.type ?? eventData.type ?? "",
                    format: eventDraft.format ?? eventData.format ?? "",
                    classification:
                      eventDraft.classification ?? eventData.classification ?? "",
                  };
                  try {
                    await updateEvent(eventData.id, patch);
                    const refreshed = await getEvent(eventData.id);
                    if (!refreshed) {
                      throw new Error("Resposta vazia ao buscar evento atualizado");
                    }
                    const mapped = mapIncomingEvent(refreshed, eventData.id);
                    setEventData((prev) => ({ ...prev, ...mapped }));
                    setEditingEvent(false);
                    showToast("Evento atualizado com sucesso!", "success");
                  } catch (err) {
                    console.error("Falha ao atualizar evento", err);
                    showToast(
                      "Não foi possível atualizar o evento. Tente novamente.",
                      "error"
                    );
                  }
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast({ message: "", type: "info" })}
    />
    </>
  );
}
