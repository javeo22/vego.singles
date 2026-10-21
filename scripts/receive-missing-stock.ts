import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { parseImport } from "../lib/operations/imports";
import {
  applyIntakeResolutions,
  type CatalogResolution,
  inventorySnapshotQuery,
  missingStockSql,
  planMissingStock,
} from "../lib/operations/stock-intake";

async function main() {
  const args = process.argv.slice(2);
  const sourcePath = args.find((arg) => !arg.startsWith("--"));
  const projectRef = args
    .find((arg) => arg.startsWith("--project-ref="))
    ?.split("=")[1];
  if (!sourcePath || !projectRef)
    throw new Error(
      "Usage: npm run stock:receive-missing -- /path/export.csv --project-ref=PROJECT [--apply]",
    );
  assert.equal(
    (await readFile("supabase/.temp/project-ref", "utf8")).trim(),
    projectRef,
    "Linked Supabase project does not match the explicit target",
  );
  const source = await readFile(resolve(sourcePath), "utf8");
  const fileHash = createHash("sha256").update(source).digest("hex");
  const directory = resolve(
    ".local",
    "stock-intake",
    fileHash.slice(0, 12),
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const query = (sql: string) => {
    const output = execFileSync(
      "supabase",
      ["db", "query", "--linked", sql, "--output", "json"],
      {
        encoding: "utf8",
        maxBuffer: 25_000_000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return JSON.parse(output).rows;
  };
  const execute = (path: string) => {
    execFileSync(
      "supabase",
      ["db", "query", "--linked", "--file", path, "--output", "json"],
      {
        encoding: "utf8",
        maxBuffer: 5_000_000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  };
  const before = query(inventorySnapshotQuery)[0];
  await writeFile(resolve(directory, "before.json"), JSON.stringify(before), {
    mode: 0o600,
  });
  const parsed = parseImport(source, {}, "pokemon", {
    defaultLanguage: "unknown",
    sourceCurrency: "unknown",
  });
  const resolutionsPath = args
    .find((arg) => arg.startsWith("--resolutions="))
    ?.slice("--resolutions=".length);
  let rows = parsed.rows;
  if (resolutionsPath) {
    const manifest: { fileHash: string; resolutions: CatalogResolution[] } =
      JSON.parse(await readFile(resolve(resolutionsPath), "utf8"));
    assert.equal(
      manifest.fileHash,
      fileHash,
      "Catalog resolutions refer to another source file",
    );
    rows = applyIntakeResolutions(parsed.rows, manifest.resolutions);
    await writeFile(
      resolve(directory, "catalog-resolutions.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600 },
    );
  }
  const plan = planMissingStock(
    rows,
    before.inventory.printings,
    before.inventory.listings,
  );
  const counts = Object.fromEntries(
    ["new", "existing", "review", "excluded"].map((decision) => {
      const rows = plan.decisions.filter((row) => row.decision === decision);
      return [
        decision,
        {
          rows: rows.length,
          copies: rows.reduce((sum, row) => sum + row.row.quantity, 0),
        },
      ];
    }),
  );
  const report = {
    sourcePath: resolve(sourcePath),
    fileHash,
    projectRef,
    newVariants: plan.groups.length,
    counts,
    rows: plan.decisions.map(({ row, ...decision }) => ({
      ...decision,
      row: {
        rowNumber: row.rowNumber,
        name: row.name,
        game: row.game,
        set: row.setName,
        number: row.collectorNumber,
        language: row.language,
        treatment: row.treatment,
        finish: row.finish,
        quantity: row.quantity,
      },
    })),
  };
  await writeFile(
    resolve(directory, "report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  const sqlInput = { fileHash, fingerprint: before.fingerprint, plan };
  const rehearsalPath = resolve(directory, "rehearsal.sql");
  await writeFile(
    rehearsalPath,
    missingStockSql({ ...sqlInput, rollback: true }),
    { mode: 0o600 },
  );
  execute(rehearsalPath);
  assert.equal(
    query(inventorySnapshotQuery)[0].fingerprint,
    before.fingerprint,
    "Rehearsal changed inventory",
  );
  console.log(
    JSON.stringify({
      phase: "rehearsal-passed",
      newVariants: plan.groups.length,
      counts,
      report: resolve(directory, "report.json"),
    }),
  );
  if (!args.includes("--apply")) return;
  const applyPath = resolve(directory, "receive.sql");
  await writeFile(applyPath, missingStockSql(sqlInput), { mode: 0o600 });
  execute(applyPath);
  const after = query(inventorySnapshotQuery)[0];
  await writeFile(resolve(directory, "after.json"), JSON.stringify(after), {
    mode: 0o600,
  });
  for (const table of ["printings", "listings", "lots"]) {
    const oldIds = new Set(
      before.inventory[table].map((row: { id: string }) => row.id),
    );
    assert.deepEqual(
      after.inventory[table].filter((row: { id: string }) =>
        oldIds.has(row.id),
      ),
      before.inventory[table],
      `Existing ${table} changed`,
    );
  }
  const total = (lots: { quantity: number }[]) =>
    lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const copies = plan.groups.reduce((sum, group) => sum + group.quantity, 0);
  assert.equal(
    total(after.inventory.lots),
    total(before.inventory.lots) + copies,
  );
  assert.equal(
    after.inventory.listings.length,
    before.inventory.listings.length + plan.groups.length,
  );
  const receipt = query(
    `select jsonb_build_object('id',b.id,'statuses',(select jsonb_object_agg(status,count) from (select status,count(*) from operation_import_rows where batch_id=b.id group by status) s),'copies',(select coalesce(sum(quantity),0) from stock_lots where source_reference=b.id::text)) result from operation_import_batches b where file_hash='${fileHash}' and receipt_reference='missing-only/${fileHash}'`,
  )[0].result;
  await writeFile(
    resolve(directory, "receipt.json"),
    JSON.stringify(
      {
        fileHash,
        receivedAt: new Date().toISOString(),
        addedVariants: plan.groups.length,
        addedCopies: copies,
        physicalStock: total(after.inventory.lots),
        receipt,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      phase: "received",
      addedVariants: plan.groups.length,
      addedCopies: copies,
      physicalStock: total(after.inventory.lots),
      receipt,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stock intake failed");
  process.exitCode = 1;
});
