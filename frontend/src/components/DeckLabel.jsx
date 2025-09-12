import React, { useEffect, useMemo, useState } from "react";
import { resolveIconsFromDeck } from "../services/pokemonIcons.js";

export default function DeckLabel({ deckName, pokemonHints, stacked = false, className = "" }) {
  const [icons, setIcons] = useState([]);

  const candidates = useMemo(() => {
    // Prioridade absoluta: hints (quando existirem)
    const hints = Array.isArray(pokemonHints) ? pokemonHints.filter(Boolean) : undefined;
    return { name: deckName || "", hints };
  }, [deckName, pokemonHints]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const urls = await resolveIconsFromDeck(candidates.name, candidates.hints);
        if (alive) setIcons(urls);
      } catch {
        if (alive) setIcons([]);
      }
    })();
    return () => { alive = false; };
  }, [candidates]);

  const imgs = icons.slice(0, 2).map((src, idx) => (
    <img
      key={idx}
      src={src}
      alt=""
      className="h-[18px] w-[18px] rounded-full ring-1 ring-zinc-800/60 object-cover shrink-0"
      loading="lazy"
      decoding="async"
    />
  ));

  if (stacked) {
    // Exibe em 2 linhas quando o nome do deck é composto (A / B)
    const [a, b] = String(deckName || "").split(" / ");
    return (
      <div className={`min-w-0 flex flex-col gap-1 ${className}`}>
        <div className="flex items-center gap-2 min-w-0">
          {imgs[0]}
          <span className="truncate">{a || deckName}</span>
        </div>
        { (b || imgs[1]) && (
          <div className="flex items-center gap-2 min-w-0">
            {imgs[1]}
            <span className="truncate">{b}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`min-w-0 flex items-center gap-2 ${className}`}>
      {imgs}
      <span className="truncate">{deckName}</span>
    </div>
  );
}
