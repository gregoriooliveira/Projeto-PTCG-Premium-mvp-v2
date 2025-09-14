export function countsAdd(a = {W:0,L:0,T:0}, b = {W:0,L:0,T:0}) {
  return { W:(a.W||0)+(b.W||0), L:(a.L||0)+(b.L||0), T:(a.T||0)+(b.T||0) };
}
export function countsOfResult(r) {
  return { W: r === "W" ? 1 : 0, L: r === "L" ? 1 : 0, T: r === "T" ? 1 : 0 };
}
export function wrPercent({W=0,L=0,T=0}={}) {
  const total = W + L + T;
  if (!total) return 0;
  return Math.round((W / total) * 1000) / 10; // 1 decimal
}
