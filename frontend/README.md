# PTCG Premium v2 — App único (Home + Pokémon TCG Físico)

Vite + React + Tailwind (ESM).

## Requisitos
- Node.js 18+

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


## New route
Use `#/tcg-fisico/eventos/<id>` or `#/eventos/<id>` to open the Event Physical Summary Page. If you navigate programmatically, you can pass `history.pushState({eventFromProps: evento}, '', '#/tcg-fisico/eventos/'+evento.id)`.
