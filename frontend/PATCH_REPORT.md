Padronização do botão Voltar — retry clean


## Top Standardization – BackButton acima do título
[OK] src/pages/DecksLivePage.jsx -> botão acima do título (moved)
[OK] src/pages/TCGLiveDatePage.jsx -> botão acima do título (moved)
[OK] src/pages/PhysicalTournamentsMock.jsx -> botão acima do título (moved)
[OK] src/pages/PhysicalStoreEventsPage.jsx -> botão acima do título (moved)
[OK] src/pages/PhysicalDateEventsPage.jsx -> botão acima do título (insert-top-div)
[OK] src/EventPhysicalSummaryPage.jsx -> botão acima do título (moved)


## 2025-09-02 — Fix: TCGLiveDatePage duplicate Resumo Geral
- Removed duplicated 'Resumo Geral' inline section from TCG Live Date page.
- Moved the standardized <ResumoGeralWidget /> to below the page header (after title), matching the desired position.
- No other pages touched.


## 2025-09-02 — Tooling Baseline
- Adicionados: ESLint, Prettier, Husky e lint-staged.
- Scripts incluídos no `package.json`: `lint`, `lint:fix`, `format`, `format:check`, `prepare`.
- Configurações criadas: `.eslintrc.cjs`, `.eslintignore`, `.prettierignore`, `.prettierrc`, `.husky/pre-commit`.

- Adicionado workflow **Auto Format (Prettier)** com auto-commit em pushes/PRs.

- Ajuste de tooling: ESLint fixado em ^8.57.0 (compatível com eslint-plugin-react-hooks@4.x) e CI alterado para `npm i`.


[auto-patch] Integrated TCGLiveLogDetail + parseTcgliveLog.js on baseline.

## Wave 3 Opponents (2025-09-08T00:03:18)
- Page #/oponentes sem MOCK; paginação 5; hyperlink; fallback somente para legado; credentials:'include' global.
