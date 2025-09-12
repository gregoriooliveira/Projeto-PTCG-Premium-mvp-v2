// src/lib/ptcglive/parseTcgliveLog.js
// Parser do log do Pokémon TCG Live (string -> estrutura para a página)
export function parseTcgliveLog(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  const setup = [];
  const turns = [];
  let currentTurn = null;
  let lastAction = null;
  let lastResult = null;
  let firstPlayer = null;
  let winner = null;
  let finalLine = '';

  const RE_TURN = /^Turn #\s*(\d+)\s*-\s*(.+?)'s Turn\s*$/;

  const pushAction = (text) => {
    if (!currentTurn) return;
    const a = { text: text.trim(), results: [] };
    currentTurn.actions.push(a);
    lastAction = a;
    lastResult = null;
  };
  const pushResult = (text) => {
    if (!lastAction) pushAction('(evento)');
    const r = { text: text.trim(), children: [] };
    lastAction.results.push(r);
    lastResult = r;
  };
  const pushReveal = (text) => {
    if (!lastResult) pushResult('(revelado)');
    lastResult.children.push({ type: 'reveal', text: text.trim() });
  };

  let i = 0;
  if (lines[0]?.trim() === 'Setup') i = 1;

  // SETUP
  while (i < lines.length && !RE_TURN.test(lines[i])) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('- ')) {
      const node = { text: line.slice(2).trim(), children: [] };
      setup.push(node);
      let j = i + 1;
      while (j < lines.length && /^\s*•/.test(lines[j])) {
        node.children.push({ type: 'reveal', text: lines[j].replace(/^\s*•\s*/, '') });
        j++;
      }
      i = j; continue;
    }
    if (/^\s*•/.test(line)) {
      const target = setup[setup.length - 1] ?? (setup.push({ text: '(revelado)', children: [] }), setup[setup.length - 1]);
      target.children.push({ type: 'reveal', text: line.replace(/^\s*•\s*/, '') });
      i++; continue;
    }
    setup.push({ text: line.trim(), children: [] });
    i++;
  }

  // TURNS
  for (; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(RE_TURN);
    if (m) {
      const n = parseInt(m[1], 10);
      const player = m[2];
      if (!firstPlayer && n === 1) firstPlayer = player;
      currentTurn = { no: n, player, actions: [] };
      turns.push(currentTurn);
      lastAction = null; lastResult = null;
      continue;
    }
    if (!line.trim()) continue;

    if (/wins\./.test(line)) {
      finalLine = line.trim();
      const mw = line.match(/([^\.]+) wins\./);
      if (mw) winner = mw[1].trim();
      continue;
    }

    if (line.startsWith('- ')) { pushResult(line.slice(2)); continue; }
    if (/^\s*•/.test(line)) { pushReveal(line.replace(/^\s*•\s*/, '')); continue; }

    if (currentTurn) pushAction(line);
  }

  const playersSeen = Array.from(new Set(turns.map(t => t.player)));
  const players = {
    user: { name: playersSeen[0] || 'Você' },
    opponent: { name: playersSeen[1] || 'Oponente' },
  };

  return { players, firstPlayer, winner, setup, turns, finalLine };
}
