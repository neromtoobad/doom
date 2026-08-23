// Doom market: reads, action bundles, and the secret that keys a position.
//
// The privacy model in one paragraph. A stake is recorded against
// poseidon(DOOM_POSITION_TAG, secret), never against an address — inside
// privacy_invoke the caller is the pool, so the contract cannot see the user even
// if it wanted to. The secret is generated in the browser, never sent anywhere on
// the buy leg, and revealed only when claiming. Lose it and the position is
// unreachable by anyone, including us.

import { hash, shortString, num, type ProviderInterface } from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import * as constants from "@/utils/constants";

/** Every deployed market. Each is its own instance of the same declared class. */
export const MARKETS: string[] = constants.DoomMarkets;
/** The first market, kept for the deploy tool and for single-market callers. */
export const MARKET = constants.DoomMarkets[0];
export const TOKEN = constants.addrSTRK;

/** Matches DOOM_POSITION_TAG in cairo/src/doom_market.cairo. Domain separation. */
const POSITION_TAG = shortString.encodeShortString("DOOM_POSITION_TAG:V1");

export const OUTCOME_NO = 0;
export const OUTCOME_YES = 1;
export const OUTCOME_VOID = 2;

/** MarketOperation variant indices, as the Cairo enum serializes them. */
const OP_BUY = "0x0";
const OP_CLAIM = "0x1";

/**
 * poseidon(tag, secret). Pinned against the Cairo implementation by
 * `commitment_matches_the_javascript_implementation` in the test suite — if these
 * two ever diverge, every claim fails with POSITION_NOT_FOUND.
 */
export function computeCommitment(secret: string): string {
  // Order matters and must mirror the Cairo span exactly: [tag, secret].
  return hash.computePoseidonHashOnElements([POSITION_TAG, secret]);
}

/** A random felt, from the browser's CSPRNG. Never derived from anything guessable. */
export function randomSecret(): string {
  const bytes = new Uint8Array(31); // < 2^248, comfortably inside the felt range
  crypto.getRandomValues(bytes);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export type MarketState = {
  address: string;
  question: string;
  potNo: bigint;
  potYes: bigint;
  total: bigint;
  /** 0..1. Defaults to an even split before any stake lands. */
  yesShare: number;
  resolved: boolean;
  winningOutcome: number;
  resolver: string;
  /** Unix seconds after which betting stops. null on v1 markets, which had no deadline. */
  closesAt: number | null;
  isV2: boolean;
  /** 'cpmm' markets price shares on a curve; 'parimutuel' ones only split a pot. */
  kind: "cpmm" | "parimutuel";
  /** Price of YES in basis points, 0..10000. Both sides always sum to 10000. */
  priceYesBps: number;
  /** Collateral bet, which is the market's volume. Equals total on parimutuel. */
  volume: bigint;
};

/**
 * Per-market caches.
 *
 * The board polls thirteen markets every fifteen seconds, and each read was ten
 * calls — roughly 120 to first paint and another 120 per cycle, against a key that
 * ships in the client bundle and is shared by every visitor. Most of that was
 * re-reading things that cannot change:
 *
 *   - question, closes_at and the arbiter are written once, in the constructor
 *   - a resolved market is final in every field this type carries
 *
 * So the immutable half is read once per market, and a settled market is not read
 * again at all.
 */
type StaticFields = {
  question: string;
  closesAt: number | null;
  resolver: string;
  isV2: boolean;
};
const staticCache = new Map<string, StaticFields>();
const settledCache = new Map<string, MarketState>();

/** Drop the caches — for tests, or after deploying a market at a reused address. */
export function clearMarketCache() {
  staticCache.clear();
  settledCache.clear();
}

export async function readMarket(
  provider: ProviderInterface,
  address: string = MARKET,
): Promise<MarketState> {
  const settled = settledCache.get(address);
  if (settled) return settled;

  const call = (entrypoint: string) =>
    provider.callContract({ contractAddress: address, entrypoint, calldata: [] });

  // get_pots exists only on the parimutuel generation. Share markets have reserves
  // instead, so this must not be allowed to reject the whole read.
  const [pots, resolvedRaw, winnerRaw] = await Promise.all([
    call("get_pots").catch(() => ["0x0", "0x0"]),
    call("is_resolved"),
    call("get_winning_outcome"),
  ]);

  // v1 exposes get_resolver; v2 renamed it get_arbiter and added a close time.
  // Probing both keeps one board able to list either generation. All three are
  // constructor-only, so this runs once per market rather than once per refresh.
  let statics = staticCache.get(address);
  if (!statics) {
    const [resolverRaw, closesRaw, questionRaw2] = await Promise.all([
      call("get_resolver").catch(() => call("get_arbiter")).catch(() => ["0x0"]),
      call("get_closes_at").catch(() => null),
      call("get_question"),
    ]);
    statics = {
      question: decodeByteArray(questionRaw2 as string[]),
      closesAt: closesRaw ? Number(num.toBigInt(closesRaw[0])) : null,
      resolver: num.toHex(resolverRaw[0]),
      isV2: closesRaw !== null,
    };
    staticCache.set(address, statics);
  }

  const potNo = num.toBigInt(pots[0]);
  const potYes = num.toBigInt(pots[1]);
  const total = potNo + potYes;

  // A CPMM market has no pots; it has reserves and a price. Probing get_price_yes
  // is how we tell the two generations apart.
  const [priceRaw, volumeRaw] = await Promise.all([
    call("get_price_yes").catch(() => null),
    call("get_volume").catch(() => null),
  ]);
  const isCpmm = priceRaw !== null;
  const reserves = isCpmm ? await call("get_reserves").catch(() => null) : null;

  const priceYesBps = isCpmm
    ? Number(num.toBigInt(priceRaw[0]))
    : total === 0n
      ? 5000
      : Number((potYes * 10000n) / total);

  const state: MarketState = {
    address,
    question: statics.question,
    potNo: reserves ? num.toBigInt(reserves[1]) : potNo,
    potYes: reserves ? num.toBigInt(reserves[0]) : potYes,
    total,
    yesShare: priceYesBps / 10000,
    resolved: num.toBigInt(resolvedRaw[0]) === 1n,
    winningOutcome: Number(num.toBigInt(winnerRaw[0])),
    resolver: statics.resolver,
    closesAt: statics.closesAt,
    isV2: statics.isV2,
    kind: isCpmm ? "cpmm" : "parimutuel",
    priceYesBps,
    volume: volumeRaw ? num.toBigInt(volumeRaw[0]) : total,
  };

  // Settled markets are final in every field above, so this is the last read.
  if (state.resolved) settledCache.set(address, state);
  return state;
}

/**
 * Ask the market maker what `amount` of collateral buys right now. Pinned against
 * the fill by `a_quote_matches_what_the_buy_actually_pays`, so the UI can promise a
 * number without lying about it.
 */
export async function quoteShares(
  provider: ProviderInterface,
  market: string,
  outcome: number,
  amountWei: bigint,
): Promise<bigint | null> {
  if (amountWei <= 0n) return 0n;
  try {
    const r = await provider.callContract({
      contractAddress: market,
      entrypoint: "quote",
      calldata: [num.toHex(outcome), num.toHex(amountWei)],
    });
    return num.toBigInt(r[0]);
  } catch {
    return null; // parimutuel markets have no quote
  }
}

/** Price in cents, the way a prediction market is normally read. */
export function priceCents(bps: number): string {
  return (bps / 100).toFixed(0);
}

/** ByteArray is [len, ...words, pending_word, pending_len]. */
function decodeByteArray(felts: string[]): string {
  const len = Number(num.toBigInt(felts[0]));
  const words = felts.slice(1, 1 + len);
  const pending = felts[1 + len];
  const pendingLen = Number(num.toBigInt(felts[2 + len]));
  let out = words.map((w) => shortString.decodeShortString(w)).join("");
  if (pendingLen > 0) out += shortString.decodeShortString(pending);
  return out;
}

/**
 * Stake. The pool withdraws to the market, then invokes it. No open note: the buy leg
 * returns an empty span because the funds stay in the market until settlement.
 */
export function buyActions(
  amountWei: bigint,
  outcome: number,
  commitment: string,
  market: string = MARKET,
) {
  return [
    {
      type: "withdraw",
      token: TOKEN,
      amount: num.toHex(amountWei),
      recipient: market,
    },
    {
      type: "invoke",
      contract: market,
      calldata: [OP_BUY, commitment, num.toHex(outcome), "0x0", "0x0"],
    },
  ] as WALLET_API.STRK20_ACTION[];
}

/**
 * Claim. A transfer of "OPEN" creates the note the payout lands in, and the wallet
 * substitutes ${openNoteIds[0]} during assembly — so that string must stay literal and
 * must not be hex-normalised.
 */
export function claimActions(secret: string, recipient: string, market: string = MARKET) {
  return [
    { type: "transfer", token: TOKEN, amount: "OPEN", recipient },
    {
      type: "invoke",
      contract: market,
      calldata: [OP_CLAIM, "0x0", "0x0", secret, "${openNoteIds[0]}"],
    },
  ] as WALLET_API.STRK20_ACTION[];
}

// ── local secret vault ──────────────────────────────────────────────────────────
// Convenience only. The secret is the position, so the UI also makes the user copy it.

const KEY = "doom:positions";

export type SavedPosition = {
  market: string;
  secret: string;
  /** Outcome shares received, on CPMM markets. Absent on older parimutuel bets. */
  shares?: string;
  commitment: string;
  outcome: number;
  amount: string;
  at: number;
  txHash?: string;
};

export function savePosition(p: SavedPosition) {
  const all = loadPositions();
  all.push(p);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function loadPositions(): SavedPosition[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedPosition[];
  } catch {
    return [];
  }
}

// ── backup ──────────────────────────────────────────────────────────────────────
// A commitment-keyed position lives in exactly one place: this browser. Clearing
// site data destroys the funds, and no amount of on-chain data can rebuild the
// secret. That is the cost of not having an account, so the least we can do is
// make the vault portable.

const BACKUP_TAG = "doom:positions:v1";

export function exportPositions(): string {
  return JSON.stringify(
    { tag: BACKUP_TAG, exportedAt: Date.now(), positions: loadPositions() },
    null,
    2,
  );
}

/** Merge a backup into this browser. Same secret on the same market is the same
 *  position, so re-importing a file is a no-op rather than a duplicate. */
export function importPositions(text: string): { added: number; skipped: number } {
  const parsed = JSON.parse(text) as unknown;
  const incoming =
    Array.isArray(parsed)
      ? (parsed as SavedPosition[])
      : ((parsed as { tag?: string; positions?: SavedPosition[] }).tag === BACKUP_TAG
          ? ((parsed as { positions?: SavedPosition[] }).positions ?? [])
          : null);
  if (!incoming) throw new Error("Not a Doom backup file.");

  const existing = loadPositions();
  const seen = new Set(existing.map((p) => `${p.market}:${p.secret}`));
  let added = 0;
  for (const p of incoming) {
    if (!p?.market || !p?.secret) continue;
    const k = `${p.market}:${p.secret}`;
    if (seen.has(k)) continue;
    seen.add(k);
    existing.push(p);
    added++;
  }
  localStorage.setItem(KEY, JSON.stringify(existing));
  return { added, skipped: incoming.length - added };
}

// ── what a position is worth ────────────────────────────────────────────────────

export type PositionValue = {
  /** Collateral paid. */
  basis: bigint;
  /** What it would pay if settled at the current price, or what it will pay now. */
  value: bigint;
  status: "open" | "won" | "lost" | "void";
};

/**
 * Mark a saved position against the live market.
 *
 * On a share market a position is worth `shares x side price`, because a winning
 * share redeems for exactly one collateral: at 55c, 7.84 YES shares are worth 4.31.
 * On the older parimutuel markets there are no shares, so the honest number is the
 * payout the current pots imply — which moves as other people bet, and is why the
 * share markets replaced them.
 */
export function positionValue(
  p: SavedPosition,
  m: MarketState | undefined,
): PositionValue | null {
  if (!m) return null;
  const basis = BigInt(p.amount);
  const shares = p.shares ? BigInt(p.shares) : null;

  if (m.resolved) {
    if (m.winningOutcome === OUTCOME_VOID) return { basis, value: basis, status: "void" };
    if (m.winningOutcome !== p.outcome) return { basis, value: 0n, status: "lost" };
    // Winner. A share redeems 1:1; a parimutuel stake takes its slice of the pot.
    if (shares) return { basis, value: shares, status: "won" };
    const winningPot = p.outcome === OUTCOME_YES ? m.potYes : m.potNo;
    const value = winningPot === 0n ? basis : (basis * m.total) / winningPot;
    return { basis, value, status: "won" };
  }

  if (m.kind === "cpmm" && shares) {
    const bps = BigInt(p.outcome === OUTCOME_YES ? m.priceYesBps : 10000 - m.priceYesBps);
    return { basis, value: (shares * bps) / 10000n, status: "open" };
  }

  const sidePot = p.outcome === OUTCOME_YES ? m.potYes : m.potNo;
  const value = sidePot === 0n ? basis : (basis * m.total) / sidePot;
  return { basis, value, status: "open" };
}

/** Signed percentage move from cost, for display. Null when there is no basis. */
export function pnlPct(v: PositionValue): number | null {
  if (v.basis === 0n) return null;
  return Number(((v.value - v.basis) * 10000n) / v.basis) / 100;
}

// ── depth ───────────────────────────────────────────────────────────────────────

/**
 * The market maker's curve, replicated exactly as the contract computes it:
 *
 *   shares_out = (r_side + a) - k / (r_other + a),  k = r_yes * r_no
 *
 * Integer division truncates in both places, so this agrees with `quote()` to the
 * wei. It exists so the size ladder can be drawn without one RPC call per rung;
 * the number the user actually commits to still comes from the contract.
 */
export function quoteLocal(
  rYes: bigint,
  rNo: bigint,
  outcome: number,
  amount: bigint,
): bigint {
  if (amount <= 0n || rYes <= 0n || rNo <= 0n) return 0n;
  const k = rYes * rNo;
  return outcome === OUTCOME_YES
    ? rYes + amount - k / (rNo + amount)
    : rNo + amount - k / (rYes + amount);
}

/** Average price paid per share, in cents, for a given size. */
export function avgPriceCents(amount: bigint, shares: bigint): number | null {
  if (shares <= 0n) return null;
  return Number((amount * 10000n) / shares) / 100;
}

export function fmtStrk(wei: bigint, dp = 2): string {
  // Round rather than truncate: a summary that shows 4.29 against 5.00 has to
  // report the gap as 0.71, and truncating each number separately made the row
  // fail to add up. Also handles dp=0, which used to render a trailing dot.
  const ONE = 10n ** 18n;
  const scale = 10n ** BigInt(dp);
  const scaled = (wei * scale + ONE / 2n) / ONE;
  const whole = scaled / scale;
  if (dp === 0) return whole.toString();
  return `${whole}.${(scaled % scale).toString().padStart(dp, "0")}`;
}

export function parseStrk(input: string): bigint {
  const [w, f = ""] = input.trim().split(".");
  const frac = (f + "000000000000000000").slice(0, 18);
  return BigInt(w || "0") * 10n ** 18n + BigInt(frac || "0");
}

// ── futarchy ────────────────────────────────────────────────────────────────────
// A DoomDecision wraps two conditional branch markets. The decision is whichever
// branch prices success higher at close — a pure function of two market prices,
// callable by anyone, with no authorized signer anywhere in it.

export const DECISIONS: string[] = constants.DoomDecisions;

export const DECISION_PENDING = 0;
export const DECISION_ADOPT = 1;
export const DECISION_REJECT = 2;
export const DECISION_INCONCLUSIVE = 3;

export type DecisionState = {
  address: string;
  proposal: string;
  adopt: MarketState;
  reject: MarketState;
  /** 0 pending · 1 adopt · 2 reject · 3 inconclusive */
  decision: number;
  /** Basis points recorded at decide() time; both zero before. */
  adoptBps: number;
  rejectBps: number;
  /** Latest close across both branches: decide() is callable after it. */
  closesAt: number | null;
};

export async function readDecision(
  provider: ProviderInterface,
  address: string,
): Promise<DecisionState> {
  const call = (entrypoint: string) =>
    provider.callContract({ contractAddress: address, entrypoint, calldata: [] });

  const [proposalRaw, branchesRaw, decisionRaw, sharesRaw] = await Promise.all([
    call("get_proposal"),
    call("get_branches"),
    call("get_decision"),
    call("get_final_shares"),
  ]);

  const adoptAddr = num.toHex(branchesRaw[0]);
  const rejectAddr = num.toHex(branchesRaw[1]);
  const [adopt, reject] = await Promise.all([
    readMarket(provider, adoptAddr),
    readMarket(provider, rejectAddr),
  ]);

  const closes =
    adopt.closesAt && reject.closesAt ? Math.max(adopt.closesAt, reject.closesAt) : null;

  return {
    address,
    proposal: decodeByteArray(proposalRaw as string[]),
    adopt,
    reject,
    decision: Number(num.toBigInt(decisionRaw[0])),
    adoptBps: Number(num.toBigInt(sharesRaw[0])),
    rejectBps: Number(num.toBigInt(sharesRaw[1])),
    closesAt: closes,
  };
}

/** decide() takes no arguments and anyone may call it. That is the whole point. */
export function decideCall(decision: string) {
  return [{ contractAddress: decision, entrypoint: "decide", calldata: [] }];
}

/** Live YES-share of a branch, for the pre-decision preview. */
export function branchShareBps(m: MarketState): number {
  return m.total === 0n ? 0 : Math.round(m.yesShare * 10000);
}

// ── price history ───────────────────────────────────────────────────────────────
// Every trade emits Bought{commitment, outcome, cost, shares, price_yes_bps}, so the
// market's whole price history is already on chain. No indexer, no backend: the
// chart is reconstructed from events the contract emitted as it repriced.

export type PricePoint = { block: number; bps: number; outcome: number; cost: bigint };

/** Selector for the Bought event, used to filter the log. */
const BOUGHT_KEY = hash.getSelectorFromName("Bought");

export async function readPriceHistory(
  provider: ProviderInterface,
  market: string,
  fromBlock = 13500000,
): Promise<PricePoint[]> {
  try {
    const res = await provider.getEvents({
      address: market,
      keys: [[BOUGHT_KEY]],
      from_block: { block_number: fromBlock },
      to_block: "latest",
      chunk_size: 100,
    });
    return (res.events ?? [])
      .map((e) => {
        // data = [outcome, cost, shares, price_yes_bps]
        const d = e.data ?? [];
        if (d.length < 4) return null;
        return {
          block: Number(e.block_number ?? 0),
          outcome: Number(num.toBigInt(d[0])),
          cost: num.toBigInt(d[1]),
          bps: Number(num.toBigInt(d[3])),
        };
      })
      .filter(Boolean) as PricePoint[];
  } catch {
    return [];
  }
}
