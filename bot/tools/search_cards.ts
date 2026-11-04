import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { catalogPause, catalogStamp, searchCards } from "../lib/catalog.ts";

export default defineTool({
  description:
    "Busca cartas en el catálogo local. No usa la red. Hay una ficha por nombre; los artes alternativos no salen aparte.",
  effect: "read",
  inputSchema: z.object({
    query: z.string().optional().describe("Nombre, tag, slug, código o texto."),
    type: z.string().optional().describe("Unit, Spell, Gear, Legend, Battlefield o Rune."),
    supertype: z.string().optional().describe("Champion, Signature, Basic o Token."),
    domain: z.string().optional().describe("Un dominio, por ejemplo Fury."),
    setId: z.string().optional().describe("Código de set, por ejemplo OGN."),
    rarity: z.string().optional(),
    tag: z.string().optional().describe("Tag exacto, por ejemplo Jinx."),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  execute(input) {
    const pause = catalogPause();
    if (pause.paused) return pause;
    const query = input.query?.trim() ?? "";
    const hasFilter = [input.type, input.supertype, input.domain, input.setId, input.rarity, input.tag].some(
      (value) => value !== undefined && value.trim().length > 0,
    );
    if (query.length === 0 && !hasFilter) {
      return { error: "Indica un nombre o un filtro.", catalog: catalogStamp(), hits: [] };
    }
    const result = searchCards({ ...input, query });
    return {
      catalog: result.stamp,
      hits: result.hits.map((card) => ({
        name: card.name,
        type: card.type,
        supertype: card.supertype,
        rarity: card.rarity,
        domains: card.domains,
        tags: card.tags,
        energy: card.energy,
        might: card.might,
        power: card.power,
        text: card.text,
        sets: card.sets,
        copyLimit: card.copyLimit,
        banned: card.bans.length > 0,
        unreleased: card.unreleased,
      })),
    };
  },
});
