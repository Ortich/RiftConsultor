import * as z from "zod/v4";

const cardErrataSchema = z.strictObject({
  source: z.string(),
  sourceUrl: z.string(),
  effectiveDate: z.string(),
});

const cardBanSchema = z.strictObject({
  format: z.string().min(1),
  bannedAt: z.string(),
  reason: z.string(),
});

/**
 * One playable card. Every record in data/catalog/cards.json has these fields,
 * in this order. `energy` is the cost. Null means the card does not have that stat.
 */
export const cardSchema = z.strictObject({
  name: z.string().min(1),
  text: z.string(),
  energy: z.number().int().nonnegative().nullable(),
  might: z.number().int().nonnegative().nullable(),
  power: z.number().int().nonnegative().nullable(),
  types: z.array(z.string().min(1)).min(1),
  supertype: z.string().min(1).nullable(),
  domains: z.array(z.string().min(1)),
  tags: z.array(z.string().min(1)),
  keywords: z.array(z.string().min(1)),
  sets: z.array(z.string().min(1)),
  rarity: z.string(),
  rarities: z.array(z.string().min(1)),
  copyLimit: z.number().int().positive().nullable(),
  bans: z.array(cardBanSchema),
  errata: cardErrataSchema.nullable(),
  unreleased: z.boolean(),
  slug: z.string().min(1),
  id: z.string().min(1),
  collectorCode: z.string().min(1).nullable(),
  codes: z.array(z.string().min(1)),
  printingCount: z.number().int().nonnegative(),
});

export type CardRecord = z.infer<typeof cardSchema>;

export const CARD_FIELDS = Object.keys(cardSchema.shape) as (keyof CardRecord)[];

export function orderCard(card: CardRecord): CardRecord {
  const ordered = {} as CardRecord;
  for (const field of CARD_FIELDS) ordered[field] = card[field] as never;
  return ordered;
}

export function parseCard(raw: unknown): { ok: true; card: CardRecord } | { ok: false; message: string } {
  const parsed = cardSchema.safeParse(raw);
  if (!parsed.success) {
    const name =
      raw !== null && typeof raw === "object" && "name" in raw && typeof raw.name === "string" ? raw.name : "sin nombre";
    const detail = parsed.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "carta"}: ${issue.message}`)
      .join("; ");
    return { ok: false, message: `${name} no cumple el modelo. ${detail}` };
  }
  return { ok: true, card: orderCard(parsed.data) };
}
