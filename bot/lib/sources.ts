import { readFileSync } from "node:fs";

import * as z from "zod/v4";

import { sourcesFile } from "./paths.ts";

const sourceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "available", "missing-radiance"]),
  hasRadiance: z.boolean(),
  grain: z.string().min(1),
  auth: z.string().min(1),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().min(1),
  endpoints: z.record(z.string().min(1), z.string().url()),
});

const sourcesSchema = z.strictObject({
  active: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
});

export type CatalogSource = z.infer<typeof sourceSchema>;

export type CatalogSources = {
  active: CatalogSource;
  sources: CatalogSource[];
};

export function loadSources(): CatalogSources {
  const parsed = sourcesSchema.safeParse(JSON.parse(readFileSync(sourcesFile, "utf8")));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`data/catalog/sources.json no cumple el modelo. ${detail}`);
  }
  const active = parsed.data.sources.filter((source) => source.id === parsed.data.active);
  if (active.length !== 1 || active[0]?.status !== "active") {
    throw new Error("data/catalog/sources.json tiene que marcar un origen activo, y solo uno.");
  }
  const marked = parsed.data.sources.filter((source) => source.status === "active");
  if (marked.length !== 1 || marked[0]?.id !== parsed.data.active) {
    throw new Error("El campo active y el status active no coinciden.");
  }
  return { active: active[0], sources: parsed.data.sources };
}
