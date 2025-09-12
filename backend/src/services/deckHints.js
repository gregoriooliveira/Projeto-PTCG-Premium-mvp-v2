
export const DECK_HINTS = {
  "miraidon iron hands": ["miraidon","iron-hands"],
  "gardevoir ex": ["gardevoir","zacian"],
  "dragapult ex": ["dragapult","giratina"]
};
export function hintForNames(names = []){
  const key = names.map(s => String(s).toLowerCase()).sort().join(" ");
  for (const [deck, pokes] of Object.entries(DECK_HINTS)){
    const d = deck.split(" ");
    const hit = d.every(k => key.includes(k));
    if (hit) return { deckName: deck, pokemons: pokes };
  }
  return null;
}
