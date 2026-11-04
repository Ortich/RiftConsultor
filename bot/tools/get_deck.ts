import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { catalogStamp } from "../lib/catalog.ts";
import { deckInput, readDeck } from "../lib/decks.ts";
import { checkDeck } from "../lib/legality.ts";

export default defineTool({
  description: "Lee un mazo guardado y lo vuelve a comprobar contra el catálogo local.",
  effect: "read",
  inputSchema: z.object({
    id: z.string().describe("Id del fichero, por ejemplo ahri-tempo."),
  }),
  execute({ id }) {
    const deck = readDeck(id);
    if (!deck) return { found: false, message: `No hay un mazo con id «${id}».` };
    return { found: true, catalog: catalogStamp(), deck, check: checkDeck(deckInput(deck)) };
  },
});
