import { readFileSync } from "node:fs";

import { catalogFile, manifestFile } from "./paths.ts";

/** Printing suffix a deck list may still append. It is not a different card. */
const VARIANT_SUFFIX =
  /\s+\((?:Alternate Art|Alt Art|Overnumbered|Signature|Metal|Starter|Launch Exclusive|Ultimate|GG EZ|\d+)\)\s*$/i;

export type CardBan = {
  format: string;
  bannedAt: string;
  reason: string;
};

export type CardErrata = {
  source: string;
  sourceUrl: string;
  effectiveDate: string;
};

export type Playable = {
  name: string;
  slug: string;
  type: string;
  types: string[];
  supertype: string | null;
  rarity: string;
  rarities: string[];
  domains: string[];
  tags: string[];
  keywords: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  text: string;
  errata: CardErrata | null;
  sets: string[];
  collectorCode: string | null;
  copyLimit: number | null;
  bans: CardBan[];
  unreleased: boolean;
};

export type CatalogStamp = {
  source: string;
  fetchedAt: string | null;
  cardCount: number;
  setCount: number | null;
  radianceCards: number | null;
};

type StoredCard = {
  card: Playable;
  codes: string[];
};

type Manifest = {
  source?: string;
  fetchedAt?: string;
  setCount?: number;
  radianceCards?: number;
};

let cache: { cards: StoredCard[]; stamp: CatalogStamp } | null = null;

export function baseName(name: string): string {
  let current = name.trim();
  for (;;) {
    const next = current.replace(VARIANT_SUFFIX, "").trim();
    if (next === current) return current;
    current = next;
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asErrata(value: unknown): CardErrata | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const source = typeof raw.source === "string" ? raw.source : "";
  const sourceUrl = typeof raw.sourceUrl === "string" ? raw.sourceUrl : "";
  const effectiveDate = typeof raw.effectiveDate === "string" ? raw.effectiveDate : "";
  if (source.length === 0 && sourceUrl.length === 0 && effectiveDate.length === 0) return null;
  return { source, sourceUrl, effectiveDate };
}

function asBans(value: unknown): CardBan[] {
  if (!Array.isArray(value)) return [];
  const bans: CardBan[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.format !== "string" || raw.format.length === 0) continue;
    bans.push({
      format: raw.format,
      bannedAt: typeof raw.bannedAt === "string" ? raw.bannedAt : "",
      reason: typeof raw.reason === "string" ? raw.reason : "",
    });
  }
  return bans;
}

function asCard(raw: unknown): StoredCard | null {
  if (raw === null || typeof raw !== "object") return null;
  const card = raw as Record<string, unknown>;
  if (typeof card.name !== "string" || card.name.trim().length === 0) return null;
  const types = stringList(card.types);
  if (types.length === 0) return null;
  const supertype = typeof card.supertype === "string" && card.supertype.length > 0 ? card.supertype : null;
  const playable: Playable = {
    name: card.name.trim(),
    slug: typeof card.slug === "string" && card.slug.length > 0 ? card.slug : card.name.trim(),
    type: types[0] ?? "",
    types,
    supertype,
    rarity: typeof card.rarity === "string" ? card.rarity : "",
    rarities: stringList(card.rarities),
    domains: stringList(card.domains),
    tags: stringList(card.tags),
    keywords: stringList(card.keywords),
    energy: numberOrNull(card.energy),
    might: numberOrNull(card.might),
    power: numberOrNull(card.power),
    text: typeof card.text === "string" ? card.text : "",
    errata: asErrata(card.errata),
    sets: stringList(card.sets),
    collectorCode: typeof card.collectorCode === "string" && card.collectorCode.length > 0 ? card.collectorCode : null,
    copyLimit: card.copyLimit === null ? null : (numberOrNull(card.copyLimit) ?? 3),
    bans: asBans(card.bans),
    unreleased: card.unreleased === true,
  };
  return { card: playable, codes: stringList(card.codes) };
}

function readManifest(): Manifest {
  try {
    return JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

export function loadCatalog(): { cards: StoredCard[]; stamp: CatalogStamp; skipped: number } {
  if (cache) return { cards: cache.cards, stamp: cache.stamp, skipped: 0 };
  const raw = JSON.parse(readFileSync(catalogFile, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("data/catalog/cards.json tiene que ser un array de cartas.");
  const cards: StoredCard[] = [];
  let skipped = 0;
  for (const item of raw) {
    const card = asCard(item);
    if (card === null) skipped += 1;
    else cards.push(card);
  }
  cards.sort((left, right) => left.card.name.localeCompare(right.card.name, "es"));
  const manifest = readManifest();
  const radianceCards = cards.filter((entry) => entry.card.sets.includes("RAD")).length;
  const stamp: CatalogStamp = {
    source: manifest.source ?? "https://openrift.app/api/v1/catalog",
    fetchedAt: typeof manifest.fetchedAt === "string" ? manifest.fetchedAt : null,
    cardCount: cards.length,
    setCount: typeof manifest.setCount === "number" ? manifest.setCount : null,
    radianceCards: typeof manifest.radianceCards === "number" ? manifest.radianceCards : radianceCards,
  };
  cache = { cards, stamp };
  return { cards, stamp, skipped };
}

export function catalogStamp(): CatalogStamp {
  return loadCatalog().stamp;
}

/** Published sets the consultor refuses to work without. Legacy and Reckoning are not out. */
const REQUIRED_SETS = [{ setId: "RAD", name: "Radiance" }] as const;

export type CatalogPause =
  | { paused: false }
  | {
      paused: true;
      missing: { setId: string; name: string }[];
      message: string;
    };

export function catalogPause(): CatalogPause {
  const present = new Set<string>();
  for (const entry of loadCatalog().cards) {
    for (const setId of entry.card.sets) present.add(setId);
  }
  const missing = REQUIRED_SETS.filter((set) => !present.has(set.setId)).map((set) => ({
    setId: set.setId,
    name: set.name,
  }));
  if (missing.length === 0) return { paused: false };
  const names = missing.map((set) => `${set.name} (${set.setId})`).join(", ");
  return {
    paused: true,
    missing,
    message: `El consultor está parado. Falta ${names} en el catálogo local. No cita cartas ni debate mazos hasta que esa colección esté en la descarga.`,
  };
}

export function allPlayables(): Playable[] {
  return loadCatalog().cards.map((entry) => entry.card);
}

export function catalogSkipped(): number {
  const raw = JSON.parse(readFileSync(catalogFile, "utf8")) as unknown;
  if (!Array.isArray(raw)) return 0;
  return raw.filter((item) => asCard(item) === null).length;
}

function lookup(query: string): { status: "one"; card: Playable } | { status: "none" } | { status: "many"; names: string[] } {
  const { cards } = loadCatalog();
  const needle = baseName(query).toLowerCase();
  if (needle.length === 0) return { status: "none" };
  const exactId = cards.filter(
    (entry) =>
      entry.card.slug.toLowerCase() === needle ||
      entry.card.collectorCode?.toLowerCase() === needle ||
      entry.codes.some((code) => code.toLowerCase() === needle),
  );
  if (exactId.length === 1 && exactId[0]) return { status: "one", card: exactId[0].card };
  if (exactId.length > 1) return { status: "many", names: exactId.map((entry) => entry.card.name) };

  const exactName = cards.filter((entry) => entry.card.name.toLowerCase() === needle);
  if (exactName.length === 1 && exactName[0]) return { status: "one", card: exactName[0].card };
  if (exactName.length > 1) return { status: "many", names: exactName.map((entry) => entry.card.name) };

  const partial = cards.filter((entry) => entry.card.name.toLowerCase().includes(needle));
  if (partial.length === 1 && partial[0]) return { status: "one", card: partial[0].card };
  if (partial.length > 1) return { status: "many", names: partial.slice(0, 15).map((entry) => entry.card.name) };
  return { status: "none" };
}

export function resolveCard(query: string):
  | { status: "one"; card: Playable }
  | { status: "none" }
  | { status: "many"; names: string[] } {
  return lookup(query);
}

export function describeCard(query: string):
  | { status: "one"; card: Playable }
  | { status: "none" }
  | { status: "many"; names: string[] } {
  return lookup(query);
}

export type SearchFilters = {
  query?: string;
  type?: string;
  supertype?: string;
  domain?: string;
  setId?: string;
  rarity?: string;
  tag?: string;
  limit?: number;
};

function includesFold(values: string[], wanted: string | undefined): boolean {
  if (!wanted) return true;
  const needle = wanted.trim().toLowerCase();
  return values.some((value) => value.toLowerCase() === needle);
}

export function searchCards(filters: SearchFilters): { stamp: CatalogStamp; hits: Playable[] } {
  const { cards, stamp } = loadCatalog();
  const query = filters.query?.trim().toLowerCase() ?? "";
  const limit = Math.min(Math.max(filters.limit ?? 8, 1), 20);
  const scored: { card: Playable; score: number }[] = [];
  for (const entry of cards) {
    const card = entry.card;
    if (filters.type && !card.types.some((type) => type.toLowerCase() === filters.type?.trim().toLowerCase())) continue;
    if (filters.supertype && (card.supertype ?? "").toLowerCase() !== filters.supertype.trim().toLowerCase()) continue;
    if (!includesFold(card.domains, filters.domain)) continue;
    if (filters.setId && !card.sets.some((setId) => setId.toLowerCase() === filters.setId?.trim().toLowerCase())) continue;
    if (filters.rarity && !card.rarities.some((rarity) => rarity.toLowerCase() === filters.rarity?.trim().toLowerCase())) {
      continue;
    }
    if (!includesFold(card.tags, filters.tag)) continue;
    let score = query.length === 0 ? 1 : 0;
    if (query.length > 0) {
      const name = card.name.toLowerCase();
      if (name === query || card.slug.toLowerCase() === query) score = 100;
      else if (entry.codes.some((code) => code.toLowerCase() === query) || card.collectorCode?.toLowerCase() === query) score = 100;
      else if (name.startsWith(query)) score = 80;
      else if (name.includes(query)) score = 60;
      else if (card.tags.some((tag) => tag.toLowerCase() === query)) score = 50;
      else if (card.text.toLowerCase().includes(query)) score = 20;
    }
    if (score > 0) scored.push({ card, score });
  }
  scored.sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name, "es"));
  return { stamp, hits: scored.slice(0, limit).map((item) => item.card) };
}
