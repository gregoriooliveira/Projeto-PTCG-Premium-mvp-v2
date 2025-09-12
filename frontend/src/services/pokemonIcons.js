// Utilities to fetch Pokémon icons (official-artwork) with caching and robust normalization.
// Prefers explicit pokemonHints over deck names.

const MEM = new Map();

export const FALLBACK =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="%23292929"/><circle cx="48" cy="48" r="30" fill="%23fff"/><circle cx="48" cy="48" r="12" fill="%23292929"/></svg>';

// Words we should ignore when parsing free text deck names
const STOP_WORDS = new Set(["team","box","deck","the","vs","and","de","do","da"]);

// Aliases for archetypes / variants / common misspellings
const ALIASES = {
  "lost box": "sableye",
  "ancient box": "koraidon",
  "future box": "miraidon",
  "great tusk": "great-tusk",
  "roaring moon": "roaring-moon",
  "iron hands": "iron-hands",
  "iron valiant": "iron-valiant",
  "iron thorns": "iron-thorns",
  "iron boulder": "iron-boulder",
  "arven's mabosstiff": "mabosstiff",
  "arvens mabosstiff": "mabosstiff",
  "porygon z": "porygon-z",
  "porygonz": "porygon-z",
  "porygon2": "porygon2",
  "rocket's porygon": "porygon-z",
  "rockets porygon": "porygon-z",
};

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+ex\b/g, "")
    .replace(/\s+v(?:max|star)?\b/g, "")
    .replace(/[()]/g, " ")
    .replace(/:\d+$/g, "") // strip suffix like ":1"
    .trim();
}

function toSlug(raw) {
  const n = normalize(raw);
  if (!n) return "";
  if (ALIASES[n]) return ALIASES[n];
  // try alias by token folding (e.g. "porygon z")
  if (ALIASES[n.replace(/\s+/g," ")]) return ALIASES[n.replace(/\s+/g," ")];
  const cleaned = n
    .split(/\s+/)
    .filter(tok => tok && !STOP_WORDS.has(tok))
    .join("-")
    .replace(/-+/g,"-");
  return cleaned;
}

async function fetchIcon(slug) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return FALLBACK;
  if (MEM.has(slug)) return MEM.get(slug);
  if (MEM.has(slug)) return MEM.get(slug);
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
    if (!res.ok) throw new Error("nf");
    const data = await res.json();
    const url =
      data?.sprites?.other?.["official-artwork"]?.front_default ||
      data?.sprites?.front_default ||
      null;
    const out = url || FALLBACK;
    MEM.set(slug, out);
    return out;
  } catch {
    MEM.set(slug, FALLBACK);
    return FALLBACK;
  }
}

export async function getPokemonIcon(nameLike) {
  const slug = toSlug(nameLike);
  if (!slug) return FALLBACK;
  return fetchIcon(slug);
}

// Resolve up to two icons. If hints are provided, they are used with absolute priority.
export async function resolveIconsFromDeck(deckName, pokemonHints) {
  const candidates = [];
  const push = (s) => { const slug = toSlug(s); if (slug && !candidates.includes(slug)) candidates.push(slug); };

  if (Array.isArray(pokemonHints) && pokemonHints.length) {
    pokemonHints.filter(Boolean).slice(0,2).forEach(push);
  }

  if (candidates.length === 0) {
    // Fallback: parse from deck name
    String(deckName || "")
      .split("/")
      .map((p)=>p.trim())
      .filter(Boolean)
      .slice(0,2)
      .forEach(push);
  }

  // Final safety: only valid slugs
  const valid = candidates.filter(s => /^[a-z0-9-]+$/.test(s));
  const out = await Promise.all((valid.length ? valid : [""]).slice(0,2).map(getPokemonIcon));
  return out;
}
