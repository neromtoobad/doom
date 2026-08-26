// What a position is worth, and how numbers reach the screen. Two of the cases here
// are bugs that shipped: fmtStrk truncated so a summary did not add up, and
// normalizeAddress did not exist, so a market opened from a URL failed to match the
// same market in the shipped list and the wrong one was displayed.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtStrk,
  parseStrk,
  pnlPct,
  positionValue,
  positionsCsv,
  OUTCOME_NO,
  OUTCOME_VOID,
  OUTCOME_YES,
  type MarketState,
  type SavedPosition,
} from "../src/lib/doom";
import { normalizeAddress } from "../src/lib/create";

const ONE = 10n ** 18n;

const market = (over: Partial<MarketState> = {}): MarketState => ({
  address: "0x1",
  question: "Will it?",
  potNo: 10n * ONE,
  potYes: 10n * ONE,
  total: 20n * ONE,
  yesShare: 0.5,
  resolved: false,
  winningOutcome: 255,
  resolver: "0x0",
  closesAt: 2_000_000_000,
  isV2: true,
  kind: "cpmm",
  priceYesBps: 5000,
  volume: 0n,
  ...over,
});

const pos = (over: Partial<SavedPosition> = {}): SavedPosition => ({
  market: "0x1",
  secret: "0xsecret",
  commitment: "0xcommit",
  outcome: OUTCOME_YES,
  amount: (5n * ONE).toString(),
  at: 0,
  ...over,
});

test("a share position marks at shares x side price", () => {
  const v = positionValue(
    pos({ shares: (7840000000000000000n).toString() }),
    market({ priceYesBps: 5475 }),
  )!;
  // 7.84 shares at 54.75c
  assert.equal(fmtStrk(v.value), "4.29");
  assert.equal(v.status, "open");
  assert.equal(pnlPct(v)!.toFixed(1), "-14.2");
});

test("the NO side is priced at one minus the YES price", () => {
  const v = positionValue(
    pos({ outcome: OUTCOME_NO, shares: (10n * ONE).toString() }),
    market({ priceYesBps: 5475 }),
  )!;
  assert.equal(fmtStrk(v.value), "4.53"); // 10 shares at 45.25c
});

test("a settled winner on a share market redeems one for one", () => {
  const v = positionValue(
    pos({ shares: (7n * ONE).toString() }),
    market({ resolved: true, winningOutcome: OUTCOME_YES }),
  )!;
  assert.equal(v.status, "won");
  assert.equal(v.value, 7n * ONE);
});

test("a loser is worth nothing and a void refunds the stake", () => {
  const lost = positionValue(pos(), market({ resolved: true, winningOutcome: OUTCOME_NO }))!;
  assert.equal(lost.status, "lost");
  assert.equal(lost.value, 0n);

  const void_ = positionValue(pos(), market({ resolved: true, winningOutcome: OUTCOME_VOID }))!;
  assert.equal(void_.status, "void");
  assert.equal(void_.value, 5n * ONE, "a void returns what was paid, not what it was worth");
});

test("a parimutuel winner takes its share of the whole pot", () => {
  // The real settled market: 1 STRK on NO, pot_no 1, pot_yes 3, NO wins.
  const v = positionValue(
    pos({ outcome: OUTCOME_NO, amount: ONE.toString(), shares: undefined }),
    market({
      kind: "parimutuel",
      resolved: true,
      winningOutcome: OUTCOME_NO,
      potNo: ONE,
      potYes: 3n * ONE,
      total: 4n * ONE,
    }),
  )!;
  assert.equal(v.value, 4n * ONE, "1 x 4 / 1 = the whole pot");
});

test("an empty winning pot cannot divide by zero", () => {
  const v = positionValue(
    pos({ outcome: OUTCOME_NO, shares: undefined }),
    market({ kind: "parimutuel", potNo: 0n, potYes: 0n, total: 0n }),
  )!;
  assert.equal(v.value, v.basis, "with no pot to divide, fall back to the stake");
});

test("fmtStrk rounds instead of truncating, and handles dp=0", () => {
  // 4.2924 against 5.00 has to report a 0.71 gap; truncating each separately
  // reported 0.70 and the summary visibly failed to add up.
  assert.equal(fmtStrk(4_292_400_000_000_000_000n), "4.29");
  assert.equal(fmtStrk(5n * ONE - 4_292_400_000_000_000_000n), "0.71");
  assert.equal(fmtStrk(ONE, 0), "1", "dp=0 used to render a trailing dot");
  assert.equal(fmtStrk(1_995_000_000_000_000_000n), "2.00");
});

test("parseStrk and fmtStrk round-trip", () => {
  for (const s of ["1", "0.05", "12.34", "1000"]) {
    assert.equal(Number(fmtStrk(parseStrk(s))), Number(s));
  }
});

test("addresses normalise to one form, however they arrive", () => {
  const padded = "0x026e1e64b1ed70983ff96d5f8605c0d3ad2ca13e4746e02875b0fa608932aa6b";
  const bare = "0x26e1e64b1ed70983ff96d5f8605c0d3ad2ca13e4746e02875b0fa608932aa6b";
  assert.equal(normalizeAddress(bare), padded);
  assert.equal(normalizeAddress(padded), padded);
  assert.equal(normalizeAddress(`  ${bare}  `), padded);
  assert.equal(normalizeAddress(padded).length, 66);
});

test("the CSV carries commitments and never a secret", () => {
  const csv = positionsCsv([
    { p: pos({ secret: "0xDEADBEEFSECRET", commitment: "0xc0ffee" }), m: market() },
  ]);
  assert.ok(csv.includes("0xc0ffee"), "the commitment identifies the position");
  assert.ok(
    !csv.toLowerCase().includes("deadbeefsecret"),
    "a spreadsheet export must never carry the thing that can spend the position",
  );
});

test("the CSV escapes a question containing a comma or a quote", () => {
  const csv = positionsCsv([
    { p: pos(), m: market({ question: 'Will "X", or Y, happen?' }) },
  ]);
  const header = csv.split("\n")[0].split(",").length;
  const row = csv.split("\n")[1];
  assert.ok(row.includes('""X""'), "quotes are doubled");
  // The embedded commas must not create extra columns once quoted fields are parsed.
  assert.equal(row.match(/"/g)!.length % 2, 0, "quotes are balanced");
  assert.ok(header > 0);
});
