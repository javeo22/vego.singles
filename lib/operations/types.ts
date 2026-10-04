export const games = ["pokemon", "magic", "lorcana", "star-wars"] as const;
export const conditions = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
  "Sealed Product",
] as const;
export const languages = [
  "en",
  "es",
  "ja",
  "zh",
  "fr",
  "de",
  "it",
  "pt",
  "ko",
] as const;
export type OperationRole = "owner" | "reviewer" | "stock";
export type InventoryRecord = {
  listing_id: string;
  card_printing_id: string;
  canonical_name: string;
  set_name: string;
  collector_number: string;
  language: string;
  game: string;
  stock_image_url: string | null;
  catalog_source: string | null;
  external_card_id: string | null;
  condition: string;
  finish: string;
  published: boolean;
  approved_price_crc: number;
  quantity: number;
  available_quantity: number;
  identity_verified: boolean;
  price_verified: boolean;
  price_revision: number;
  stock_revision: number;
  acquisition_cost: number | null;
  cost_confirmed: boolean;
  price_locked_until: string | null;
  kind: string;
};
