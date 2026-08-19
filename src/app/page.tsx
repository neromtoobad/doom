"use client";

import { useCallback, useEffect, useState } from "react";
import { num } from "starknet";
import s from "./market.module.css";
import SelectWallet from "./components/client/WalletHandle/SelectWallet";
import { useStoreWallet } from "./components/Wallet/walletContext";
import * as constants from "@/utils/constants";
import {
  MARKET,
  OUTCOME_NO,
  OUTCOME_VOID,
  OUTCOME_YES,
  buyActions,
  claimActions,
  computeCommitment,
  fmtStrk,
  loadPositions,
  parseStrk,
  randomSecret,
  readMarket,
  savePosition,
  type MarketState,
  type SavedPosition,
} from "@/lib/doom";

type Result =
  | { kind: "idle" }
  | { kind: "pending"; msg: string }
  | { kind: "ok"; msg: string; tx?: string }
  | { kind: "err"; msg: string };

export default function MarketPage() {
  const myWalletAccount = useStoreWallet((st) => st.myWalletAccount);
  const address = useStoreWallet((st) => st.address);

  const [market, setMarket] = useState<MarketState | null>(null);
  const [outcome, setOutcome] = useState<number>(OUTCOME_YES);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [freshSecret, setFreshSecret] = useState<string>("");
  const [claimSecret, setClaimSecret] = useState("");
  const [saved, setSaved] = useState<SavedPosition[]>([]);

  const provider = constants.myFrontendProviders[0]; // mainnet

  const refresh = useCallback(async () => {
    try {
      setMarket(await readMarket(provider));
    } catch {
      /* leave the last good state on a transient RPC hiccup */
    }
  }, [provider]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => setSaved(loadPositions()), []);

  const isResolver =
    !!market && !!address && num.toBigInt(market.resolver) === num.toBigInt(address || "0x0");

  const yesPct = market ? Math.round(market.yesShare * 100) : 50;

  async function stake() {
    if (!myWalletAccount) return setResult({ kind: "err", msg: "Connect a wallet first." });
    let wei: bigint;
    try {
      wei = parseStrk(amount);
    } catch {
      return setResult({ kind: "err", msg: "Enter a valid amount." });
    }
    if (wei <= 0n) return setResult({ kind: "err", msg: "Amount must be greater than zero." });

    const secret = randomSecret();
    const commitment = computeCommitment(secret);
    setFreshSecret(secret);
    setResult({ kind: "pending", msg: "Confirm in your wallet…" });

    try {
      const r = await myWalletAccount.strk20InvokeTransaction(
        buyActions(wei, outcome, commitment),
      );
      const tx = r.transaction_hash;
      savePosition({
        secret,
        commitment,
        outcome,
        amount: wei.toString(),
        at: Date.now(),
        txHash: tx,
      });
      setSaved(loadPositions());
      setResult({ kind: "pending", msg: "Waiting for confirmation…" });
      await provider.waitForTransaction(tx, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "Stake placed.", tx });
      refresh();
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }

  async function claim() {
    if (!myWalletAccount) return setResult({ kind: "err", msg: "Connect a wallet first." });
    const secret = claimSecret.trim();
    if (!secret) return setResult({ kind: "err", msg: "Paste the secret from your stake." });
    setResult({ kind: "pending", msg: "Confirm in your wallet…" });
    try {
      const r = await myWalletAccount.strk20InvokeTransaction(claimActions(secret, address));
      const tx = r.transaction_hash;
      setResult({ kind: "pending", msg: "Waiting for confirmation…" });
      await provider.waitForTransaction(tx, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "Claimed into a shielded note.", tx });
      refresh();
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }

  async function resolve(winning: number) {
    if (!myWalletAccount) return;
    setResult({ kind: "pending", msg: "Confirm the resolution in your wallet…" });
    try {
      const r = await myWalletAccount.execute([
        { contractAddress: MARKET, entrypoint: "resolve", calldata: [num.toHex(winning)] },
      ]);
      await provider.waitForTransaction(r.transaction_hash, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "Market resolved.", tx: r.transaction_hash });
      refresh();
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }

  const settled = market?.resolved ?? false;
  const winnerLabel =
    market?.winningOutcome === OUTCOME_YES
      ? "YES"
      : market?.winningOutcome === OUTCOME_NO
        ? "NO"
        : "VOID — stakes refunded";

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <header className={s.brand}>
          <span className={s.wordmark}>DOOM</span>
          <span className={s.tagline}>the price is public, the voters are not</span>
        </header>

        <section className={s.hero}>
          <div className={s.kicker}>
            <span className={settled ? `${s.dot} ${s.dotClosed}` : s.dot} />
            {settled ? `Settled · ${winnerLabel}` : "Open · staking live on Starknet mainnet"}
          </div>
          <h1 className={s.question}>{market?.question ?? "Loading market…"}</h1>
        </section>

        <div className={s.grid}>
          {/* ── left: the public half ── */}
          <div>
            <div className={s.card}>
              <div className={s.odds}>
                <div className={`${s.odd} ${s.oddYes}`}>
                  <div className={s.oddLabel}>Yes</div>
                  <div className={`${s.oddPct} ${s.yes}`}>{yesPct}%</div>
                  <div className={s.oddPot}>
                    {market ? `${fmtStrk(market.potYes)} STRK staked` : "—"}
                  </div>
                </div>
                <div className={`${s.odd} ${s.oddNo}`}>
                  <div className={s.oddLabel}>No</div>
                  <div className={`${s.oddPct} ${s.no}`}>{100 - yesPct}%</div>
                  <div className={s.oddPot}>
                    {market ? `${fmtStrk(market.potNo)} STRK staked` : "—"}
                  </div>
                </div>
              </div>

              <div className={s.bar}>
                <div className={s.barYes} style={{ width: `${yesPct}%` }} />
              </div>

              <div className={s.stat}>
                <span>Total staked</span>
                <span className={s.statVal}>
                  {market ? `${fmtStrk(market.total)} STRK` : "—"}
                </span>
              </div>
              <div className={s.stat}>
                <span>Settlement</span>
                <span className={s.statVal}>Parimutuel · winners split the pot</span>
              </div>
              <div className={s.stat}>
                <span>Market</span>
                <span className={s.statVal}>
                  <a
                    className={s.link}
                    href={`https://voyager.online/contract/${MARKET}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {MARKET.slice(0, 10)}…{MARKET.slice(-6)}
                  </a>
                </span>
              </div>

              {/* The point of the whole product, stated where a leaderboard would be. */}
              <div className={s.void}>
                <div className={s.voidTitle}>No participant list</div>
                <p className={s.voidBody}>
                  Every other market shows you who is holding what. Doom cannot.{" "}
                  <strong>Positions are keyed by a secret, not an address</strong>, and the
                  contract is only ever called by the privacy pool — so it never learns who
                  staked, even if it wanted to. This space stays empty by construction.
                </p>
              </div>
            </div>
          </div>

          {/* ── right: the trade panel ── */}
          <aside>
            <div className={s.card}>
              <h2 className={s.panelTitle}>{settled ? "Claim" : "Take a position"}</h2>

              {!settled && (
                <>
                  <div className={s.pick}>
                    <button
                      className={`${s.pickBtn} ${outcome === OUTCOME_YES ? s.pickYesOn : ""}`}
                      onClick={() => setOutcome(OUTCOME_YES)}
                    >
                      Yes
                    </button>
                    <button
                      className={`${s.pickBtn} ${outcome === OUTCOME_NO ? s.pickNoOn : ""}`}
                      onClick={() => setOutcome(OUTCOME_NO)}
                    >
                      No
                    </button>
                  </div>

                  <label className={s.label} htmlFor="amt">
                    Amount (STRK, from your shielded balance)
                  </label>
                  <input
                    id="amt"
                    className={s.input}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="1.0"
                  />

                  <button
                    className={s.cta}
                    onClick={stake}
                    disabled={!myWalletAccount || result.kind === "pending"}
                  >
                    {result.kind === "pending" ? "Working…" : "Stake privately"}
                  </button>

                  <p className={s.hint}>
                    Shield STRK first — a stake spends your shielded balance, not your public
                    one. Two wallet prompts: the pool withdraws to the market, then invokes it.
                  </p>
                </>
              )}

              {settled && (
                <>
                  <label className={s.label} htmlFor="sec">
                    Your secret
                  </label>
                  <input
                    id="sec"
                    className={s.input}
                    value={claimSecret}
                    onChange={(e) => setClaimSecret(e.target.value)}
                    placeholder="0x…"
                  />
                  <button
                    className={s.cta}
                    onClick={claim}
                    disabled={!myWalletAccount || result.kind === "pending"}
                  >
                    {result.kind === "pending" ? "Working…" : "Claim payout"}
                  </button>
                  {saved.length > 0 && (
                    <button
                      className={s.ghost}
                      onClick={() => setClaimSecret(saved[saved.length - 1].secret)}
                      disabled={result.kind === "pending"}
                    >
                      Use my last saved secret
                    </button>
                  )}
                  <p className={s.hint}>
                    Revealing the secret is the only thing that links a payout to a stake. It
                    still never links either to you.
                  </p>
                </>
              )}

              <div style={{ marginTop: 18 }}>
                <SelectWallet />
              </div>

              {freshSecret && (
                <div className={s.secret}>
                  <div className={s.secretTitle}>Save this. It is your position.</div>
                  <div className={s.secretVal}>{freshSecret}</div>
                  <p className={s.secretWarn}>
                    Nobody can recover it — not us, not the contract, not StarkWare. Lose it and
                    the stake is unreachable forever. It is saved in this browser too, but that
                    is convenience, not a backup.
                  </p>
                </div>
              )}

              {result.kind !== "idle" && (
                <div
                  className={`${s.result} ${
                    result.kind === "ok" ? s.ok : result.kind === "err" ? s.err : s.pending
                  }`}
                >
                  {result.kind === "pending" ? "⋯ " : result.kind === "ok" ? "✓ " : "✕ "}
                  {"msg" in result ? result.msg : ""}
                  {"tx" in result && result.tx && (
                    <>
                      {" "}
                      <a
                        className={s.link}
                        href={`https://voyager.online/tx/${result.tx}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        view transaction
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>

            {isResolver && !settled && (
              <div className={s.card} style={{ marginTop: 20 }}>
                <h2 className={s.panelTitle}>Resolver</h2>
                <p className={s.hint} style={{ marginTop: 0 }}>
                  You hold the resolver key for this market. Settling is final.
                </p>
                <button className={s.ghost} onClick={() => resolve(OUTCOME_YES)}>
                  Settle YES
                </button>
                <button className={s.ghost} onClick={() => resolve(OUTCOME_NO)}>
                  Settle NO
                </button>
                <button className={s.ghost} onClick={() => resolve(OUTCOME_VOID)}>
                  Settle VOID (refund everyone)
                </button>
              </div>
            )}
          </aside>
        </div>

        {/* Outside the grid so the trade panel stays above it when the columns stack. */}
        <p className={s.footNote}>
          Draft contract, unaudited, built during an 18-day sprint. Stake small. What is
          public: the question, the odds, the totals, every transaction. What is not: who
          staked, how much any individual staked, and which side they took. The anonymity set
          is the STRK20 pool&apos;s, not Doom&apos;s alone.
        </p>
      </div>
    </main>
  );
}
