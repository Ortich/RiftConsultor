import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { catalogPause, catalogStamp } from "../lib/catalog.ts";
import { writeDeck, type StoredDeck } from "../lib/decks.ts";
import { checkDeck, type DeckCard } from "../lib/legality.ts";

const entry = z.object({
  name: z.string().min(1),
  count: z.number().int().positive(),
  role: z.string().optional().describe("Para qué está esta carta en el plan."),
});

function cardsOf(cards: { name: string; count: number; role?: string }[] | undefined): DeckCard[] {
  return (cards ?? []).map((card) => ({
    name: card.name,
    count: card.count,
    ...(card.role ? { role: card.role } : {}),
  }));
}

export default defineTool({
  description:
    "Comprueba un mazo de constructed contra el catálogo local. Solo escribe data/decks cuando commit es true y el usuario ha pedido guardar esa versión.",
  effect: (input) => (input.commit === true ? "write" : "read"),
  inputSchema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .describe("Id estable del fichero, en minúsculas."),
    name: z.string().min(1),
    legend: z.string().min(1).describe("Nombre exacto de la Legend."),
    chosenChampion: z.string().min(1).describe("Unidad Champion que empieza en la zona de campeón. También va en el main."),
    strategy: z.string().describe("Plan del mazo, en palabras del usuario."),
    meta: z.string().describe("A qué mesa apunta. Vacío si el usuario aún no lo ha dicho."),
    main: z.array(entry).max(80),
    runes: z.array(entry).max(40),
    battlefields: z.array(entry).max(12),
    sideboard: z.array(entry).max(20).optional(),
    commit: z.boolean().optional().describe("True solo cuando el usuario pide guardar esta versión."),
  }),
  execute(input, ctx) {
    const pause = catalogPause();
    if (pause.paused) return { saved: false, ...pause };
    const deckInput = {
      id: input.id,
      name: input.name,
      legend: input.legend,
      chosenChampion: input.chosenChampion,
      strategy: input.strategy,
      meta: input.meta,
      main: cardsOf(input.main),
      runes: cardsOf(input.runes),
      battlefields: cardsOf(input.battlefields),
      sideboard: cardsOf(input.sideboard),
    };
    const check = checkDeck(deckInput);
    const commit = input.commit === true;
    if (!commit) {
      return { saved: false, catalog: catalogStamp(), check };
    }
    if (ctx.session.purpose === "eval") {
      return { saved: false, reason: "eval", catalog: catalogStamp(), check };
    }
    const stored: StoredDeck = {
      ...deckInput,
      format: "constructed",
      updatedAt: ctx.now().toISOString(),
    };
    writeDeck(stored);
    return { saved: true, id: stored.id, catalog: catalogStamp(), check };
  },
});
