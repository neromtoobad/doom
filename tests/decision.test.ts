// The futarchy read path, end to end, against a provider that answers exactly what
// the Cairo contracts return.
//
// Nothing is deployed yet, so this path has never run against a real DoomDecision.
// The day it does will be deploy day, which is the worst possible time to discover
// that an enum variant or a ByteArray is being read wrong. These stub the RPC and
// check the parse.

import { test } from "node:test";
import assert from "node:assert/strict";
import { byteArray, num } from "starknet";
import {
  readDecision,
  branchShareBps,
  decideCall,
  DECISION_PENDING,
  DECISION_ADOPT,
  DECISION_REJECT,
  DECISION_INCONCLUSIVE,
  clearMarketCache,
  type MarketState,
} from "../src/lib/doom";

const E = 10n ** 18n;
const hex = (n: bigint | number | string) => "0x" + BigInt(n).toString(16);

/** A ByteArray as Cairo serialises it. */
function baFelts(s: string): string[] {
  const b = byteArray.byteArrayFromString(s);
  return [
    hex(b.data.length),
    ...b.data.map((d) => hex(BigInt(String(d)))),
    hex(BigInt(String(b.pending_word))),
    hex(String(b.pending_word_len)),
  ];
}

/** A DoomMarketV2 branch: pots, a close time, unresolved. */
function branch(question: string, potNo: bigint, potYes: bigint, closesAt: number) {
  return {
    get_pots: [hex(potNo), hex(potYes)],
    is_resolved: ["0x0"],
    get_winning_outcome: ["0x0"],
    get_arbiter: ["0x2002"],
    get_resolver: ["0x2002"],
    get_closes_at: [hex(closesAt)],
    get_question: baFelts(question),
    // v2 branches are parimutuel: no CPMM price or volume entrypoint.
    get_price_yes: null,
    get_volume: null,
  } as Record<string, string[] | null>;
}

const ADOPT = "0x0aaa";
const REJECT = "0x0bbb";
const DEC = "0x0ddd";
const CLOSES = 1_800_000_000;

function makeProvider(opts: {
  decision: number;
  adoptBps: number;
  rejectBps: number;
  adoptPots: [bigint, bigint];
  rejectPots: [bigint, bigint];
  proposal?: string;
}) {
  const tables: Record<string, Record<string, string[] | null>> = {
    [DEC]: {
      get_proposal: baFelts(opts.proposal ?? "Should the DAO fund proposal X?"),
      get_branches: [ADOPT, REJECT],
      get_decision: [hex(opts.decision)],
      get_final_shares: [hex(opts.adoptBps), hex(opts.rejectBps)],
    },
    [ADOPT]: branch("If adopted, will the metric be met?", ...opts.adoptPots, CLOSES),
    [REJECT]: branch("If rejected, will the metric be met?", ...opts.rejectPots, CLOSES + 60),
  };
  return {
    callContract: async ({
      contractAddress,
      entrypoint,
    }: {
      contractAddress: string;
      entrypoint: string;
    }) => {
      const key = "0x" + num.toBigInt(contractAddress).toString(16).padStart(4, "0");
      const t = tables[key] ?? tables[contractAddress];
      if (!t) throw new Error(`no stub for ${contractAddress}`);
      const v = t[entrypoint];
      if (v === undefined || v === null) throw new Error(`no entrypoint ${entrypoint}`);
      return v;
    },
  } as never;
}

test("a pending decision reads both branches and reports pending", async () => {
  clearMarketCache();
  const p = makeProvider({
    decision: DECISION_PENDING,
    adoptBps: 0,
    rejectBps: 0,
    adoptPots: [1n * E, 4n * E],
    rejectPots: [4n * E, 1n * E],
  });
  const d = await readDecision(p, DEC);
  assert.equal(d.decision, DECISION_PENDING);
  assert.equal(d.proposal, "Should the DAO fund proposal X?");
  assert.equal(d.adoptBps, 0, "shares are zero until decide() runs");
  assert.equal(d.rejectBps, 0);
  assert.equal(d.adopt.total, 5n * E);
  assert.equal(d.reject.total, 5n * E);
});

test("closesAt is the later of the two branches — decide() needs both shut", async () => {
  clearMarketCache();
  const p = makeProvider({
    decision: DECISION_PENDING,
    adoptBps: 0,
    rejectBps: 0,
    adoptPots: [1n * E, 1n * E],
    rejectPots: [1n * E, 1n * E],
  });
  const d = await readDecision(p, DEC);
  assert.equal(d.closesAt, CLOSES + 60, "the later close governs");
});

test("a decided contract reports the recorded shares, not the live ones", async () => {
  clearMarketCache();
  const p = makeProvider({
    decision: DECISION_ADOPT,
    adoptBps: 8000,
    rejectBps: 2000,
    adoptPots: [1n * E, 4n * E],
    rejectPots: [4n * E, 1n * E],
  });
  const d = await readDecision(p, DEC);
  assert.equal(d.decision, DECISION_ADOPT);
  assert.equal(d.adoptBps, 8000);
  assert.equal(d.rejectBps, 2000);
});

test("every Decision variant maps to the constant the panel switches on", async () => {
  for (const v of [DECISION_PENDING, DECISION_ADOPT, DECISION_REJECT, DECISION_INCONCLUSIVE]) {
    clearMarketCache();
    const p = makeProvider({
      decision: v,
      adoptBps: 0,
      rejectBps: 0,
      adoptPots: [0n, 0n],
      rejectPots: [0n, 0n],
    });
    const d = await readDecision(p, DEC);
    assert.equal(d.decision, v, `variant ${v} must round-trip`);
  }
});

test("branchShareBps previews the live YES share before any decision", () => {
  const m = (no: bigint, yes: bigint): MarketState =>
    ({ total: no + yes, yesShare: no + yes === 0n ? 0 : Number(yes) / Number(no + yes) }) as MarketState;
  assert.equal(branchShareBps(m(1n * E, 4n * E)), 8000);
  assert.equal(branchShareBps(m(4n * E, 1n * E)), 2000);
  assert.equal(branchShareBps(m(0n, 0n)), 0, "an empty branch is not an even 50%");
});

test("decide() is argument-free and names no signer", () => {
  const c = decideCall(DEC);
  assert.equal(c.length, 1);
  assert.equal(c[0].entrypoint, "decide");
  assert.deepEqual(c[0].calldata, [], "anyone may call it, with nothing to pass");
  assert.equal(c[0].contractAddress, DEC);
});
