# RiftConsultor

Consultor de mazos de Riftbound. Las cartas viven en este repositorio, una ficha por nombre, y los mazos se guardan con su estrategia y con el meta contra el que van.

El consultor no busca cartas en la web. Si una carta no está en `data/catalog/cards.json`, tiene que decirlo. Un arte alternativo, un acabado o un idioma no son otra carta.

Radiance está en esta descarga: 183 cartas con set `RAD`. Legacy y Reckoning no han salido. Secret Garden está fechado el 1 de diciembre de 2026. Esas tres no hacen falta para usar el consultor. Si un `npm run sync-cards` futuro deja Radiance fuera, las herramientas se paran solas.

## Catálogo

`data/catalog/cards.json` sale de `GET https://openrift.app/api/v1/catalog`. `data/catalog/manifest.json` dice cuándo se descargó y cuántas cartas quedaron. El texto de reglas es el de la edición inglesa normal, o el de la errata cuando el catálogo trae una: en ese caso la ficha guarda la fuente. Los símbolos se quedan como `:rb_might:` o `:rb_energy_2:`.

Doce cartas traen un ban de constructed en la propia ficha. El consultor no añade otros.

Para refrescarlo:

```bash
npm run sync-cards
```

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
