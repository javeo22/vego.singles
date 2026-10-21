import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inventorySnapshotQuery } from "../lib/operations/stock-intake";
import {
  sourceReviewSql,
  type SourceReviewReceipt,
} from "../lib/operations/source-review-receipt";

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) =>
    args
      .find((value) => value.startsWith(`--${name}=`))
      ?.slice(name.length + 3);
  const path = arg("manifest");
  const project = arg("project-ref");
  if (!path || !project)
    throw new Error(
      "Usage: tsx scripts/save-stock-source-review.ts --manifest=PRIVATE_MANIFEST.json --project-ref=PROJECT [--apply]",
    );
  assert.equal(
    (await readFile("supabase/.temp/project-ref", "utf8")).trim(),
    project,
  );
  const manifest: SourceReviewReceipt = JSON.parse(
    await readFile(resolve(path), "utf8"),
  );
  const directory = resolve(
    dirname(path),
    `receipt-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const cli = (args: string[]) =>
    JSON.parse(
      execFileSync(
        "supabase",
        ["db", "query", "--linked", ...args, "--output", "json"],
        {
          encoding: "utf8",
          maxBuffer: 30_000_000,
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    ).rows;
  const snapshot = () => cli([inventorySnapshotQuery])[0];
  const before = snapshot();
  const publicBefore = cli(["select count(*) n from storefront_inventory"])[0]
    .n;
  await writeFile(resolve(directory, "before.json"), JSON.stringify(before), {
    mode: 0o600,
  });
  const chunks: SourceReviewReceipt[] = [];
  for (let start = 0; start < manifest.results.length; start += 100) {
    const hex = createHash("sha256")
      .update(`${manifest.key}/${start}`)
      .digest("hex");
    const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    chunks.push({
      ...manifest,
      key,
      rootKey: manifest.key,
      results: manifest.results.slice(start, start + 100),
    });
  }
  const applyPaths: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const rehearsal = resolve(directory, `rehearsal-${index}.sql`);
    await writeFile(rehearsal, sourceReviewSql(chunk, true), { mode: 0o600 });
    cli(["--file", rehearsal]);
    const applyPath = resolve(directory, `apply-${index}.sql`);
    await writeFile(applyPath, sourceReviewSql(chunk), { mode: 0o600 });
    applyPaths.push(applyPath);
    console.log(
      JSON.stringify({
        phase: "chunk-rehearsal-passed",
        chunk: index + 1,
        chunks: chunks.length,
      }),
    );
  }
  assert.equal(
    snapshot().fingerprint,
    before.fingerprint,
    "Rehearsal changed inventory",
  );
  console.log(
    JSON.stringify({
      phase: "rehearsal-passed",
      variants: manifest.results.length,
    }),
  );
  if (!args.includes("--apply")) return;
  for (const [index, applyPath] of applyPaths.entries()) {
    cli(["--file", applyPath]);
    console.log(
      JSON.stringify({
        phase: "chunk-saved",
        chunk: index + 1,
        chunks: applyPaths.length,
      }),
    );
  }
  const after = snapshot();
  assert.deepEqual(
    after.inventory.listings,
    before.inventory.listings,
    "Listings/prices/publication changed",
  );
  assert.deepEqual(
    after.inventory.lots,
    before.inventory.lots,
    "Stock changed",
  );
  const targets = new Set(manifest.results.map((row) => row.printingId));
  for (const old of before.inventory.printings) {
    const current = after.inventory.printings.find(
      (row: any) => row.id === old.id,
    );
    if (!targets.has(old.id))
      assert.deepEqual(current, old, "Other catalog records changed");
    else {
      const clean = (row: any) => {
        const copy = structuredClone(row);
        delete copy.updated_at;
        delete copy.metadata.source_match_review;
        return copy;
      };
      assert.deepEqual(
        clean(current),
        clean(old),
        "Physical/catalog identity changed",
      );
    }
  }
  assert.equal(
    cli(["select count(*) n from storefront_inventory"])[0].n,
    publicBefore,
  );
  const count = () =>
    cli([
      `select count(*) n from operation_jobs where result->>'sourceReviewKey'='${manifest.key}'`,
    ])[0].n;
  assert.equal(count(), manifest.results.length);
  // A retry cannot duplicate jobs or touch metadata again.
  for (const applyPath of applyPaths) cli(["--file", applyPath]);
  assert.equal(count(), manifest.results.length);
  assert.equal(snapshot().fingerprint, after.fingerprint);
  await writeFile(resolve(directory, "after.json"), JSON.stringify(after), {
    mode: 0o600,
  });
  const result = {
    phase: "saved",
    variants: manifest.results.length,
    published: 0,
    review: manifest.results.length,
    publicListings: publicBefore,
    preservedStockAndPrices: true,
    duplicateJobsOnRetry: 0,
    receipt: directory,
  };
  await writeFile(
    resolve(directory, "verification.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
