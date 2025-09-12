# CSRF Token Flow

The backend sets a `csrfToken` cookie with `SameSite=Strict` and `HttpOnly` on first contact (and `Secure` when running in production). For any non-GET request, clients must include the same token in the `X-CSRF-Token` header. Requests also need `credentials: 'include'` so the cookie is sent.

## Flow
1. Client performs a safe request (e.g., `GET /api/health`).
2. Server issues a `csrfToken` cookie if one is missing.
3. Client reads the `csrfToken` cookie.
4. For `POST`, `PATCH`, `DELETE`, etc., the client sends the cookie value in the `X-CSRF-Token` header.
5. The server compares the header to the cookie and rejects mismatches with `403`.

## Required Headers Example
```http
X-CSRF-Token: <value of csrfToken cookie>
Content-Type: application/json
```

```js
fetch('/api/live/events', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCookie('csrfToken')
  },
  body: JSON.stringify({...})
});
```
