// Creating a market from the browser.
//
// The share-market class is already declared on mainnet, so opening a market is a
// deploy and nothing more: no declare, no terminal, no key handling. That is the
// whole reason this is affordable enough to hand to anyone.

import { byteArray, num, type ProviderInterface } from "starknet";
import * as constants from "@/utils/constants";
import { readMarket } from "./doom";

/**
 * Class hash of `DoomPredictionMarket`, already declared on mainnet and shared by
 * every share market on the board.
 *
 * Verified against `cairo/target/dev/doom_DoomPredictionMarket.contract_class.json`
 * with `hash.computeSierraContractClassHash`, and against the class hash the live
 * BTC market reports. Rebuilding the contract changes this: recompute it and update
 * here, or the deploy will fail with an undeclared class.
 */
export const MARKET_CLASS_HASH =
  "0x59dc95c72ad09b4b7fd090351e0c152fdc17501f23fa44c92a1c1f0273953af";

/** The STRK20 privacy pool. Pinned at construction; it is the only allowed caller. */
export const POOL =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/**
 * Canonical address form: 0x + 64 hex, zero-padded.
 *
 * `num.toHex` strips leading zeros, so an address pasted or read from a URL comes
 * back shorter than the same address in the shipped list and the two never match as
 * object keys. Everything that indexes a market by address goes through here.
 */
export function normalizeAddress(a: string): string {
  return "0x" + num.toBigInt(a.trim()).toString(16).padStart(64, "0");
}

export type NewMarket = {
  question: string;
  /** Unix seconds. Betting stops here; settlement can be proposed after. */
  closesAt: number;
  /** Seconds a proposed outcome can be disputed before it can be finalised. */
  challengeWindow: number;
  /** Wei. What a proposer stakes, and what a disputer must match. */
  bond: bigint;
  /** Rules only a contested market. The creator, unless they nominate someone else. */
  arbiter: string;
};

/** Constructor args, in the order `DoomPredictionMarket::constructor` declares them. */
export function marketConstructorCalldata(m: NewMarket): string[] {
  const q = byteArray.byteArrayFromString(m.question);
  return [
    POOL,
    m.arbiter,
    constants.addrSTRK,
    m.closesAt.toString(),
    m.challengeWindow.toString(),
    m.bond.toString(),
    q.data.length.toString(),
    ...q.data.map((d) => d.toString()),
    q.pending_word.toString(),
    q.pending_word_len.toString(),
  ];
}

/**
 * Seed the market maker. `add_liquidity` pulls with `transfer_from`, so the approve
 * has to land first; both go in one multicall so the user signs once and cannot end
 * up with an approved-but-unseeded market.
 *
 * This is a public transaction on purpose. Liquidity is not a bet — the provider is
 * not taking a side, and pretending otherwise would spend anonymity for nothing.
 */
export function seedLiquidityCalls(market: string, amountWei: bigint) {
  return [
    {
      contractAddress: constants.addrSTRK,
      entrypoint: "approve",
      calldata: [market, num.toHex(amountWei), "0x0"],
    },
    {
      contractAddress: market,
      entrypoint: "add_liquidity",
      calldata: [num.toHex(amountWei)],
    },
  ];
}

// ── markets this browser knows about ────────────────────────────────────────────
// The board ships a curated list. Anything a user creates, or opens by link, is
// remembered here so it survives a reload. There is no global index: a market you
// were not shown and did not pin never appears.

const KEY = "doom:markets";

export type UserMarket = {
  address: string;
  /** Cached for the board; the contract remains the source of truth. */
  question: string;
  /** True when this browser deployed it. */
  mine: boolean;
  at: number;
};

export function loadUserMarkets(): UserMarket[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as UserMarket[];
    return raw.filter((m) => m && typeof m.address === "string");
  } catch {
    return [];
  }
}

export function saveUserMarket(m: UserMarket) {
  const all = loadUserMarkets();
  const entry = { ...m, address: normalizeAddress(m.address) };
  if (all.some((x) => normalizeAddress(x.address) === entry.address)) return;
  all.push(entry);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function removeUserMarket(address: string) {
  const target = normalizeAddress(address);
  localStorage.setItem(
    KEY,
    JSON.stringify(loadUserMarkets().filter((m) => normalizeAddress(m.address) !== target)),
  );
}

/**
 * Confirm an address really is a readable Doom market before pinning it. Cheaper
 * than letting a typo sit on the board as a permanently loading card.
 */
export async function verifyMarket(
  provider: ProviderInterface,
  address: string,
): Promise<{ ok: true; question: string } | { ok: false; why: string }> {
  let addr: string;
  try {
    addr = normalizeAddress(address);
  } catch {
    return { ok: false, why: "That is not a contract address." };
  }
  try {
    const m = await readMarket(provider, addr);
    if (!m.question) return { ok: false, why: "No market question at that address." };
    return { ok: true, question: m.question };
  } catch {
    return { ok: false, why: "Nothing at that address answers like a Doom market." };
  }
}
