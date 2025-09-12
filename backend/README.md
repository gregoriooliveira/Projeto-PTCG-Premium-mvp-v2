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
   ```

3. Instale deps e suba a API:
   ```bash
   npm install
   npm run dev
   ```

A API sobe em `http://localhost:8787`. Seu front deve usar `VITE_API_BASE_URL=http://localhost:8787`.

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
