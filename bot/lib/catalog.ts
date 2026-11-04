import { readFileSync } from "node:fs";

import { catalogFile, manifestFile } from "./paths.ts";

/** Printing suffix Riftcodex appends to the card name. Not part of the deck name. */
const VARIANT_SUFFIX =
  /\s+\((?:Alternate Art|Overnumbered|Signature|Metal|Starter|Launch Exclusive|Ultimate|GG EZ|\d+)\)\s*$/i;

export type Printing = {
  id: string;
  name: string;
  baseName: string;
  riftboundId: string;
  collectorNumber: number;
  energy: number | null;
  might: number | null;
  power: number | null;
  type: string;
  supertype: string | null;
  rarity: string;
  domains: string[];
  text: string;
  setId: string;
  tags: string[];
  alternateArt: boolean;
  overnumbered: boolean;
  signedPrinting: boolean;
  imageUrl: string | null;
};

export type Playable = {
  name: string;
  type: string;
  supertype: string | null;
  rarity: string;
  rarities: string[];
  domains: string[];
  tags: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  text: string;
  sets: string[];
  printingCount: number;
  riftboundId: string;
  imageUrl: string | null;
  conflict: string | null;
};

export type CatalogStamp = {
  source: string;
  fetchedAt: string | null;
  cardCount: number;
  setCount: number | null;
};

type Group = {
  baseName: string;
  printings: Printing[];
  playable: Playable;
};

type Manifest = {
  source?: string;
  fetchedAt?: string;
  cardCount?: number;
  setCount?: number;
};

let cache: { groups: Group[]; byId: Map<string, Group>; stamp: CatalogStamp } | null = null;

export function baseName(name: string): string {
  let current = name.trim();
  for (;;) {
    const next = current.replace(VARIANT_SUFFIX, "").trim();
    if (next === current) return current;
    current = next;
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/\[NO TEXT\]/gi, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(value: unknown): string {
  return typeof value === "string" ? normalizeText(value) : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asPrinting(raw: unknown): Printing | null {
  if (raw === null || typeof raw !== "object") return null;
  const card = raw as Record<string, unknown>;
  const classification = card.classification;
  const attributes = card.attributes;
  const text = card.text;
  const set = card.set;
  const media = card.media;
  const metadata = card.metadata;
  if (typeof card.id !== "string" || typeof card.name !== "string") return null;
  if (classification === null || typeof classification !== "object") return null;
  const kind = (classification as Record<string, unknown>).type;
  if (typeof kind !== "string" || kind.length === 0) return null;
  const cls = classification as Record<string, unknown>;
  const attrs = attributes !== null && typeof attributes === "object" ? (attributes as Record<string, unknown>) : {};
  const body = text !== null && typeof text === "object" ? (text as Record<string, unknown>) : {};
  const setRec = set !== null && typeof set === "object" ? (set as Record<string, unknown>) : {};
  const mediaRec = media !== null && typeof media === "object" ? (media as Record<string, unknown>) : {};
  const meta = metadata !== null && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const supertype = typeof cls.supertype === "string" && cls.supertype.length > 0 ? cls.supertype : null;
  return {
    id: card.id,
    name: card.name.trim(),
    baseName: baseName(card.name),
    riftboundId: typeof card.riftbound_id === "string" ? card.riftbound_id : "",
    collectorNumber: typeof card.collector_number === "number" ? card.collector_number : 0,
    energy: numberOrNull(attrs.energy),
    might: numberOrNull(attrs.might),
    power: numberOrNull(attrs.power),
    type: kind,
    supertype,
    rarity: typeof cls.rarity === "string" ? cls.rarity : "",
    domains: stringList(cls.domain),
    text: textOf(body.plain),
    setId: typeof setRec.set_id === "string" ? setRec.set_id : "",
    tags: stringList(card.tags),
    alternateArt: meta.alternate_art === true,
    overnumbered: meta.overnumbered === true,
    signedPrinting: meta.signature === true,
    imageUrl: typeof mediaRec.image_url === "string" ? mediaRec.image_url : null,
  };
}

function sameIdentity(left: Printing, right: Printing): boolean {
  const leftSuper = left.type === "Legend" ? null : left.supertype;
  const rightSuper = right.type === "Legend" ? null : right.supertype;
  return (
    left.type === right.type &&
    leftSuper === rightSuper &&
    left.energy === right.energy &&
    left.might === right.might &&
    left.power === right.power &&
    left.text === right.text &&
    sameList(left.domains, right.domains) &&
    sameList(left.tags, right.tags)
  );
}

function sameList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((item, index) => item === b[index]);
}

const SET_RANK: Record<string, number> = {
  OGN: 0,
  SFD: 1,
  UNL: 2,
  VEN: 3,
  OGS: 4,
  PR: 5,
  OPP: 6,
  JDG: 7,
};

function prefer(left: Printing, right: Printing): Printing {
  const score = (card: Printing) =>
    (card.name === card.baseName ? 8 : 0) +
    (card.alternateArt ? 0 : 4) +
    (card.overnumbered ? 0 : 2) +
    (card.signedPrinting ? 0 : 1) -
    (SET_RANK[card.setId] ?? 9) * 0.01;
  return score(left) >= score(right) ? left : right;
}

function toPlayable(base: string, printings: Printing[]): Playable {
  const preferred = printings.reduce((best, card) => prefer(best, card));
  const conflict = printings.every((card) => sameIdentity(card, preferred))
    ? null
    : "Las ediciones de esta carta no coinciden en texto, tipo, dominios o tags.";
  const sets = [...new Set(printings.map((card) => card.setId).filter((id) => id.length > 0))].sort();
  const rarities = [...new Set(printings.map((card) => card.rarity).filter((id) => id.length > 0))].sort();
  const supertype = preferred.type === "Legend" ? null : preferred.supertype;
  return {
    name: base,
    type: preferred.type,
    supertype,
    rarity: preferred.rarity,
    rarities,
    domains: preferred.domains,
    tags: preferred.tags,
    energy: preferred.energy,
    might: preferred.might,
    power: preferred.power,
    text: preferred.text,
    sets,
    printingCount: printings.length,
    riftboundId: preferred.riftboundId,
    imageUrl: preferred.imageUrl,
    conflict,
  };
}

function readManifest(): Manifest {
  try {
    return JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

export function loadCatalog(): { groups: Group[]; stamp: CatalogStamp; skipped: number } {
  if (cache) {
    return { groups: cache.groups, stamp: cache.stamp, skipped: 0 };
  }
  const raw = JSON.parse(readFileSync(catalogFile, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("data/catalog/cards.json tiene que ser un array de cartas.");
  }
  const printings: Printing[] = [];
  let skipped = 0;
  for (const item of raw) {
    const printing = asPrinting(item);
    if (printing === null) skipped += 1;
    else printings.push(printing);
  }
  const buckets = new Map<string, Printing[]>();
  for (const printing of printings) {
    const key = printing.baseName.toLowerCase();
    const bucket = buckets.get(key);
    if (bucket) bucket.push(printing);
    else buckets.set(key, [printing]);
  }
  const groups: Group[] = [];
  const byId = new Map<string, Group>();
  for (const [key, bucket] of buckets) {
    const group: Group = {
      baseName: bucket[0]?.baseName ?? key,
      printings: bucket,
      playable: toPlayable(bucket[0]?.baseName ?? key, bucket),
    };
    groups.push(group);
    for (const printing of bucket) {
      if (printing.riftboundId.length > 0) byId.set(printing.riftboundId.toLowerCase(), group);
    }
  }
  groups.sort((left, right) => left.baseName.localeCompare(right.baseName, "es"));
  const manifest = readManifest();
  const stamp: CatalogStamp = {
    source: manifest.source ?? "https://api.riftcodex.com/cards",
    fetchedAt: typeof manifest.fetchedAt === "string" ? manifest.fetchedAt : null,
    cardCount: printings.length,
    setCount: typeof manifest.setCount === "number" ? manifest.setCount : null,
  };
  cache = { groups, byId, stamp };
  return { groups, stamp, skipped };
}

export function catalogStamp(): CatalogStamp {
  return loadCatalog().stamp;
}

/** Released sets the consultor refuses to work without. Legacy is not out yet. */
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
  for (const group of loadCatalog().groups) {
    for (const printing of group.printings) {
      if (printing.setId.length > 0) present.add(printing.setId);
    }
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
    message: `El consultor está parado. Falta ${names} en el catálogo de Riftcodex. No cita cartas ni debate mazos hasta que esa colección esté en la descarga.`,
  };
}

export function allPlayables(): Playable[] {
  return loadCatalog().groups.map((group) => group.playable);
}

export function catalogSkipped(): number {
  const raw = JSON.parse(readFileSync(catalogFile, "utf8")) as unknown;
  if (!Array.isArray(raw)) return 0;
  return raw.filter((item) => asPrinting(item) === null).length;
}

function groupByQuery(query: string): { status: "one"; group: Group } | { status: "none" } | { status: "many"; names: string[] } {
  const { groups } = loadCatalog();
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return { status: "none" };
  const loaded = cache;
  const byRiftbound = loaded?.byId.get(needle);
  if (byRiftbound) return { status: "one", group: byRiftbound };

  const exactPrinted = groups.filter((group) =>
    group.printings.some((card) => card.name.toLowerCase() === needle),
  );
  if (exactPrinted.length === 1 && exactPrinted[0]) return { status: "one", group: exactPrinted[0] };
  if (exactPrinted.length > 1) return { status: "many", names: exactPrinted.map((group) => group.baseName) };

  const exactBase = groups.filter((group) => group.baseName.toLowerCase() === needle);
  if (exactBase.length === 1 && exactBase[0]) return { status: "one", group: exactBase[0] };
  if (exactBase.length > 1) return { status: "many", names: exactBase.map((group) => group.baseName) };

  const partial = groups.filter(
    (group) =>
      group.baseName.toLowerCase().includes(needle) ||
      group.printings.some((card) => card.name.toLowerCase().includes(needle)),
  );
  if (partial.length === 1 && partial[0]) return { status: "one", group: partial[0] };
  if (partial.length > 1) return { status: "many", names: partial.slice(0, 15).map((group) => group.baseName) };
  return { status: "none" };
}

export function resolveCard(query: string):
  | { status: "one"; card: Playable }
  | { status: "none" }
  | { status: "many"; names: string[] } {
  const found = groupByQuery(query);
  if (found.status !== "one") return found;
  return { status: "one", card: found.group.playable };
}

export function describeCard(query: string):
  | { status: "one"; card: Playable; printedNames: string[] }
  | { status: "none" }
  | { status: "many"; names: string[] } {
  const found = groupByQuery(query);
  if (found.status !== "one") return found;
  const printedNames = [...new Set(found.group.printings.map((printing) => printing.name))].sort((left, right) =>
    left.localeCompare(right, "es"),
  );
  return { status: "one", card: found.group.playable, printedNames };
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
  const { groups, stamp } = loadCatalog();
  const query = filters.query?.trim().toLowerCase() ?? "";
  const limit = Math.min(Math.max(filters.limit ?? 8, 1), 20);
  const scored: { card: Playable; score: number }[] = [];
  for (const group of groups) {
    const card = group.playable;
    if (filters.type && card.type.toLowerCase() !== filters.type.trim().toLowerCase()) continue;
    if (filters.supertype && (card.supertype ?? "").toLowerCase() !== filters.supertype.trim().toLowerCase()) continue;
    if (!includesFold(card.domains, filters.domain)) continue;
    if (filters.setId && !group.printings.some((printing) => printing.setId.toLowerCase() === filters.setId?.trim().toLowerCase())) {
      continue;
    }
    if (filters.rarity && !card.rarities.some((rarity) => rarity.toLowerCase() === filters.rarity?.trim().toLowerCase())) {
      continue;
    }
    if (!includesFold(card.tags, filters.tag)) continue;
    let score = query.length === 0 ? 1 : 0;
    if (query.length > 0) {
      const name = card.name.toLowerCase();
      if (name === query) score = 100;
      else if (group.printings.some((printing) => printing.riftboundId.toLowerCase() === query)) score = 100;
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
