import test from "node:test";
import assert from "node:assert/strict";
import { pricingExchangeReady } from "../lib/operations/price-workflow";
import { processStoreUpdate } from "../lib/operations/store-update";
test("fixed exchange is ready without a recent quote and the worker never requests an official rate", async () => {
  const configured = {
    fx: 500,
    fx_at: "2020-01-01T00:00:00Z",
    fx_source: null,
    fx_mode: "fixed",
  };
  assert.equal(pricingExchangeReady(configured), true);
  assert.equal(
    pricingExchangeReady({ ...configured, fx_mode: "automatic" }),
    false,
  );
  assert.equal(pricingExchangeReady({ ...configured, fx: 0 }), false);
  const original = globalThis.fetch;
  let fetches = 0;
  const calls: string[] = [];
  globalThis.fetch = (async () => {
    fetches++;
    throw new Error("Network must not be needed for a fixed rate");
  }) as typeof fetch;
  const db: any = {
    from: () => ({
      select: () => ({
        single: async () => ({ data: configured, error: null }),
      }),
    }),
    rpc: async (name: string) => {
      calls.push(name);
      return {
        data:
          name === "claim_store_updates"
            ? []
            : { run: { status: "completed" } },
        error: null,
      };
    },
  };
  try {
    const result = await processStoreUpdate(db, "test");
    assert.equal(fetches, 0);
    assert.equal(result.exchange.fx, 500);
    assert.equal(calls.includes("refresh_store_exchange"), false);
  } finally {
    globalThis.fetch = original;
  }
});
