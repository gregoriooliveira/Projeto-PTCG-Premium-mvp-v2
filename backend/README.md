# PTCG Backend — TCG Live e Físico

## Rodar em dev (com Firestore Emulator)

1. Inicie o emulador do Firestore (em outro terminal):
   ```bash
   firebase emulators:start --only firestore --import=.firebase-data --export-on-exit
   ```

2. Copie `.env.example` para `.env` e confirme:
   ```ini
   PORT=8787
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   GOOGLE_CLOUD_PROJECT=ptcg-premium-dev
   TZ=America/Sao_Paulo
   CORS_ORIGIN=http://localhost:5173
   ```

   `CORS_ORIGIN` define a origem permitida pelo CORS (padrão acima é seguro para desenvolvimento).

3. Instale deps e suba a API:
   ```bash
   npm install
   npm run dev
   ```

A API sobe em `http://localhost:8787`. Seu front deve usar `VITE_API_BASE_URL=http://localhost:8787`.

## Autenticação

Rotas que alteram dados (`POST`, `PATCH`, `DELETE`) exigem credencial.
Envie `Authorization: Bearer <token>` com um **ID token** do Firebase.

Para obter o ID token no cliente, autentique-se pelo Firebase (Google, e-mail/senha etc.)
e use `getIdToken()` do SDK. O token expira em aproximadamente 1 hora e deve ser
renovado automaticamente pelo SDK antes de cada requisição.

Em integrações servidor-servidor, utilize uma conta de serviço ou o Admin SDK para
emitir um token customizado e trocá-lo por um ID token válido. Inclua sempre esse
token no cabeçalho `Authorization` das chamadas.

## CSRF

Para requisições que modificam dados, o backend exige um token CSRF. O cookie
`csrfToken` é enviado na primeira chamada segura e o mesmo valor deve ser
reenviado no cabeçalho `X-CSRF-Token` em chamadas subsequentes. As requisições
devem usar `credentials: 'include'` para que o cookie acompanhe o pedido. Veja
[docs/CSRF.md](../docs/CSRF.md) para detalhes.

```js
const csrf = getCookie('csrfToken');
const idToken = await getIdToken();
fetch('/api/live/events', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
    'X-CSRF-Token': csrf
  },
  body: JSON.stringify({ /* ... */ })
});
```

## Endpoints principais

- `GET    /api/health`
- `GET    /api/home`
  - Parâmetros de consulta:
    - `source`: filtra a origem dos dados agregados. Aceita `live`, `physical` ou `all` (padrão). Quando `all`, os dados de Live
      e Físico são mesclados; se as coleções físicas ainda não existirem, o backend faz fallback automático para retornar apenas
      os dados de Live.
    - `limit`: número de dias recentes considerados nas seções baseadas em datas. Se não informado, usa `5`.
  - Estrutura da resposta:
    - `summary`: agrega contagens totais (`counts`) e porcentagem de vitórias (`wr`), além de `topDeck` com o deck mais
      eficiente.
    - `lastDays`: lista dos últimos dias com atividade, contendo métricas diárias (`counts`, `wr`) e referência opcional ao
      evento mais recente do dia (`event`).
    - `topDecks`: decks mais performáticos, incluindo contagens, win rate (`wr`), avatares e Pokémon associados.
    - `topOpponents`: oponentes mais frequentes com suas estatísticas agregadas, win rate e informações do deck típico.
    - `recentTournaments`: últimos torneios registrados com metadados de data.
    - `recentLogs`: recorte dos logs mais recentes, com identificação de evento, decks e Pokémon sugeridos.
- `GET    /api/events`
- `GET    /api/events/:id`
- `POST   /api/events`
- `PUT    /api/events/:id`
- `GET    /api/live-logs`
- `POST   /api/live-logs`
- `POST   /api/import-logs/parse`
- `POST   /api/import-logs/commit`
- `GET    /api/pokedex/search`
- `GET    /api/pokedex/by-slug/:slug`
- `POST   /api/live/events`
- `GET    /api/live/events`
- `GET    /api/live/events/:id`
- `PATCH  /api/live/events/:id`
- `DELETE /api/live/events/:id`
- `GET    /api/live/summary?limitDays=5`
- `GET    /api/live/days/:date`
- `GET    /api/live/decks`
- `GET    /api/live/decks/:deck/logs`
- `GET    /api/live/opponents-agg`
- `GET    /api/live/logs`
- `GET    /api/live/tournaments`
- `GET    /api/live/tournaments/:id`

Agregações (dias, decks, oponentes, torneios) são atualizadas **on write** pelo servidor.

### Endpoints `/api/physical/*`

Principais rotas para eventos do TCG Físico (espelham as de Live):

- `POST   /api/physical/events` — Cria um evento/log físico e recalcula agregações.
- `GET    /api/physical/events/:id` — Retorna os detalhes de um evento, incluindo log bruto quando disponível.
- `PATCH  /api/physical/events/:id` — Atualiza campos específicos de um evento físico.
- `DELETE /api/physical/events/:id` — Remove um evento e limpa rounds ou logs associados.
- `GET    /api/physical/events` — Lista os eventos físicos mais recentes (parâmetro `limit` opcional).
- `GET    /api/physical/events/:eventId/rounds` — Lista os rounds cadastrados para um evento.
- `POST   /api/physical/events/:eventId/rounds` — Registra um round para o evento e atualiza estatísticas.
- `PATCH  /api/physical/events/:eventId/rounds/:roundId` — Atualiza um round existente e força o recálculo das métricas do evento.
  ```http
  PATCH /api/physical/events/evt_123/rounds/rnd_456
  Content-Type: application/json

  {
    "number": 2,
    "opponent": "Gary",
    "g1": { "order": 1, "result": "V" }
  }

  HTTP/1.1 200 OK
  Content-Type: application/json

  {
    "id": "rnd_456",
    "number": 2,
    "result": "W",
    "opponent": "Gary",
    "g1": { "order": 1, "result": "V" },
    "g2": { "order": 2, "result": "D" },
    "g3": { "order": 3, "result": "V" }
  }
  ```
- `DELETE /api/physical/events/:eventId/rounds/:roundId` — Remove um round e sincroniza os resumos agregados do evento.
  ```http
  DELETE /api/physical/events/evt_123/rounds/rnd_456

  HTTP/1.1 200 OK
  Content-Type: application/json

  { "ok": true }
  ```
- `POST   /api/physical/events/maintenance/backfill-tournaments` — Executa uma varredura para preencher campos de torneio ausentes e recomputar agregações relevantes.
  ```http
  POST /api/physical/events/maintenance/backfill-tournaments

  HTTP/1.1 200 OK
  Content-Type: application/json

  {
    "ok": true,
    "processed": 120,
    "updated": 18,
    "tournaments": ["lc-2024-xyz", "regional-sp-2023"]
  }
  ```
- `GET    /api/physical/summary?limitDays=5` — Entrega um resumo agregado (dias, decks, torneios, oponentes e logs recentes).
- `GET    /api/physical/days/:date` — Mostra os eventos e o resumo de vitórias/derrotas de um dia específico.
- `GET    /api/physical/decks` — Retorna agregações por deck (`deck` opcional para filtrar por chave normalizada).
- `GET    /api/physical/decks/:deck/logs` — Lista os eventos jogados com um deck específico (playerDeckKey).
- `GET    /api/physical/decks/:id` — Consulta metadados de um deck salvo (nome e avatares).
- `GET    /api/physical/tournaments` — Lista torneios agregados, com filtro opcional por `query`.
- `GET    /api/physical/tournaments/suggest` — Sugere torneios para autocomplete (filtro `q`).
- `GET    /api/physical/tournaments/:id` — Exibe detalhes de um torneio e rounds associados.
- `GET    /api/physical/opponents-agg` — Lista estatísticas agregadas por oponente enfrentado.
- `GET    /api/physical/logs` — Retorna logs paginados de eventos físicos (aceita `limit`, `offset`, `opponent`).

Exemplo de criação de evento:

```http
POST /api/physical/events
Content-Type: application/json

{
  "dia": "2024-05-01",                     // opcional — aceita `DD/MM/YYYY`, `YYYY-MM-DD` ou data parseável
  "nome": "League Challenge",              // opcional — nome "bruto" do evento informado pelo usuário
  "tipo": "LC",                            // opcional — utilizado para detectar torneios
  "local": "Loja XPTO",                    // opcional — cidade ou loja
  "formato": "Standard",                   // opcional
  "classificacao": "League Challenge",     // opcional — ex.: League Challenge, Regional etc.
  "you": "Ash",
  "opponent": "Gary",
  "deckName": "Chien-Pao/Baxcalibur",
  "opponentDeck": "Miraidon",
  "result": "W",                           // opcional — `W`, `L`, `T`...
  "round": 1,                               // opcional
  "placement": 3,                           // opcional — posição final no torneio
  "pokemons": ["chien-pao-ex", "baxcalibur"], // opcional — até 2 slugs
  "isOnlineTourney": false,                // opcional — flag para eventos online
  "limitlessId": "lc-2024-xyz",           // opcional — ID do Limitless (sem prefixo)
  "tourneyName": "League Challenge XPTO", // opcional — força o nome derivado do torneio
  "rawLog": "Round 1 vs Gary...",          // opcional — log bruto associado
  "lang": "pt"                             // opcional — padrão `pt`
}
```

O campo `dia` é opcional. Quando fornecido, é normalizado para o formato `YYYY-MM-DD` antes de ser salvo. Caso ausente, a API usa o timestamp de criação (`createdAt`) para definir `date` automaticamente. O valor de `createdAt` é mantido separadamente como um timestamp numérico para fins de auditoria e logs.

Resposta: `201 { "eventId": "abc123" }`.

`GET /api/physical/events/:id` retorna:

```json
{
  "eventId": "abc123",
  "source": "physical",
  "createdAt": 1714526400000,
  "date": "2024-05-01",
  "you": "Ash",
  "opponent": "Gary",
  "deckName": "Chien-Pao/Baxcalibur",
  "opponentDeck": "Miraidon",
  "playerDeckKey": "chien-pao-baxcalibur",
  "opponentDeckKey": "miraidon",
  "result": "W",
  "round": 1,
  "placement": 3,
  "pokemons": ["chien-pao-ex", "baxcalibur"],
  "isOnlineTourney": false,
  "limitlessId": "lc-2024-xyz",
  "tourneyName": "League Challenge XPTO",
  "tournamentId": "limitless:lc-2024-xyz",
  "rawLog": "Round 1 vs Gary...",
  "lang": "pt",
  "name": "League Challenge",
  "type": "LC",
  "storeOrCity": "Loja XPTO",
  "format": "Standard",
  "classification": "League Challenge"
}
```

Campos derivados: quando `limitlessId` é informado, o backend gera automaticamente `tournamentId` com o prefixo `limitless:` e preserva `tourneyName` apenas se enviado manualmente. Caso contrário, ele tenta inferir `tourneyName` e `tournamentId` a partir de `tipo`, `nome` e `dia` (criando um slug normalizado) sempre que o evento é reconhecido como torneio presencial.

### Pokédex e persistência de Pokémon

As rotas `/api/pokedex/search` e `/api/pokedex/by-slug/:slug` consultam a PokéAPI e
armazenam os resultados em cache no Firestore.

Eventos físicos aceitam um campo `pokemons` com até dois slugs. Esses valores são
persistidos junto ao evento e reaproveitados para avatares e agregações.

## Sessão em memória

O servidor mantém eventos e logs em memória por sessão apenas para uso temporário.
Cada lista é limitada a **100** itens; ao exceder o limite, os mais antigos são
descartados automaticamente.

## App Engine

O `app.yaml` já está incluso. Para deploy futuramente, garanta as credenciais de serviço no projeto GCP e rode `gcloud app deploy`.
