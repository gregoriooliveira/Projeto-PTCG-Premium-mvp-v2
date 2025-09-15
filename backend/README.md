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

- `POST   /api/physical/events`
- `GET    /api/physical/events/:id`
- `PATCH  /api/physical/events/:id`
- `DELETE /api/physical/events/:id`
- `GET    /api/physical/summary?limitDays=5`
- `GET    /api/physical/days/:date`
- `GET    /api/physical/decks`

Exemplo de criação de evento:

```http
POST /api/physical/events
Content-Type: application/json

{
  "dia": "2024-05-01",
  "nome": "League Challenge",
  "tipo": "LC",
  "local": "Loja XPTO",
  "formato": "Standard",
  "classificacao": "League Challenge",
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

`GET /api/physical/events/:id` retorna:

```json
{
  "eventId": "abc123",
  "date": "2024-05-01",
  "name": "League Challenge",
  "type": "LC",
  "storeOrCity": "Loja XPTO",
  "format": "Standard",
  "classification": "League Challenge",
  "you": "Ash",
  "opponent": "Gary",
  "deckName": "Chien-Pao/Baxcalibur",
  "opponentDeck": "Miraidon",
  "result": "W",
  "round": 1,
  "pokemons": ["chien-pao-ex", "baxcalibur"]
}
```

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
