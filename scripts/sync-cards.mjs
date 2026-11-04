import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCard } from "../bot/lib/card.ts";
import { loadSources } from "../bot/lib/sources.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "data/catalog");
const source = loadSources().active;
const catalogUrl = source.endpoints.catalog;
if (source.id !== "openrift" || typeof catalogUrl !== "string") {
  throw new Error(
    `La descarga solo normaliza OpenRift. El origen activo es ${source.id}. Los demás están anotados en data/catalog/sources.json.`,
  );
}

const SET_ORDER = ["OGN", "SFD", "UNL", "VEN", "RAD", "OGS", "FND", "ARC", "T1A", "T1S", "KDA", "SGN", "LGC", "REC"];

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function labelMap(items) {
  const labels = new Map();
  if (!Array.isArray(items)) return labels;
  for (const item of items) {
    if (item && typeof item.slug === "string" && typeof item.label === "string") labels.set(item.slug, item.label);
  }
  return labels;
}

function titleCase(slug) {
  if (slug.length === 0) return slug;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function labelsOf(values, labels) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === "string" && value.length > 0)
    .map((value) => labels.get(value) ?? titleCase(value));
}

function earliestRelease(set) {
  const dates = Object.values(set.releases ?? {})
    .map((release) => (release && typeof release.releasedAt === "string" ? release.releasedAt : ""))
    .filter((date) => date.length > 0)
    .sort();
  return dates[0] ?? null;
}

function setRank(slug) {
  const index = SET_ORDER.indexOf(slug);
  return index === -1 ? SET_ORDER.length + 1 : index;
}

function scorePrinting(printing, slug) {
  let score = 0;
  if (printing.language === "EN") score += 100;
  if (printing.artVariant === "normal") score += 40;
  if (printing.isSigned !== true) score += 10;
  if (printing.isOvernumbered !== true) score += 8;
  if (printing.finish === "normal") score += 4;
  if (cleanText(printing.printedRulesText).length > 0) score += 2;
  score -= setRank(slug) * 0.01;
  score -= (typeof printing.canonicalRank === "number" ? printing.canonicalRank : 99) * 0.0001;
  return score;
}

function chooseText(printings) {
  const counts = new Map();
  for (const printing of printings) {
    const text = cleanText(printing.printedRulesText);
    const current = counts.get(text);
    if (current) current.count += 1;
    else counts.set(text, { text, count: 1 });
  }
  const ranked = [...counts.values()].sort(
    (left, right) => right.count - left.count || right.text.length - left.text.length || left.text.localeCompare(right.text),
  );
  return ranked[0]?.text ?? "";
}

function bansOf(raw) {
  if (!Array.isArray(raw)) return [];
  const bans = [];
  for (const ban of raw) {
    if (ban === null || typeof ban !== "object") continue;
    if (ban.formatId !== "standard" && ban.formatName !== "Constructed") continue;
    bans.push({
      format: typeof ban.formatName === "string" && ban.formatName.length > 0 ? ban.formatName : "Constructed",
      bannedAt: typeof ban.bannedAt === "string" ? ban.bannedAt : "",
      reason: typeof ban.reason === "string" ? ban.reason : "",
    });
  }
  return bans;
}

function errataOf(raw) {
  if (raw === null || typeof raw !== "object") return { text: null, note: null };
  const text = cleanText(raw.correctedRulesText);
  if (text.length === 0) return { text: null, note: null };
  return {
    text,
    note: {
      source: typeof raw.source === "string" ? raw.source : "",
      sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : "",
      effectiveDate: typeof raw.effectiveDate === "string" ? raw.effectiveDate : "",
    },
  };
}

function normalize(catalog, fetchedAt) {
  if (catalog === null || typeof catalog !== "object") throw new Error("El catálogo no es un objeto.");
  const cards = catalog.cards;
  const printings = catalog.printings;
  const sets = catalog.sets;
  if (cards === null || typeof cards !== "object" || Array.isArray(cards)) throw new Error("Falta cards.");
  if (printings === null || typeof printings !== "object" || Array.isArray(printings)) throw new Error("Falta printings.");
  if (!Array.isArray(sets)) throw new Error("Falta sets.");

  const enums = catalog.enums ?? {};
  const typeLabels = labelMap(enums.cardTypes);
  const superLabels = labelMap(enums.superTypes);
  const domainLabels = labelMap(enums.domains);
  const rarityLabels = labelMap(enums.rarities);
  const today = fetchedAt.slice(0, 10);

  const setById = new Map();
  const setRecords = [];
  for (const set of sets) {
    if (set === null || typeof set !== "object" || typeof set.id !== "string" || typeof set.slug !== "string") {
      throw new Error("Un set no tiene id o slug.");
    }
    const releasedAt = earliestRelease(set);
    const record = {
      id: set.slug,
      name: typeof set.name === "string" ? set.name : set.slug,
      setType: typeof set.setType === "string" ? set.setType : "",
      releasedAt,
      englishRelease: typeof set.releases?.EN?.releasedAt === "string" ? set.releases.EN.releasedAt : null,
      released: releasedAt !== null && releasedAt <= today,
    };
    setById.set(set.id, record);
    setRecords.push(record);
  }
  setRecords.sort((left, right) => setRank(left.id) - setRank(right.id) || left.id.localeCompare(right.id));

  const byCard = new Map();
  for (const printing of Object.values(printings)) {
    if (printing === null || typeof printing !== "object" || typeof printing.cardId !== "string") continue;
    const bucket = byCard.get(printing.cardId);
    if (bucket) bucket.push(printing);
    else byCard.set(printing.cardId, [printing]);
  }

  const usedCodes = new Map();
  const names = new Map();
  const playables = [];
  for (const [id, card] of Object.entries(cards)) {
    if (card === null || typeof card !== "object" || typeof card.name !== "string" || card.name.trim().length === 0) {
      throw new Error(`La carta ${id} no tiene nombre.`);
    }
    if (!Array.isArray(card.types) || card.types.length === 0) throw new Error(`${card.name} no tiene tipo.`);
    if (Array.isArray(card.superTypes) && card.superTypes.length > 1) {
      throw new Error(`${card.name} tiene más de un supertipo y no hay una regla para elegirlo.`);
    }
    const name = card.name.trim();
    const nameKey = name.toLowerCase();
    if (names.has(nameKey)) throw new Error(`Nombre repetido: ${name}`);
    names.set(nameKey, id);

    const ownPrintings = byCard.get(id) ?? [];
    const ranked = [...ownPrintings].sort((left, right) => {
      const leftSet = setById.get(left.setId);
      const rightSet = setById.get(right.setId);
      return (
        scorePrinting(right, rightSet?.id ?? "") - scorePrinting(left, leftSet?.id ?? "") ||
        String(left.publicCode ?? "").localeCompare(String(right.publicCode ?? ""))
      );
    });
    const preferred = ranked[0] ?? null;
    const englishBase = ownPrintings.filter(
      (printing) =>
        printing.language === "EN" &&
        printing.artVariant === "normal" &&
        printing.isSigned !== true &&
        printing.isOvernumbered !== true,
    );
    const textPool = englishBase.length > 0 ? englishBase : ownPrintings.filter((printing) => printing.language === "EN");
    const errata = errataOf(card.errata);
    const text = errata.text ?? chooseText(textPool.length > 0 ? textPool : ownPrintings);
    const setIds = [...new Set(ownPrintings.map((printing) => setById.get(printing.setId)?.id).filter((slug) => typeof slug === "string"))];
    setIds.sort((left, right) => setRank(left) - setRank(right) || left.localeCompare(right));
    const releasedSets = setIds.filter((slug) => setRecords.find((set) => set.id === slug)?.released === true);
    const rarityPool = (englishBase.length > 0 ? englishBase : ownPrintings).map((printing) => printing.rarity).filter((rarity) => typeof rarity === "string");
    const rarities = [...new Set(rarityPool.map((rarity) => rarityLabels.get(rarity) ?? titleCase(rarity)))].sort();
    const preferredRarity = typeof preferred?.rarity === "string" ? (rarityLabels.get(preferred.rarity) ?? titleCase(preferred.rarity)) : (rarities[0] ?? "");
    const codes = [];
    for (const printing of ownPrintings) {
      if (typeof printing.publicCode !== "string" || printing.publicCode.length === 0) continue;
      const code = printing.publicCode;
      const owner = usedCodes.get(code.toLowerCase());
      if (owner && owner !== name) throw new Error(`El código ${code} está en ${owner} y en ${name}.`);
      usedCodes.set(code.toLowerCase(), name);
      if (!codes.includes(code)) codes.push(code);
    }
    codes.sort();
    const copyLimit = card.maxCopiesOverride === 0 ? null : typeof card.maxCopiesOverride === "number" ? card.maxCopiesOverride : 3;
    const parsed = parseCard({
      name,
      text,
      energy: typeof card.energy === "number" ? card.energy : null,
      might: typeof card.might === "number" ? card.might : null,
      power: typeof card.power === "number" ? card.power : null,
      types: labelsOf(card.types, typeLabels),
      supertype: labelsOf(card.superTypes, superLabels)[0] ?? null,
      domains: labelsOf(card.domains, domainLabels),
      tags: Array.isArray(card.tags) ? card.tags.filter((tag) => typeof tag === "string") : [],
      keywords: Array.isArray(card.keywords) ? card.keywords.filter((keyword) => typeof keyword === "string") : [],
      sets: setIds,
      rarity: preferredRarity,
      rarities,
      copyLimit,
      bans: bansOf(card.bans),
      errata: errata.note,
      unreleased: setIds.length > 0 && releasedSets.length === 0,
      slug: typeof card.slug === "string" ? card.slug : id,
      id,
      collectorCode: typeof preferred?.publicCode === "string" ? preferred.publicCode : null,
      codes,
      printingCount: englishBase.length,
    });
    if (!parsed.ok) throw new Error(parsed.message);
    playables.push(parsed.card);
  }
  playables.sort((left, right) => left.name.localeCompare(right.name, "es"));
  const radianceCards = playables.filter((card) => card.sets.includes("RAD")).length;
  if (playables.length < 1000) throw new Error(`Solo han llegado ${playables.length} cartas.`);
  if (radianceCards < 150) throw new Error(`Radiance solo tiene ${radianceCards} cartas.`);
  const ahri = playables.find((card) => card.name === "Ahri, Confident");
  if (!ahri || !ahri.sets.includes("RAD") || !ahri.text.includes("Disarm")) {
    throw new Error("Ahri, Confident no está en Radiance o no trae su texto.");
  }
  return {
    cards: playables,
    sets: setRecords,
    printingCount: Object.keys(printings).length,
    radianceCards,
  };
}

const response = await fetch(catalogUrl, {
  headers: {
    accept: "application/json",
    "user-agent": "rift-consultor/0.1",
  },
});
if (!response.ok) throw new Error(`OpenRift ha respondido ${response.status}.`);
const catalog = await response.json();
const fetchedAt = new Date().toISOString();
const normalized = normalize(catalog, fetchedAt);
const cardsJson = `${JSON.stringify(normalized.cards, null, 2)}\n`;
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "cards.json"), cardsJson);
writeFileSync(path.join(outDir, "sets.json"), `${JSON.stringify(normalized.sets, null, 2)}\n`);
const manifest = {
  sourceId: source.id,
  source: catalogUrl,
  fetchedAt,
  cardCount: normalized.cards.length,
  printingCount: normalized.printingCount,
  setCount: normalized.sets.length,
  radianceCards: normalized.radianceCards,
  sha256: createHash("sha256").update(cardsJson).digest("hex"),
  note: "Una carta por nombre. Los artes alternativos, acabados e idiomas no se guardan como cartas distintas.",
};
writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Guardadas ${manifest.cardCount} cartas (${manifest.radianceCards} en Radiance) a partir de ${manifest.printingCount} ediciones.`,
);
