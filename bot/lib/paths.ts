import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root. Tools resolve data from here, not from the session cwd. */
export const projectRoot = path.resolve(here, "../..");

export const catalogFile = path.join(projectRoot, "data/catalog/cards.json");
export const manifestFile = path.join(projectRoot, "data/catalog/manifest.json");
export const decksDir = path.join(projectRoot, "data/decks");
