// src/services/tournamentsData.js
let MEM = null;

function slugifyName(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
export function makeTournamentId(name, dateISO) {
  return `${slugifyName(name)}-${dateISO}`;
}

function seedIfEmpty() {
  if (!MEM) {
    MEM = [
      { id: "limitless-online-2025-08-25", name: "Limitless Online", dateISO: "2025-08-25", roundsCount: 5 },
      { id: "pokemon-global-challenge-2025-08-20", name: "Pokémon Global Challenge", dateISO: "2025-08-20", roundsCount: 3 },
    ];
  }
  return MEM;
}
function readAll() {
  return MEM || seedIfEmpty();
}
function writeAll(arr) {
  MEM = arr || [];
}

export function getSummaryList() {
  let all = readAll();
  if (!all.length) all = seedIfEmpty();
  return [...all].sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
}
export function getTournamentById(id) {
  let all = readAll();
  if (!all.length) all = seedIfEmpty();
  return all.find(t => t.id === id) || null;
}
export function upsertTournament(t) {
  const all = readAll();
  const id = t.id || makeTournamentId(t.name, t.dateISO);
  const idx = all.findIndex(x => x.id === id);
  const toSave = { id, name: t.name, dateISO: t.dateISO, roundsCount: t.roundsCount ?? 0 };
  if (idx >= 0) all[idx] = { ...all[idx], ...toSave }; else all.push(toSave);
  writeAll(all);
  return id;
}
