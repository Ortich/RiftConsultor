import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { catalogStamp, describeCard } from "../lib/catalog.ts";

export default defineTool({
  description:
    "Devuelve una carta del catálogo local por nombre exacto o riftbound_id. Úsala antes de citar el texto.",
  effect: "read",
  inputSchema: z.object({
    name: z.string().min(1).describe("Nombre de la carta o riftbound_id."),
  }),
  execute({ name }) {
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
      printedNames: found.printedNames,
      type: card.type,
      supertype: card.supertype,
      rarity: card.rarity,
      rarities: card.rarities,
      domains: card.domains,
      tags: card.tags,
      energy: card.energy,
      might: card.might,
      power: card.power,
      text: card.text,
      sets: card.sets,
      printingCount: card.printingCount,
      riftboundId: card.riftboundId,
      imageUrl: card.imageUrl,
      conflict: card.conflict,
    };
  },
});
