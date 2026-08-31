import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutSummary, moveToTarget, countdown } from "../src/lib/payout";

const E = 10n ** 18n;

test("pay is stake plus fee, get is the contract's own quote", () => {
  const p = payoutSummary(1n * E, 1760000000000000000n, 6n * E);
  assert.equal(p.payWei, 7n * E);
  assert.equal(p.getWei, 1760000000000000000n);
});

test("the multiplier is the number that makes a bad bet obvious", () => {
  // The real 1 STRK case: 1.76 back on 7.00 spent.
  const p = payoutSummary(1n * E, 1760000000000000000n, 6n * E);
  assert.equal(p.multiplier, 0.2514);
  assert.equal(p.profitable, false, "winning still loses money at this size");
});

test("a large enough stake clears the fee and reads above 1x", () => {
  const p = payoutSummary(40n * E, 47n * E, 6n * E);
  assert.ok(p.multiplier !== null && p.multiplier > 1, `got ${p.multiplier}`);
  assert.equal(p.profitable, true);
});

test("profitable is exactly get > pay, including at the boundary", () => {
  assert.equal(payoutSummary(1n * E, 7n * E, 6n * E).profitable, false, "equal is not profit");
  assert.equal(payoutSummary(1n * E, 7n * E + 1n, 6n * E).profitable, true);
});

test("a zero stake yields no multiplier rather than a divide by zero", () => {
  const p = payoutSummary(0n, 0n, null);
  assert.equal(p.multiplier, null);
  assert.equal(p.profitable, false);
});

test("a missing fee is treated as zero, not as a crash", () => {
  const p = payoutSummary(1n * E, 2n * E, null);
  assert.equal(p.payWei, 1n * E);
  assert.equal(p.multiplier, 2);
});

test("moveToTarget says how far spot has to travel", () => {
  assert.equal(moveToTarget(100, 150), 50);
  assert.equal(moveToTarget(200, 100), -50);
  assert.ok(Math.abs(moveToTarget(834.37, 1200)! - 43.82) < 0.01, "matches the +43.82% case");
});

test("moveToTarget refuses nonsense instead of returning NaN", () => {
  assert.equal(moveToTarget(0, 100), null);
  assert.equal(moveToTarget(-5, 100), null);
  assert.equal(moveToTarget(NaN, 100), null);
  assert.equal(moveToTarget(100, NaN), null);
});

test("countdown formats days, hours and minutes", () => {
  const now = 1_700_000_000_000;
  const at = (ms: number) => Math.floor((now + ms) / 1000);
  assert.equal(countdown(at(24 * 864e5 + 20 * 36e5 + 53 * 6e4), now), "24d 20h 53m");
  assert.equal(countdown(at(2 * 36e5 + 5 * 6e4), now), "2h 5m");
  assert.equal(countdown(at(7 * 6e4), now), "7m");
});

test("countdown reports a passed close rather than a negative", () => {
  const now = 1_700_000_000_000;
  assert.equal(countdown(Math.floor(now / 1000) - 60, now), "closed");
  assert.equal(countdown(null, now), null, "a market with no close time has no countdown");
});
