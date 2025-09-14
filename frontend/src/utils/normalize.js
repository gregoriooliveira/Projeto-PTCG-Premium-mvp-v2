export function normalizeDeckKey(s = "") {
  return String(s).trim().replace(/\s+/g, " ").toLowerCase();
}
export function normalizeName(s = "") {
  return String(s).trim().replace(/\s+/g, " ");
}
