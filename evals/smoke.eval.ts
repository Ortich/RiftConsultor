import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Una carta concreta se lee del catálogo local y no se guarda ningún mazo.",
  async test(t) {
    await t.send("Enséñame el texto exacto de Tibbers. No modifiques ningún mazo.");
    t.succeeded();
    t.calledTool("get_card");
    t.notCalledTool("save_deck");
  },
});
