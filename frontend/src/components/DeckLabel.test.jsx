import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeckLabel from "./DeckLabel.jsx";
import { prettyDeckKey } from "../services/prettyDeckKey.js";

const createMockResponse = (slug) => ({
  ok: true,
  async json() {
    return {
      sprites: {
        other: {
          "official-artwork": {
            front_default: `https://img/${slug}.png`,
          },
        },
      },
    };
  },
});

describe("DeckLabel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (url) => {
      const slug = url.split("/").pop();
      return createMockResponse(slug);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders hyphenated Pokémon names and resolves icons without hints", async () => {
    const deckName = prettyDeckKey("chien-pao-baxcalibur");

    render(<DeckLabel deckName={deckName} showIcons />);

    const label = screen.getByText("Chien-Pao / Baxcalibur");
    expect(label.textContent).toBe("Chien-Pao / Baxcalibur");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/chien-pao")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/baxcalibur")
      );
    });

    const imgs = screen.getAllByRole("img");
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute("src")).toBe("https://img/chien-pao.png");
    expect(imgs[1].getAttribute("src")).toBe("https://img/baxcalibur.png");
  });

  it("renders stacked layout for multi-segment deck names", () => {
    render(<DeckLabel deckName="Arceus / Giratina" stacked showIcons={false} />);

    const firstLine = screen.getByText("Arceus");
    const secondLine = screen.getByText("Giratina");

    const container = firstLine.closest("div")?.parentElement;
    expect(container?.className).toContain("flex-col");
    expect(container?.querySelectorAll("span.truncate")).toHaveLength(2);
    expect(secondLine.closest("div")?.parentElement).toBe(container);
  });

  it("keeps inline layout for single-segment deck names", () => {
    render(<DeckLabel deckName="Lugia VSTAR" showIcons={false} />);

    const label = screen.getByText("Lugia VSTAR");
    const container = label.closest("div");

    expect(container?.className).not.toContain("flex-col");
    expect(container?.querySelectorAll("span.truncate")).toHaveLength(1);
  });
});
