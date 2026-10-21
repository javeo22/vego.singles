// These labels describe print treatments, rather than the canonical card name.
// Keep the source row unchanged and retain each removed label as treatment data.
export function collectrCardName(value: string) {
  let name = value.trim();
  const treatments: string[] = [];
  const known =
    /^(?:showcase(?: scrolls)?|borderless|anime borderless|hyperspace|tdm bundle|prismatic evolutions stamp|cosmos holo|prestige|league promo|full art|alt art|alternate art|jp alternate art|extended art|retro frame|future sight|white border|secret|illustration rare|special illustration rare|(?:rainbow|surge|first-place|galaxy|halo|raised|out of sight|prestige) foil|foil(?: etched)?|etched foil|gold-stamped signature|poke ball pattern|master ball pattern)$/i;
  for (let index = 0; index < 12; index++) {
    const suffix = name.match(/\s*\(([^()]*)\)\s*$/);
    if (!suffix) break;
    const text = suffix[1].trim();
    if (!known.test(text) && !/^(?:\d{3,4}|JP|JPN|CN|EN|ES)$/i.test(text))
      break;
    if (known.test(text)) treatments.unshift(text.toLowerCase());
    name = name.slice(0, suffix.index).trim();
  }
  return { name, treatment: treatments.join(" / ") || "standard" };
}

export const maxImportRows = 5000;
