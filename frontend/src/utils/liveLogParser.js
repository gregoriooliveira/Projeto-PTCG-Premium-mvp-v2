// Lightweight parser for TCG Live logs
// Exported API expected by pages: parseTcgliveLog(text)
export function parseTcgliveLog(text=""){
  const lines = String(text).replace(/\r/g,"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
  // naive extraction of players and opening plays
  const players = {};
  for (const ln of lines){
    const m = ln.match(/^(.*) drew 7 cards/i);
    if (m) { players.player1 = players.player1 || m[1].trim(); continue; }
    const w = ln.match(/(.*) wins\.?$/i);
    if (w) { players.winner = w[1].trim(); }
  }
  return { lines, players };
}
