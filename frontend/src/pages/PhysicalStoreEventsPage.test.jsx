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

  it("uses deck pokemons when aggregate top hints are empty", () => {
    const event = {
      id: "evt-hints",
      rows: [
        {
          playerDeckKey: "lost-zone",
          playerDeckName: "Lost Zone",
          userPokemons: ["Comfey", "Sableye"],
        },
      ],
      detail: {
        roundsCount: 1,
        opponentsList: ["Dexter"],
        opponentsAgg: [
          {
            opponentName: "Dexter",
            counts: { W: 1, L: 0, T: 0 },
            topDeckKey: "preferred",
            topDeckName: "Preferred Deck",
            topPokemons: [],
            decks: [
              { deckKey: "preferred", deckName: "Preferred Deck", pokemons: [] },
              {
                deckKey: "backup",
                deckName: "Backup Deck",
                pokemons: ["Miraidon EX", { name: "Raikou V " }],
              },
            ],
          },
        ],
      },
    };

    const matches = buildEventMatches(event, { rounds: [] });

    expect(matches).toHaveLength(1);
    expect(matches[0].opponentPokemons).toEqual(["Miraidon EX", "Raikou V"]);
  });

  it("uses detail pokemons for player hints when available", () => {
    const event = {
      id: "evt-detail-hints",
      rows: [
        {
          playerDeckKey: "lost-zone",
          playerDeckName: "Lost Zone",
        },
      ],
      detail: {
        roundsCount: 1,
        opponentsList: ["Dexter"],
        pokemons: [
          {
            side: "you",
            pokemons: ["Miraidon EX", { name: "Raikou V " }],
          },
          {
            side: "opponent",
            pokemons: ["Charizard ex"],
          },
        ],
        opponentsAgg: [
          {
            opponentName: "Dexter",
            counts: { W: 1, L: 0, T: 0 },
            decks: [
              { deckKey: "preferred", deckName: "Preferred Deck", pokemons: [] },
              { deckKey: "backup", deckName: "Backup Deck", pokemons: [] },
            ],
          },
        ],
      },
    };

    const matches = buildEventMatches(event, { rounds: [] });

    expect(matches).toHaveLength(1);
    expect(matches[0].userPokemons).toEqual(["Miraidon EX", "Raikou V"]);
  });
});
