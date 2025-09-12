// importing/parser.js
export function parseLog(raw = "", opts = {}){
  const text = String(raw || "").replace(/\r/g,"").trim();
  const lang = /drew/i.test(text) || /wins?/i.test(text) ? "en"
            : /comprou/i.test(text) || /venceu/i.test(text) ? "pt" : "auto";
  const lines = text.split(/\n+/);

  // Collect players from opening-hand lines
  const playerRegex = /(.*)\s+drew\s+7\s+cards.*opening hand\.?/i;
  const playersSeen = [];
  for (const ln of lines){
    const m = ln.match(playerRegex);
    if (m){
      const name = (m[1]||"").trim();
      if (name && !playersSeen.includes(name)) playersSeen.push(name);
      if (playersSeen.length >= 2) break;
    }
  }

  // Rule 1: who reveals the 7 cards is YOU; the other is OPP
  let you = null, opp = null;
  for (let i=0;i<lines.length;i++){
    const m = lines[i].match(playerRegex);
    if (!m) continue;
    const name = (m[1]||"").trim();
    const next = (lines[i+1]||"").trim();
    const next2 = (lines[i+2]||"").trim();
    const revealed = /^•\s+/.test(next) || /^•\s+/.test(next2);
    const hidden = /^-\s*\d+\s+drawn\s+cards\.?/i.test(next);
    if (revealed) you = name;
    if (hidden && !revealed && !opp) opp = name;
  }

  // Rule 2: 1st/2nd defined by the first actionable line after "Turn # 1"
  let firstPlayer = null;
  const t1 = lines.findIndex(ln => /^(Turn\s*#\s*1)\b/i.test(ln));
  if (t1 >= 0){
    for (let i=t1+1; i<Math.min(lines.length, t1+60); i++){
      const ln = (lines[i]||"").trim();
      if (!ln || /^[•-]/.test(ln)) continue; // skip bullets / drawn counts
      const mm = ln.match(/^([A-Za-zÀ-ÖØ-öø-ÿ0-9' ._-]+?)\s+\b(played|attached|used|evolved|benched|put|moved|retreated|declared|shuffled|chose|searched|drew|wins?|conceded)\b/i);
      if (mm){ firstPlayer = (mm[1]||"").trim(); break; }
    }
  }

  // Fallback: winner line
  if (!you){
    const mw = text.match(/^\s*(.+?)\s+wins?\.?$/im);
    if (mw) you = (mw[1]||"").trim();
  }

  // Fill opponent from seen names
  if (!opp && you && playersSeen.length){
    const other = playersSeen.find(n => n !== you);
    if (other) opp = other;
  }
  if (!you && playersSeen.length) you = playersSeen[0] || "";
  if (!opp && playersSeen.length) opp = playersSeen[1] || playersSeen[0] || "";

  // Optional: collect revealed cards just for reference (first bullet list after a drawn-cards line)
  const revealedCards = [];
  for (let i=0;i<lines.length;i++){
    if (/drawn\s+cards\.?/i.test(lines[i])){
      const next = (lines[i+1]||"");
      if (/^•\s+/.test(next)){
        const cards = next.replace(/^•\s+/, "").split(/,\s*/).map(s=>s.trim()).filter(Boolean);
        revealedCards.push(...cards);
      }
    }
  }

  return { language: lang, players: { player: you||"", opponent: opp||"", first: firstPlayer||null }, revealedCards };
}
