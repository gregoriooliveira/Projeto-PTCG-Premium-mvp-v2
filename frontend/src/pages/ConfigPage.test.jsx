import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, vi, beforeEach, afterEach, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ConfigPage from "./ConfigPage.jsx";
import { AuthProvider } from "../auth/AuthProvider.jsx";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const getProfileMock = vi.fn();
const updateProfileMock = vi.fn();
const deleteAccountMock = vi.fn();

vi.mock("../services/profile.js", () => ({
  getProfile: (...args) => getProfileMock(...args),
  updateProfile: (...args) => updateProfileMock(...args),
  deleteAccount: (...args) => deleteAccountMock(...args),
}));

const renderConfigPage = ({ authValue } = {}) => {
  const value =
    authValue ||
    ({
      user: { email: "ash@kanto.example" },
      signOut: vi.fn().mockResolvedValue(),
    });

  return render(
    <AuthProvider value={value}>
      <MemoryRouter>
        <ConfigPage />
      </MemoryRouter>
    </AuthProvider>
  );
};

beforeEach(() => {
  getProfileMock.mockReset();
  updateProfileMock.mockReset();
  deleteAccountMock.mockReset();
  mockNavigate.mockReset();
  document.documentElement.className = "";
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

describe("ConfigPage", () => {
  it("exibe o Screen Name carregado e permite edição", async () => {
    getProfileMock.mockResolvedValue({ screenName: "Ash Ketchum", themePreference: "dark" });
    updateProfileMock.mockResolvedValue({ screenName: "Misty", themePreference: "dark" });

    renderConfigPage();

    const value = await screen.findByTestId("screen-name-value");
    expect(value.textContent).toContain("Ash Ketchum");

    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    const input = screen.getByLabelText(/novo screen name/i);
    fireEvent.change(input, { target: { value: "Misty" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith({ screenName: "Misty" }));
    expect(screen.getByTestId("screen-name-value").textContent).toContain("Misty");
  });

  it("altera o tema e aplica a classe correspondente", async () => {
    getProfileMock.mockResolvedValue({ screenName: "Ash", themePreference: "dark" });
    updateProfileMock.mockResolvedValue({ themePreference: "light" });

    renderConfigPage();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "light" } });

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith({ themePreference: "light" }));
    await waitFor(() => expect(document.documentElement.classList.contains("theme-light")).toBe(true));
  });

  it("abre o modal de exclusão e confirma a remoção", async () => {
    const signOut = vi.fn().mockResolvedValue();
    getProfileMock.mockResolvedValue({ screenName: "Ash", themePreference: "dark" });
    deleteAccountMock.mockResolvedValue(true);

    renderConfigPage({ authValue: { user: { email: "ash@kanto.example" }, signOut } });

    await screen.findByTestId("screen-name-value");

    fireEvent.click(screen.getByRole("button", { name: /excluir conta/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /confirmar exclusão/i }));

    await waitFor(() => expect(deleteAccountMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
