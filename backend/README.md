# PTCG Backend — TCG Live endpoints

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

## Endpoints principais

- `POST   /api/live/events`
- `GET    /api/live/events/:id`
- `PATCH  /api/live/events/:id`
- `DELETE /api/live/events/:id`
- `GET    /api/live/summary?limitDays=5`
- `GET    /api/live/days/:date`
- `GET    /api/live/decks`
- `GET    /api/live/tournaments`
- `GET    /api/live/tournaments/:id`

Agregações (dias, decks, oponentes, torneios) são atualizadas **on write** pelo servidor.

## App Engine

O `app.yaml` já está incluso. Para deploy futuramente, garanta as credenciais de serviço no projeto GCP e rode `gcloud app deploy`.
