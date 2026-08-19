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

/** Semicircular chance dial. Green fills clockwise with the YES share. */
function Gauge({ pct }: { pct: number }) {
  const r = 62;
  const len = Math.PI * r;
  const filled = (pct / 100) * len;
  return (
    <div className={s.gauge}>
      <svg width="148" height="92" viewBox="0 0 148 92" aria-hidden>
        <path
          d={`M 12 80 A ${r} ${r} 0 0 1 136 80`}
          fill="none"
          stroke="#2a2a31"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          d={`M 12 80 A ${r} ${r} 0 0 1 136 80`}
          fill="none"
          stroke="#22c55e"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${len}`}
        />
      </svg>
      <div className={s.gaugeVal}>
        <div className={s.gaugePct}>{pct}%</div>
        <div className={s.gaugeCap}>chance</div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  const myWalletAccount = useStoreWallet((st) => st.myWalletAccount);
  const address = useStoreWallet((st) => st.address);

  const [market, setMarket] = useState<MarketState | null>(null);
  const [outcome, setOutcome] = useState<number>(OUTCOME_YES);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [freshSecret, setFreshSecret] = useState("");
  const [claimSecret, setClaimSecret] = useState("");
  const [saved, setSaved] = useState<SavedPosition[]>([]);

  const provider = constants.myFrontendProviders[0]; // mainnet

  const refresh = useCallback(async () => {
    try {
      setMarket(await readMarket(provider));
    } catch {
      /* keep the last good state through a transient RPC hiccup */
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
  const settled = market?.resolved ?? false;
  const yesPct = market ? Math.round(market.yesShare * 100) : 50;
  const winnerLabel =
    market?.winningOutcome === OUTCOME_YES
      ? "Settled YES"
      : market?.winningOutcome === OUTCOME_NO
        ? "Settled NO"
        : "Void — refunded";

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
    setFreshSecret(secret);
    setResult({ kind: "pending", msg: "Confirm in your wallet…" });
    try {
      const r = await myWalletAccount.strk20InvokeTransaction(
        buyActions(wei, outcome, computeCommitment(secret)),
      );
      const tx = r.transaction_hash;
      savePosition({
        secret,
        commitment: computeCommitment(secret),
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
      setResult({ kind: "pending", msg: "Waiting for confirmation…" });
      await provider.waitForTransaction(r.transaction_hash, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "Claimed into a shielded note.", tx: r.transaction_hash });
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

  return (
    <main className={s.page}>
      <nav className={s.nav}>
        <div className={s.navLeft}>
          <div className={s.mark}>D</div>
          <span className={s.wordmark}>Doom</span>
          <span className={s.navTag}>the price is public, the voters are not</span>
        </div>
        <div className={s.navRight}>
          <span className={`${s.chip} ${s.chipDim}`}>Starknet mainnet</span>
        </div>
      </nav>

      <div className={s.shell}>
        <section className={s.stats}>
          <div>
            <div className={s.statLabel}>Total staked</div>
            <div className={s.statValue}>{market ? fmtStrk(market.total) : "—"} STRK</div>
          </div>
          <div>
            <div className={s.statLabel}>Open markets</div>
            <div className={s.statValue}>1</div>
          </div>
          <div>
            <div className={s.statLabel}>Participants known</div>
            <div className={`${s.statValue} ${s.statHidden}`}>0</div>
            <div className={s.statNote}>and that is the point</div>
          </div>
        </section>

        <div className={s.filters}>
          <span className={`${s.pill} ${s.pillOn}`}>Governance</span>
          <span className={s.pill}>Shipping</span>
          <span className={s.pill}>Treasury</span>
          <span className={s.pill}>Grants</span>
          <span className={s.filterSpacer} />
          <span className={s.filterNote}>One market this sprint. More is not the point.</span>
        </div>

        <div className={s.grid}>
          <div>
            <article className={s.card}>
              <div className={s.heroTop}>
                <div className={settled ? `${s.status} ${s.statusClosed}` : s.status}>
                  <span className={s.statusDot} />
                  {settled ? winnerLabel : "Open · live on mainnet"}
                </div>
                <div className={s.heroRow}>
                  <h1 className={s.question}>{market?.question ?? "Loading market…"}</h1>
                  <Gauge pct={yesPct} />
                </div>
              </div>

              <div className={s.sides}>
                <div className={`${s.side} ${s.sideYes}`}>
                  <span className={`${s.sideName} ${s.yes}`}>Yes</span>
                  <span className={s.sideAmt}>
                    {market ? fmtStrk(market.potYes) : "—"} STRK
                  </span>
                </div>
                <div className={`${s.side} ${s.sideNo}`}>
                  <span className={`${s.sideName} ${s.no}`}>No</span>
                  <span className={s.sideAmt}>{market ? fmtStrk(market.potNo) : "—"} STRK</span>
                </div>
              </div>

              <div className={s.meta}>
                <span className={s.metaItem}>
                  Settlement <span className={s.metaVal}>Parimutuel</span>
                </span>
                <span className={s.metaItem}>
                  Resolver <span className={s.metaVal}>Named, single</span>
                </span>
                <span className={s.metaItem}>
                  Contract{" "}
                  <a
                    className={`${s.metaVal} ${s.link}`}
                    href={`https://voyager.online/contract/${MARKET}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {MARKET.slice(0, 8)}…{MARKET.slice(-4)}
                  </a>
                </span>
              </div>
            </article>

            <section className={s.void}>
              <div className={s.voidHead}>
                <span className={s.voidTitle}>Holders</span>
                <span className={s.voidTag}>unavailable by design</span>
              </div>
              <p className={s.voidBody}>
                Every other prediction market puts a leaderboard here. Doom cannot build one.{" "}
                <strong>Positions are keyed by a secret, not an address</strong>, and the contract
                is only ever called by the STRK20 privacy pool — so it never learns who staked,
                even if it wanted to.
              </p>
              <div className={s.ghostRows}>
                <div className={s.ghostRow}>—</div>
                <div className={s.ghostRow}>—</div>
                <div className={s.ghostRow}>—</div>
              </div>
            </section>

            <p className={s.footNote}>
              Draft contract, unaudited, written during an 18-day sprint. Stake small. Public: the
              question, the odds, the totals, every transaction. Not public: who staked, how much
              any individual staked, which side they took. The anonymity set is the STRK20
              pool&apos;s, not Doom&apos;s alone, and timing correlation between shielding and
              staking is a real leak this does not solve.
            </p>
          </div>

          <aside>
            <div className={s.card}>
              <div className={s.panelHead}>
                <h2 className={s.panelTitle}>{settled ? "Claim payout" : "Take a position"}</h2>
              </div>
              <div className={s.panelBody}>
                {!settled ? (
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
                      Amount, from your shielded balance
                    </label>
                    <div className={s.inputWrap}>
                      <input
                        id="amt"
                        className={s.input}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="1.0"
                      />
                      <span className={s.inputSuffix}>STRK</span>
                    </div>
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
                ) : (
                  <>
                    <label className={s.label} htmlFor="sec">
                      Your secret
                    </label>
                    <div className={s.inputWrap}>
                      <input
                        id="sec"
                        className={s.input}
                        value={claimSecret}
                        onChange={(e) => setClaimSecret(e.target.value)}
                        placeholder="0x…"
                      />
                    </div>
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
                      Revealing the secret links a payout to a stake. It still links neither to
                      you.
                    </p>
                  </>
                )}

                <div style={{ marginTop: 16 }}>
                  <SelectWallet />
                </div>

                {freshSecret && (
                  <div className={s.secret}>
                    <div className={s.secretTitle}>Save this. It is your position.</div>
                    <div className={s.secretVal}>{freshSecret}</div>
                    <p className={s.secretWarn}>
                      Nobody can recover it — not us, not the contract, not StarkWare. Lose it and
                      the stake is unreachable forever. It is mirrored into this browser, but that
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
                        {" · "}
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
            </div>

            {isResolver && !settled && (
              <div className={s.card} style={{ marginTop: 20 }}>
                <div className={s.panelHead}>
                  <h2 className={s.panelTitle}>Resolver</h2>
                </div>
                <div className={s.panelBody}>
                  <p className={s.hint} style={{ marginTop: 0 }}>
                    You hold the resolver key. Settling is final and cannot be undone.
                  </p>
                  <button className={s.ghost} onClick={() => resolve(OUTCOME_YES)}>
                    Settle YES
                  </button>
                  <button className={s.ghost} onClick={() => resolve(OUTCOME_NO)}>
                    Settle NO
                  </button>
                  <button className={s.ghost} onClick={() => resolve(OUTCOME_VOID)}>
                    Settle VOID — refund everyone
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
