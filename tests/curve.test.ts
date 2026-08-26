// The client re-implements the market maker's pricing so the size ladder can be
// drawn without one RPC call per rung. That duplication is the risk: JavaScript and
// Cairo can drift apart silently, and the UI would keep quoting confident wrong
// numbers. These vectors were captured from the deployed BTC market on mainnet by
// calling `quote()` directly, so a divergence fails here rather than in front of a
// user.

import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteLocal, avgPriceCents } from "../src/lib/doom";
import { OUTCOME_NO, OUTCOME_YES } from "../src/lib/doom";

/** Live reserves of 0x00611045…730f when the vectors were taken. */
const R_YES = 9_090_909_090_909_090_909n;
const R_NO = 11_000_000_000_000_000_000n;
const ONE = 10n ** 18n;

const VECTORS: [number, bigint, bigint][] = [
  [OUTCOME_YES, 1n * ONE, 1_757_575_757_575_757_576n],
  [OUTCOME_YES, 5n * ONE, 7_840_909_090_909_090_910n],
  [OUTCOME_YES, 25n * ONE, 31_313_131_313_131_313_132n],
  [OUTCOME_NO, 1n * ONE, 2_090_090_090_090_090_091n],
  [OUTCOME_NO, 5n * ONE, 8_903_225_806_451_612_904n],
  [OUTCOME_NO, 25n * ONE, 33_066_666_666_666_666_667n],
];

test("matches quote() on mainnet, to the wei", () => {
  for (const [outcome, amount, expected] of VECTORS) {
    assert.equal(
      quoteLocal(R_YES, R_NO, outcome, amount),
      expected,
      `${outcome === OUTCOME_YES ? "YES" : "NO"} ${amount / ONE} STRK`,
    );
  }
});

test("a bigger trade always gets a worse average price", () => {
  let last = 0;
  for (const size of [1n, 2n, 5n, 10n, 25n, 100n]) {
    const out = quoteLocal(R_YES, R_NO, OUTCOME_YES, size * ONE);
    const avg = avgPriceCents(size * ONE, out)!;
    assert.ok(avg > last, `average price should rise with size, got ${avg} after ${last}`);
    last = avg;
  }
});

test("a share never costs more than one collateral", () => {
  // The curve can approach 1 but must not cross it: a share redeems for exactly 1,
  // so paying more than 1 would be a guaranteed loss the UI should never quote.
  for (const size of [1n, 10n, 1_000n, 100_000n]) {
    const out = quoteLocal(R_YES, R_NO, OUTCOME_YES, size * ONE);
    assert.ok(avgPriceCents(size * ONE, out)! < 100, `size ${size} priced at or above par`);
  }
});

test("buying one side moves its price up and the other down", () => {
  const a = 5n * ONE;
  const outYes = quoteLocal(R_YES, R_NO, OUTCOME_YES, a);
  // Post-trade reserves, as the contract computes them.
  const yes2 = R_YES + a - outYes;
  const no2 = R_NO + a;
  const priceBefore = Number((R_NO * 10_000n) / (R_YES + R_NO));
  const priceAfter = Number((no2 * 10_000n) / (yes2 + no2));
  assert.ok(priceAfter > priceBefore, "buying YES must raise the price of YES");
});

test("degenerate inputs return nothing rather than a wrong number", () => {
  assert.equal(quoteLocal(R_YES, R_NO, OUTCOME_YES, 0n), 0n);
  assert.equal(quoteLocal(R_YES, R_NO, OUTCOME_YES, -1n), 0n);
  assert.equal(quoteLocal(0n, R_NO, OUTCOME_YES, ONE), 0n);
  assert.equal(quoteLocal(R_YES, 0n, OUTCOME_YES, ONE), 0n);
  assert.equal(avgPriceCents(ONE, 0n), null);
});
