// Reading Pragma, Starknet's oracle, straight from the browser.
//
// Doom's markets settle by human proposal backed by a bond, and nothing here
// changes that: the contracts were deployed without an oracle binding and cannot
// gain one. What this does is remove the excuse for getting it wrong. For a price
// question the panel shows the median the oracle is publishing right now, says
// which way that resolves, and pre-fills the proposal.
//
// So settlement is oracle-INFORMED, not oracle-ENFORCED. Enforcing it on chain
// would mean a new contract class. Saying otherwise would be a lie a judge could
// check in one call.

import { num, shortString, type ProviderInterface } from "starknet";

/** Pragma's mainnet oracle aggregator. */
export const PRAGMA_ORACLE =
  "0x2a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b";

/** `AggregationMode::Median`. */
const MEDIAN = "0x0";

export type Median = {
  pair: string;
  price: number;
  decimals: number;
  /** Unix seconds of the last publisher update. */
  updatedAt: number;
  sources: number;
};

/**
 * `get_data_median(AggregationMode, DataType::SpotEntry(pair_id))` returns
 * `[price, decimals, last_updated_timestamp, num_sources_aggregated, ...]`.
 *
 * Not every pair is published: SOL/USD reverts on mainnet today, so a miss here is
 * normal and the caller shows nothing rather than guessing.
 */
export async function readMedian(
  provider: ProviderInterface,
  pair: string,
): Promise<Median | null> {
  try {
    const r = await provider.callContract({
      contractAddress: PRAGMA_ORACLE,
      entrypoint: "get_data_median",
      calldata: [MEDIAN, num.toHex(BigInt(shortString.encodeShortString(pair)))],
    });
    const decimals = Number(num.toBigInt(r[1]));
    const price = Number(num.toBigInt(r[0])) / 10 ** decimals;
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      pair,
      price,
      decimals,
      updatedAt: Number(num.toBigInt(r[2])),
      sources: Number(num.toBigInt(r[3])),
    };
  } catch {
    return null; // pair not published, or the oracle is unreachable
  }
}

export type Parsed = {
  /** The Pragma pair id, e.g. "BTC/USD". */
  pair: string;
  ticker: string;
  threshold: number;
  /** True when the question asks whether the price ends up above the threshold. */
  above: boolean;
};

/**
 * Pull a price claim out of a market question.
 *
 * Deliberately strict. It only matches the shape Doom's own price markets use, and
 * returns null for anything else, because a wrong parse would put a confident and
 * incorrect answer next to a settlement button.
 */
export function parseQuestion(question: string): Parsed | null {
  const m = question.match(
    /\b(BTC|ETH|SOL|STRK|BNB|XRP|DOGE|AVAX|LINK)\b[^$]*?\b(above|below)\b\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
  );
  if (!m) return null;
  const threshold = Number(m[3].replace(/,/g, ""));
  if (!Number.isFinite(threshold) || threshold <= 0) return null;
  return {
    ticker: m[1].toUpperCase(),
    pair: `${m[1].toUpperCase()}/USD`,
    threshold,
    above: m[2].toLowerCase() === "above",
  };
}

/**
 * Assets Doom can offer a template for.
 *
 * The list is a promise: a market built from a template will parse, and its panel
 * will read a live feed. So it holds only pairs Pragma actually publishes — SOL/USD
 * reverts on mainnet today, which is exactly the kind of thing that would otherwise
 * ship a template producing a market nothing can settle.
 */
export const TEMPLATE_ASSETS = ["BTC", "ETH", "STRK"] as const;
export type TemplateAsset = (typeof TEMPLATE_ASSETS)[number];

/**
 * Build a question in the shape `parseQuestion` understands.
 *
 * Templates exist so the two halves cannot drift: whatever this writes, the oracle
 * panel can read back. `templateRoundTrips` is the assertion of that, and the create
 * page refuses to offer a template that fails it.
 */
export function templateQuestion(
  asset: TemplateAsset,
  above: boolean,
  strike: number,
  isoDate: string,
): string {
  const pretty = strike >= 1 ? strike.toLocaleString("en-US") : String(strike);
  return `Will ${asset} close ${above ? "above" : "below"} $${pretty} on ${isoDate}?`;
}

/** True when a generated question parses back to the inputs that made it. */
export function templateRoundTrips(
  asset: TemplateAsset,
  above: boolean,
  strike: number,
  isoDate: string,
): boolean {
  const p = parseQuestion(templateQuestion(asset, above, strike, isoDate));
  return !!p && p.ticker === asset && p.above === above && p.threshold === strike;
}

export type Verdict = Parsed & {
  median: Median;
  /** What the oracle's current reading implies, if the market closed right now. */
  answer: "YES" | "NO";
};

/** The oracle's current answer to a market question, or null if it cannot say. */
export async function oracleVerdict(
  provider: ProviderInterface,
  question: string,
): Promise<Verdict | null> {
  const parsed = parseQuestion(question);
  if (!parsed) return null;
  const median = await readMedian(provider, parsed.pair);
  if (!median) return null;
  const over = median.price > parsed.threshold;
  return { ...parsed, median, answer: (parsed.above ? over : !over) ? "YES" : "NO" };
}

export type Settlement = {
  bond: bigint;
  /** 255 = OUTCOME_NONE, meaning nobody has proposed yet. */
  proposedOutcome: number;
  proposedAt: number;
  proposer: string;
  disputed: boolean;
  challengeWindow: number;
};

/**
 * Bond and proposal state, read only for the market being looked at.
 *
 * These are deliberately not part of the board read: the board polls thirteen
 * markets on a timer and only one of them is ever on screen.
 */
export async function readSettlement(
  provider: ProviderInterface,
  market: string,
): Promise<Settlement | null> {
  try {
    const call = (entrypoint: string) =>
      provider.callContract({ contractAddress: market, entrypoint, calldata: [] });
    const [bondRaw, prop] = await Promise.all([call("get_bond"), call("get_proposal")]);
    // (outcome, proposed_at, proposer, disputer, challenge_window)
    return {
      bond: num.toBigInt(bondRaw[0]),
      proposedOutcome: Number(num.toBigInt(prop[0])),
      proposedAt: Number(num.toBigInt(prop[1])),
      proposer: num.toHex(prop[2]),
      disputed: num.toBigInt(prop[3]) !== 0n,
      challengeWindow: Number(num.toBigInt(prop[4])),
    };
  } catch {
    return null; // first-generation markets have neither
  }
}

/**
 * Propose an outcome. The bond is pulled with `transfer_from`, so an approve has to
 * land first — but `pull` returns early on zero, so a bondless market needs only the
 * one call and should not ask for a pointless approval.
 */
export function proposeCalls(market: string, outcome: number, bondWei: bigint) {
  const propose = {
    contractAddress: market,
    entrypoint: "propose",
    calldata: [num.toHex(outcome)],
  };
  if (bondWei <= 0n) return [propose];
  return [
    {
      contractAddress:
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
      entrypoint: "approve",
      calldata: [market, num.toHex(bondWei), "0x0"],
    },
    propose,
  ];
}

export function finalizeCall(market: string) {
  return [{ contractAddress: market, entrypoint: "finalize", calldata: [] }];
}
