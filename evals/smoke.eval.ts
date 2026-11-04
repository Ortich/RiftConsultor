import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Con Radiance ausente el consultor se para y no lee ni guarda cartas.",
  async test(t) {
    await t.send("Enséñame el texto exacto de Tibbers y dime si entra en un mazo.");
    t.succeeded();
    t.calledTool("catalog_status");
    t.notCalledTool("get_card");
    t.notCalledTool("save_deck");
  },
});