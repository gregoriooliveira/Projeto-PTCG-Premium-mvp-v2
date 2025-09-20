import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteAccount, getProfile, updateProfile } from "../services/profile.js";
import { useAuth } from "../auth/AuthProvider.jsx";

const applyThemeClass = (theme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("theme-dark", "theme-light");
  root.classList.add(theme === "light" ? "theme-light" : "theme-dark");
};

const DEFAULT_PROFILE = {
  screenName: "",
  themePreference: "dark",
};

export default function ConfigPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [screenNameInput, setScreenNameInput] = useState("");
  const [savingScreenName, setSavingScreenName] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [themeSaving, setThemeSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    let isActive = true;
    setLoading(true);
    (async () => {
      try {
        const data = await getProfile();
        if (!isActive) return;
        const normalized = { ...DEFAULT_PROFILE, ...data };
        setProfile(normalized);
        setScreenNameInput(normalized.screenName || "");
        setTheme(normalized.themePreference === "light" ? "light" : "dark");
        setError(null);
      } catch (err) {
        if (!isActive) return;
        setError("Não foi possível carregar o perfil.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  const screenNameLabel = useMemo(() => {
    if (loading) return "Carregando...";
    return profile.screenName ? profile.screenName : "—";
  }, [loading, profile.screenName]);

  const handleEditClick = () => {
    setScreenNameInput(profile.screenName || "");
    setEditing(true);
  };

  const handleScreenNameSubmit = async (event) => {
    event.preventDefault();
    if (!editing) return;
    const nextValue = screenNameInput.trim();
    if (nextValue === profile.screenName) {
      setEditing(false);
      return;
    }
    setSavingScreenName(true);
    try {
      const updated = await updateProfile({ screenName: nextValue });
      setProfile((prev) => ({ ...prev, ...updated, screenName: nextValue }));
      setError(null);
      setEditing(false);
    } catch (err) {
      setError("Não foi possível atualizar o Screen Name.");
    } finally {
      setSavingScreenName(false);
    }
  };

  const handleThemeChange = async (event) => {
    const nextTheme = event.target.value === "light" ? "light" : "dark";
    if (nextTheme === theme) return;
    const previousTheme = theme;
    setTheme(nextTheme);
    setProfile((prev) => ({ ...prev, themePreference: nextTheme }));
    setThemeSaving(true);
    try {
      const updated = await updateProfile({ themePreference: nextTheme });
      setProfile((prev) => ({ ...prev, ...updated }));
      setError(null);
    } catch (err) {
      setTheme(previousTheme);
      setProfile((prev) => ({ ...prev, themePreference: previousTheme }));
      setError("Não foi possível atualizar a preferência de tema.");
    } finally {
      setThemeSaving(false);
    }
  };

  const handleLogout = async () => {
    if (typeof signOut !== "function") return;
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      setError("Falha ao encerrar a sessão.");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await deleteAccount();
      setDeleteOpen(false);
      setProfile({ ...DEFAULT_PROFILE });
      setTheme("dark");
      setScreenNameInput("");
      setError(null);
      if (typeof signOut === "function") {
        await signOut();
      }
      navigate("/");
    } catch (err) {
      setError("Não foi possível excluir a conta.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 text-zinc-200">
      <div>
        <h1 className="text-3xl font-semibold">Configurações</h1>
        <p className="text-sm text-zinc-400">Gerencie sua conta e preferências do PTCG Premium.</p>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-white/5 bg-white/5 p-5 shadow-lg shadow-black/30">
        <header>
          <h2 className="text-xl font-semibold">Perfil</h2>
          <p className="text-sm text-zinc-400">Atualize o Screen Name utilizado no PTCG Live.</p>
        </header>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium uppercase tracking-wide text-zinc-400">Screen Name PTCG Live</span>
            <span data-testid="screen-name-value" className="text-lg font-semibold text-zinc-100">
              {screenNameLabel}
            </span>
            <button
              type="button"
              onClick={handleEditClick}
              disabled={loading}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
            >
              Editar
            </button>
          </div>
          {editing ? (
            <form onSubmit={handleScreenNameSubmit} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-4">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-zinc-300">Novo Screen Name</span>
                <input
                  value={screenNameInput}
                  onChange={(event) => setScreenNameInput(event.target.value)}
                  placeholder="Informe o novo Screen Name"
                  className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-base text-zinc-100 focus:border-emerald-400 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={savingScreenName}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-white/5 bg-white/5 p-5 shadow-lg shadow-black/30">
        <header>
          <h2 className="text-xl font-semibold">Tema</h2>
          <p className="text-sm text-zinc-400">Escolha entre a aparência clara ou escura do aplicativo.</p>
        </header>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Modo de tema</span>
            <select
              value={theme}
              onChange={handleThemeChange}
              disabled={themeSaving}
              className="w-48 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-base text-zinc-100 focus:border-emerald-400 focus:outline-none"
            >
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </select>
          </label>
          <span className="text-xs uppercase tracking-wide text-zinc-500">Preferência salva automaticamente</span>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-white/5 bg-white/5 p-5 shadow-lg shadow-black/30">
        <header>
          <h2 className="text-xl font-semibold">Conta</h2>
          <p className="text-sm text-zinc-400">Gerencie acesso e segurança.</p>
        </header>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">E-mail autenticado</p>
            <p className="text-lg font-semibold text-zinc-100">{user?.email || "—"}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-fit rounded-md border border-zinc-500/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="fixed bottom-6 right-6 rounded-full border border-red-500/50 bg-red-500/20 px-5 py-3 text-sm font-semibold text-red-100 shadow-lg shadow-red-500/25 transition hover:bg-red-500/30"
      >
        Excluir conta
      </button>

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-red-500/40 bg-zinc-950 p-6 text-zinc-100">
            <h3 className="text-xl font-semibold text-red-200">Confirmar exclusão</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Esta ação é permanente. Tem certeza de que deseja excluir sua conta e todos os dados associados?
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-red-950 transition hover:bg-red-400 disabled:opacity-60"
              >
                Confirmar exclusão
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-md border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
