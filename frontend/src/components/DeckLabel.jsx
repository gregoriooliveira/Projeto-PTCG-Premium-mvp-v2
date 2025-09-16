import React, { useEffect, useMemo, useState } from "react";
import { resolveIconsFromDeck } from "../services/pokemonIcons.js";

export default function DeckLabel({
  deckName,
  pokemonHints,
  stacked = false,
  className = "",
  showIcons = true,
}) {
  const [icons, setIcons] = useState([]);

  const candidates = useMemo(() => {
    // Prioridade absoluta: hints (quando existirem)
    const hints = Array.isArray(pokemonHints) ? pokemonHints.filter(Boolean) : undefined;
    return { name: deckName || "", hints };
  }, [deckName, pokemonHints]);

  useEffect(() => {
    if (!showIcons) {
      setIcons([]);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const urls = await resolveIconsFromDeck(candidates.name, candidates.hints);
        if (alive) setIcons(urls);
      } catch {
        if (alive) setIcons([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [candidates, showIcons]);

  const imgs = showIcons
    ? icons.slice(0, 2).map((src, idx) => (
        <img
          key={idx}
          src={src}
          alt=""
          className="h-[18px] w-[18px] rounded-full ring-1 ring-zinc-800/60 object-cover shrink-0"
          loading="lazy"
          decoding="async"
        />
      ))
    : [];

  if (stacked) {
    // Exibe em 2 linhas quando o nome do deck é composto (A / B)
    const [a, b] = String(deckName || "").split(" / ");
    const firstIcon = showIcons ? imgs[0] : null;
    const secondIcon = showIcons ? imgs[1] : null;

    return (
      <div className={`min-w-0 flex flex-col gap-1 ${className}`}>
        <div className="flex items-center gap-2 min-w-0">
          {firstIcon}
          <span className="truncate">{a || deckName}</span>
        </div>
        {(b || secondIcon) && (
          <div className="flex items-center gap-2 min-w-0">
            {secondIcon}
            <span className="truncate">{b}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`min-w-0 flex items-center gap-2 ${className}`}>
      {showIcons && imgs}
      <span className="truncate">{deckName}</span>
    </div>
  );
}
