import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();

vi.mock("./services/api.js", () => ({
  api: (...args) => apiMock(...args),
}));

vi.mock("./services/physicalApi.js", () => ({
  getPhysicalEvent: vi.fn(),
  postPhysicalEvent: vi.fn(),
}));

describe("eventsRepo.updateEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    apiMock.mockReset();
  });

  it("uses PATCH and returns the server response", async () => {
    apiMock.mockResolvedValue({ ok: true });
    const { updateEvent } = await import("./eventsRepo.js");

    const payload = { deckName: "Miraidon" };
    const result = await updateEvent("evt-42", payload);

    expect(apiMock).toHaveBeenCalledWith("/api/physical/events/evt-42", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns null when the request fails", async () => {
    apiMock.mockRejectedValue(new Error("boom"));
    const { updateEvent } = await import("./eventsRepo.js");

    const result = await updateEvent("evt-42", { deckName: "Miraidon" });
    expect(result).toBeNull();
  });
});
