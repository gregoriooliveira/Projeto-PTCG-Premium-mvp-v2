export const decks = [
  { key: "Gardevoir ex", sprites: [282, 196] },
  { key: "Dragapult ex", sprites: [149, 195] },
  { key: "Grimmsnarl ex", sprites: [861, 860] },
  { key: "Raging Bolt ex", sprites: [1010, 1017] },
  { key: "Mewtwo Rocket", sprites: [150, 52] },
  { key: "Gholdengo", sprites: [1000, 999] },
  { key: "Tera Box", sprites: [6, 3] },
  { key: "Joltik Box", sprites: [595, 596] },
  { key: "Eevee Box", sprites: [133, 134] },
];

export const opponents = [
  "GregorioOli",
  "ArthurBR",
  "Marina",
  "Akira",
  "Theo",
  "Luna",
  "Rafael",
  "Sofia",
];

const flip = (p) => Math.random() < p;
const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

function randomDateWithin(days = 30) {
  const now = new Date();
  const past = new Date(now);
  past.setDate(now.getDate() - Math.floor(Math.random() * days));
  past.setHours(
    Math.floor(Math.random() * 24),
    Math.floor(Math.random() * 60),
    0,
    0
  );
  return past;
}

export function generateMockMatches(n = 120) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = randChoice(decks);
    const oppDeck = randChoice(decks);
    const mode = flip(0.6) ? "live" : "manual"; // viés suave para Live
    const strength = d.key.includes("Grimmsnarl") || d.key.includes("Dragapult") ? 0.62 : 0.52;
    const outcome = flip(strength) ? "W" : flip(0.07) ? "T" : "L";
    rows.push({
      id: `m_${i}`,
      date: randomDateWithin(25),
      mode, // "live" | "manual"
      result: outcome, // "W" | "L" | "T"
      playerDeck: d.key,
      opponentDeck: oppDeck.key,
      opponentName: randChoice(opponents),
    });
  }
  return rows;
}

export function spriteUrlsFor(deckKey) {
  const d = decks.find((x) => x.key === deckKey);
  if (!d) return [];
  return d.sprites.map(
    (id) =>
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
  );
}
