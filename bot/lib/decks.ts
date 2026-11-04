import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { checkDeck, type DeckCard, type DeckCheck, type DeckInput } from "./legality.ts";
import { decksDir } from "./paths.ts";

export type StoredDeck = DeckInput & {
  format: "constructed";
  updatedAt: string;
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function deckPath(id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new Error("Id de mazo inválido.");
  }
  const file = path.join(decksDir, `${id}.json`);
  const relative = path.relative(decksDir, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Id de mazo inválido.");
  }
  return file;
}

function isDeckCard(value: unknown): value is DeckCard {
  if (value === null || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return typeof card.name === "string" && typeof card.count === "number";
}

function readCards(value: unknown): DeckCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDeckCard).map((card) => ({
    name: card.name,
    count: card.count,
    ...(typeof card.role === "string" && card.role.length > 0 ? { role: card.role } : {}),
  }));
}

export function readDeck(id: string): StoredDeck | null {
  let file: string;
  try {
    file = deckPath(id);
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    return {
      id,
      name: typeof raw.name === "string" ? raw.name : id,
      format: "constructed",
      legend: typeof raw.legend === "string" ? raw.legend : "",
      chosenChampion: typeof raw.chosenChampion === "string" ? raw.chosenChampion : "",
      strategy: typeof raw.strategy === "string" ? raw.strategy : "",
      meta: typeof raw.meta === "string" ? raw.meta : "",
      main: readCards(raw.main),
      runes: readCards(raw.runes),
      battlefields: readCards(raw.battlefields),
      sideboard: readCards(raw.sideboard),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeDeck(deck: StoredDeck): void {
  mkdirSync(decksDir, { recursive: true });
  writeFileSync(deckPath(deck.id), `${JSON.stringify(deck, null, 2)}\n`, "utf8");
}

export function listDecks(): { deck: StoredDeck; check: DeckCheck }[] {
  mkdirSync(decksDir, { recursive: true });
  const ids = readdirSync(decksDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .filter((id) => ID_PATTERN.test(id))
    .sort();
  const decks: { deck: StoredDeck; check: DeckCheck }[] = [];
  for (const id of ids) {
    const deck = readDeck(id);
    if (!deck) continue;
    decks.push({ deck, check: checkDeck(deck) });
  }
  return decks;
}

export function deckInput(deck: StoredDeck): DeckInput {
  return {
    id: deck.id,
    name: deck.name,
    legend: deck.legend,
    chosenChampion: deck.chosenChampion,
    strategy: deck.strategy,
    meta: deck.meta,
    main: deck.main,
    runes: deck.runes,
    battlefields: deck.battlefields,
    sideboard: deck.sideboard,
  };
}
