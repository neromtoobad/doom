// Positions that belong to a wallet rather than to a browser.
//
// The original design put the secret in localStorage, which made a position a
// property of the machine you bet from: clear your site data, or open the site on
// your phone, and the position was gone. That is the wrong noun. A position should
// belong to whoever controls the wallet.
//
// So the secret is derived instead of stored. Sign one fixed message, hash the
// signature into a master key, and derive every position secret from it. The same
// wallet reproduces the same secrets on any device, and nothing has to be saved
// anywhere — not here, not on a server.
//
// None of this changes what the chain sees. Positions are still keyed by
// poseidon(tag, secret) and the pool is still the caller, so no address is recorded.
// The link from wallet to position exists only inside the browser doing the maths,
// and is never transmitted.

import { hash, num, type ProviderInterface, type TypedData } from "starknet";
import { POSITION_TAG, computeCommitment, type SavedPosition } from "./doom";

/**
 * The message whose signature becomes the master key.
 *
 * It must never change. A different message derives different secrets, which would
 * silently orphan every position ever made with the old one.
 */
export const VAULT_MESSAGE: TypedData = {
  types: {
    StarknetDomain: [
      { name: "name", type: "shortstring" },
      { name: "version", type: "shortstring" },
      { name: "chainId", type: "shortstring" },
      { name: "revision", type: "shortstring" },
    ],
    Vault: [
      { name: "purpose", type: "shortstring" },
      { name: "version", type: "shortstring" },
    ],
  },
  primaryType: "Vault",
  domain: { name: "Doom", version: "1", chainId: "SN_MAIN", revision: "1" },
  message: { purpose: "position key", version: "1" },
};

/** Signature → one felt. Both parts, so neither half alone is the key. */
function masterFromSignature(sig: string[]): string {
  return hash.computePoseidonHashOnElements([
    POSITION_TAG,
    ...sig.slice(0, 2).map((x) => num.toHex(num.toBigInt(x))),
  ]);
}

/**
 * The master key for this session.
 *
 * Held in memory only. It can spend every position it derives, so it is never
 * written to disk — a reload asks the wallet again, which is the right trade for a
 * key of that power. Client-side navigation keeps it, so moving between the board
 * and the portfolio does not re-prompt.
 */
let cached: string | null = null;

export function cachedMaster(): string | null {
  return cached;
}

export function forgetMaster(): void {
  cached = null;
}

/** Derive once per session and remember it in memory. */
export async function unlock(
  signer: { signMessage: (t: TypedData, a: string) => Promise<unknown> },
  address: string,
): Promise<string> {
  if (cached) return cached;
  cached = await deriveMaster(signer, address);
  return cached;
}

/**
 * The position this wallet holds on one market, if any.
 *
 * Used by the claim panel so a winner never has to produce a key by hand: the app
 * derives the same secret it bet with and spends it.
 */
export async function findPosition(
  provider: ProviderInterface,
  master: string,
  market: string,
  depth = 8,
): Promise<{ secret: string; commitment: string; outcome: number; amount: bigint } | null> {
  for (let i = 0; i < depth; i++) {
    const secret = derivedSecret(master, market, i);
    const commitment = computeCommitment(secret);
    try {
      const r = await provider.callContract({
        contractAddress: market,
        entrypoint: "get_position",
        calldata: [commitment],
      });
      const shares = num.toBigInt(r[1] ?? "0x0");
      const cost = num.toBigInt(r[2] ?? "0x0");
      const amount = cost > 0n ? cost : shares;
      if (amount > 0n) {
        return { secret, commitment, outcome: Number(num.toBigInt(r[0] ?? "0x0")), amount };
      }
    } catch {
      return null;
    }
  }
  return null;
}

export class NonDeterministicWallet extends Error {
  constructor() {
    super(
      "This wallet signs the same message differently each time, so a position key " +
        "cannot be rebuilt from it. Your positions will stay in this browser — " +
        "export a backup.",
    );
  }
}

/**
 * Derive the master key, and refuse to return one that cannot be reproduced.
 *
 * The STARK curve signs deterministically, but the wallet is the one signing and a
 * wallet could add randomness of its own. If it does, every bet would be sealed with
 * a key nothing could regenerate, so this signs twice and compares before handing
 * anything back. Two prompts once is a cheap price for not losing funds silently.
 */
export async function deriveMaster(
  signer: { signMessage: (t: TypedData, a: string) => Promise<unknown> },
  address: string,
): Promise<string> {
  const once = await signer.signMessage(VAULT_MESSAGE, address);
  const twice = await signer.signMessage(VAULT_MESSAGE, address);
  const a = masterFromSignature(toFelts(once));
  const b = masterFromSignature(toFelts(twice));
  if (a !== b) throw new NonDeterministicWallet();
  return a;
}

/** Wallets return a signature as an array, or as {r,s}. Normalise both. */
function toFelts(sig: unknown): string[] {
  if (Array.isArray(sig)) return sig.map(String);
  const o = sig as { r?: unknown; s?: unknown };
  if (o?.r !== undefined && o?.s !== undefined) return [String(o.r), String(o.s)];
  throw new Error("Unrecognised signature shape from the wallet.");
}

/**
 * The secret for the `index`-th position this wallet takes on `market`.
 *
 * Keyed by market as well as index so the same slot on two markets is two different
 * secrets — otherwise one revealed claim would expose a position elsewhere.
 */
export function derivedSecret(master: string, market: string, index: number): string {
  return hash.computePoseidonHashOnElements([
    master,
    num.toHex(num.toBigInt(market)),
    num.toHex(index),
  ]);
}

/**
 * Find the positions a master key owns, by asking the contracts.
 *
 * There is no index to read: a commitment reveals nothing about who made it, which
 * is the point. So candidates are derived and tested. `get_position` returns an empty
 * record for a commitment that never bet, and a real one for a commitment that did.
 */
export async function recoverPositions(
  provider: ProviderInterface,
  master: string,
  markets: string[],
  depth = 4,
): Promise<SavedPosition[]> {
  const found: SavedPosition[] = [];
  await Promise.all(
    markets.map(async (market) => {
      for (let i = 0; i < depth; i++) {
        const secret = derivedSecret(master, market, i);
        const commitment = computeCommitment(secret);
        try {
          const r = await provider.callContract({
            contractAddress: market,
            entrypoint: "get_position",
            calldata: [commitment],
          });
          // Position { outcome, shares, cost, claimed } — a cost of zero never bet.
          const shares = num.toBigInt(r[1] ?? "0x0");
          const cost = num.toBigInt(r[2] ?? "0x0");
          const amount = cost > 0n ? cost : shares;
          if (amount === 0n) continue;
          found.push({
            market,
            secret,
            commitment,
            outcome: Number(num.toBigInt(r[0] ?? "0x0")),
            amount: amount.toString(),
            shares: shares > 0n ? shares.toString() : undefined,
            at: Date.now(),
          });
        } catch {
          // Older markets expose a different shape; nothing to recover there.
          break;
        }
      }
    }),
  );
  return found;
}
