import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { catalogPause, catalogStamp } from "../lib/catalog.ts";

export default defineTool({
  description:
    "Dice si el consultor puede trabajar. Está parado mientras falte una colección publicada, ahora mismo Radiance (RAD).",
  effect: "read",
  inputSchema: z.object({}),
  execute() {
    const pause = catalogPause();
    return { ...pause, catalog: catalogStamp() };
  },
});