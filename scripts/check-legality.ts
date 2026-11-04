import { readFileSync, rmSync } from "node:fs";

import { CARD_FIELDS } from "../bot/lib/card.ts";
import { allPlayables, catalogPause, catalogSkipped, catalogStamp, describeCard, type Playable } from "../bot/lib/catalog.ts";
import { readDeck, writeDeck } from "../bot/lib/decks.ts";
import { checkDeck, type DeckCard, type DeckInput } from "../bot/lib/legality.ts";
import { catalogFile } from "../bot/lib/paths.ts";
import { loadSources } from "../bot/lib/sources.ts";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

function card(name: string, count: number): DeckCard {
  return { name, count };
}

function fits(item: Playable, domains: string[]): boolean {
  return item.domains.every((domain) => domain === "Colorless" || domain === "Neutral" || domains.includes(domain));
}

function playableMain(item: Playable): boolean {
  return (
    item.bans.length === 0 &&
    !item.unreleased &&
    item.types.length > 0 &&
    item.types.every((type) => type === "Unit" || type === "Spell" || type === "Gear") &&
    item.supertype !== "Signature" &&
    item.supertype !== "Token" &&
    item.supertype !== "Champion"
  );
}

function mainDeck(championName: string, pool: Playable[], domains: string[]): DeckCard[] | null {
  const cards: DeckCard[] = [card(championName, 1)];
  let total = 1;
  for (const item of pool) {
    if (total >= 40) break;
    if (item.name === championName || !playableMain(item) || !fits(item, domains)) continue;
    const count = Math.min(item.copyLimit ?? 3, 40 - total);
    cards.push(card(item.name, count));
    total += count;
  }
  return total === 40 ? cards : null;
}

const stamp = catalogStamp();
const pause = catalogPause();
const hasRadiance = allPlayables().some((card) => card.sets.includes("RAD"));
expect(pause.paused === !hasRadiance, "la pausa no coincide con la presencia de Radiance");
if (pause.paused) {
  expect(pause.missing.some((set) => set.setId === "RAD"), "parado, pero no por Radiance");
}
expect(stamp.cardCount === 1106, `el catálogo tiene ${stamp.cardCount} cartas, se esperaban 1106`);
expect(stamp.radianceCards === 183, `Radiance tiene ${stamp.radianceCards} cartas, se esperaban 183`);
const sources = loadSources();
expect(sources.active.id === "openrift", "el origen activo no es OpenRift");
expect(sources.active.endpoints.catalog === stamp.source, "el manifiesto no apunta al origen activo");
expect(sources.sources.some((source) => source.id === "rifthunt" && source.hasRadiance), "falta RiftHunt como origen con Radiance");
expect(sources.sources.some((source) => source.id === "riftcodex" && source.hasRadiance === false), "falta Riftcodex como origen sin Radiance");
expect(stamp.source.includes("openrift.app"), "la fuente del catálogo no es OpenRift");
const rawCards = JSON.parse(readFileSync(catalogFile, "utf8")) as unknown[];
const fieldOrder = CARD_FIELDS.join(",");
const disordered = rawCards.find(
  (item) => item === null || typeof item !== "object" || Object.keys(item).join(",") !== fieldOrder,
);
expect(disordered === undefined, "hay una carta que no trae los campos del modelo, en ese orden");
expect(!pause.paused, "el consultor sigue parado con Radiance en el catálogo");
expect(stamp.fetchedAt !== null, "el manifiesto no tiene fetchedAt");
expect(catalogSkipped() === 0, "hay cartas que el lector no entiende");

const tibbers = describeCard("Tibbers");
expect(tibbers.status === "one" && tibbers.card.supertype === "Signature", "Tibbers no sale como Signature");
expect(tibbers.status === "one" && tibbers.card.tags.includes("Annie"), "Tibbers no tiene el tag Annie");

const jinx = describeCard("Loose Cannon");
expect(jinx.status === "one" && jinx.card.type === "Legend", "Loose Cannon no es Legend");
expect(
  jinx.status === "one" && jinx.card.domains.includes("Fury") && jinx.card.domains.includes("Chaos") && jinx.card.tags.includes("Jinx"),
  "la leyenda de Jinx no tiene Fury, Chaos y el tag Jinx",
);

const rebel = describeCard("Jinx, Rebel (Alternate Art)");
expect(rebel.status === "one" && rebel.card.name === "Jinx, Rebel", "el sufijo de edición no se ha quitado");

const ahri = describeCard("Ahri, Confident");
expect(
  ahri.status === "one" && ahri.card.sets.includes("RAD") && ahri.card.domains.includes("Calm") && ahri.card.text.includes("Disarm"),
  "Ahri, Confident no está en Radiance o no trae Disarm",
);
expect(ahri.status === "one" && ahri.card.text.includes(":rb_might:"), "el texto de Ahri ha perdido el símbolo :rb_might:");
expect(describeCard("ahri-confident").status === "one", "el slug de Ahri no resuelve");
expect(describeCard("RAD-038/167-EN").status === "one", "el código de Ahri no resuelve");

const loose = describeCard("Loose Cannon");
const spider = describeCard("Spiderling");
if (loose.status === "one" && spider.status === "one") {
  const swarm = checkDeck({
    id: "zz-test-legalidad",
    name: "Arañas",
    legend: loose.card.name,
    chosenChampion: "Jinx, Rebel",
    strategy: "Cualquier número de Spiderling.",
    meta: "Prueba local.",
    main: [card("Jinx, Rebel", 1), card("Spiderling", 6)],
    runes: [],
    battlefields: [],
    sideboard: [],
  });
  expect(
    !swarm.errors.some((issue) => issue.code === "copy_limit" && issue.message.includes("Spiderling")),
    "Spiderling no admite cualquier número de copias",
  );
  expect(swarm.errors.some((issue) => issue.code === "main_size"), "un main corto de Spiderling no avisa el tamaño");
}

const pool = allPlayables();
const legend = pool.find((item) => item.bans.length === 0 && !item.unreleased && item.type === "Legend" && item.tags.length > 0);
const champion =
  legend === undefined
    ? undefined
    : pool.find(
        (item) =>
          item.bans.length === 0 &&
          !item.unreleased &&
          item.type === "Unit" &&
          item.supertype === "Champion" &&
          legend.tags.every((tag) => item.tags.includes(tag)) &&
          fits(item, legend.domains),
      );
const rune =
  legend === undefined
    ? undefined
    : pool.find((item) => item.bans.length === 0 && item.type === "Rune" && fits(item, legend.domains));
const offRune =
  legend === undefined
    ? undefined
    : pool.find(
        (item) =>
          item.bans.length === 0 &&
          item.type === "Rune" &&
          item.domains.some((domain) => domain !== "Colorless" && domain !== "Neutral" && !legend.domains.includes(domain)),
      );
const fields =
  legend === undefined
    ? []
    : pool.filter((item) => item.bans.length === 0 && item.type === "Battlefield" && fits(item, legend.domains));

expect(legend !== undefined && champion !== undefined, "no hay una pareja leyenda/campeón legal en el catálogo");
expect(rune !== undefined && offRune !== undefined, "no hay runas de prueba");
expect(fields.length >= 3, "faltan battlefields");

if (legend && champion && rune && offRune && fields.length >= 3) {
  const main = mainDeck(champion.name, pool, legend.domains);
  expect(main !== null, "no hay cartas bastantes para llenar 40 copias legales");
  if (main) {
    const base: DeckInput = {
      id: "zz-test-legalidad",
      name: "Prueba",
      legend: legend.name,
      chosenChampion: champion.name,
      strategy: "Curva baja para conquistar y cerrar con el campeón.",
      meta: "Prueba local. No es un meta real.",
      main,
      runes: [card(rune.name, 12)],
      battlefields: fields.slice(0, 3).map((item) => card(item.name, 1)),
      sideboard: [],
    };
    const legal = checkDeck(base);
    expect(legal.legal, `un mazo mínimo no es legal: ${legal.errors.map((issue) => `${issue.code}:${issue.message}`).join(" | ")}`);
    expect(legal.ready, "un mazo con estrategia y meta no sale ready");

    const short = checkDeck({ ...base, main: [card(champion.name, 1)], strategy: "", meta: "" });
    expect(short.errors.some((issue) => issue.code === "main_size"), "un main corto no avisa main_size");
    expect(short.warnings.some((issue) => issue.code === "missing_strategy"), "falta el aviso de estrategia");
    expect(!short.ready, "un mazo sin estrategia sale ready");

    const offDomain = checkDeck({ ...base, runes: [card(offRune.name, 12)] });
    expect(offDomain.errors.some((issue) => issue.code === "domain"), "una runa de otro dominio pasa el filtro");

    const bumpAt = main.findIndex((entry, index) => index > 0 && pool.find((item) => item.name === entry.name)?.copyLimit === 3);
    expect(bumpAt > 0, "no hay una carta con máximo 3 para la prueba de copias");
    if (bumpAt > 0) {
      const bumped = main.map((entry, index) => (index === bumpAt ? { ...entry, count: entry.count + 1 } : entry));
      const fourth = checkDeck({ ...base, main: bumped });
      expect(fourth.errors.some((issue) => issue.code === "copy_limit"), "la cuarta copia no se detecta");
    }

    const neekoAt = main.findIndex((entry, index) => index > 0);
    if (neekoAt > 0) {
      const withNeeko = main.map((entry, index) => (index === neekoAt ? card("Neeko, Blending In", 1) : entry));
      const neutral = checkDeck({ ...base, main: withNeeko });
      expect(
        !neutral.errors.some((issue) => issue.code === "domain" && issue.message.includes("Neeko")),
        "Neeko, de dominio Neutral, no entra en el mazo",
      );
    }

    const bannedAt = main.findIndex((entry, index) => index > 0);
    if (bannedAt > 0) {
      const withBan = main.map((entry, index) => (index === bannedAt ? card("Fight or Flight", 1) : entry));
      const banned = checkDeck({ ...base, main: withBan });
      expect(banned.errors.some((issue) => issue.code === "banned"), "Fight or Flight no sale como baneada");
    }

    const spider = pool.find((item) => item.name === "Spiderling");
    if (spider && fits(spider, legend.domains)) {
      const withSpiders = main.map((entry, index) => (index === 1 ? card("Spiderling", 6) : entry));
      const unlimited = checkDeck({ ...base, main: withSpiders });
      expect(
        !unlimited.errors.some((issue) => issue.code === "copy_limit" && issue.message.includes("Spiderling")),
        "Spiderling no admite cualquier número de copias",
      );
    }
  }
}

const kennen = describeCard("Heart of the Tempest");
const rush = describeCard("Lightning Rush");
expect(kennen.status === "one" && rush.status === "one", "Kennen o Lightning Rush no están");
if (kennen.status === "one" && rush.status === "one") {
  const kennenChampion = pool.find(
    (item) =>
      item.type === "Unit" &&
      item.supertype === "Champion" &&
      kennen.card.tags.every((tag) => item.tags.includes(tag)) &&
      fits(item, kennen.card.domains),
  );
  const kennenRune = pool.find((item) => item.type === "Rune" && fits(item, kennen.card.domains));
  const kennenFields = pool.filter((item) => item.bans.length === 0 && item.type === "Battlefield" && fits(item, kennen.card.domains));
  const kennenMain = kennenChampion ? mainDeck(kennenChampion.name, pool, kennen.card.domains) : null;
  expect(kennenChampion !== undefined && kennenRune !== undefined && kennenFields.length >= 3 && kennenMain !== null, "faltan piezas de Kennen");
  if (kennenChampion && kennenRune && kennenFields.length >= 3 && kennenMain) {
    const withRush = checkDeck({
      id: "zz-test-legalidad",
      name: "Kennen",
      legend: kennen.card.name,
      chosenChampion: kennenChampion.name,
      strategy: "Probar el tag de Signature.",
      meta: "Prueba local.",
      main: [card(rush.card.name, 1), ...kennenMain.slice(0, -1)],
      runes: [card(kennenRune.name, 12)],
      battlefields: kennenFields.slice(0, 3).map((item) => card(item.name, 1)),
      sideboard: [],
    });
    expect(
      !withRush.errors.some((issue) => issue.code === "signature_tag"),
      `Lightning Rush no encaja con Kennen: ${withRush.errors.map((issue) => issue.message).join(" | ")}`,
    );
    const teemo = pool.find(
      (item) => item.type === "Unit" && item.supertype === "Champion" && item.tags.includes("Teemo") && !item.tags.includes("Kennen"),
    );
    if (teemo && kennenMain) {
      const swapped = checkDeck({
        id: "zz-test-legalidad",
        name: "Kennen",
        legend: kennen.card.name,
        chosenChampion: teemo.name,
        strategy: "No debería encajar.",
        meta: "Prueba local.",
        main: [card(teemo.name, 1), ...kennenMain.slice(1)],
        runes: [card(kennenRune.name, 12)],
        battlefields: kennenFields.slice(0, 3).map((item) => card(item.name, 1)),
        sideboard: [],
      });
      expect(
        swapped.errors.some((issue) => issue.code === "champion_tag"),
        "Teemo encaja como campeón de Kennen",
      );
    }
  }
}

const probeId = "zz-test-legalidad";
try {
  writeDeck({
    id: probeId,
    name: "Prueba",
    format: "constructed",
    legend: "Loose Cannon",
    chosenChampion: "Jinx, Rebel",
    strategy: "Prueba de escritura.",
    meta: "",
    main: [],
    runes: [],
    battlefields: [],
    sideboard: [],
    updatedAt: "2026-11-04T00:00:00.000Z",
  });
  const roundTrip = readDeck(probeId);
  expect(roundTrip?.strategy === "Prueba de escritura.", "el mazo no se ha releído");
} finally {
  rmSync(new URL(`../data/decks/${probeId}.json`, import.meta.url), { force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`ok ${stamp.cardCount} cartas, catálogo ${stamp.fetchedAt}`);
