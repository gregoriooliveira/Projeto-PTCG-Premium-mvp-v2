
import React from "react";

import PropTypes from "prop-types";
import DeckLabel from "../DeckLabel.jsx";

/**
 * ResumoGeralWidget
 * Padroniza o widget "Resumo Geral" para Home, TCG Live, TCG Físico e Datas do Live.
 *
 * Props:
 * - variant: "home" | "live" | "fisico" | "datasLive"
 * - winRate: { value: number, label?: string }
 * - center:
 *    - se variant === "home": { kda: { v:number, d:number, e:number }, total:number, subtitle:string }
 *    - demais: { number:number, subtitle:string }
 * - topDeck: { deckName:string, winRate:number, avatars:string[], href?:string }
 */
export default function ResumoGeralWidget({ title, variant, winRate, center, topDeck }) {
  const isFisico = variant === "fisico";
  const isDatasLive = variant === "datasLive";

  const TopDeckContent = (
    <div className="flex items-center justify-end gap-3">
      <div className="flex -space-x-3">
        {(topDeck?.avatars || []).slice(0, 2).map((src, i) => (
          <img
            key={i}
            src={src}
            alt="avatar"
            className="h-10 w-10 rounded-full ring-2 ring-zinc-900 object-cover"
          />
        ))}
      </div>
      <div className="text-right">
        <div className={`text-sm font-medium leading-tight ${isDatasLive ? 'whitespace-normal break-words max-w-none' : 'truncate '} ${isFisico ? '' : ''}` }>
        <DeckLabel deckName={topDeck?.deckName} stacked />
        </div>
        <div className="text-xs text-zinc-400">
          Top Deck • <span className="text-zinc-200 font-medium">{(topDeck?.winRate ?? 0).toFixed(1)}% WR</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl bg-zinc-900/70 ring-1 ring-zinc-800 shadow-lg">
      <div className="px-5 pt-4 pb-2 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800">🏁</span>
          <h2 className="text-lg font-medium">Resumo Geral</h2>
        </div>
        <span className="text-xs text-zinc-400 uppercase tracking-wide">{title}</span>
      </div>

      <div className="grid grid-cols-3 gap-4 p-5">
        {/* ESQUERDA: Win Rate */}
        <div className="col-span-1">
          <div className="text-3xl font-bold text-emerald-400 leading-none">{winRate?.value ?? 0}%</div>
          <div className="text-sm text-zinc-400 mt-1">{winRate?.label || "Win Rate"}</div>
        </div>

        {/* CENTRO: varia por variant */}
        <div className="col-span-1 text-center">
          {variant === "home" ? (
            <div className="space-y-1">
              <div className="text-base text-zinc-400"></div>
              <div className="text-2xl font-semibold tracking-wide">
                <span className="text-emerald-400">{center?.kda?.v ?? 0}</span>
                <span className="mx-1">/</span>
                <span className="text-rose-400">{center?.kda?.d ?? 0}</span>
                <span className="mx-1">/</span>
                <span className="text-amber-300">{center?.kda?.e ?? 0}</span>
              </div>
              <div className="text-xs text-zinc-400">{center?.subtitle}: <span className="text-zinc-200 font-medium">{center?.total ?? 0}</span></div>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-bold">{center?.number ?? 0}</div>
              <div className="text-sm text-zinc-400 mt-1">{center?.subtitle}</div>
            </div>
          )}
        </div>

        {/* DIREITA: Top Deck */}
        <div className="col-span-1 block">
          {isFisico ? (
            <a href={topDeck?.href || "#"} className="group block">
              {TopDeckContent}
            </a>
          ) : (
            TopDeckContent
          )}
        </div>
      </div>
    </div>
  );
}

ResumoGeralWidget.propTypes = {
  title: PropTypes.string,
  variant: PropTypes.oneOf(["home", "live", "fisico", "datasLive"]),
  winRate: PropTypes.shape({
    value: PropTypes.number,
    label: PropTypes.string,
  }),
  center: PropTypes.object,
  topDeck: PropTypes.shape({
    deckName: PropTypes.string,
    winRate: PropTypes.number,
    avatars: PropTypes.arrayOf(PropTypes.string),
    href: PropTypes.string,
  }),
};

ResumoGeralWidget.defaultProps = {
  title: "Resumo Geral",
  variant: "live",
  winRate: undefined,
  center: undefined,
  topDeck: undefined,
};