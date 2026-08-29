import { test } from "node:test";
import assert from "node:assert/strict";
import { sizeBand, measureCrowd, describeBet } from "../src/lib/disclosure";
import type { BookEntry } from "../src/lib/doom";
import { OUTCOME_YES, OUTCOME_NO } from "../src/lib/doom";

const E = 10n ** 18n;
const entry = (strk: string): BookEntry => ({
  commitment: "0x1",
  outcome: 1,
  size: BigInt(Math.round(Number(strk) * 1e6)) * 10n ** 12n,
  shares: null,
  block: 1,
});

test("sizeBand rounds to the nearest whole STRK", () => {
  assert.equal(sizeBand(0n), 0);
  assert.equal(sizeBand(E), 1);
  assert.equal(sizeBand(E + E / 2n), 2); // .5 rounds up
  assert.equal(sizeBand(E + E / 2n - 1n), 1);
  assert.equal(sizeBand(40n * E), 40);
});

test("crowd counts existing positions in the same band", () => {
  const book = [entry("40"), entry("40.2"), entry("39.7"), entry("1")];
  const c = measureCrowd(book, 40n * E);
  assert.equal(c.positions, 4);
  assert.equal(c.band, 40);
  assert.equal(c.sameBand, 3, "40, 40.2 and 39.7 all round to 40");
});

test("an empty band is reported as empty, and a fuller one is named", () => {
  const book = [entry("40"), entry("40.1"), entry("7")];
  const c = measureCrowd(book, 3n * E);
  assert.equal(c.sameBand, 0);
  assert.equal(c.bestBand, 40);
  assert.equal(c.bestCount, 2);
});

test("no alternative is suggested when the chosen band is already the best", () => {
  const book = [entry("40"), entry("40.1"), entry("7")];
  const c = measureCrowd(book, 40n * E);
  assert.equal(c.sameBand, 2);
  assert.equal(c.bestBand, null, "nothing beats the band already chosen");
});

test("an empty book never claims company", () => {
  const c = measureCrowd([], 10n * E);
  assert.equal(c.positions, 0);
  assert.equal(c.sameBand, 0);
  assert.equal(c.bestBand, null);
});

test("the disclosure always carries the stake/claim linkability caveat", () => {
  for (const book of [[], [entry("40")], [entry("1"), entry("2")]]) {
    const d = describeBet({
      book,
      amountWei: 40n * E,
      outcome: OUTCOME_YES,
      market: "0xabc",
      poolFeeWei: 6n * E,
    });
    assert.ok(d.caveats.length > 0, "caveats are never empty");
    assert.ok(
      d.caveats.some((c) => c.includes("share one commitment")),
      "the stake/claim link is disclosed on every bet",
    );
  }
});

test("a lone size is disclosed as identifying", () => {
  const d = describeBet({
    book: [entry("40"), entry("40.1")],
    amountWei: 3n * E,
    outcome: OUTCOME_NO,
    market: "0xabc",
    poolFeeWei: 6n * E,
  });
  const text = d.caveats.join(" ");
  assert.match(text, /identifiable in the log by its amount alone/);
  assert.match(text, /near 40 STRK, which is more company/);
});

test("company is reported without the identifiability warning", () => {
  const d = describeBet({
    book: [entry("40"), entry("40.1")],
    amountWei: 40n * E,
    outcome: OUTCOME_YES,
    market: "0xabc",
    poolFeeWei: 6n * E,
  });
  const text = d.caveats.join(" ");
  assert.doesNotMatch(text, /identifiable in the log by its amount alone/);
  assert.match(text, /2 existing positions near 40 STRK/);
});

test("the side shown is the side being bet", () => {
  const y = describeBet({ book: [], amountWei: E, outcome: OUTCOME_YES, market: "0xa", poolFeeWei: null });
  const n = describeBet({ book: [], amountWei: E, outcome: OUTCOME_NO, market: "0xa", poolFeeWei: null });
  assert.equal(y.published.find((p) => p.label === "Which side")?.value, "YES");
  assert.equal(n.published.find((p) => p.label === "Which side")?.value, "NO");
});

test("the address is listed as withheld, never as published", () => {
  const d = describeBet({ book: [], amountWei: E, outcome: OUTCOME_YES, market: "0xa", poolFeeWei: null });
  assert.ok(d.withheld.some((w) => w.label === "Your address"));
  assert.ok(!d.published.some((p) => /address/i.test(p.label)));
});
