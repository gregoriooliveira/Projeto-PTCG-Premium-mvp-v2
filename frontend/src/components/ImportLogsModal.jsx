import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import PokemonAutocomplete from "./PokemonAutocomplete.jsx";
import { importLogsParse, importLogsCommit, normalizeDeckKey, getLiveTournament } from "../services/api.js";

// === NEW: normalizer helpers ===============================================
import { normalizePokemonFieldValue, toPokeApiSlug, toPokeApiDisplay } from "../utils/pokeapiName.js";
// ===========================================================================

export default function ImportLogsModal({ isOpen, onClose, onSaved, initialValues }) {
  const [rawLog, setRawLog] = useState("");
  const [playerOptions, setPlayerOptions] = useState([]);
  const [players, setPlayers] = useState({ you: "", opp: "" });
  const [deckName, setDeckName] = useState("");
  const [opponentDeck, setOpponentDeck] = useState("");
  const [userPoke1, setUserPoke1] = useState(null);
  const [userPoke2, setUserPoke2] = useState(null);
  const [oppPoke1, setOppPoke1] = useState(null);
  const [oppPoke2, setOppPoke2] = useState(null);
  const [isOnlineTourney, setIsOnlineTourney] = useState(false);

  const [noTourneyId, setNoTourneyId] = useState(false);
  const [tourneyId, setTourneyId] = useState("");
  const [tourneyInfo, setTourneyInfo] = useState(null);
  const [tourneyRound, setTourneyRound] = useState("");
  const [tourneyNameManual, setTourneyNameManual] = useState("");

  const [busy, setBusy] = useState(false);

  // Reset form when modal opens/closes
  useEffect(()=>{
    if (!isOpen) return;
    resetForm(initialValues);
  }, [isOpen]);

  function resetForm(init) {
    setRawLog(init?.rawLog || "");
    setPlayers({ you: init?.you || "", opp: init?.opp || "" });
    setDeckName(init?.deckName || "");
    setOpponentDeck(init?.opponentDeck || "");
    setUserPoke1(null); setUserPoke2(null); setOppPoke1(null); setOppPoke2(null);
    setIsOnlineTourney(false);
    setNoTourneyId(false); setTourneyId(""); setTourneyInfo(null);
    setTourneyRound(""); setTourneyNameManual("");
    setPlayerOptions([]);
    setBusy(false);
  }

  // Autosuggest parse
  useEffect(() => {
    if (!isOpen) return;
    const s = rawLog.trim();
    if (s.length < 10) return;
    const t = setTimeout(() => { runParse(); }, 300);
    return () => clearTimeout(t);
  }, [isOpen, rawLog]);

  // Normalize any shape of value coming from PokemonAutocomplete or parser
  const normalizePkmValue = (v) => {
    if (!v) return null;
    const base = typeof v === "string" ? v : (v.name || v.slug || "");
    const slug = toPokeApiSlug(base);
    const name = toPokeApiDisplay(base);
    return { slug, name };
  };

  async function runParse(){
    try{
      const res = await importLogsParse({ rawLog, language: "auto", context:{ source:"tcg-live" } });
      const opts = [res?.detected?.player, res?.detected?.opponent].filter(Boolean);
      setPlayerOptions(opts);
      const { detected, suggestions } = res || {};
      if (detected){
        setPlayers(p => ({ you: detected.player || p.you, opp: detected.opponent || p.opp }));
      }
      if (suggestions){
        if (suggestions.playerDeckName && !deckName) setDeckName(suggestions.playerDeckName);              // deck -> HUMANO (com espaços)
        if (suggestions.opponentDeckName && !opponentDeck) setOpponentDeck(suggestions.opponentDeckName); // deck -> HUMANO (com espaços)

        if (Array.isArray(suggestions.playerPokemons) && suggestions.playerPokemons[0] && !userPoke1){
          setUserPoke1(normalizePkmValue(suggestions.playerPokemons[0]));
        }
        if (Array.isArray(suggestions.playerPokemons) && suggestions.playerPokemons[1] && !userPoke2){
          setUserPoke2(normalizePkmValue(suggestions.playerPokemons[1]));
        }
        if (Array.isArray(suggestions.opponentPokemons) && suggestions.opponentPokemons[0] && !oppPoke1){
          setOppPoke1(normalizePkmValue(suggestions.opponentPokemons[0]));
        }
        if (Array.isArray(suggestions.opponentPokemons) && suggestions.opponentPokemons[1] && !oppPoke2){
          setOppPoke2(normalizePkmValue(suggestions.opponentPokemons[1]));
        }
      }
    }catch(e){ /* noop */ }
  }

  // Fetch tournament by ID
  useEffect(()=>{
    let cancel=false;
    async function load(){
      setTourneyInfo(null);
      if (!isOnlineTourney || noTourneyId) return;
      const id = tourneyId.trim();
      if (id.length<3) return;
      try{
        const data = await getLiveTournament(id);
        if (cancel) return;
        setTourneyInfo(data||null);
      }catch{
        if (!cancel) setTourneyInfo({ error:true });
      }
    }
    load();
    return () => { cancel=true; };
  }, [isOnlineTourney, noTourneyId, tourneyId]);

  async function onSave(){
    setBusy(true);
    try{
      const payload = {
        rawLog,
        language: "auto",
        players: { user: { handle: players.you }, opponent: { handle: players.opp } },
        decks: {
          userDeckName: deckName,
          opponentDeckName: opponentDeck,
          userDeckKey: normalizeDeckKey(deckName),
          opponentDeckKey: normalizeDeckKey(opponentDeck)
        },
        mainPokemons: {
          user: [userPoke1?.slug, userPoke2?.slug].filter(Boolean),
          opponent: [oppPoke1?.slug, oppPoke2?.slug].filter(Boolean)
        },
        meta: {
          source:"tcg-live",
          tournamentOnline: isOnlineTourney,
          tournament: isOnlineTourney ? (
            noTourneyId ? { name: tourneyNameManual || "", round: tourneyRound || "" } :
            { platform:"limitless", id: tourneyId || "", name: tourneyInfo?.name || "", round: tourneyRound || "" }
          ) : null
        }
      };
      if (!deckName.trim()) throw new Error("Informe o nome do seu deck");
      if (!opponentDeck.trim()) throw new Error("Informe o deck do oponente");

      const res = await importLogsCommit(payload);
      onSaved && onSaved({ id: res?.matchId, matchId: res?.matchId, ...res });
      resetForm({});
      onClose && onClose();
    }catch(e){
      alert(e?.message || "Falha ao salvar");
    }finally{
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      {/* Container do modal com largura menor e altura máxima */}
      <div className="w-[92vw] max-w-[960px] rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Wrapper com limite de altura e layout em coluna */}
        <div className="flex max-h-[85vh] flex-col">
          {/* HEADER */}
          <div className="shrink-0 flex items-center justify-between p-4 border-b border-zinc-800">
            <div className="text-lg font-semibold text-zinc-200">
              Importar logs do TCG Live - v-IL-0905
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={() => { resetForm({}); onClose && onClose(); }}
              >
                Fechar
              </button>
            </div>
          </div>

          {/* BODY (rola quando ficar grande) */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-6"
            style={{ scrollbarGutter: "stable" }}
          >
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-6">
                <div className="rounded-xl border border-zinc-800 p-3">
                  <label className="text-sm text-zinc-400">VOCÊ</label>
                  <select
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                    value={players.you}
                    onChange={e=>setPlayers(p=>({...p, you:e.target.value}))}
                  >
                    {playerOptions.map(n => (
                      <option key={n} value={n}>{n}</option>
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
                    onChange={e=>setPlayers(p=>({...p, opp:e.target.value}))}
                  >
                    {playerOptions.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="col-span-12 flex justify-end">
                <button
                  className="text-xs text-zinc-400 hover:underline"
                  onClick={() => setPlayers(p=>({ you: p.opp, opp: p.you }))}
                >
                  Trocar você/oponente
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-zinc-400">Nome do Deck *</label>
                <input
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                  placeholder="Ex: Miraidon Iron Hands"
                  value={deckName}
                  onChange={e=>setDeckName(e.target.value)}
                />
              </div>
              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-zinc-400">Deck do oponente (obrigatório)</label>
                <input
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                  placeholder="Ex: Gardevoir ex"
                  value={opponentDeck}
                  onChange={e=>setOpponentDeck(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-6 space-y-3">
                <div className="text-xs uppercase text-zinc-500">Pokémon principais — Você</div>
                <PokemonAutocomplete
                  label="1º Pokémon *"
                  required
                  value={userPoke1}
                  onChange={(v)=>setUserPoke1(normalizePkmValue(v))}
                />
                <PokemonAutocomplete
                  label="2º Pokémon (opcional)"
                  value={userPoke2}
                  onChange={(v)=>setUserPoke2(normalizePkmValue(v))}
                />
              </div>
              <div className="col-span-12 md:col-span-6 space-y-3">
                <div className="text-xs uppercase text-zinc-500">Pokémon principais — Oponente</div>
                <PokemonAutocomplete
                  label="1º Pokémon *"
                  required
                  value={oppPoke1}
                  onChange={(v)=>setOppPoke1(normalizePkmValue(v))}
                />
                <PokemonAutocomplete
                  label="2º Pokémon (opcional)"
                  value={oppPoke2}
                  onChange={(v)=>setOppPoke2(normalizePkmValue(v))}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-zinc-400">Colar log completo aqui</label>
              <textarea
                className="w-full min-h-[180px] bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                placeholder="- Textos do log..."
                value={rawLog}
                onChange={e=>setRawLog(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-zinc-600 w-4 h-4"
                checked={isOnlineTourney}
                onChange={e=>setIsOnlineTourney(e.target.checked)}
              />
              <span className="text-sm text-zinc-300">Log de Torneio on-line</span>
            </div>

            {isOnlineTourney && (
              <div className="rounded-xl border border-zinc-800 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-zinc-300">Dados do Torneio</div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      className="accent-zinc-600 w-4 h-4"
                      checked={noTourneyId}
                      onChange={e=>setNoTourneyId(e.target.checked)}
                    />
                    Não possuo ID de Torneio
                  </label>
                </div>

                {!noTourneyId ? (
                  <>
                    <div>
                      <label className="text-sm text-zinc-400">ID de Torneio (Limitless)</label>
                      <input
                        className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                        placeholder="Ex: 44c0208327e1"
                        value={tourneyId}
                        onChange={e=>setTourneyId(e.target.value)}
                      />
                      {tourneyInfo && !tourneyInfo.error && (
                        <div className="text-xs text-zinc-400 mt-1">
                          <div><span className="text-zinc-500">Nome:</span> {tourneyInfo?.name || "-"}</div>
                          {tourneyInfo?.status && <div><span className="text-zinc-500">Status:</span> {tourneyInfo.status}</div>}
                        </div>
                      )}
                      {tourneyInfo?.error && <div className="text-xs text-rose-400 mt-1">Não foi possível validar esse torneio.</div>}
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400">Round desse log no torneio</label>
                      <input
                        type="number"
                        min="1"
                        className="w-40 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                        placeholder="Ex: 3"
                        value={tourneyRound}
                        onChange={e=>setTourneyRound(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm text-zinc-400">Nome do Torneio</label>
                      <input
                        className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                        placeholder="Ex: Torneio Semanal Online"
                        value={tourneyNameManual}
                        onChange={e=>setTourneyNameManual(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400">Round desse log no torneio</label>
                      <input
                        type="number"
                        min="1"
                        className="w-40 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                        placeholder="Ex: 3"
                        value={tourneyRound}
                        onChange={e=>setTourneyRound(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* FOOTER fixo (sempre visível) */}
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
            <button
              className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={() => { resetForm({}); onClose && onClose(); }}
            >
              Fechar
            </button>
            <button
              disabled={busy || !deckName.trim() || !opponentDeck.trim()}
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

ImportLogsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func,
  onSaved: PropTypes.func,
  initialValues: PropTypes.object
};
