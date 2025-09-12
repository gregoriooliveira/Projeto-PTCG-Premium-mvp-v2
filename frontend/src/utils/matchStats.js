export function wlCounts(matches) {
  let W = 0,
    L = 0,
    T = 0;
  for (const m of matches) {
    if (m.result === "W") W++;
    else if (m.result === "L") L++;
    else if (m.result === "T") T++;
    else console.warn(`Unknown result: ${m.result}`);
  }
  return { W, L, T, total: W + L + T };
}

export function winRateFromCounts({ W, L, T }) {
  const denom = W + L + T;
  return denom === 0 ? 0 : Math.round((W / denom) * 1000) / 10; // 1 decimal
}

export function byKey(matches, keyFn) {
  const map = new Map();
  for (const m of matches) {
    const k = keyFn(m);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  return map;
}

export function dateKeyMDY(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function topDeckByWinRate(matches, minGames = 6) {
  const g = byKey(matches, (m) => m.playerDeck);
  let best = null;
  for (const [deckKey, games] of g.entries()) {
    if (games.length < minGames) continue;
    const counts = wlCounts(games);
    const wr = winRateFromCounts(counts);
    if (!best || wr > best.winRate) best = { deckKey, winRate: wr, games: counts.total };
  }
  return best;
}

export function mostUsedDeckOf(matches) {
  const g = byKey(matches, (m) => m.playerDeck);
  let best = null;
  for (const [deckKey, games] of g.entries()) {
    if (!best || games.length > best.count) best = { deckKey, count: games.length };
  }
  return best?.deckKey ?? "—";
}
