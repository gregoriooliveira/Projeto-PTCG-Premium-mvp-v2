// src/services/prettyDeckKey.js
// Render deck keys like "arvens-mabosstiff-drakloak" as "Arven's Mabosstiff / Drakloak"

const TRAINERS = new Set([
  "arven","sada","turo","penny","clavell","giacomo","iono","grusha","brassius","ryme",
  "mela","katy","larry","tulip","hassel","rika","poppy","kofu","nemona","geeta"
]);

const HYPHENATED_MON = ["chien-pao", "chi-yu", "wo-chien", "ting-lu"].map(slug => ({
  slug,
  parts: slug.split("-")
}));
const HYPHENATED_SET = new Set(HYPHENATED_MON.map(({ slug }) => slug));

function titleCaseSlug(slug = ""){
  const raw = String(slug || "");
  const normalized = raw.toLowerCase();
  const words = raw
    .split("-")
    .filter(Boolean)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w));
  const joiner = HYPHENATED_SET.has(normalized) ? "-" : " ";
  return words.join(joiner);
}

const TWO_WORD_MON = new Set([
  "roaring moon","great tusk","iron hands","iron treads","walking wake","raging bolt","gouging fire",
  "iron crown","iron boulder","sandy shocks","flutter mane","scream tail","brute bonnet","slither wing",
  "iron jugulis","iron moth","iron bundle","iron thorns"
]);

function findHyphenated(tokens){
  return HYPHENATED_MON.find(entry =>
    tokens.length >= entry.parts.length &&
    entry.parts.every((part, idx) => tokens[idx] === part)
  );
}

function splitPokemons(tokens){
  if (!tokens.length) return "";

  const hyphen = findHyphenated(tokens);
  if (hyphen){
    const restTokens = tokens.slice(hyphen.parts.length);
    if (restTokens.length){
      const restHyphen = findHyphenated(restTokens);
      const restSlug = restTokens.join("-");
      const restFormatted = restHyphen && restHyphen.parts.length === restTokens.length
        ? titleCaseSlug(restHyphen.slug)
        : titleCaseSlug(restSlug);
      return [titleCaseSlug(hyphen.slug), restFormatted].filter(Boolean).join(" / ");
    }
    return titleCaseSlug(hyphen.slug);
  }

  const joined = tokens.join(" ");
  // Try known two-word mon at start
  for (const name of TWO_WORD_MON){
    if (joined.startsWith(name + " ")){
      const firstSlug = name.replace(/ /g, "-");
      const rest = joined.slice(name.length + 1).trim();
      if (rest){
        return titleCaseSlug(firstSlug) + " / " + titleCaseSlug(rest.replace(/ /g,"-"));
      }
      return titleCaseSlug(firstSlug);
    }
  }
  // Default heuristic
  if (tokens.length >= 2){
    const first = tokens[0];
    const second = tokens.slice(1).join("-");
    return titleCaseSlug(first) + " / " + titleCaseSlug(second);
  }
  return titleCaseSlug(tokens.join("-"));
}

export function prettyDeckKey(key = ""){
  const raw = String(key || "").trim().toLowerCase();
  if (!raw) return "";

  const parts = raw.split("-").filter(Boolean);
  if (parts.length === 0) return "";

  const first = parts[0];
  const base = first.replace(/s$/, ""); // treat "arvens" as "arven"
  const isTrainer = TRAINERS.has(first) || TRAINERS.has(base);

  if (isTrainer){
    const trainerTitle = titleCaseSlug(base) + "'s";
    const formatted = splitPokemons(parts.slice(1));
    return [trainerTitle, formatted].filter(Boolean).join(" ");
  } else {
    return splitPokemons(parts);
  }
}
