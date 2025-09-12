// src/eventsRepo.js
// Repositório mínimo para leitura dos eventos do TCG Físico.
// Integra com o armazenamento atual (localStorage key: 'ptcg-premium:eventos').
// Estrutura esperada dos itens (pelo NovoRegistroDialog):
// { id, dia: "YYYY-MM-DD", nome, tipo, local, formato, classificacao, createdAt, ... }

import { getItem } from "./utils/storage.js";

const STORAGE_KEY = "ptcg-premium:eventos";

export function getAllEvents() {
  const arr = getItem(STORAGE_KEY, []);
  return Array.isArray(arr) ? arr.slice() : [];
}

export function listEventsByDate(dateYMD) {
  const all = getAllEvents();
  return all
    .filter(ev => (ev?.dia === dateYMD) || (ev?.date === dateYMD))
    .sort((a, b) => {
      const ad = new Date(a?.createdAt || 0).getTime();
      const bd = new Date(b?.createdAt || 0).getTime();
      return bd - ad;
    });
}

export function getMatchesCount(ev) {
  // Se rounds estiver presente e em array, usa length. Caso contrário, tenta estatísticas derivadas.
  if (Array.isArray(ev?.rounds)) return ev.rounds.length;
  if (ev?.stats?.totalMatches != null) return Number(ev.stats.totalMatches) || 0;
  // Alguns formatos podem ter V/D/E salvos diretamente:
  const V = Number(ev?.V || 0), D = Number(ev?.D || 0), E = Number(ev?.E || 0);
  if (V || D || E) return V + D + E;
  return 0;
}
