# INTEGRATION GUIDE – TCG Live · Datas Page

- Página: `src/pages/TCGLiveDatePage.jsx`
- Rota: `#/tcg-live/datas/:date`
- Widget "Todos os Registros": linkar as datas para essa rota.

## Configurar `VITE_API_BASE_URL`

1. Crie um arquivo `.env` na pasta `frontend` (ou ajuste o existente).
2. Defina a URL da API usada pelas chamadas do `fetch`:
   ```sh
   VITE_API_BASE_URL=http://localhost:8787
   ```
3. Reinicie o servidor do Vite para que a variável seja carregada.

## Enviar `X-CSRF-Token` com cookies

1. Faça uma requisição segura (ex.: `GET /api/health`) para receber o cookie `csrfToken`.
2. Leia o valor desse cookie no cliente.
3. Em requisições que alteram dados (`POST`, `PATCH`, `DELETE` etc.), envie o valor no cabeçalho `X-CSRF-Token`.
4. Use sempre `credentials: 'include'` para que o cookie acompanhe a requisição.

## Exemplo de `fetch`

```js
const csrf = document.cookie
  .split('; ')
  .find(r => r.startsWith('csrfToken='))
  ?.split('=')[1];

const idToken = await getIdToken(); // do Firebase

await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/live/events`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
    'X-CSRF-Token': csrf,
  },
  body: JSON.stringify({ /* ...payload... */ })
});
```
