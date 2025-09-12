2025-09-10T00:32:34.298704Z
- Minimal Opponents page change: uses getOpponentLogs(opponent, { limit:10000, offset:0 }), leaving mapping and UI intact.
- ImportLogsModal: label updated to "(obrigatório)" and input "required".
- No changes to event detail or api client beyond this; keeps prior working behavior.

2025-09-10T00:49:21.794171Z: Fix getOpponentLogs call (numeric limit/offset) and show deck label fallback (opponentDeck||topDeckName||fromSlugToName(topDeckKey)).

2025-09-10T00:55:53.398587Z: api.js getOpponentLogs now falls back to fetching all logs and client-side filtering when the server returns zero rows.

2025-09-10T01:10:21.303395Z: OpponentsPage.jsx now displays deck label using opponentDeck/topDeckName/deckKey fallback in the HEADER list.

2025-09-10T01:16:37.449564Z: Opponents header now computes deck label inline using opponentDeck/topDeckName/topDeck.deckName/name/deckName/fromSlugToName(topDeckKey).

2025-09-10T01:21:26.391795Z: FIX6 - Opponents header: removed the small grey duplicate deck line; kept only the main prominent label.

2025-09-10T02:10:38.955219Z: OpponentsPage: removed score column on collapsed rows and render W/L chip using renderWLChip(); adjusted col spans to 2/4/4/1/1.

2025-09-10T02:14:39.243312Z: FIX8 - Define renderWLChip helper after imports to avoid runtime reference error.
