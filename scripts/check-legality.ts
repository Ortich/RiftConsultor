import { rmSync } from "node:fs";

import { allPlayables, catalogPause, catalogSkipped, catalogStamp, describeCard, type Playable } from "../bot/lib/catalog.ts";
import { readDeck, writeDeck } from "../bot/lib/decks.ts";
import { checkDeck, type DeckCard, type DeckInput } from "../bot/lib/legality.ts";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

function card(name: string, count: number): DeckCard {
  return { name, count };
}

function fits(item: Playable, domains: string[]): boolean {
  return item.domains.every((domain) => domain === "Colorless" || domains.includes(domain));
}

function mainDeck(championName: string, pool: Playable[], domains: string[]): DeckCard[] | null {
  const cards: DeckCard[] = [card(championName, 1)];
  let total = 1;
  for (const item of pool) {
    if (total >= 40) break;
    if (item.name === championName || item.conflict || !fits(item, domains)) continue;
    if (item.type !== "Unit" && item.type !== "Spell" && item.type !== "Gear") continue;
    if (item.supertype === "Signature" || item.supertype === "Token" || item.supertype === "Champion") continue;
    const count = Math.min(3, 40 - total);
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
expect(stamp.cardCount === 1451, `el catálogo tiene ${stamp.cardCount} cartas, se esperaban 1451`);
expect(stamp.fetchedAt !== null, "el manifiesto no tiene fetchedAt");
expect(catalogSkipped() === 0, "hay cartas que el lector no entiende");

const tibbers = describeCard("Tibbers");
expect(tibbers.status === "one" && tibbers.card.supertype === "Signature", "Tibbers no sale como Signature");
expect(tibbers.status === "one" && tibbers.card.tags.includes("Annie"), "Tibbers no tiene el tag Annie");

const jinx = describeCard("Jinx - Loose Cannon");
expect(jinx.status === "one" && jinx.card.type === "Legend", "Jinx - Loose Cannon no es Legend");
expect(
  jinx.status === "one" && jinx.card.domains.includes("Fury") && jinx.card.domains.includes("Chaos"),
  "la leyenda de Jinx no tiene Fury y Chaos",
);

const rebel = describeCard("Jinx - Rebel (Alternate Art)");
expect(rebel.status === "one" && rebel.card.name === "Jinx - Rebel", "el sufijo de edición no se ha quitado");

const pool = allPlayables();
const legend = pool.find((item) => item.conflict === null && item.type === "Legend" && item.tags.length > 0);
const champion =
  legend === undefined
    ? undefined
    : pool.find(
        (item) =>
          item.conflict === null &&
          item.type === "Unit" &&
          item.supertype === "Champion" &&
          legend.tags.every((tag) => item.tags.includes(tag)) &&
          fits(item, legend.domains),
      );
const rune =
  legend === undefined
    ? undefined
    : pool.find((item) => item.conflict === null && item.type === "Rune" && fits(item, legend.domains));
const offRune =
  legend === undefined
    ? undefined
    : pool.find(
        (item) =>
          item.conflict === null &&
          item.type === "Rune" &&
          item.domains.some((domain) => domain !== "Colorless" && !legend.domains.includes(domain)),
      );
const fields =
  legend === undefined ? [] : pool.filter((item) => item.conflict === null && item.type === "Battlefield" && fits(item, legend.domains));

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

    const bumped = main.map((entry, index) => (index === 1 ? { ...entry, count: entry.count + 1 } : entry));
    const fourth = checkDeck({ ...base, main: bumped });
    expect(fourth.errors.some((issue) => issue.code === "copy_limit"), "la cuarta copia no se detecta");
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
  const kennenFields = pool.filter(
    (item) => item.conflict === null && item.type === "Battlefield" && fits(item, kennen.card.domains),
  );
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
    legend: "Jinx - Loose Cannon",
    chosenChampion: "Jinx - Rebel",
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
