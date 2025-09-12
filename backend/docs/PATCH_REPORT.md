Patched on 20250905-025859
- parse debounce via frontend, backend parser improved for EN short logs
- suggestor filters out non-Pokémon terms
- GET /api/live/events/:id now includes rawLog

## Wave 3 Opponents (2025-09-08T00:03:18)
- Strict CORS + preflight; NDJSON logs; /api/home; /api/import-logs/parse & /commit (deckName obrigatório);
- /api/live/opponents-agg & /logs;
2025-09-10T01:31:19.872740Z - Implemented GET /api/live/logs: supports opponent filter (opponent|opponentName|name|q), limit/offset, returns rows with id/date/createdAt/deck/opponentDeck/score/result/event/opponent/you.
2025-09-10T01:32:18.947282Z - Added index-free fallback logic for GET /api/live/logs (scan + sort in memory when orderBy index not available).
