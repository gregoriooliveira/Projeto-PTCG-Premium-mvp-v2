# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
### Backend
- Reworked `/api/home` aggregation to accept `source=all|live|physical` and `limit` query params, merge live/physical snapshots when requested, and enrich recent logs/opponents with normalized Pokémon hints and counts. (`backend/src/home/routes.js`).
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

- Deriva e normaliza metadados de torneio (ID, nome, contagem de rounds) ao salvar e atualizar eventos físicos, propagando os novos campos para agregações e listagens. (`backend/src/physical/routes.js`, `backend/src/physical/aggregates.js`).
- Adiciona rotina autenticada `POST /api/physical/events/maintenance/backfill-tournaments` para preencher torneios ausentes e recomputar agregados relacionados. (`backend/src/physical/routes.js`).
- Implementa listagem, detalhe e sugestão de torneios físicos, bem como CRUD completo de rounds por evento. (`backend/src/physical/routes.js`).

### Frontend
- `#/tcg-fisico/eventos/loja/:store?` carrega a loja do hash, normaliza o valor selecionado e atualiza a navegação ao trocar a opção, mantendo filtros e ordenação na listagem. (`frontend/src/StoreEventsPage.jsx`).
- Sanitiza pistas de Pokémon ao montar o detalhe das partidas, evitando duplicatas e normalizando valores antes de exibir ícones. (`frontend/src/pages/PhysicalStoreEventsPage.jsx`, `frontend/src/pages/TCGLivePage.jsx`).
- `#/oponentes` combina agregados e logs de `/api/live` e `/api/physical`, deduplica e ordena os resultados e constrói link dinâmico para `#/tcg-fisico/eventos/:id`.
- As chamadas de fallback rodam em paralelo e cada log leva o `source` que indica qual endpoint o originou.
- `ImportLogsModal`: label updated to "(obrigatório)" and input marked `required`.
- Fix `getOpponentLogs` call (numeric limit/offset) and show deck label fallback (`opponentDeck` ∨ `topDeckName` ∨ `fromSlugToName(topDeckKey)`).
- `api.js` `getOpponentLogs` falls back to fetching all logs and client-side filtering when the server returns zero rows.
- `OpponentsPage.jsx` displays deck label using `opponentDeck` / `topDeckName` / `deckKey` fallback in the header list.
- Opponents header computes deck label inline using `opponentDeck` / `topDeckName` / `topDeck.deckName` / `name` / `deckName` / `fromSlugToName(topDeckKey)`.
- Removed duplicate deck line in Opponents header.
- `OpponentsPage` removes score column on collapsed rows and renders W/L chip using `renderWLChip`; adjusted column spans to `2/4/4/1/1`.
- Defined `renderWLChip` helper after imports to avoid runtime reference error.
