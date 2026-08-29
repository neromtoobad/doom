// What a bet publishes, and what it does not.
//
// Doom's claim is "visible odds, invisible bettors". That is a claim about a
// boundary, and a boundary nobody can see is indistinguishable from a marketing
// line. This module draws it explicitly, for the specific bet in the box, before
// it is signed — including the parts that are unflattering.
//
// It is grounded in what the two legs of a bet actually do rather than in what the
// pitch says. `buyActions` withdraws from the pool to the market and then invokes
// the market inside `privacy_invoke`; the market emits
// `Staked { #[key] commitment, outcome, amount, pot_no, pot_yes }`. So the amount
// is public twice over and the side is public once, while the address never appears
// in either leg — inside the invoke the caller is the pool.
//
// The anonymity numbers are measured, not asserted. They come from the market's own
// event log, and when the crowd is a crowd of one this says so.

import type { BookEntry } from "./doom";
import { fmtStrk, OUTCOME_YES } from "./doom";

const ONE = 10n ** 18n;

/** The whole-STRK bucket a size falls in. Sizes are public, so this is observable. */
export function sizeBand(wei: bigint): number {
  return Number((wei + ONE / 2n) / ONE);
}

export type Crowd = {
  /** Positions already in this market. */
  positions: number;
  /** The band this bet would join. */
  band: number;
  /** Positions already standing in that band. */
  sameBand: number;
  /** The most populated band in the market, when one beats the chosen band. */
  bestBand: number | null;
  bestCount: number;
};

/**
 * How much company this bet would have, by size, in the public log.
 *
 * Size is the one attribute of a Doom position that is always published, so it is
 * the one an observer clusters on. A position sharing its size with several others
 * is one of several; a position alone at its size is identified by its amount.
 */
export function measureCrowd(book: BookEntry[], amountWei: bigint): Crowd {
  const band = sizeBand(amountWei);
  const counts = new Map<number, number>();
  for (const e of book) {
    const b = sizeBand(e.size);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const sameBand = counts.get(band) ?? 0;

  let bestBand: number | null = null;
  let bestCount = 0;
  for (const [b, c] of counts) {
    if (c > bestCount || (c === bestCount && bestBand !== null && b < bestBand)) {
      bestBand = b;
      bestCount = c;
    }
  }
  // Only worth naming if it is genuinely better company than the chosen size.
  if (bestBand === band || bestCount <= sameBand) {
    bestBand = null;
    bestCount = 0;
  }
  return { positions: book.length, band, sameBand, bestBand, bestCount };
}

export type Disclosure = {
  published: { label: string; value: string }[];
  withheld: { label: string; value: string }[];
  /** The uncomfortable half. Never empty. */
  caveats: string[];
  crowd: Crowd;
};

/**
 * The full disclosure for one prospective bet.
 *
 * `caveats` is the part that matters. Anyone can list what a private system hides;
 * the honest thing is to list what it still gives away, which is why this function
 * cannot return an empty caveat list — the commitment linking a stake to its own
 * claim is a property of the design, present on every bet ever placed here.
 */
export function describeBet(opts: {
  book: BookEntry[];
  amountWei: bigint;
  outcome: number;
  market: string;
  poolFeeWei: bigint | null;
}): Disclosure {
  const { book, amountWei, outcome, market, poolFeeWei } = opts;
  const crowd = measureCrowd(book, amountWei);
  const side = outcome === OUTCOME_YES ? "YES" : "NO";

  const published = [
    { label: "Which market", value: `${market.slice(0, 10)}…${market.slice(-4)}` },
    { label: "Which side", value: side },
    { label: "How much", value: `${fmtStrk(amountWei)} STRK` },
    { label: "The odds it moves them to", value: "recomputed and public" },
    { label: "When", value: "the block timestamp" },
    { label: "A commitment hash", value: "poseidon(tag, secret)" },
  ];

  const withheld = [
    { label: "Your address", value: "inside the invoke the caller is the pool" },
    { label: "The link to you", value: "the position is keyed by commitment" },
    { label: "Your other positions", value: "each uses a separately derived secret" },
  ];

  const caveats: string[] = [
    "Your stake and your eventual claim share one commitment, so an observer can " +
      "link those two events to each other. Neither links to you.",
  ];

  if (crowd.sameBand === 0) {
    caveats.push(
      `No position in this market is near ${crowd.band} STRK. Size is public, so this ` +
        `bet would be identifiable in the log by its amount alone` +
        (crowd.bestBand !== null
          ? `. ${crowd.bestCount} position${crowd.bestCount === 1 ? " sits" : "s sit"} near ` +
            `${crowd.bestBand} STRK, which is more company.`
          : "."),
    );
  } else {
    caveats.push(
      `${crowd.sameBand} existing position${crowd.sameBand === 1 ? "" : "s"} ` +
        `near ${crowd.band} STRK, so the amount alone does not single this out.`,
    );
  }

  caveats.push(
    "The pool pays the market directly, so the transfer and its amount are visible " +
      "on chain — from the pool's balance, which is shared, not from your address.",
  );

  if (poolFeeWei !== null && poolFeeWei > 0n) {
    caveats.push(
      `Timing is the weak link this cannot fix: shield a distinctive amount and bet ` +
        `it moments later and the two correlate. Shield ahead of time, and in a ` +
        `round number.`,
    );
  }

  return { published, withheld, caveats, crowd };
}
