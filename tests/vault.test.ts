// Wallet-derived position keys.
//
// Getting this wrong loses money in a way no backup can undo: a secret that cannot
// be re-derived seals the position forever. So the properties are pinned here — the
// same wallet must reproduce the same secret, and no two slots may collide.

import { test } from "node:test";
import assert from "node:assert/strict";
import { derivedSecret, deriveMaster, NonDeterministicWallet } from "../src/lib/vault";
import { computeCommitment } from "../src/lib/doom";

const ADDR = "0x00074f705582c31dded56a8758674d3b8157dc65448bb91c7541ace36df239a1";
const M1 = "0x00611045be3eb6172f9ca2603c1dfbdb1319151178c8aa8f990b02363f12730f";
const M2 = "0x0205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4";

/** A wallet that signs deterministically, as the STARK curve does. */
const steady = (r: string, s: string) => ({
  signMessage: async () => [r, s],
});

test("the same signature always yields the same master key", async () => {
  const w = steady("0x1a2b3c", "0x4d5e6f");
  const a = await deriveMaster(w, ADDR);
  const b = await deriveMaster(w, ADDR);
  assert.equal(a, b);
});

test("a different signature yields a different master key", async () => {
  const a = await deriveMaster(steady("0x1a2b3c", "0x4d5e6f"), ADDR);
  const b = await deriveMaster(steady("0x1a2b3c", "0x4d5e70"), ADDR);
  assert.notEqual(a, b, "both halves of the signature must feed the key");
});

test("a wallet that signs randomly is refused, not used", async () => {
  let n = 0;
  const flaky = { signMessage: async () => [`0x${++n}`, "0x2"] };
  await assert.rejects(() => deriveMaster(flaky, ADDR), NonDeterministicWallet);
});

test("{r,s} signatures are accepted as well as arrays", async () => {
  const arr = await deriveMaster(steady("0x7", "0x9"), ADDR);
  const obj = await deriveMaster({ signMessage: async () => ({ r: "0x7", s: "0x9" }) }, ADDR);
  assert.equal(arr, obj);
});

test("a garbled signature throws instead of deriving a wrong key", async () => {
  await assert.rejects(() => deriveMaster({ signMessage: async () => "nonsense" }, ADDR));
});

test("secrets are reproducible from the master alone", async () => {
  const master = await deriveMaster(steady("0xaa", "0xbb"), ADDR);
  assert.equal(derivedSecret(master, M1, 0), derivedSecret(master, M1, 0));
});

test("slots and markets never collide", async () => {
  const master = await deriveMaster(steady("0xaa", "0xbb"), ADDR);
  const keys = new Set<string>();
  for (const m of [M1, M2]) for (let i = 0; i < 8; i++) keys.add(derivedSecret(master, m, i));
  assert.equal(keys.size, 16, "each market/slot pair must be its own secret");
  assert.notEqual(
    derivedSecret(master, M1, 0),
    derivedSecret(master, M2, 0),
    "the same slot on two markets must differ, or one claim would expose the other",
  );
});

test("two wallets never share a position", async () => {
  const a = await deriveMaster(steady("0x1", "0x2"), ADDR);
  const b = await deriveMaster(steady("0x3", "0x4"), ADDR);
  assert.notEqual(derivedSecret(a, M1, 0), derivedSecret(b, M1, 0));
});

test("derived secrets are valid felts and commit like any other", async () => {
  const master = await deriveMaster(steady("0xaa", "0xbb"), ADDR);
  for (let i = 0; i < 4; i++) {
    const sec = derivedSecret(master, M1, i);
    assert.match(sec, /^0x[0-9a-f]+$/, "must be a hex felt");
    assert.ok(BigInt(sec) < 2n ** 251n, "must fit the field");
    assert.match(computeCommitment(sec), /^0x[0-9a-f]+$/);
  }
});
