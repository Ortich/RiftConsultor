# RiftConsultor

Consultor de mazos de Riftbound. Las cartas viven en este repositorio, descargadas de [Riftcodex](https://api.riftcodex.com/cards), y los mazos se guardan con su estrategia y con el meta contra el que van.

**Parado.** Radiance (RAD) salió el 23 de octubre de 2026 y Riftcodex todavía no la lista. Hasta que `npm run sync-cards` traiga cartas de ese set, el consultor no cita cartas ni debate mazos.

El consultor no busca cartas en la web. Si una carta no está en `data/catalog/cards.json`, tiene que decirlo.

## Catálogo

`data/catalog/cards.json` es la respuesta de `GET https://api.riftcodex.com/cards`, una fila por edición. `data/catalog/manifest.json` dice cuándo se descargó. Si dos ediciones del mismo nombre no coinciden, la herramienta avisa y usa la edición base.

Para refrescarlo:

```bash
npm run sync-cards
```

`curl` contra la API recibe un 403 de Cloudflare. El script prueba `fetch` y, si no pasa, usa Chrome.

## Mazos

Cada mazo es un JSON en `data/decks/<id>.json`:

- `legend` y `chosenChampion`, con los nombres del catálogo
- `main` (40 en constructed, el campeón elegido cuenta dentro), `runes` (12) y `battlefields` (3 nombres distintos)
- `sideboard` opcional, de 0 a 10
- `strategy`: el plan del mazo
- `meta`: a qué mesa apunta. Se escribe con lo que ves jugar, no con una tier list inventada

## Consultor

```bash
npm run check
npm run check:decks
npx --yes "@grok/agent-sdk@0.6.0" validate --dir .
npx --yes "@grok/agent-sdk@0.6.0" dev
```

El playground queda en `http://127.0.0.1:3000/playground`. Hace falta una clave de Cursor (`CURSOR_API_KEY` o `npx --yes "@grok/agent-sdk@0.6.0" login`) para que el modelo responda. Validar el proyecto y llamar a las herramientas no la necesitan.
