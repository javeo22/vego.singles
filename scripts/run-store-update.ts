import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  collectrPriceProof,
  type ClaimedStoreItem,
} from "../lib/operations/collectr-automation";
import { officialExchange } from "../lib/operations/collectr-automation";
import { inventorySnapshotQuery } from "../lib/operations/stock-intake";

async function main() {
  const args = process.argv.slice(2),
    project = args.find((a) => a.startsWith("--project-ref="))?.slice(14);
  if (!args.includes("--apply") || !project)
    throw new Error(
      "Usage: tsx scripts/run-store-update.ts --project-ref=PROJECT --apply [--run=UUID]",
    );
  assert.equal(
    (await readFile("supabase/.temp/project-ref", "utf8")).trim(),
    project,
  );
  const directory = resolve(
    ".local",
    "store-update",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let sequence = 0;
  function raw(sql: string) {
    const path = resolve(directory, `${++sequence}.sql`);
    return writeFile(path, sql, { mode: 0o600 }).then(
      () =>
        JSON.parse(
          execFileSync(
            "supabase",
            ["db", "query", "--linked", "--file", path, "--output", "json"],
            {
              encoding: "utf8",
              maxBuffer: 50_000_000,
              stdio: ["ignore", "pipe", "pipe"],
            },
          ),
        ).rows,
    );
  }
  async function query(sql: string) {
    return (
      await raw(
        `with authorized as materialized(select set_config('request.jwt.claim.role','service_role',true)) select ${sql} data from authorized`,
      )
    )[0].data;
  }
  const before = (await raw(inventorySnapshotQuery))[0];
  await writeFile(resolve(directory, "before.json"), JSON.stringify(before), {
    mode: 0o600,
  });
  const requested =
    args.find((a) => a.startsWith("--run="))?.slice(6) || crypto.randomUUID();
  assert.match(requested, /^[a-f0-9-]{36}$/);
  const run = await query(
    `start_store_update('prices',null,null,'${requested}')`,
  );
  const rate = await officialExchange();
  await query(
    `refresh_store_exchange('${run}',${rate.fx},'${rate.observedAt}','${rate.sourceUrl}')`,
  );
  console.log(
    JSON.stringify({
      phase: "started",
      run,
      rate: rate.fx,
      rateDate: rate.observedAt,
      artifacts: directory,
    }),
  );
  let summary = await query(`store_update_summary('${run}')`);
  for (
    let batch = 0;
    summary.run.status === "running" && batch < 200;
    batch++
  ) {
    const items = (await query(
      `claim_store_updates('${run}',50)`,
    )) as ClaimedStoreItem[];
    if (!items.length)
      throw new Error(
        `No cards available; another worker may still hold a lease. Resume with --run=${run}`,
      );
    await writeFile(
      resolve(directory, `claim-${batch}.json`),
      JSON.stringify(items),
      { mode: 0o600 },
    );
    const proofs: any[] = [];
    for (let start = 0; start < items.length; start += 16) {
      proofs.push(
        ...(await Promise.all(
          items.slice(start, start + 16).map(async (item) => {
            try {
              return {
                id: item.id,
                token: item.lease_token,
                proof: await collectrPriceProof(item),
              };
            } catch {
              return {
                id: item.id,
                token: item.lease_token,
                proof: {
                  expected: item.expected,
                  reason:
                    "La fuente no respondió. Reintenta esta carta; el precio actual se conserva.",
                },
              };
            }
          }),
        )),
      );
    }
    const json = JSON.stringify(proofs);
    assert.ok(!json.includes("$store_update_proofs$"));
    const results = await query(
      `finish_store_updates($store_update_proofs$${json}$store_update_proofs$::jsonb)`,
    );
    await writeFile(
      resolve(directory, `results-${batch}.json`),
      JSON.stringify(results),
      { mode: 0o600 },
    );
    summary = await query(`store_update_summary('${run}')`);
    console.log(
      JSON.stringify({
        phase: "progress",
        run,
        total: summary.total,
        done: summary.done,
        updated: summary.updated,
        unchanged: summary.unchanged,
        review: summary.review,
      }),
    );
  }
  const after = (await raw(inventorySnapshotQuery))[0];
  const oldLots = before.inventory.lots.map((lot: any) => ({
    id: lot.id,
    quantity: lot.quantity,
    owner_id: lot.owner_id,
    unit_cost_crc: lot.unit_cost_crc,
    cost_verified: lot.cost_verified,
    source_reference: lot.source_reference,
    location_code: lot.location_code,
  }));
  const currentLots = after.inventory.lots.map((lot: any) => ({
    id: lot.id,
    quantity: lot.quantity,
    owner_id: lot.owner_id,
    unit_cost_crc: lot.unit_cost_crc,
    cost_verified: lot.cost_verified,
    source_reference: lot.source_reference,
    location_code: lot.location_code,
  }));
  assert.deepEqual(
    currentLots,
    oldLots,
    "Stock quantities, owners or costs changed",
  );
  assert.equal(summary.run.status, "completed");
  await writeFile(resolve(directory, "after.json"), JSON.stringify(after), {
    mode: 0o600,
  });
  await writeFile(
    resolve(directory, "summary.json"),
    JSON.stringify(summary, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      phase: "completed",
      run,
      total: summary.total,
      done: summary.done,
      updated: summary.updated,
      unchanged: summary.unchanged,
      review: summary.review,
      quantitiesAndCostsPreserved: true,
      summary: resolve(directory, "summary.json"),
    }),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
