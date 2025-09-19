import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPhysicalRoundsMock = vi.fn();
const postPhysicalRoundMock = vi.fn();
const updatePhysicalRoundMock = vi.fn();
const deletePhysicalRoundMock = vi.fn();

vi.mock("./services/physicalApi.js", () => ({
  postPhysicalRound: (...args) => postPhysicalRoundMock(...args),
  getPhysicalRounds: (...args) => getPhysicalRoundsMock(...args),
  updatePhysicalRound: (...args) => updatePhysicalRoundMock(...args),
  deletePhysicalRound: (...args) => deletePhysicalRoundMock(...args),
}));

const getEventMock = vi.fn();
const updateEventMock = vi.fn();
const deleteEventMock = vi.fn();

vi.mock("./eventsRepo.js", () => ({
  getEvent: (...args) => getEventMock(...args),
  updateEvent: (...args) => updateEventMock(...args),
  deleteEvent: (...args) => deleteEventMock(...args),
}));

const getPokemonIconMock = vi.fn(() => Promise.resolve("icon.png"));

vi.mock("./services/pokemonIcons.js", () => ({
  getPokemonIcon: (...args) => getPokemonIconMock(...args),
  FALLBACK: "fallback.png",
}));

vi.mock("./components/BackButton", () => ({
  default: () => <button type="button">Back</button>,
}));

const { default: EventPhysicalSummaryPage } = await import("./EventPhysicalSummaryPage.jsx");

describe("EventPhysicalSummaryPage", () => {
  beforeEach(() => {
    getPhysicalRoundsMock.mockReset();
    postPhysicalRoundMock.mockReset();
    updatePhysicalRoundMock.mockReset();
    deletePhysicalRoundMock.mockReset();
    getEventMock.mockReset();
    updateEventMock.mockReset();
    deleteEventMock.mockReset();
    getPokemonIconMock.mockClear();

    window.location.hash = "#/tcg-fisico/eventos/evt-1";
    window.history.replaceState(
      {
        eventFromProps: {
          id: "evt-1",
          eventId: "evt-1",
          name: "League Night",
          date: "2024-01-01",
        },
      },
      "",
      "#/tcg-fisico/eventos/evt-1",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("removes the edited round and resets the form when deletion succeeds", async () => {
    getPhysicalRoundsMock.mockResolvedValue([
      {
        id: "round-1",
        roundId: "round-1",
        number: 1,
        opponentName: "Brock",
        opponentDeckName: "Rock",
        g1: { result: "V", order: "1st" },
        g2: { result: "", order: "" },
        g3: { result: "", order: "" },
        flags: { noShow: false, bye: false, id: false },
      },
      {
        id: "round-2",
        roundId: "round-2",
        number: 2,
        opponentName: "Misty",
        opponentDeckName: "Water",
        g1: { result: "D", order: "1st" },
        g2: { result: "", order: "" },
        g3: { result: "", order: "" },
        flags: { noShow: false, bye: false, id: false },
      },
    ]);
    deletePhysicalRoundMock.mockResolvedValue({ ok: true });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<EventPhysicalSummaryPage />);

    await waitFor(() => {
      expect(getPhysicalRoundsMock).toHaveBeenCalledWith("evt-1");
    });

    await waitFor(() => {
      expect(screen.getByText("2024-01-01")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("R1")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("R1"));

    const editButton = await screen.findByRole("button", { name: "Editar" });
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save edit" })).toBeTruthy();
    });

    const opponentInput = screen.getByPlaceholderText("Ex.: Marina / João");
    expect(opponentInput.value).toBe("Brock");

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deletePhysicalRoundMock).toHaveBeenCalledWith("evt-1", "round-1");
    });

    await waitFor(() => {
      expect(screen.queryByText("R1")).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add round" })).toBeTruthy();
    });

    expect(screen.getByPlaceholderText("Ex.: Marina / João").value).toBe("");

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert?.textContent || "").toContain("Round excluído com sucesso!");
    });

    confirmSpy.mockRestore();
  });
});
