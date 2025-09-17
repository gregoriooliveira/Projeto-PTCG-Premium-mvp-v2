import { describe, expect, it, vi } from "vitest";

vi.mock("./components/NovoRegistroDialog.jsx", () => ({ default: () => null }));
vi.mock("./components/widgets/ResumoGeralWidget.jsx", () => ({ default: () => null }));
vi.mock("./components/DeckLabel.jsx", () => ({ default: () => null }));
vi.mock("./eventsRepo.js", () => ({ getEvent: vi.fn() }));
vi.mock("./services/api.js", () => ({
  getPhysicalLogs: vi.fn(),
  getPhysicalSummary: vi.fn(),
  normalizeDeckKey: (value) => value,
}));
vi.mock("framer-motion", () => ({ motion: { div: () => null } }));
vi.mock("lucide-react", () => ({
  BarChart3: () => null,
  CalendarDays: () => null,
  Trophy: () => null,
  Users: () => null,
  Upload: () => null,
}));

import {
  aggregatePokemonHintsForDeck,
  countsFrom,
  deriveTopDeckHints,
  topDeckByWinRate,
  winRate,
} from "./PhysicalPageV2.jsx";

describe("PhysicalPageV2 helper utilities", () => {
  it("countsFrom normaliza tokens variados de resultado", () => {
    const matches = [
      { result: "W" },
      { result: "w" },
      { result: "win" },
      { result: "V" },
      { result: "L" },
      { result: "loss" },
      { result: "D" },
      { result: "T" },
      { result: "tie" },
      { result: "empate" },
      { result: "" },
      { result: "unknown" },
      {},
    ];
    expect(countsFrom(matches)).toEqual({ W: 4, L: 3, T: 3, total: 10 });
  });

  it("winRate inclui empates no denominador", () => {
    expect(winRate({ W: 7, L: 2, T: 1 })).toBe(70);
    expect(winRate({})).toBe(0);
  });

  it("topDeckByWinRate considera tokens normalizados e desempata por volume", () => {
    const matches = [
      { playerDeck: "Alpha", result: "win" },
      { playerDeck: "Alpha", result: "loss" },
      { playerDeck: "Alpha", result: "empate" },
      { playerDeck: "Beta", result: "W" },
      { playerDeck: "Beta", result: "L" },
      { playerDeck: "Beta", result: "V" },
      { playerDeck: "Beta", result: "T" },
      { playerDeck: "Gamma", result: "w" },
      { playerDeck: "Gamma", result: "d" },
      { playerDeck: "Delta", result: "BYE" },
    ];

    const best = topDeckByWinRate(matches);
    expect(best).toMatchObject({ deckKey: "Beta", winRate: 50, games: 4 });
  });

  it("aggregatePokemonHintsForDeck combina todas as entradas do deck vencedor", () => {
    const matches = [
      { playerDeck: "Alpha", userPokemons: ["gardevoir", "mewtwo"] },
      { playerDeck: "Alpha", userPokemons: ["gardevoir", "miraidon"] },
      { playerDeck: "Beta", userPokemons: ["charizard"] },
      { playerDeck: "Alpha", userPokemons: ["gardevoir", "zacian", "mewtwo"] },
      { playerDeck: "Alpha", userPokemons: ["  Gardevoir  "] },
    ];

    const hints = aggregatePokemonHintsForDeck(matches, "Alpha");
    expect(hints).toEqual(["gardevoir", "mewtwo", "miraidon", "zacian"]);
  });

  it("aggregatePokemonHintsForDeck retorna vazio quando não encontra correspondências", () => {
    expect(aggregatePokemonHintsForDeck([], "Gamma")).toEqual([]);
    expect(aggregatePokemonHintsForDeck([{ playerDeck: "Alpha", userPokemons: ["lugia"] }], "Gamma")).toEqual([]);
  });

  it("deriveTopDeckHints prioriza agregação manual em relação ao resumo", () => {
    const matches = [
      { playerDeck: "Alpha", userPokemons: ["gardevoir"] },
      { playerDeck: "Alpha", userPokemons: ["zacian"] },
    ];

    const summaryTopDeck = { deckKey: "Alpha", avatars: ["lugia"] };

    const hints = deriveTopDeckHints({
      matches,
      summaryTopDeck,
      deckKeyCandidates: ["Alpha", "alpha", "—"],
    });

    expect(hints).toEqual(["gardevoir", "zacian"]);
  });
});
