// The bet, stated as a payout rather than as a quote.
//
// Doom has always computed this. The trade panel just showed it the way the contract
// thinks about it — "you receive 1.76 shares", "return, after fee: -74.9%" — which is
// correct and which nobody reads as money. The same three numbers said plainly are
// "you pay 7, you get 1.76, that is 0.25x", and the second phrasing is the one that
// stops someone taking the trade.
//
// Nothing here is a new source of truth. `sharesWei` is the contract's own `quote()`,
// and the fee is the pool's own `get_fee_amount`; this only reframes them.

/** What one bet costs and pays, in the framing a bettor actually thinks in. */
export type Payout = {
  /** Stake plus the pool's flat fee — everything that leaves the wallet. */
  payWei: bigint;
  /** What comes back if this side wins. On a share market, one share pays 1 STRK. */
  getWei: bigint;
  /** getWei / payWei. Null when nothing is staked. */
  multiplier: number | null;
  /** Whether winning actually returns more than the bet cost. */
  profitable: boolean;
};

export function payoutSummary(
  stakeWei: bigint,
  sharesWei: bigint,
  feeWei: bigint | null,
): Payout {
  const payWei = stakeWei + (feeWei ?? 0n);
  const getWei = sharesWei;
  if (payWei <= 0n) {
    return { payWei, getWei, multiplier: null, profitable: false };
  }
  // Four decimal places of ratio is far more than the UI shows and keeps the
  // rounding away from the boundary that decides `profitable`.
  const multiplier = Number((getWei * 10000n) / payWei) / 10000;
  return { payWei, getWei, multiplier, profitable: getWei > payWei };
}

/**
 * How far spot has to travel to reach the strike, as a percentage.
 *
 * Positive means it has to rise. This is the number the market is really asking
 * about, and it is nowhere on the page today — a question reading "above $150,000"
 * means something very different at $109k spot than at $148k.
 */
export function moveToTarget(spot: number, threshold: number): number | null {
  if (!Number.isFinite(spot) || !Number.isFinite(threshold) || spot <= 0) return null;
  return ((threshold - spot) / spot) * 100;
}

/**
 * Time left, as "24d 20h 53m".
 *
 * Coarse on purpose: seconds tick, and a number that changes every second pulls the
 * eye away from the two numbers on this panel that decide anything.
 */
export function countdown(closesAtSec: number | null, nowMs: number): string | null {
  if (closesAtSec === null) return null;
  const ms = closesAtSec * 1000 - nowMs;
  if (ms <= 0) return "closed";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h ${mm}m`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}
