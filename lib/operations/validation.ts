import { z } from "zod";
import { policySchema } from "./pricing";
import { catalogCardSchema, conditions, languages, games } from "./imports";
const id = z.string().uuid(),
  reason = z.string().trim().min(3).max(500),
  location = z.string().regex(/^[A-Z0-9_-]{1,32}$/);
const url = z
  .string()
  .url()
  .refine((v) => v.startsWith("https://"), "Usa un enlace HTTPS");
const action = <N extends string, T extends z.ZodRawShape>(name: N, shape: T) =>
  z
    .object({
      action: z.literal(name),
      key: id,
      payload: z.object(shape).strict(),
    })
    .strict();
export const commandSchema = z.union([
  action("confirm_card", {
    id,
    confirmed: z.literal(true),
    expected: z
      .object({
        listingId: id,
        printingId: id,
        game: z.enum(games),
        name: z.string().max(500),
        set: z.string().max(500),
        number: z.string().max(100).nullable(),
        language: z.string().max(60),
        condition: z.string().max(60),
        finish: z.string().max(120),
        kind: z.enum(["single", "sealed"]),
        treatment: z.string().max(200),
      })
      .strict(),
  }),
  action("approve_price", {
    id,
    priceCrc: z.number().int().positive().max(2147483647),
    expectedPriceCrc: z.number().int().positive().max(2147483647),
    reason,
  }),
  action("set_price_fx", {
    fx: z.number().min(1).max(10000),
    observedAt: z.string().datetime(),
    sourceUrl: url,
  }),
  action("resolve_import", {
    id,
    language: z.enum(languages),
    condition: z.enum(conditions),
    finish: z.string().trim().min(1).max(80),
    reason,
    card_printing_id: id.optional(),
    candidate: catalogCardSchema.optional(),
  }),
  action("skip_import", { id }),
  action("commit_import", { id, location }),
  action("verify_listing", {
    id,
    language: z.enum(languages),
    reason,
    condition: z.enum(conditions).optional(),
    finish: z.string().min(1).max(80).optional(),
    acquisitionCostCrc: z
      .number()
      .int()
      .nonnegative()
      .max(100000000)
      .nullable()
      .optional(),
    imageUrl: z.union([url, z.literal("")]).optional(),
    provider: z.string().max(40).optional(),
    externalId: z.string().max(100).optional(),
  }),
  action("stock_adjust", {
    id,
    delta: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0),
    location,
    reason,
  }),
  action("stock_transfer", {
    id,
    quantity: z.number().int().positive().max(100000),
    from: location,
    to: location,
    reason,
  }),
  action("lot_cost", {
    id,
    cost: z.number().nonnegative().max(100000000),
    reason,
  }),
  action("quarantine_lot", { id, quarantined: z.boolean(), reason }),
  action("evidence", {
    id,
    amount: z.number().positive().max(10000000),
    currency: z.enum(["USD", "CRC"]),
    provider: z.string().trim().min(1).max(60),
    sourceUrl: url,
    observedAt: z.string().datetime(),
    priceType: z.enum([
      "market_reference",
      "condition_quote",
      "asking_price",
      "sale_comparable",
    ]),
    exactVariant: z.literal(true),
    priceCheckId: id.optional(),
    priceReferenceId: z.string().min(1).max(250).optional(),
  }).refine(
    (v) => !!v.payload.priceCheckId === !!v.payload.priceReferenceId,
    "La referencia necesita el identificador de su verificación",
  ),
  action("bulk_price", {
    ids: z.array(id).min(1).max(50),
    approve: z.boolean(),
    reason,
  }),
  action("review_price", { id, approve: z.boolean(), reason }),
  action("price_lock", { id, until: z.string().datetime().nullable(), reason }),
  action("publish", { id, published: z.boolean() }),
  action("settings", {
    policy: policySchema,
    fx: z.number().min(1).max(10000).nullable(),
    fxAt: z.string().datetime().nullable(),
    fxSource: z.union([url, z.literal("")]).nullable(),
    dailyJobLimit: z.number().int().min(1).max(1000).default(100),
    deliveryFeeCrc: z.number().int().nonnegative().max(100000),
  }),
  action("location", {
    code: location,
    label: z.string().trim().min(1).max(100),
  }),
  action("revoke_membership", { email: z.string().email() }),
  action("membership", {
    email: z.string().email(),
    role: z.enum(["owner", "reviewer", "stock"]),
  }),
  action("enqueue_refresh", {}),
  action("enqueue", { id, kind: z.enum(["match_import", "refresh_price"]) }),
  action("retry_job", { id }),
  action("reserve_request", { id, hours: z.number().int().min(1).max(72) }),
  action("refresh_request", { id }),
  action("cancel_request", { id, reason }),
  action("sell_request", { id }),
  action("fulfill_request", { id }),
]);
export const importSchema = z
  .object({
    action: z.literal("stage_import"),
    key: id,
    text: z.string().max(2000000),
    name: z.string().trim().min(1).max(120),
    mode: z.enum(["receipt", "snapshot"]),
    defaultGame: z.enum(games).default("pokemon"),
    reference: z.string().trim().max(120).default(""),
    mapping: z.record(z.string()).default({}),
  })
  .strict();
export const inquirySchema = z
  .object({
    key: id,
    items: z
      .array(
        z
          .object({ id, quantity: z.number().int().positive().max(100) })
          .strict(),
      )
      .min(1)
      .max(30),
    fulfillment: z.enum(["duelist", "pickup"]),
    note: z.string().max(500).default(""),
  })
  .strict();
export const runJobSchema = z.object({ action: z.literal("run_job") }).strict();
