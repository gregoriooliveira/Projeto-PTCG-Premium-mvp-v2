# PTCG Premium v2 — App único (Home + Pokémon TCG Físico)

Vite + React + Tailwind (ESM).

## Requisitos
- Node.js 18+

## Configuração
Crie um arquivo `.env` na pasta `frontend` com as variáveis:

```sh
VITE_API_BASE_URL=http://localhost:8787
```

Veja o [Guia de Integração](docs/INTEGRATION_GUIDE.md) para detalhes sobre cookies, CSRF e cabeçalhos.

## Instalação
```bash
npm install
```

## Dev
```bash
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Rotas `/tcg-fisico/*`
As telas do TCG Físico vivem sob `#/tcg-fisico`:

- `#/tcg-fisico` – visão geral
- `#/tcg-fisico/eventos/loja` – listagem agregada por loja (aceita `#/tcg-fisico/eventos/loja/:loja` para pré-selecionar a loja)
- `#/tcg-fisico/eventos/:id` – resumo e rounds de um evento

A visão por loja escreve o filtro atual na hash (`StoreEventsPage.jsx`) e observa `hashchange` para manter a loja pré-selecionada ao seguir links profundos ou usar Voltar/Avançar (`PhysicalStoreEventsPage.jsx`), preservando os filtros ativos ao navegar.

Quando um evento é aberto a partir da lista da loja, o resumo recebe `?store=` na hash (`StoreEventsPage.jsx`). `EventPhysicalSummaryPage.jsx` aproveita esse parâmetro para renderizar a navegação de retorno à loja, mantendo o usuário no contexto correto ao voltar.

Navegação programática para a página de evento:

```js
history.pushState({ eventFromProps: evento }, '', `#/tcg-fisico/eventos/${evento.id}`);
```

Essas telas consomem os endpoints do backend em `/api/physical/*`. Exemplo de criação de evento:

```http
POST /api/physical/events
Content-Type: application/json

{
  "you": "Ash",
  "opponent": "Gary",
  "deckName": "Chien-Pao/Baxcalibur",
  "opponentDeck": "Miraidon",
  "result": "W",
  "round": 1,
  "pokemons": ["chien-pao-ex", "baxcalibur"]
}
```

Resposta: `201 { "eventId": "abc123" }`.

## Deck modal e PokéAPI
O componente `DeckModal` permite informar o nome do deck e até dois Pokémon. Ele usa `PokemonAutocomplete`, que consulta
`/api/pokedex/search` no backend (proxy para a PokéAPI com cache).

Os slugs dos Pokémon escolhidos são enviados junto com o evento (`pokemons: ["chien-pao-ex", "baxcalibur"]`) e o backend os
persiste para reaproveitar avatares e agregações.
