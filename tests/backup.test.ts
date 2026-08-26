// The secret vault. Losing this browser's storage destroys the funds and no on-chain
// data can rebuild it, so export and restore are the only safety net that exists.
// Restore has to be idempotent, because the natural way to use a backup is to import
// the same file more than once.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  exportPositions,
  importPositions,
  loadPositions,
  savePosition,
} from "../src/lib/doom";
import { loadUserMarkets, removeUserMarket, saveUserMarket } from "../src/lib/create";

// A minimal localStorage. The library only touches it inside functions, so it only
// has to exist before a test calls one.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();

const p = (secret: string, market = "0xm1") => ({
  market,
  secret,
  commitment: "0xc",
  outcome: 1,
  amount: "1000000000000000000",
  at: 1,
});

beforeEach(() => localStorage.clear());

test("a backup round-trips every position", () => {
  savePosition(p("0xa"));
  savePosition(p("0xb"));
  const file = exportPositions();
  localStorage.clear();
  assert.equal(loadPositions().length, 0);

  assert.equal(importPositions(file).added, 2);
  assert.deepEqual(loadPositions().map((x) => x.secret).sort(), ["0xa", "0xb"]);
});

test("importing the same file twice adds nothing the second time", () => {
  savePosition(p("0xa"));
  const file = exportPositions();
  assert.equal(importPositions(file).added, 0, "already present");
  assert.equal(loadPositions().length, 1, "and must not duplicate");
});

test("restoring merges rather than replacing", () => {
  savePosition(p("0xa"));
  const file = exportPositions();
  localStorage.clear();
  savePosition(p("0xz"));
  importPositions(file);
  assert.deepEqual(loadPositions().map((x) => x.secret).sort(), ["0xa", "0xz"]);
});

test("the same secret on a different market is a different position", () => {
  savePosition(p("0xa", "0xm1"));
  const file = exportPositions();
  localStorage.clear();
  savePosition(p("0xa", "0xm2"));
  assert.equal(importPositions(file).added, 1);
  assert.equal(loadPositions().length, 2);
});

test("a file that is not a Doom backup is refused, not half-applied", () => {
  savePosition(p("0xa"));
  assert.throws(() => importPositions('{"tag":"something-else","positions":[]}'));
  assert.throws(() => importPositions("not json at all"));
  assert.equal(loadPositions().length, 1, "existing positions survive a bad import");
});

test("junk entries inside a backup are skipped", () => {
  const file = JSON.stringify({
    tag: "doom:positions:v1",
    positions: [p("0xa"), { market: "0xm" }, null, { secret: "0xb" }],
  });
  assert.equal(importPositions(file).added, 1, "only the complete entry counts");
});

test("a corrupt store reads as empty rather than throwing", () => {
  localStorage.setItem("doom:positions", "{{{not json");
  assert.deepEqual(loadPositions(), []);
});

test("pinned markets dedupe across address spellings", () => {
  const padded = "0x026e1e64b1ed70983ff96d5f8605c0d3ad2ca13e4746e02875b0fa608932aa6b";
  const bare = "0x26e1e64b1ed70983ff96d5f8605c0d3ad2ca13e4746e02875b0fa608932aa6b";
  saveUserMarket({ address: bare, question: "Q", mine: false, at: 1 });
  saveUserMarket({ address: padded, question: "Q", mine: false, at: 2 });
  assert.equal(loadUserMarkets().length, 1, "the same market pinned twice is one market");
  assert.equal(loadUserMarkets()[0].address, padded, "stored in canonical form");

  removeUserMarket(bare);
  assert.equal(loadUserMarkets().length, 0, "removal matches either spelling");
});
