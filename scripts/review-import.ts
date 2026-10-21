import { readFileSync } from "node:fs";
import { parseImport } from "../lib/operations/imports";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run review:import -- /absolute/path/export.csv");
  process.exit(1);
}
const parsed = parseImport(readFileSync(path, "utf8"));
const counts = (field: "game" | "kind" | "finish" | "language") =>
  parsed.rows.reduce<Record<string, number>>((result, row) => {
    result[row[field]] = (result[row[field]] || 0) + 1;
    return result;
  }, {});
console.log(
  JSON.stringify(
    {
      rows: parsed.rows.length,
      units: parsed.rows.reduce((sum, row) => sum + row.quantity, 0),
      games: counts("game"),
      kinds: counts("kind"),
      finishes: counts("finish"),
      languages: counts("language"),
      sourcePriceReferences: parsed.rows.filter((row) => row.sourceMarketPrice)
        .length,
      nonstandardTreatments: parsed.rows.filter(
        (row) => row.treatment !== "standard",
      ).length,
      invalidRows: parsed.rows.filter((row) => row.errors.length).length,
      issues: parsed.rows
        .filter((row) => row.errors.length)
        .map((row) => ({
          row: row.rowNumber,
          name: row.name,
          errors: row.errors,
        })),
    },
    null,
    2,
  ),
);
