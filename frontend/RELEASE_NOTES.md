# Baseline – baseline-2025-08-29 - TCG Físico (Final Pass)

**Created:** 2025-08-29 19:22

## Scope
Consolida as entregas da área **TCG Físico** (páginas: Home TCG Físico, Torneios, Lojas e Evento).

## Destaques
- Página **Torneios** com lista *Dia / Cidade / Partidas*, filtro por **Tipo de Evento** (Regional, Special Event, Internacional, Mundial), cabeçalho, ordenação por **Data** (padrão), botão **Copiar link do filtro**, empty state com **Limpar filtro**.
- **Voltar aos torneios** no resumo do evento (preserva `?type`).
- **Home TCG Físico**: título **Resumo Torneios** e os 4 tipos são links; deep-link funcionando.
- **Lojas**: filtro higienizado para exibir somente lojas de eventos **Liga Local / Challenge / CLP / Cup** (sem “cidades de torneio”).

## Acessibilidade e UX
- `aria-label`/`title` em botões e links principais.
- Layouts alinhados e compactos para filtros (mesmo padrão de Lojas).

## Terminologia
- “Matches/Matchs” → **“Partidas”**.

## Arquivos afetados (principais)
- `src/TournamentEventsPage.jsx`
- `src/PhysicalPageV2.jsx`
- `src/EventPhysicalSummaryPage.jsx`
- `src/StoreEventsPage.jsx`
- `src/App.jsx` (roteamento e `parseHash` robusto)

## Próximos passos sugeridos (opcional)
- Modal de edição para **Cidade** (hoje é `prompt`).
- Botão **Copiar link do filtro** também em **Lojas**.
- Padronização de spacing (header radius top-only) em todas as listas.


### Added
- Log viewer page with collapsible events and a robust TCG Live parser.
- Docs updated (ARCHITECTURE.md).
