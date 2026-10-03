export type Listing = {
  id: string;
  approved_price_crc: number;
  condition: string;
  finish: string;
  quantity: number;
  kind?: "single" | "sealed";
  reference?: "charizard" | "sol-ring" | "stitch" | "star-wars";
  sample?: boolean;
  card_printings: {
    canonical_name: string;
    set_name: string;
    collector_number: string;
    language: string;
    game: string;
    stock_image_url: string | null;
  } | null;
};

export const gameNames: Record<string, string> = {
  pokemon: "Pokémon",
  magic: "Magic: The Gathering",
  lorcana: "Lorcana",
  "star-wars": "Star Wars Unlimited",
};
export const formatPrice = (value: number) =>
  `₡${value.toLocaleString("en-US")}`;

// Editorial display examples, never represented as published database inventory.
export const displayExamples: Listing[] = [
  {
    id: "display-charizard",
    reference: "charizard",
    sample: true,
    approved_price_crc: 12300,
    quantity: 1,
    condition: "Near Mint",
    finish: "Holo",
    card_printings: {
      canonical_name: "Charizard ex",
      set_name: "Scarlet & Violet 151",
      collector_number: "006/165",
      language: "English",
      game: "pokemon",
      stock_image_url: null,
    },
  },
  {
    id: "display-sol-ring",
    reference: "sol-ring",
    sample: true,
    approved_price_crc: 2500,
    quantity: 1,
    condition: "Near Mint",
    finish: "Non-foil",
    card_printings: {
      canonical_name: "Sol Ring",
      set_name: "Commander Masters",
      collector_number: "396",
      language: "English",
      game: "magic",
      stock_image_url: null,
    },
  },
  {
    id: "display-stitch",
    reference: "stitch",
    sample: true,
    approved_price_crc: 8900,
    quantity: 1,
    condition: "Near Mint",
    finish: "Non-foil",
    card_printings: {
      canonical_name: "Stitch — Carefree Surfer",
      set_name: "The First Chapter",
      collector_number: "21/204",
      language: "English",
      game: "lorcana",
      stock_image_url: null,
    },
  },
  {
    id: "display-star-wars",
    reference: "star-wars",
    sample: true,
    kind: "sealed",
    approved_price_crc: 62000,
    quantity: 1,
    condition: "Sealed Product",
    finish: "",
    card_printings: {
      canonical_name: "Spark of Rebellion Booster Box",
      set_name: "Spark of Rebellion",
      collector_number: "",
      language: "English",
      game: "star-wars",
      stock_image_url: null,
    },
  },
];
