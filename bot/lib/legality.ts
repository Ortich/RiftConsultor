import { resolveCard, type Playable } from "./catalog.ts";

export type DeckCard = {
  name: string;
  count: number;
  role?: string;
};

export type DeckInput = {
  id: string;
  name: string;
  legend: string;
  chosenChampion: string;
  strategy: string;
  meta: string;
  main: DeckCard[];
  runes: DeckCard[];
  battlefields: DeckCard[];
  sideboard: DeckCard[];
};

export type DeckIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type DeckCheck = {
  legal: boolean;
  ready: boolean;
  errors: DeckIssue[];
  warnings: DeckIssue[];
  counts: {
    main: number;
    runes: number;
    battlefields: number;
    sideboard: number;
    signatures: number;
  };
  identity: {
    legend: string;
    tags: string[];
    domains: string[];
    chosenChampion: string;
  } | null;
};

const MAIN_TYPES = new Set(["Unit", "Gear", "Spell"]);

function sum(cards: DeckCard[]): number {
  return cards.reduce((total, card) => total + card.count, 0);
}

function meaningfulDomains(domains: string[]): string[] {
  return domains.filter((domain) => domain !== "Colorless");
}

function domainLegal(card: Playable, legendDomains: string[]): boolean {
  const allowed = new Set(meaningfulDomains(legendDomains));
  return meaningfulDomains(card.domains).every((domain) => allowed.has(domain));
}

function tagsCoverLegend(cardTags: string[], legendTags: string[]): boolean {
  if (legendTags.length === 0) return false;
  const owned = new Set(cardTags);
  return legendTags.every((tag) => owned.has(tag));
}

function sharesTag(cardTags: string[], legendTags: string[]): boolean {
  const owned = new Set(cardTags);
  return legendTags.some((tag) => owned.has(tag));
}

type Resolved =
  | { ok: true; card: Playable }
  | { ok: false; issue: DeckIssue };

function resolveEntry(entry: DeckCard, zone: string): Resolved {
  const found = resolveCard(entry.name);
  if (found.status === "none") {
    return {
      ok: false,
      issue: {
        level: "error",
        code: "unknown_card",
        message: `${zone}: «${entry.name}» no está en el catálogo local.`,
      },
    };
  }
  if (found.status === "many") {
    return {
      ok: false,
      issue: {
        level: "error",
        code: "ambiguous_card",
        message: `${zone}: «${entry.name}» coincide con varias cartas (${found.names.join(", ")}). Usa el nombre exacto.`,
      },
    };
  }
  return { ok: true, card: found.card };
}

function pushCopyLimits(issues: DeckIssue[], zones: { zone: string; cards: DeckCard[] }[]): Map<string, { count: number; card: Playable }> {
  const totals = new Map<string, { count: number; card: Playable; zones: string[] }>();
  for (const zone of zones) {
    const seen = new Set<string>();
    for (const entry of zone.cards) {
      const resolved = resolveEntry(entry, zone.zone);
      if (!resolved.ok) {
        issues.push(resolved.issue);
        continue;
      }
      if (resolved.card.conflict) {
        issues.push({
          level: "warning",
          code: "conflict_card",
          message: `${zone.zone}: «${resolved.card.name}» tiene ediciones que no coinciden. Uso la edición base.`,
        });
      }
      const key = resolved.card.name.toLowerCase();
      if (seen.has(key)) {
        issues.push({
          level: "warning",
          code: "duplicate_entry",
          message: `${zone.zone}: «${resolved.card.name}» está repetida en la lista. Suma las copias en una sola línea.`,
        });
      }
      seen.add(key);
      const current = totals.get(key);
      if (current) {
        current.count += entry.count;
        current.zones.push(zone.zone);
      } else {
        totals.set(key, { count: entry.count, card: resolved.card, zones: [zone.zone] });
      }
    }
  }
  return totals;
}

/**
 * Constructed checks pinned from the core rules and the 9 Oct 2026 tournament
 * rules: 40 main, 12 runes, 3 unique battlefields, sideboard 0–10, 3-of,
 * 3 signatures. Colorless is treated as no domain requirement.
 * This is not a ban list.
 */
export function checkDeck(input: DeckInput): DeckCheck {
  const errors: DeckIssue[] = [];
  const warnings: DeckIssue[] = [];
  const issues: DeckIssue[] = [];

  const legendResolved = resolveCard(input.legend);
  let legend: Playable | null = null;
  if (legendResolved.status === "none") {
    errors.push({
      level: "error",
      code: "unknown_card",
      message: `La leyenda «${input.legend}» no está en el catálogo local.`,
    });
  } else if (legendResolved.status === "many") {
    errors.push({
      level: "error",
      code: "ambiguous_card",
      message: `La leyenda «${input.legend}» coincide con varias cartas (${legendResolved.names.join(", ")}).`,
    });
  } else if (legendResolved.card.type !== "Legend") {
    errors.push({
      level: "error",
      code: "wrong_type",
      message: `«${legendResolved.card.name}» es ${legendResolved.card.type}, no una Legend.`,
    });
  } else {
    legend = legendResolved.card;
    if (legend.conflict) {
      warnings.push({
        level: "warning",
        code: "conflict_card",
        message: `La leyenda «${legend.name}» tiene ediciones que no coinciden en el catálogo. Uso la edición base.`,
      });
    }
  }

  const combined = pushCopyLimits(issues, [
    { zone: "Main", cards: input.main },
    { zone: "Sideboard", cards: input.sideboard },
  ]);
  const runeTotals = pushCopyLimits(issues, [{ zone: "Runas", cards: input.runes }]);
  const fieldTotals = pushCopyLimits(issues, [{ zone: "Battlefields", cards: input.battlefields }]);

  for (const issue of issues) {
    if (issue.level === "warning") warnings.push(issue);
    else errors.push(issue);
  }

  let signatures = 0;
  if (legend) {
    for (const entry of combined.values()) {
      if (!domainLegal(entry.card, legend.domains)) {
        errors.push({
          level: "error",
          code: "domain",
          message: `«${entry.card.name}» pide ${entry.card.domains.join(" + ") || "sin dominio"}, y la leyenda es ${legend.domains.join(" + ")}.`,
        });
      }
      if (entry.card.supertype === "Token" || entry.card.type === "Token") {
        errors.push({
          level: "error",
          code: "token",
          message: `«${entry.card.name}» es un token y no entra en el mazo.`,
        });
      } else if (!MAIN_TYPES.has(entry.card.type)) {
        errors.push({
          level: "error",
          code: "wrong_type",
          message: `«${entry.card.name}» es ${entry.card.type} y no puede ir en el main ni en el sideboard.`,
        });
      }
      if (entry.card.supertype === "Signature") {
        signatures += entry.count;
        if (!sharesTag(entry.card.tags, legend.tags)) {
          errors.push({
            level: "error",
            code: "signature_tag",
            message: `«${entry.card.name}» es Signature y no comparte tag con la leyenda (${legend.tags.join(", ")}).`,
          });
        }
      }
      if (entry.count > 3) {
        errors.push({
          level: "error",
          code: "copy_limit",
          message: `«${entry.card.name}» suma ${entry.count} copias entre main y sideboard. El máximo es 3.`,
        });
      }
    }
    for (const entry of runeTotals.values()) {
      if (entry.card.type !== "Rune") {
        errors.push({
          level: "error",
          code: "wrong_type",
          message: `«${entry.card.name}» es ${entry.card.type}, no una Rune.`,
        });
      } else if (!domainLegal(entry.card, legend.domains)) {
        errors.push({
          level: "error",
          code: "domain",
          message: `La runa «${entry.card.name}» no entra en ${legend.domains.join(" + ")}.`,
        });
      }
    }
    for (const entry of fieldTotals.values()) {
      if (entry.card.type !== "Battlefield") {
        errors.push({
          level: "error",
          code: "wrong_type",
          message: `«${entry.card.name}» es ${entry.card.type}, no un Battlefield.`,
        });
      } else if (!domainLegal(entry.card, legend.domains)) {
        errors.push({
          level: "error",
          code: "domain",
          message: `El battlefield «${entry.card.name}» no entra en ${legend.domains.join(" + ")}.`,
        });
      }
      if (entry.count !== 1) {
        errors.push({
          level: "error",
          code: "battlefield_duplicate",
          message: `«${entry.card.name}» tiene que ir a 1 copia. Ahora tiene ${entry.count}.`,
        });
      }
    }
  }

  const mainCount = sum(input.main);
  const runeCount = sum(input.runes);
  const fieldCount = sum(input.battlefields);
  const sideCount = sum(input.sideboard);
  if (mainCount !== 40) {
    errors.push({
      level: "error",
      code: "main_size",
      message: `El main tiene ${mainCount} cartas. En constructed son exactamente 40, campeón elegido incluido.`,
    });
  }
  if (runeCount !== 12) {
    errors.push({
      level: "error",
      code: "rune_size",
      message: `Las runas suman ${runeCount}. Tienen que ser 12.`,
    });
  }
  if (fieldCount !== 3 || fieldTotals.size !== 3) {
    errors.push({
      level: "error",
      code: "battlefield_count",
      message: `Hacen falta 3 battlefields de nombre distinto. Hay ${fieldCount} copias y ${fieldTotals.size} nombres.`,
    });
  }
  if (sideCount > 10) {
    errors.push({
      level: "error",
      code: "sideboard_size",
      message: `El sideboard tiene ${sideCount} cartas. El máximo es 10.`,
    });
  }
  if (signatures > 3) {
    errors.push({
      level: "error",
      code: "signature_count",
      message: `Hay ${signatures} cartas Signature. El máximo es 3 en total.`,
    });
  }

  const championLookup = resolveCard(input.chosenChampion);
  const championKey =
    championLookup.status === "one" ? championLookup.card.name.toLowerCase() : input.chosenChampion.trim().toLowerCase();
  const champion = combined.get(championKey);
  if (!champion) {
    errors.push({
      level: "error",
      code: "chosen_champion",
      message: `«${input.chosenChampion}» tiene que estar en el main. Esa copia es la que empieza en la zona de campeón.`,
    });
  } else if (legend) {
    if (champion.card.type !== "Unit" || champion.card.supertype !== "Champion") {
      errors.push({
        level: "error",
        code: "chosen_champion",
        message: `«${champion.card.name}» no es una unidad Champion.`,
      });
    } else if (!tagsCoverLegend(champion.card.tags, legend.tags)) {
      errors.push({
        level: "error",
        code: "champion_tag",
        message: `«${champion.card.name}» no cubre los tags de la leyenda (${legend.tags.join(", ")}).`,
      });
    }
  }

  if (input.strategy.trim().length === 0) {
    warnings.push({
      level: "warning",
      code: "missing_strategy",
      message: "Falta la estrategia. Sin ella el consultor no puede juzgar si un cambio encaja.",
    });
  }
  if (input.meta.trim().length === 0) {
    warnings.push({
      level: "warning",
      code: "missing_meta",
      message: "Falta el meta contra el que va el mazo. Escríbelo con lo que estás viendo en mesa, no con una tier list inventada.",
    });
  }

  const legal = errors.length === 0;
  return {
    legal,
    ready: legal && input.strategy.trim().length > 0 && input.meta.trim().length > 0,
    errors,
    warnings,
    counts: {
      main: mainCount,
      runes: runeCount,
      battlefields: fieldCount,
      sideboard: sideCount,
      signatures,
    },
    identity: legend
      ? {
          legend: legend.name,
          tags: legend.tags,
          domains: legend.domains,
          chosenChampion: champion?.card.name ?? input.chosenChampion,
        }
      : null,
  };
}
