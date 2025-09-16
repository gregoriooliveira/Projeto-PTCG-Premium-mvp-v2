# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
### Backend
- Recompute physical aggregates from round data (`backend/src/physical/aggregates.js`).
- Add `counts` field to the `recentLogs` response of `/api/home` (`backend/src/home/routes.js`).
- Parse debounce via frontend; backend parser improved for English short logs.
- Suggestor filters out non-Pokémon terms.
- `GET /api/live/events/:id` now includes `rawLog`.
- Wave 3 Opponents update:
  - Strict CORS and preflight handling.
  - NDJSON logs endpoint.
  - `/api/home` endpoint.
  - `/api/import-logs/parse` and `/commit` with `deckName` required.
  - `/api/live/opponents-agg` and `/logs` endpoints.
  - `GET /api/live/logs` supports opponent filtering and pagination, returning rows with id, date, deck and result metadata.
  - `GET /api/live/logs` falls back to in-memory scan and sort when `orderBy` index is unavailable.

### Frontend
- Opponents page uses `getOpponentLogs(opponent, { limit: 10000, offset: 0 })` keeping mapping and UI intact.
- `ImportLogsModal`: label updated to "(obrigatório)" and input marked `required`.
- Fix `getOpponentLogs` call (numeric limit/offset) and show deck label fallback (`opponentDeck` ∨ `topDeckName` ∨ `fromSlugToName(topDeckKey)`).
- `api.js` `getOpponentLogs` falls back to fetching all logs and client-side filtering when the server returns zero rows.
- `OpponentsPage.jsx` displays deck label using `opponentDeck` / `topDeckName` / `deckKey` fallback in the header list.
- Opponents header computes deck label inline using `opponentDeck` / `topDeckName` / `topDeck.deckName` / `name` / `deckName` / `fromSlugToName(topDeckKey)`.
- Removed duplicate deck line in Opponents header.
- `OpponentsPage` removes score column on collapsed rows and renders W/L chip using `renderWLChip`; adjusted column spans to `2/4/4/1/1`.
- Defined `renderWLChip` helper after imports to avoid runtime reference error.
