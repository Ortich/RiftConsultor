import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { catalogPause, catalogStamp, describeCard } from "../lib/catalog.ts";

export default defineTool({
  description:
    "Devuelve una carta del catálogo local por nombre, slug o código de coleccionista. Una carta por nombre: el arte alternativo no es otra carta. Úsala antes de citar el texto.",
  effect: "read",
  inputSchema: z.object({
    name: z.string().min(1).describe("Nombre de la carta, slug o código, por ejemplo Ahri, Confident."),
  }),
  execute({ name }) {
    const pause = catalogPause();
    if (pause.paused) return pause;
    const found = describeCard(name);
    if (found.status === "none") {
      return { found: false, catalog: catalogStamp(), message: `«${name}» no está en el catálogo local.` };
    }
    if (found.status === "many") {
      return {
        found: false,
        catalog: catalogStamp(),
        message: "Hay varias cartas. Pide una con el nombre exacto.",
        matches: found.names,
      };
    }
    const card = found.card;
    return {
      found: true,
      catalog: catalogStamp(),
      name: card.name,
      slug: card.slug,
      collectorCode: card.collectorCode,
      type: card.type,
      types: card.types,
      supertype: card.supertype,
      rarity: card.rarity,
      rarities: card.rarities,
      domains: card.domains,
      tags: card.tags,
      keywords: card.keywords,
      energy: card.energy,
      might: card.might,
      power: card.power,
      text: card.text,
      errata: card.errata,
      sets: card.sets,
      copyLimit: card.copyLimit,
      bans: card.bans,
      unreleased: card.unreleased,
    };
  },
});
