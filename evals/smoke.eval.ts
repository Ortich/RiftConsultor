import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Con el catálogo local, el consultor lee el texto de Tibbers y no guarda un mazo.",
  async test(t) {
    await t.send("Enséñame el texto exacto de Tibbers y dime si entra en un mazo.");
    t.succeeded();
    t.calledTool("catalog_status");
    t.calledTool("get_card");
    t.notCalledTool("save_deck");
  },
});
