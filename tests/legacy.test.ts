import { test } from "node:test";
import assert from "node:assert/strict";
import { canonMarket, sameMarket } from "../src/lib/doom";

// The real market this regression stranded: 0x0205a8… as the constants file spells
// it, and 0x205a8… as num.toHex returns it.
const PADDED = "0x0205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4";
const STRIPPED = "0x205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4";

test("canonMarket pads to 0x + 64 hex", () => {
  assert.equal(canonMarket(STRIPPED), PADDED);
  assert.equal(canonMarket(PADDED), PADDED);
  assert.equal(canonMarket(PADDED).length, 66);
});

test("canonMarket is idempotent", () => {
  assert.equal(canonMarket(canonMarket(STRIPPED)), canonMarket(STRIPPED));
});

test("canonMarket tolerates whitespace and mixed case", () => {
  assert.equal(canonMarket(`  ${PADDED.toUpperCase().replace("0X", "0x")}  `), PADDED);
});

test("the stripped and padded spellings are the same market", () => {
  assert.ok(sameMarket(PADDED, STRIPPED), "this returning false is what hid the position");
  assert.ok(!sameMarket(PADDED, "0x1"), "different markets stay different");
});

test("sameMarket is false for missing operands rather than throwing", () => {
  assert.equal(sameMarket(undefined, PADDED), false);
  assert.equal(sameMarket(PADDED, undefined), false);
  assert.equal(sameMarket("", PADDED), false);
});

test("canonMarket returns junk unchanged instead of throwing", () => {
  assert.equal(canonMarket("not-an-address"), "not-an-address");
  assert.doesNotThrow(() => sameMarket("not-an-address", PADDED));
  assert.equal(sameMarket("not-an-address", PADDED), false);
});

test("a position saved under either spelling is found by the claim picker", () => {
  // The filter as the market page runs it.
  const pick = (saved: { market: string }[], address: string) =>
    saved.filter((p) => sameMarket(p.market, address));

  const saved = [{ market: STRIPPED }, { market: PADDED }, { market: "0xdead" }];
  assert.equal(pick(saved, PADDED).length, 2, "both spellings match the padded address");
  assert.equal(pick(saved, STRIPPED).length, 2, "and the stripped one");
});

test("old string equality is what failed, and is not what we ship", () => {
  assert.notEqual(STRIPPED, PADDED, "raw === was always going to miss");
  assert.ok(sameMarket(STRIPPED, PADDED));
});

// ── restore, across the two spellings ───────────────────────────────────────────
// The point of restore is a browser that does not already hold the position, so the
// dedupe has to compare felts too: a backup written when the app stored the stripped
// spelling must not import twice into a browser that now stores the padded one.

import { savePosition, loadPositions, importPositions, exportPositions } from "../src/lib/doom";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();

const pos = (market: string) => ({
  market,
  secret: "0xs1",
  commitment: "0xc",
  outcome: 1,
  amount: "3000000000000000000",
  at: 1,
});

test("a position is stored canonically however it was spelled", () => {
  localStorage.clear();
  savePosition(pos(STRIPPED));
  assert.equal(loadPositions()[0].market, PADDED, "padded on the way in");
});

test("restoring a stripped-spelling backup into a padded browser does not duplicate", () => {
  localStorage.clear();
  savePosition(pos(PADDED));
  // A backup file written by an older build, carrying the stripped spelling.
  const old = JSON.stringify({ tag: "doom:positions:v1", positions: [pos(STRIPPED)] });
  const { added, skipped } = importPositions(old);
  assert.equal(added, 0, "same felt, same secret — the same position");
  assert.equal(skipped, 1);
  assert.equal(loadPositions().length, 1, "not duplicated");
});

test("a legacy backup still restores into an empty browser", () => {
  localStorage.clear();
  const old = JSON.stringify({ tag: "doom:positions:v1", positions: [pos(STRIPPED)] });
  assert.equal(importPositions(old).added, 1);
  const got = loadPositions();
  assert.equal(got.length, 1);
  assert.ok(sameMarket(got[0].market, PADDED), "and is findable by the padded address");
});

test("export then restore is a no-op, whichever spelling was saved", () => {
  localStorage.clear();
  savePosition(pos(STRIPPED));
  const file = exportPositions();
  assert.equal(importPositions(file).added, 0, "re-importing a fresh export adds nothing");
  assert.equal(loadPositions().length, 1);
});
