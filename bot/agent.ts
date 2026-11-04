import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "RiftConsultor",
  description: "Debate cambios de mazos de Riftbound contra un catálogo local de Riftcodex.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  tools: ["read", "grep", "glob", "ls"],
  local: {
    sandbox: true,
  },
});
