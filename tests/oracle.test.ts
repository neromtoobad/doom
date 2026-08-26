// The parser decides whether a market gets an oracle answer, and that answer appears
// next to a button that settles the market. A false positive is therefore worse than
// no answer at all: it would put a confident wrong outcome in front of someone about
// to propose it. These tests push on the false-positive side hardest.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQuestion,
  templateQuestion,
  templateRoundTrips,
  TEMPLATE_ASSETS,
} from "../src/lib/pragma";

test("reads the strike and direction from every market Doom has deployed", () => {
  const cases: [string, string, number, boolean][] = [
    ["Will BTC close above $150,000 on 2026-12-31?", "BTC", 150000, true],
    ["Will BTC close above $80,000 on 2026-09-30?", "BTC", 80000, true],
    ["Will BTC close above $100,000 on 2026-12-31?", "BTC", 100000, true],
    ["Will ETH close above $2,500 on 2026-09-30?", "ETH", 2500, true],
    ["Will ETH close above $3,000 on 2026-12-31?", "ETH", 3000, true],
    ["Will SOL close above $120 on 2026-12-31?", "SOL", 120, true],
    ["Will STRK close above $0.05 on 2026-12-31?", "STRK", 0.05, true],
  ];
  for (const [q, ticker, threshold, above] of cases) {
    const p = parseQuestion(q);
    assert.ok(p, `should parse: ${q}`);
    assert.equal(p!.ticker, ticker);
    assert.equal(p!.threshold, threshold, q);
    assert.equal(p!.above, above);
    assert.equal(p!.pair, `${ticker}/USD`);
  }
});

test("says nothing about questions that are not price claims", () => {
  const notPrices = [
    "Will Doom publish a demo video before 2026-08-30 23:59 UTC?",
    "Will strk20-hackathon PR #100 merge before 2026-08-25 23:59 UTC?",
    "Will it rain tomorrow?",
    "Who wins the election?",
    "",
    "Will the BTC conference sell out?", // names an asset, claims no price
  ];
  for (const q of notPrices) {
    assert.equal(parseQuestion(q), null, `must not invent an answer for: ${q}`);
  }
});

test("rejects a malformed or nonsensical strike", () => {
  assert.equal(parseQuestion("Will BTC close above $0 on 2026-12-31?"), null);
  assert.equal(parseQuestion("Will BTC close above $ on 2026-12-31?"), null);
});

test("below is not silently read as above", () => {
  const p = parseQuestion("Will ETH close below $2,000 on 2026-12-31?");
  assert.ok(p);
  assert.equal(p!.above, false, "direction drives the verdict; inverting it inverts settlement");
});

test("every template writes a question the parser reads back", () => {
  for (const asset of TEMPLATE_ASSETS)
    for (const above of [true, false])
      for (const strike of [0.05, 0.5, 1, 120, 2500, 100000, 1_234_567.5]) {
        assert.ok(
          templateRoundTrips(asset, above, strike, "2026-12-31"),
          `${asset} ${above ? "above" : "below"} ${strike} did not round-trip`,
        );
      }
});

test("template output is the exact shape the deployed markets already use", () => {
  assert.equal(
    templateQuestion("BTC", true, 100000, "2026-12-31"),
    "Will BTC close above $100,000 on 2026-12-31?",
  );
  assert.equal(
    templateQuestion("STRK", false, 0.05, "2026-09-30"),
    "Will STRK close below $0.05 on 2026-09-30?",
  );
});

test("templates only offer assets with a Pragma feed", () => {
  // SOL/USD reverts on mainnet. Offering it would produce a market whose panel can
  // never answer, which is the exact failure templates exist to prevent.
  assert.ok(!(TEMPLATE_ASSETS as readonly string[]).includes("SOL"));
  for (const a of TEMPLATE_ASSETS) assert.ok(parseQuestion(templateQuestion(a, true, 1, "2026-12-31")));
});
