
/**
 * Pokémon name normalizer for PokeAPI / image URLs.
 *
 * Goal:
 *  - Keep deck names HUMAN (with spaces), but force only Pokémon fields
 *    to the PokeAPI-style hyphenated format when filling suggestions or
 *    when the user leaves the input (onBlur).
 *
 * What it does:
 *  - Converts any human name like "Great Tusk" => { slug: "great-tusk", display: "Great-Tusk" }
 *  - Handles common edge cases (Porygon Z, Mr. Mime, Mime Jr., Nidoran♀/♂, Type: Null, Wo Chien, etc.)
 *  - Removes accents and odd punctuation safely.
 *
 * Examples:
 *  pokemonToPokeApi("Great Tusk")  -> { slug: "great-tusk", display: "Great-Tusk" }
 *  pokemonToPokeApi("Roaring Moon")-> { slug: "roaring-moon", display: "Roaring-Moon" }
 *  pokemonToPokeApi("Porygon Z")   -> { slug: "porygon-z", display: "Porygon-Z" }
 *  pokemonToPokeApi("Mr. Mime")    -> { slug: "mr-mime", display: "Mr-Mime" }
 *  pokemonToPokeApi("Mime Jr.")    -> { slug: "mime-jr", display: "Mime-Jr" }
 *  pokemonToPokeApi("Nidoran ♀")   -> { slug: "nidoran-f", display: "Nidoran-F" }
 *  pokemonToPokeApi("Nidoran ♂")   -> { slug: "nidoran-m", display: "Nidoran-M" }
 *  pokemonToPokeApi("Farfetch’d")  -> { slug: "farfetchd", display: "Farfetchd" }
 */
 
/**
 * Turn a human string into a normalized array of ASCII tokens.
 * Replaces punctuation with hyphens and collapses repeats.
 */
function _tokenizeToHyphenatedASCII(input) {
  if (!input) return '';
  // Normalize accents
  let s = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Standardize punctuation variants
  s = s
    .replace(/[’'‘`´]/g, '')                 // remove apostrophes (Farfetch'd -> Farfetchd, Sirfetch’d -> Sirfetchd)
    .replace(/[.:]/g, '-')                   // Mr. Mime, Mime Jr., Type: Null
    .replace(/[()]/g, ' ')                   // drop parentheses
    .replace(/♀/gi, '-f')                    // Nidoran♀
    .replace(/♂/gi, '-m')                    // Nidoran♂
    .replace(/&/g, ' and ')                  // just in case (unlikely in Pokémon names)
    ;

  // Convert any non letter/number plus spaces to hyphens
  s = s.replace(/[^A-Za-z0-9]+/g, '-');

  // Trim and collapse multiple hyphens
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');

  return s;
}

/**
 * Capitalize each hyphen separated chunk for display.
 */
function _titleCaseHyphenated(hyphenatedLower) {
  if (!hyphenatedLower) return '';
  return hyphenatedLower.split('-').map(part => {
    if (!part) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('-');
}

/**
 * Core converter.
 * Returns both a lowercase slug and a Title-Case display value (both hyphenated).
 */
export function pokemonToPokeApi(input) {
  const hyphenated = _tokenizeToHyphenatedASCII(String(input || '').trim());
  const slug = hyphenated.toLowerCase();     // what APIs usually want
  const display = _titleCaseHyphenated(slug);// what we want to show in the inputs
  return { slug, display };
}

/**
 * Convenience helpers.
 */
export function toPokeApiSlug(input) {
  return pokemonToPokeApi(input).slug;
}

export function toPokeApiDisplay(input) {
  return pokemonToPokeApi(input).display;
}

/**
 * Use this when writing back to the form input fields that represent POKÉMON names.
 * (Deck names should NOT go through this.)
 */
export function normalizePokemonFieldValue(input) {
  return toPokeApiDisplay(input);
}
