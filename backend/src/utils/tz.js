const TZ = process.env.TZ || "America/Sao_Paulo";
export function dateKeyFromTs(ts) {
  // Format YYYY-MM-DD in target timezone
  const dt = new Date(ts);
  // en-CA gives 'YYYY-MM-DD' when using dateStyle: 'short' not reliable; better custom
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(dt);
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}
