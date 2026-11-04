import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { listDecks } from "../lib/decks.ts";

export default defineTool({
  description: "Lista los mazos guardados en data/decks, con estrategia y si pasan la legalidad.",
  effect: "read",
  inputSchema: z.object({}),
  execute() {
    const decks = listDecks().map(({ deck, check }) => ({
      id: deck.id,
      name: deck.name,
      legend: deck.legend,
      chosenChampion: deck.chosenChampion,
      legal: check.legal,
      ready: check.ready,
      updatedAt: deck.updatedAt,
      strategy: deck.strategy.slice(0, 180),
      meta: deck.meta.slice(0, 180),
    }));
    return { decks };
  },
});
