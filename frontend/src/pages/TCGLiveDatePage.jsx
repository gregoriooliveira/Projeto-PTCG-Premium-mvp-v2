import React, { useEffect, useMemo, useState } from "react";
import ResumoGeralWidget from "../components/widgets/ResumoGeralWidget.jsx";
import BackButton from "../components/BackButton.jsx";
import DeckLabel from "../components/DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";
import { getLiveDay } from "../services/api.js";

/* -------------------------------- helpers -------------------------------- */

function fmtHM(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function prettyDeckName(s) {
  if (!s) return "";
  return String(s).replace(/\s*\/\s*\/\s*/g, " / ").trim();
}

function Pill({ tone = "zinc", children }) {
  const tones = {
    green:
      "bg-emerald-900/40 text-emerald-200 border border-emerald-600/40 px-2 py-0.5 rounded-full text-xs font-semibold",
    rose:
      "bg-rose-900/40 text-rose-200 border border-rose-600/40 px-2 py-0.5 rounded-full text-xs font-semibold",
    amber:
      "bg-amber-900/40 text-amber-200 border border-amber-600/40 px-2 py-0.5 rounded-full text-xs font-semibold",
    zinc:
      "bg-zinc-800 text-zinc-200 border border-zinc-600/40 px-2 py-0.5 rounded-full text-xs font-semibold",
  };
  return <span className={tones[tone] || tones.zinc}>{children}</span>;
}

/* ------------------------------- main page -------------------------------- */

export default function TCGLiveDatePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matches, setMatches] = useState([]);
  const [summary, setSummary] = useState(null);

  const routeDate = useMemo(() => {
    const m = window.location.hash.match(/#\/tcg-live\/datas\/([^/?#]+)/);
    return m?.[1] || "";
  }, [typeof window !== "undefined" ? window.location.hash : ""]);

  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getLiveDay(routeDate);
        if (off) return;

        setSummary(data?.summary || null);

        const rows = Array.isArray(data?.events) ? data.events : [];
        const mapped = rows.map((e) => ({
          id: e?.eventId || e?.id,
          time: e?.createdAt ? fmtHM(e.createdAt) : e?.time || "—",
          result: (e?.result || "").toUpperCase() === "W" ? "W" : (e?.result || "").toUpperCase() === "L" ? "L" : "T",
          playerDeck: prettyDeckKey(e?.playerDeck || ""),
          opponent: e?.opponent || "-",
          opponentDeck: prettyDeckKey(e?.opponentDeck || ""),
          userPokemons: e?.userPokemons || e?.myPokemons,
          opponentPokemons: e?.opponentPokemons || e?.oppPokemons,
        }));
        setMatches(mapped);
      } catch (err) {
        setError(err?.message || "Falha ao carregar");
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => {
      off = true;
    };
  }, [routeDate]);

  // Win Rate do dia (somente do dia da rota)
  const dayWR = useMemo(() => {
    // primeiro tenta usar summary.wr (que já vem do backend filtrado pelo dia)
    let wr = Number(summary?.wr);
    if (!Number.isFinite(wr) || wr < 0) wr = null;
    if (wr == null) {
      // se não vier, derivamos dos matches de hoje
      if (matches.length) {
        let w = 0, l = 0, t = 0;
        for (const m of matches) {
          if (m.result === "W") w++;
          else if (m.result === "L") l++;
          else t++;
        }
        const tot = w + l + t;
        wr = tot ? (w / tot) * 100 : 0;
      } else if (summary?.counts) {
        const c = summary.counts;
        const w = Number(c.W || 0);
        const l = Number(c.L || 0);
        const t = Number(c.T || 0);
        const tot = w + l + t;
        wr = tot ? (w / tot) * 100 : 0;
      } else {
        wr = 0;
      }
    }
    // aceita payload em fração
    if (wr > 0 && wr <= 1) wr *= 100;
    return Math.round((Number(wr) || 0) * 10) / 10;
  }, [summary, matches]);

  // Top deck do dia (agregado apenas dos matches do dia)
  const topDeckOfDay = useMemo(() => {
    if (!matches.length) return null;
    const agg = new Map();
    for (const m of matches) {
      const name = m.playerDeck || "";
      if (!name) continue;
      const cur = agg.get(name) || { w: 0, l: 0, t: 0 };
      if (m.result === "W") cur.w++;
      else if (m.result === "L") cur.l++;
      else cur.t++;
      agg.set(name, cur);
    }
    let best = null;
    for (const [name, v] of agg.entries()) {
      const tot = v.w + v.l + v.t;
      if (!tot) continue;
      const wr = (v.w / tot) * 100;
      if (!best || wr > best.wr || (wr === best.wr && v.w > best.w)) {
        best = { name, wr: Math.round(wr * 10) / 10, w: v.w };
      }
    }
    return best;
  }, [matches]);

  const wrForWidget = Number.isFinite(dayWR) ? dayWR : 0;
  const gamesForWidget = matches.length;
  const topDeckName = topDeckOfDay?.name || "—";
  const topDeckWR = Number.isFinite(topDeckOfDay?.wr) ? topDeckOfDay.wr : 0;

  const showTime = true;

  return (
    <div className="p-4 space-y-4">
      <BackButton href="#/tcg-live">Voltar</BackButton>

      <ResumoGeralWidget
        title="RESUMO GERAL"
        variant="datasLive"
        winRate={{ value: wrForWidget, label: "Win Rate" }}
        center={{ number: gamesForWidget, subtitle: "Logs" }}
        topDeck={{ deckName: topDeckName, winRate: topDeckWR, avatars: [] }}
      />

      {error && (
        <div className="text-rose-400 text-sm">
          Erro ao carregar os dados do dia: {error}
        </div>
      )}

      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-zinc-400 font-mono">
            <tr className="border-b border-zinc-800/60">
              {showTime && <th className="px-4 py-3 text-left">Hora</th>}
              <th className="px-4 py-3 text-left">Deck</th>
              <th className="px-4 py-3 text-left">Oponente</th>
              <th className="px-4 py-3 text-center">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {!loading && matches.length === 0 && (
              <tr>
                <td
                  className="px-4 py-6 text-zinc-400"
                  colSpan={showTime ? 4 : 3}
                >
                  Sem partidas neste dia.
                </td>
              </tr>
            )}

            {matches.map((m) => (
              <tr
                key={m.id}
                className="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer"
                onClick={() => {
                  if (m?.id) window.location.hash = `#/tcg-live/logs/${m.id}`;
                }}
                role="link"
                title="Abrir log"
              >
                {showTime && <td className="px-4 py-3">{m.time || "—"}</td>}

                <td className="px-4 py-3">
                  <a
                    className="no-underline"
                    href={m?.id ? `#/tcg-live/logs/${m.id}` : undefined}
                  >
                    <DeckLabel deckName={m.playerDeck || "—"} pokemonHints={m.userPokemons} />
                  </a>
                </td>

                <td className="px-4 py-3">{m.opponent || "—"}</td>

                <td className="px-4 py-3 text-center">
                  {m.result === "W" ? (
                    <Pill tone="green">W</Pill>
                  ) : m.result === "L" ? (
                    <Pill tone="rose">L</Pill>
                  ) : (
                    <Pill tone="amber">T</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
