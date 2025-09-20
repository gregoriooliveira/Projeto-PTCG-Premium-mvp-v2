const TOURNAMENT_TYPE_FILTER_OPTIONS = [
  {
    value: "regional",
    keywords: ["regional", "regional championship", "regional championships"],
  },
  {
    value: "special",
    keywords: ["special", "special event", "special events"],
  },
  {
    value: "international",
    keywords: [
      "international",
      "international championship",
      "international championships",
      "internacional",
      "internacional championship",
      "internacional championships",
    ],
  },
  {
    value: "worlds",
    keywords: [
      "worlds",
      "world championship",
      "world championships",
      "mundial",
      "campeonato mundial",
    ],
  },
];

function normalizeAscii(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeTournamentTypeFilter(value) {
  const ascii = normalizeAscii(value);
  if (!ascii) return null;
  for (const option of TOURNAMENT_TYPE_FILTER_OPTIONS) {
    const match = option.keywords.some(
      (keyword) => ascii === keyword || ascii.includes(keyword),
    );
    if (match) return option.value;
  }
  return null;
}

export { TOURNAMENT_TYPE_FILTER_OPTIONS };
