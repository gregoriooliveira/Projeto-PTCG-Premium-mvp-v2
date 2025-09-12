import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import PokemonAutocomplete from "./PokemonAutocomplete.jsx";
import { importLogsParse, patchLiveEvent } from "../services/api.js";

function titleCase(s = "") {
  return String(s).replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

export default function EditLogModal({ isOpen, logId, ev, onClose, onSaved }) {
  const [playerOptions, setPlayerOptions] = useState([]);
  const [players, setPlayers] = useState({ you: "", opp: "" });
  const [deckName, setDeckName] = useState("");
  const [opponentDeck, setOpponentDeck] = useState("");
  const [userPoke1, setUserPoke1] = useState(null);
  const [userPoke2, setUserPoke2] = useState(null);
  const [oppPoke1, setOppPoke1] = useState(null);
  const [oppPoke2, setOppPoke2] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      resetForm(ev);
      parsePlayers(ev?.rawLog);
    }
  }, [isOpen, ev]);

  function resetForm(e) {
    setPlayers({ you: e?.you || "", opp: e?.opponent || "" });
    setDeckName(e?.deckName || "");
    setOpponentDeck(e?.opponentDeck || "");
    const youP = Array.isArray(e?.pokemons)
      ? e.pokemons.filter((p) => !p.side || p.side === "you")
      : Array.isArray(e?.userPokemons)
      ? e.userPokemons
      : [];
    const oppP = Array.isArray(e?.pokemons)
      ? e.pokemons.filter((p) => p.side === "opponent")
      : Array.isArray(e?.opponentPokemons)
      ? e.opponentPokemons
      : [];
    const toObj = (p) =>
      typeof p === "string"
        ? { slug: p, name: titleCase(p.replace(/-/g, " ")) }
        : { slug: p.slug, name: p.name || titleCase((p.slug || "").replace(/-/g, " ")) };
    setUserPoke1(youP[0] ? toObj(youP[0]) : null);
    setUserPoke2(youP[1] ? toObj(youP[1]) : null);
    setOppPoke1(oppP[0] ? toObj(oppP[0]) : null);
    setOppPoke2(oppP[1] ? toObj(oppP[1]) : null);
  }

  async function parsePlayers(raw) {
    const fallback = [ev?.you, ev?.opponent].filter(Boolean);
    try {
      const res = await importLogsParse({ rawLog: raw || "", language: "auto", context: { source: "tcg-live" } });
      const opts = [res?.detected?.player, res?.detected?.opponent].filter(Boolean);
      setPlayerOptions(opts.length === 2 ? opts : Array.from(new Set(fallback)));
    } catch {
      setPlayerOptions(Array.from(new Set(fallback)));
    }
  }

  async function onSave() {
    setBusy(true);
    try {
      const pokemons = [
        userPoke1 && { side: "you", ...userPoke1 },
        userPoke2 && { side: "you", ...userPoke2 },
        oppPoke1 && { side: "opponent", ...oppPoke1 },
        oppPoke2 && { side: "opponent", ...oppPoke2 }
      ].filter(Boolean);
      const payload = {
        deckName,
        opponentDeck,
        pokemons,
        you: players.you,
        opponent: players.opp
      };
      await patchLiveEvent(logId, payload);
      onSaved && onSaved();
    } catch (e) {
      alert(e?.message || "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-8">
      <div className="w-[600px] max-w-[95vw] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="text-lg font-semibold text-zinc-200">Editar Log</div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </div>
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <div className="rounded-xl border border-zinc-800 p-3">
                <label className="text-sm text-zinc-400">VOCÊ</label>
                <select
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                  value={players.you}
                  onChange={(e) => setPlayers((p) => ({ ...p, you: e.target.value }))}
                >
                  {playerOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="rounded-xl border border-zinc-800 p-3">
                <label className="text-sm text-zinc-400">OPONENTE</label>
                <select
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                  value={players.opp}
                  onChange={(e) => setPlayers((p) => ({ ...p, opp: e.target.value }))}
                >
                  {playerOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <label className="text-sm text-zinc-400">Nome do Deck *</label>
              <input
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                placeholder="Ex: Miraidon Iron Hands"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <label className="text-sm text-zinc-400">Deck do oponente (obrigatório)</label>
              <input
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                placeholder="Ex: Gardevoir ex"
                value={opponentDeck}
                onChange={(e) => setOpponentDeck(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6 space-y-3">
              <div className="text-xs uppercase text-zinc-500">Pokémon principais — Você</div>
              <PokemonAutocomplete label="1º Pokémon" required value={userPoke1} onChange={setUserPoke1} />
              <PokemonAutocomplete label="2º Pokémon (opcional)" value={userPoke2} onChange={setUserPoke2} />
            </div>
            <div className="col-span-12 md:col-span-6 space-y-3">
              <div className="text-xs uppercase text-zinc-500">Pokémon principais — Oponente</div>
              <PokemonAutocomplete label="1º Pokémon" required value={oppPoke1} onChange={setOppPoke1} />
              <PokemonAutocomplete label="2º Pokémon (opcional)" value={oppPoke2} onChange={setOppPoke2} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={onClose}
            >
              Fechar
            </button>
            <button
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-white text-zinc-900 hover:bg-white disabled:opacity-50"
              onClick={onSave}
            >
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

EditLogModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  logId: PropTypes.string.isRequired,
  ev: PropTypes.object,
  onClose: PropTypes.func,
  onSaved: PropTypes.func
};
