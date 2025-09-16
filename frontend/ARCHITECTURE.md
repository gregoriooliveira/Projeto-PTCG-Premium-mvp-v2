
# PTCG Premium — Architecture & Product Canon

This doc is the living “source of truth” for how the **PTCG Premium App** is built and how core product rules work. It should be kept in sync as we ship features.

---

## 1) Tech Stack

- **Framework:** React + Vite (SPA)
- **Routing:** **Hash-based** (no React Router). The app reads `window.location.hash` and resolves routes in `src/App.jsx` using `hashParts`.
- **Styling:** Tailwind CSS with a dark theme using **zinc/neutral** tones as base. Outcome states use:
  - **Win (V):** emerald/green
  - **Loss (D):** rose/red
  - **Tie (E):** amber/yellow
- **State/Persistence:** Local component state for now; IndexedDB planned for rounds and events (via `idb-keyval` or similar).

---

## 2) Routing Map (hash)

All routes are resolved inside **`src/App.jsx`**. The router logic is a switch-like chain based on `hashParts`:

- **Home**: `#/`
- **Oponentes (agregado)**: `#/oponentes`
- **Pokémon TCG Físico (overview)**: `#/tcg-fisico`
- **Novo Registro / Registro**: `#/registro/:id`
- **Evento Físico (resumo + rounds)**: `#/tcg-fisico/eventos/:id`
  - Also accepted for compatibility: `#/eventos/:id`

> **Important**: Do not introduce React Router unless the product lead requests it. The architectural choice is a lightweight, hash-based router.

### Navigation Contract (Novo Evento → Evento Físico)
When the user clicks **Continuar** in “Novo Evento”, navigate to the event summary page:
```js
const evento = { id, name, storeOrCity, date, type, format, deckMonA, deckMonB };
history.pushState({ eventFromProps: evento }, '', `#/tcg-fisico/eventos/${evento.id}`);
```
- `history.state.eventFromProps` is optional; if absent, the page uses a **dev fallback** (mock) so dev builds still render.

---

## 3) Key Pages & Components

### 3.1 Pages
- **HomePage** — dashboards & summaries.
- **PhysicalPageV2** — Pokémon TCG Físico overview.
- **EventPhysicalSummaryPage** — **new** page to record and display rounds for a specific **Físico** event. File: `src/EventPhysicalSummaryPage.jsx`.
- **OpponentsPage** — aggregated opponent insights (`#/oponentes`).

### 3.2 EventPhysicalSummaryPage Overview
- **Header (left)**: Title (event name), date, chips (Store/City + Format).
- **Header (right)**: aggregated **V-D-E** and **WR%** + **Deck avatar** (placeholder initials for now).
- **Rounds list**: table-like strip. Each row colored by the match result (V/D/E). Shows:
  - Round number
  - Opponent deck avatars (up to two) + deck label (“No show” / “Bye” if flagged)
  - Result string (e.g., `LW`, `LL`, `W`) — **always “W”** for **No show/Bye**
- **Add Round panel (inline)**: not a modal. Fields:
  - Opponent Deck (required primary Pokémon; secondary optional). Deck equality uses **unordered pair**: `A/B == B/A`.
  - Game 1/2/3: **W/L/T** and **1st/2nd** (Bo3 rules). Game 2 shows after G1; Game 3 shows only if G1/G2 are split (V & D).
  - **No show** and **Bye**: clickable **chips** (no checkboxes). Selecting one auto-sets **Game 1 = V** and makes opponent fields optional.
  - Actions: **Add round** (primary), **Cancel** (secondary).
- **Placeholders**: Pokémon avatars are placeholder initials until real assets are wired.

### 3.3 Reusable UI Helpers (local to the page)
- `DeckAvatar` (initials or image)
- `ResultBadge`
- `Labeled`, `Select`
- `ToggleGroup`
- `TagToggle` (for No show / Bye)

> These are currently defined **inline** in `EventPhysicalSummaryPage.jsx` to avoid external breakage. If we factor them out, reflect imports here.

### 3.4 OpponentsPage Overview
- **Data source**: `OpponentsPage.jsx` calls `getOpponentsAgg` to merge opponent statistics from **TCG Live** and **TCG Físico**, deduplicating entries across both feeds.
- **Deck enrichment**: after aggregation, each deck entry is enriched via additional lookups so avatars, typing and metadata stay consistent regardless of origin.
- **Output**: surfaces unified standings plus quick filters so squads can spot repeat matchups irrespective of where the games happened.

---

## 4) Domain Rules (canonical)

- **Win Rate (WR):** `WR = round(((V + 0.5 * E) / (V + D + E)) * 100)` as **integer %**.
- **Match Result aggregation** (Bo3):
  - Count wins (V) vs losses (D); ties (E) break to **E** if equal V and D.
- **Points per Match**: `V=3`, `E=1`, `D=0`.
- **No show / Bye**: treated as a **Win**. In the rounds list, always display **“W”** in the Result column.
- **Deck equality**: `(A/B) == (B/A)` for metrics (unordered pair normalization).
- **Max deck avatars per entry**: **2**.

---

## 5) Files Touched by Event Page Integration

- `src/EventPhysicalSummaryPage.jsx` — new page with layout, logic, and small UI helpers.
- `src/App.jsx` — route resolution updated to include:
  ```jsx
  hashParts[0] === 'tcg-fisico' && hashParts[1] === 'eventos' ? <EventPhysicalSummaryPage /> :
  hashParts[0] === 'eventos' ? <EventPhysicalSummaryPage /> :
  ```
- (Optional) `src/Router.jsx` contains similar logic, but **`App.jsx` is authoritative** for route selection today.

---

## 6) Data Model (event & round — current shape)

```ts
type Game = { result: 'V' | 'D' | 'E' | ''; order: '1st' | '2nd' | '' };

type Round = {
  id: string;           // 'r-<n>'
  number: number;       // 1..N
  opponentName: string; // optional
  opponentDeckName: string; // optional
  oppMonA: string;      // primary (required unless noShow/bye)
  oppMonB: string;      // optional
  normOppDeckKey: string; // normalized unordered pair
  g1: Game;
  g2: Game;
  g3: Game;
  flags: { noShow: boolean; bye: boolean };
};

type Event = {
  id: string;
  name: string;
  storeOrCity: string;
  date: string; // ISO
  type: string;
  format: string;
  deckMonA?: string;
  deckMonB?: string;
};
```

> Persistence: next steps are to connect `loadRounds(eventId)` / `saveRounds(eventId, rounds)` to IndexedDB.

---

## 7) Coding Standards & Conventions

- Keep page-level components **self-contained** (helpers local) unless explicitly shared.
- No framework switches without product approval (e.g., **keep hash routing**).
- Keep colors and contrast consistent with the **zinc/neutral** palette and V/D/E accents.
- When adding routes, **update `App.jsx` hash switch** first.
- Tests (light, dev-only) live inline for helpers (normalization, WR, points, match result).

---

## 8) Known TODOs / Backlog

- Hook rounds/events to **IndexedDB** for persistence across sessions.
- Replace placeholder avatars with Pokémon assets.
- Add a **store consolidation page** with a filter (unique page; later feature).
- Extract `TagToggle`, `ToggleGroup`, etc. to a shared UI module once stable.

---

## 9) Logs & Deep Links

- Expanded log entries include a `source` property that deep-links to the originating record: `#/tcg-live/logs/:id` for **TCG Live** or `#/tcg-fisico/eventos/:id` for **TCG Físico** events.

---

_Last updated: auto-generated by assistant on integration of EventPhysicalSummaryPage._


---

### 31/08/2025 – Adição da página TCG Live · Datas (#/tcg-live/datas/:date)
- Inclusão de `src/pages/TCGLiveDatePage.jsx`.
- Rota hash e integração com widget “Todos os Registros”.


## Atualização 2025-09-02: Páginas de Decks

- **Novas páginas**:
  - `DecksTCGLivePage` (default export) em `src/pages/DecksLivePage.jsx`
  - `DecksTCGFisicoPage` (nomeado)

- **Rotas hash**:
  - `#/tcg-live/decks` → Decks Live
  - `#/tcg-fisico/decks` → Decks Físico

- **Integrações**:
  - `TCGLivePage` linka Top 5 Decks → Decks Live
  - `PhysicalPageV2` Resumo Geral (Top Deck) → Decks Físico


## 2025-09-02 — Widget Resumo Geral padronizado
- Criado `src/components/widgets/ResumoGeralWidget.jsx` para unificar o layout do widget “Resumo Geral” nas páginas:
  - TCG Live (`src/pages/TCGLivePage.jsx`) — variant `live`
  - TCG Físico (`src/PhysicalPageV2.jsx`) — variant `fisico` (área direita é hyperlink)
  - Datas do TCG Live (`src/pages/TCGLiveDatePage.jsx`) — variant `datasLive`
- Comportamento:
  - Coluna esquerda: Win Rate (valor + label)
  - Coluna central:
    - Home → V/D/E + “Total de Partidas”
    - Outras → número + subtítulo (ex.: “Logs importados”, “Registros realizados”, “Partidas no dia”)
  - Coluna direita: Top Deck (2 avatars, nome do deck, rótulo “Top Deck” e % WR)
  - **Apenas no TCG Físico** a área do Top Deck é link clicável (hover com underline). Nas demais variantes não há efeito de link.
- Próximos passos: substituir a origem dos dados mock por cálculos/filtros reais de cada página (quando disponíveis).



## Tooling & Quality Gates (2025-09-02)
- **ESLint**: regras para React, Hooks, A11y, Import, TailwindCSS, ordenação de imports e remoção de imports não usados.
- **Prettier**: formatação padronizada (printWidth=100, singleQuote, trailingComma=all).
- **Husky + lint-staged**: valida lint/format ao `pre-commit`.
- **Alias** `@ -> ./src` configurado no resolver de imports do ESLint.
- **Scripts** no `package.json`:
  - `npm run lint` / `npm run lint:fix`
  - `npm run format` / `npm run format:check`
  - `npm run prepare` (instala hooks do Husky)


## Import Logs Modal (Global)

- **Component**: `src/components/ImportLogsModal.jsx`
- **Integration**: Mounted globally in `App.jsx` alongside other dialogs (e.g., NovoRegistroDialog).
- **State**: Uses `useState` in `App.jsx` (`showImport`) with a global opener exposed on `window.__ptcgImportDialogOpen`.
- **Triggers**:
  - Sidebar menu item **"Importar Log"** (desktop and mobile) → opens modal directly.
  - Top button **"Importar Log"** in `TCGLivePage.jsx` → also calls global opener to open the modal.
  - Navigating to `#/importar` in the URL hash → automatically opens the modal.
- **Behavior**:
  - Detects players from pasted log (revealed vs hidden opening hand).
  - Requires deck name and at least 1 main Pokémon.
  - Supports tournament info (Limitless ID or manual name).
  - Persists events to `localStorage` (`ptcg-live-events`).
  - After save, navigates to `#/tcg-live/logs/:id`.
- **Notes**:
  - Replaces old placeholder page `#/importar`.
  - Modal is available from **any screen** in the app, same behavior as Novo Registro.


## TCG Live — Exibição de Logs

- Página `src/pages/TCGLiveLogDetail.jsx` para visualizar logs completos.
- Parser puro em `src/lib/ptcglive/parseTcgliveLog.js` (string → estrutura: setup/turnos/ações/resultados/revelações/vencedor/1st).
- Usa localStorage `ptcg-live-events` para carregar payloads do importador.
- Suporte a torneios online (nome/round) no cabeçalho, quando presentes no payload.
