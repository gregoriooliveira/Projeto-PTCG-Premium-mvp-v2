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
          className="h-[40px] w-[40px] rounded-full ring-1 ring-zinc-800/60 object-cover shrink-0"
          loading="lazy"
          decoding="async"
        />
      ))
    : [];

  const normalizedName = typeof deckName === "string" ? deckName : "";
  const [firstSegmentRaw, ...restSegmentsRaw] = normalizedName.split(" / ");
  const firstSegment = firstSegmentRaw?.trim?.() ?? "";
  const restSegments = restSegmentsRaw.map((segment) => (segment ?? "").trim());
  const secondSegment = restSegments.join(" / ").trim();
  const hasSecondSegment = secondSegment.length > 0;

  if (stacked && hasSecondSegment) {
    const firstIcon = showIcons ? imgs[0] : null;
    const secondIcon = showIcons ? imgs[1] : null;

    return (
      <div className={`min-w-0 flex flex-col gap-1 ${className}`}>
        <div className="flex items-center gap-2 min-w-0">
          {firstIcon}
          <span className="truncate">{firstSegment || normalizedName}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {secondIcon}
          <span className="truncate">{secondSegment}</span>
        </div>
      </div>
    );
  }

  const inlineLabel = stacked ? firstSegment || normalizedName : deckName;

  return (
    <div className={`min-w-0 flex items-center gap-2 ${className}`}>
      {showIcons && imgs}
      <span className="truncate">{inlineLabel}</span>
    </div>
  );
}
