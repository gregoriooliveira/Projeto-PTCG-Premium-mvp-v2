// src/services/prettyDeckKey.js
// Render deck keys like "arvens-mabosstiff-drakloak" as "Arven's Mabosstiff / Drakloak"

const TRAINERS = new Set([
  "arven","sada","turo","penny","clavell","giacomo","iono","grusha","brassius","ryme",
  "mela","katy","larry","tulip","hassel","rika","poppy","kofu","nemona","geeta"
]);

function titleCaseSlug(slug = ""){
  return String(slug)
    .split("-")
    .filter(Boolean)
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : w)
    .join(" ");
}

const TWO_WORD_MON = new Set([
  "roaring moon","great tusk","iron hands","iron treads","walking wake","raging bolt","gouging fire",
  "iron crown","iron boulder","sandy shocks","flutter mane","scream tail","brute bonnet","slither wing",
  "iron jugulis","iron moth","iron bundle","iron thorns"
]);

function splitPokemons(tokens){
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
