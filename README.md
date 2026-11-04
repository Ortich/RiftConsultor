# RiftConsultor

Consultor de mazos de Riftbound. Las cartas viven en este repositorio, una ficha por nombre, y los mazos se guardan con su estrategia y con el meta contra el que van.

El consultor no busca cartas en la web. Si una carta no está en `data/catalog/cards.json`, tiene que decirlo. Un arte alternativo, un acabado o un idioma no son otra carta.

Radiance está en esta descarga: 183 cartas con set `RAD`. Legacy y Reckoning no han salido. Secret Garden está fechado el 1 de diciembre de 2026. Esas tres no hacen falta para usar el consultor. Si un `npm run sync-cards` futuro deja Radiance fuera, las herramientas se paran solas.

## Orígenes

Están en `data/catalog/sources.json`. El campo `active` es el que usa `npm run sync-cards`. Hoy es OpenRift. Los otros se quedan anotados para poder cambiar de origen sin volver a buscarlos.

| Id | Estado | Radiance | Para qué sirve |
| --- | --- | --- | --- |
| `openrift` | activo | sí | Catálogo de una carta y sus impresiones. Es la descarga actual. |
| `rifthunt` | disponible | sí | Bulk de impresiones. Aún no hay normalizador. |
| `riftcodex` | sin Radiance | no | Una fila por edición. El 4 nov 2026 no listaba RAD. |

## Modelo de carta

Cada objeto de `data/catalog/cards.json` tiene los mismos campos, en este orden. El código que lo exige es `bot/lib/card.ts`. Una carta que no cumpla el modelo no entra en el consultor.

| Campo | Qué es |
| --- | --- |
| `name` | Nombre |
| `text` | Texto de reglas. Vacío si no tiene. Los símbolos se quedan como `:rb_might:` o `:rb_energy_2:` |
| `energy` | Coste. `null` si la carta no cuesta |
| `might` | Might. `null` si no tiene |
| `power` | Poder. `null` si no tiene |
| `types` | Uno o más: Unit, Spell, Gear, Legend, Rune, Battlefield, Other |
| `supertype` | Champion, Signature, Token, Basic, o `null` |
| `domains` | Dominios |
| `tags` | Tags |
| `keywords` | Palabras clave |
| `sets` | Sets en los que está impresa |
| `rarity` | Rareza de la edición base |
| `rarities` | Rarezas que se han visto |
| `copyLimit` | Máximo de copias. `null` si no hay máximo |
| `bans` | Bans de constructed que trae el origen. Vacío si no está baneada |
| `errata` | Fuente del texto corregido, o `null` si el texto es el impreso |
| `unreleased` | `true` si solo existe en un set que todavía no ha salido |
| `slug` | Id legible |
| `id` | Id del origen |
| `collectorCode` | Código de la edición base, o `null` |
| `codes` | Códigos de todas las impresiones, para buscar |
| `printingCount` | Cuántas impresiones inglesas normales se han plegado en esta ficha |

`data/catalog/manifest.json` dice cuándo se descargó y de qué origen. Si el texto viene de una errata, `errata` cita la fuente. Doce cartas traen un ban de constructed en `bans`. El consultor no añade otros.

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
