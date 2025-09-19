import { describe, expect, it } from "vitest";

import { buildEventMatches } from "./PhysicalStoreEventsPage.jsx";

describe("buildEventMatches", () => {
  it("returns aggregated opponents when round documents are unavailable", () => {
    const event = {
      id: "evt-agg",
      rows: [
        {
          playerDeckKey: "lost-zone",
          playerDeckName: "Lost Zone",
          userPokemons: ["Comfey", "Sableye"],
        },
      ],
      detail: {
        roundsCount: 3,
        opponentsList: ["Alice", "Bob", "Carol"],
        opponentsAgg: [
          {
            opponentName: "Bob",
            counts: { W: 0, L: 1, T: 0 },
            decks: [{ deckKey: "dark-rai", deckName: "Darkrai" }],
          },
          {
            opponentName: "Alice",
            counts: { W: 1, L: 0, T: 0 },
            decks: [
              {
                deckKey: "charizard", 
                deckName: "Charizard",
                pokemons: ["charizard-ex"],
              },
            ],
            topDeckKey: "charizard",
            topDeckName: "Charizard",
          },
          {
            opponentName: "Carol",
            counts: { W: 0, L: 0, T: 1 },
            decks: [{ deckName: "Control" }],
          },
        ],
      },
    };

    const matches = buildEventMatches(event, { rounds: [] });

    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.opponent)).toEqual(["Alice", "Bob", "Carol"]);
    expect(matches.map((m) => m.roundLabel)).toEqual(["R1", "R2", "R3"]);
    expect(matches.map((m) => m.result)).toEqual(["W", "L", "T"]);
    expect(matches[0].counts).toEqual({ W: 1, L: 0, T: 0, total: 1 });
    expect(matches[1].counts).toEqual({ W: 0, L: 1, T: 0, total: 1 });
    expect(matches[2].counts).toEqual({ W: 0, L: 0, T: 1, total: 1 });
    matches.forEach((match) => {
      expect(match.userPokemons).toEqual(["Comfey", "Sableye"]);
    });
  });
});
