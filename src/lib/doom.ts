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
  /** Unix seconds after which staking stops. null on v1 markets, which had no deadline. */
  closesAt: number | null;
  isV2: boolean;
};

export async function readMarket(
  provider: ProviderInterface,
  address: string = MARKET,
): Promise<MarketState> {
  const call = (entrypoint: string) =>
    provider.callContract({ contractAddress: address, entrypoint, calldata: [] });

  const [pots, resolvedRaw, winnerRaw, questionRaw] = await Promise.all([
    call("get_pots"),
    call("is_resolved"),
    call("get_winning_outcome"),
    call("get_question"),
  ]);

  // v1 exposes get_resolver; v2 renamed it get_arbiter and added a close time.
  // Probing both keeps one board able to list either generation.
  const [resolverRaw, closesRaw] = await Promise.all([
    call("get_resolver").catch(() => call("get_arbiter")).catch(() => ["0x0"]),
    call("get_closes_at").catch(() => null),
  ]);

  const potNo = num.toBigInt(pots[0]);
  const potYes = num.toBigInt(pots[1]);
  const total = potNo + potYes;

  return {
    address,
    question: decodeByteArray(questionRaw as string[]),
    potNo,
    potYes,
    total,
    yesShare: total === 0n ? 0.5 : Number((potYes * 10000n) / total) / 10000,
    resolved: num.toBigInt(resolvedRaw[0]) === 1n,
    winningOutcome: Number(num.toBigInt(winnerRaw[0])),
    resolver: num.toHex(resolverRaw[0]),
    closesAt: closesRaw ? Number(num.toBigInt(closesRaw[0])) : null,
    isV2: closesRaw !== null,
  };
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

export function fmtStrk(wei: bigint, dp = 2): string {
  const whole = wei / 10n ** 18n;
  const frac = ((wei % 10n ** 18n) * 10n ** BigInt(dp)) / 10n ** 18n;
  return `${whole}.${frac.toString().padStart(dp, "0")}`;
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
