import React, { useState } from "react";
import PokemonAutocomplete from "./PokemonAutocomplete.jsx";

export default function DeckModal({ initialDeck, onCancel, onSave }) {
  const [deckName, setDeckName] = useState(initialDeck?.deckName || "");
  const [pokemon1, setPokemon1] = useState(
    initialDeck?.pokemon1
      ? { name: initialDeck.pokemon1, slug: initialDeck.pokemon1 }
      : null
  );
  const [pokemon2, setPokemon2] = useState(
    initialDeck?.pokemon2
      ? { name: initialDeck.pokemon2, slug: initialDeck.pokemon2 }
      : null
  );

  const handleSave = () => {
    onSave &&
      onSave({
        deckName: deckName.trim(),
        pokemon1: pokemon1?.slug || "",
        pokemon2: pokemon2?.slug || "",
      });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-[min(480px,90vw)]">
        <h3 className="text-lg font-bold mb-3">Deck</h3>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-zinc-400">Nome do Deck</label>
            <input
              className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
            />
          </div>
          <PokemonAutocomplete
            label="Pokémon 1"
            required
            value={pokemon1}
            onChange={setPokemon1}
          />
          <PokemonAutocomplete
            label="Pokémon 2"
            value={pokemon2}
            onChange={setPokemon2}
          />
        </div>
        <div className="mt-4 flex gap-3 justify-end">
          <button
            className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            onClick={handleSave}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
