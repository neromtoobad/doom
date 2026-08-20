"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { num } from "starknet";
import s from "./market.module.css";
import markImg from "../../public/brand/mark-96.png";
import DecisionPanel from "./DecisionPanel";
import SelectWallet from "./components/client/WalletHandle/SelectWallet";
import { useStoreWallet } from "./components/Wallet/walletContext";
import * as constants from "@/utils/constants";
import {
  DECISIONS,
  MARKETS,
  decideCall,
  readDecision,
  type DecisionState,
  OUTCOME_NO,
  OUTCOME_VOID,
  OUTCOME_YES,
  buyActions,
  claimActions,
  computeCommitment,
  fmtStrk,
  loadPositions,
  priceCents,
  quoteShares,
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

/** Semicircular chance dial. Sweeps up from zero on mount, then tracks live. */
function Gauge({ pct, size = 1 }: { pct: number; size?: number }) {
  const r = 62;
  const len = Math.PI * r;
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  return (
    <div className={s.gauge} style={{ transform: `scale(${size})` }}>
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
          strokeDasharray={`${(drawn / 100) * len} ${len}`}
          style={{
            transition: "stroke-dasharray 1.1s cubic-bezier(.22,1,.36,1)",
            filter: "drop-shadow(0 0 6px rgba(34,197,94,.45))",
          }}
        />
      </svg>
      <div className={s.gaugeVal}>
        <div className={s.gaugePct}>{pct}%</div>
        <div className={s.gaugeCap}>chance</div>
      </div>
    </div>
  );
}

/** Numbers that roll to their value instead of appearing. */
function CountUp({ value, decimals = 2, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [shown, setShown] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <>
      {shown.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </>
  );
}

/** Live odds strip. Doubled content scrolls seamlessly; pausing on hover. */
function Ticker({ items, onPick }: { items: MarketState[]; onPick: (a: string) => void }) {
  if (items.length === 0) return null;
  const cells = [...items, ...items];
  return (
    <div className={s.ticker} aria-hidden>
      <div className={s.tickerTrack}>
        {cells.map((m, i) => {
          const pct = Math.round(m.yesShare * 100);
          return (
            <button key={i} className={s.tickerItem} onClick={() => onPick(m.address)} tabIndex={-1}>
              <span className={pct >= 50 ? s.yes : s.no}>{pct}%</span>
              <span className={s.tickerQ}>{m.question.replace(/\?$/, "")}</span>
              <span className={s.tickerDot}>·</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "closes in 9d" / "closed" — markets without a deadline just say nothing. */
function closesIn(m: MarketState): string {
  if (m.resolved) return "settled";
  if (m.closesAt === null) return "holders hidden";
  const ms = m.closesAt * 1000 - Date.now();
  if (ms <= 0) return "closed";
  const d = Math.floor(ms / 864e5);
  if (d >= 1) return `closes in ${d}d`;
  const h = Math.floor(ms / 36e5);
  return h >= 1 ? `closes in ${h}h` : "closes within the hour";
}

/**
 * Your bets, reconstructed from the secrets in this browser. The contract cannot
 * tell you what you hold — it does not know who you are — so this is the only
 * place a position can be listed, and it is local by necessity, not by choice.
 */
function Portfolio({
  saved,
  markets,
  onOpen,
}: {
  saved: SavedPosition[];
  markets: Record<string, MarketState>;
  onOpen: (a: string) => void;
}) {
  if (saved.length === 0) {
    return (
      <div className={s.portfolio}>
        <div className={s.portfolioHead}>My bets</div>
        <p className={s.portfolioEmpty}>
          No bets from this browser yet. Positions are keyed by a secret, so they live
          here and nowhere else — not even the contract can list them for you.
        </p>
      </div>
    );
  }
  const rows = [...saved].reverse();
  return (
    <div className={s.portfolio}>
      <div className={s.portfolioHead}>
        My bets<span className={s.portfolioCount}>{saved.length}</span>
      </div>
      <div className={s.posList}>
        {rows.map((p, i) => {
          const m = markets[p.market];
          const won = m?.resolved && m.winningOutcome === p.outcome;
          const lost = m?.resolved && m.winningOutcome !== p.outcome && m.winningOutcome !== 2;
          const shares = p.shares ? BigInt(p.shares) : null;
          return (
            <button key={i} className={s.posRow} onClick={() => onOpen(p.market)}>
              <span className={s.posSide}>
                <span className={p.outcome === OUTCOME_YES ? s.yes : s.no}>
                  {p.outcome === OUTCOME_YES ? "YES" : "NO"}
                </span>
              </span>
              <span className={s.posQ}>{m?.question ?? p.market.slice(0, 18) + "…"}</span>
              <span className={s.posAmt}>
                {shares ? `${fmtStrk(shares)} shares` : `${fmtStrk(BigInt(p.amount))} STRK`}
              </span>
              <span className={won ? s.posWon : lost ? s.posLost : s.posOpen}>
                {won ? "claimable" : lost ? "lost" : m?.resolved ? "void" : "open"}
              </span>
            </button>
          );
        })}
      </div>
      <p className={s.portfolioNote}>
        These secrets exist only in this browser. Clear your site data and the bets
        become unreachable by anyone, including us. Copy them somewhere safe.
      </p>
    </div>
  );
}

export default function Home() {
  const myWalletAccount = useStoreWallet((st) => st.myWalletAccount);
  const address = useStoreWallet((st) => st.address);

  const [markets, setMarkets] = useState<Record<string, MarketState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<number>(OUTCOME_YES);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [freshSecret, setFreshSecret] = useState("");
  const [claimSecret, setClaimSecret] = useState("");
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [decisions, setDecisions] = useState<DecisionState[]>([]);
  const [quote, setQuote] = useState<bigint | null>(null);
  const [filter, setFilter] = useState<"all" | "crypto" | "starknet" | "closing">("all");
  const [sort, setSort] = useState<"volume" | "closing" | "new">("volume");
  const [showPortfolio, setShowPortfolio] = useState(false);

  const provider = constants.myFrontendProviders[0]; // mainnet

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      MARKETS.map(async (addr) => {
        try {
          return [addr, await readMarket(provider, addr)] as const;
        } catch {
          return null; // a market that will not read is simply not listed
        }
      }),
    );
    const next: Record<string, MarketState> = {};
    for (const e of entries) if (e) next[e[0]] = e[1];
    setMarkets(next);

    const ds = await Promise.all(
      DECISIONS.map((a) => readDecision(provider, a).catch(() => null)),
    );
    setDecisions(ds.filter(Boolean) as DecisionState[]);
  }, [provider]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    setSaved(loadPositions());
    const h = window.location.hash.replace("#", "");
    if (h && MARKETS.includes(h)) setSelected(h);
  }, []);

  const all = MARKETS.map((a) => markets[a]).filter(Boolean) as MarketState[];

  const CRYPTO = /\b(BTC|ETH|SOL|XRP|DOGE)\b/;
  const STARKNET = /\b(STRK|Starknet|strk20)\b/i;
  const soon = (m: MarketState) =>
    m.closesAt !== null && m.closesAt * 1000 - Date.now() < 14 * 864e5;

  const list = all
    .filter((m) =>
      filter === "all"
        ? true
        : filter === "crypto"
          ? CRYPTO.test(m.question)
          : filter === "starknet"
            ? STARKNET.test(m.question)
            : soon(m),
    )
    .sort((a, b) => {
      if (sort === "volume") return a.volume > b.volume ? -1 : a.volume < b.volume ? 1 : 0;
      if (sort === "closing") return (a.closesAt ?? 9e9) - (b.closesAt ?? 9e9);
      return 0;
    });
  const open = all.filter((m) => !m.resolved).length;
  const totalStaked = all.reduce((acc, m) => acc + m.volume, 0n);

  const market = selected ? markets[selected] : null;
  const settled = market?.resolved ?? false;
  const yesPct = market ? Math.round(market.yesShare * 100) : 50;
  const isResolver =
    !!market && !!address && num.toBigInt(market.resolver) === num.toBigInt(address || "0x0");
  const winnerLabel =
    market?.winningOutcome === OUTCOME_YES
      ? "Settled YES"
      : market?.winningOutcome === OUTCOME_NO
        ? "Settled NO"
        : "Void — refunded";

  // Live fill preview. The contract's own quote(), so the number shown is the
  // number the buy delivers.
  useEffect(() => {
    let dead = false;
    if (!market || market.kind !== "cpmm" || market.resolved) {
      setQuote(null);
      return;
    }
    let wei: bigint;
    try {
      wei = parseStrk(amount);
    } catch {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      const q = await quoteShares(provider, market.address, outcome, wei);
      if (!dead) setQuote(q);
    }, 180);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [market, outcome, amount, provider]);

  function selectMarket(addr: string | null) {
    setSelected(addr);
    setResult({ kind: "idle" });
    setFreshSecret("");
    setClaimSecret("");
    if (typeof window !== "undefined") {
      window.location.hash = addr ?? "";
      window.scrollTo({ top: 0 });
    }
  }

  async function stake() {
    if (!myWalletAccount || !market)
      return setResult({ kind: "err", msg: "Connect a wallet first." });
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
        buyActions(wei, outcome, commitment, market.address),
      );
      const tx = r.transaction_hash;
      savePosition({
        market: market.address,
        secret,
        commitment,
        outcome,
        shares: quote != null ? quote.toString() : undefined,
        amount: wei.toString(),
        at: Date.now(),
        txHash: tx,
      });
      setSaved(loadPositions());
      setResult({ kind: "pending", msg: "Waiting for confirmation…" });
      await provider.waitForTransaction(tx, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "Bet placed.", tx });
      refresh();
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }

  async function claim() {
    if (!myWalletAccount || !market)
      return setResult({ kind: "err", msg: "Connect a wallet first." });
    const secret = claimSecret.trim();
    if (!secret) return setResult({ kind: "err", msg: "Paste the secret from your stake." });
    setResult({ kind: "pending", msg: "Confirm in your wallet…" });
    try {
      const r = await myWalletAccount.strk20InvokeTransaction(
        claimActions(secret, address, market.address),
      );
      setResult({ kind: "pending", msg: "Waiting for confirmation…" });
      await provider.waitForTransaction(r.transaction_hash, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "Claimed into a shielded note.", tx: r.transaction_hash });
      refresh();
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }

  async function resolve(winning: number) {
    if (!myWalletAccount || !market) return;
    setResult({ kind: "pending", msg: "Confirm the resolution in your wallet…" });
    try {
      const r = await myWalletAccount.execute([
        { contractAddress: market.address, entrypoint: "resolve", calldata: [num.toHex(winning)] },
      ]);
      await provider.waitForTransaction(r.transaction_hash, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "Market resolved.", tx: r.transaction_hash });
      refresh();
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }

  async function decide(addr: string) {
    if (!myWalletAccount) return setResult({ kind: "err", msg: "Connect a wallet first." });
    setResult({ kind: "pending", msg: "Confirm decide() in your wallet…" });
    try {
      const r = await myWalletAccount.execute(decideCall(addr));
      await provider.waitForTransaction(r.transaction_hash, { retries: 400, retryInterval: 3000 });
      setResult({ kind: "ok", msg: "The market decided.", tx: r.transaction_hash });
      refresh();
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
    }
  }

  const mySecrets = saved.filter((p) => !market || p.market === market.address);

  return (
    <main className={s.page}>
      <nav className={s.nav}>
        <div className={s.navLeft}>
          <button className={s.brandBtn} onClick={() => selectMarket(null)}>
            <Image src={markImg} alt="Doom" width={40} height={40} className={s.markImg} priority />
            <span className={s.wordmark}>DOOM</span>
          </button>
          <span className={s.navTag}>visible odds, invisible bettors</span>
        </div>
        <div className={s.navRight}>
          <span className={`${s.chip} ${s.chipDim}`}>Starknet mainnet</span>
          {address && (
            <span
              className={s.chip}
              title={address}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "#22c55e" }}
            >
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          )}
          <SelectWallet />
        </div>
      </nav>

      <Ticker items={all} onPick={selectMarket} />

      <div className={s.shell}>
        <section className={s.stats}>
          <div>
            <div className={s.statLabel}>Total volume</div>
            <div className={s.statValue}>
              <CountUp value={Number(totalStaked) / 1e18} /> STRK
            </div>
          </div>
          <div>
            <div className={s.statLabel}>Open markets</div>
            <div className={s.statValue}>{open}</div>
          </div>
          <div>
            <div className={s.statLabel}>Bettors identifiable</div>
            <div className={`${s.statValue} ${s.statHidden}`}>0</div>
            <div className={s.statNote}>and that is the point</div>
          </div>
        </section>

        {!market ? (
          <>
            {decisions.map((d) => (
              <DecisionPanel
                key={d.address}
                state={d}
                canDecide={!!myWalletAccount}
                busy={result.kind === "pending"}
                onDecide={() => decide(d.address)}
              />
            ))}

            <div className={s.filters}>
              {([
                ["all", "All markets"],
                ["crypto", "Crypto"],
                ["starknet", "Starknet"],
                ["closing", "Closing soon"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  className={`${s.pill} ${filter === k ? s.pillOn : ""}`}
                  onClick={() => setFilter(k)}
                >
                  {label}
                </button>
              ))}
              <span className={s.filterSpacer} />
              <select
                className={s.sort}
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                aria-label="Sort markets"
              >
                <option value="volume">Most traded</option>
                <option value="closing">Closing soonest</option>
                <option value="new">Newest</option>
              </select>
              <button
                className={`${s.pill} ${showPortfolio ? s.pillOn : ""}`}
                onClick={() => setShowPortfolio((v) => !v)}
              >
                My bets{saved.length > 0 ? ` (${saved.length})` : ""}
              </button>
            </div>

            {showPortfolio && (
              <Portfolio saved={saved} markets={markets} onOpen={selectMarket} />
            )}

            <div className={s.board}>
              {list.length === 0 && <div className={s.empty}>Reading markets from mainnet…</div>}
              {list.map((m) => {
                const pct = Math.round(m.yesShare * 100);
                return (
                  <button
                    key={m.address}
                    className={s.tile}
                    onClick={() => selectMarket(m.address)}
                  >
                    <div className={s.tileTop}>
                      <span className={m.resolved ? `${s.status} ${s.statusClosed}` : s.status}>
                        <span className={s.statusDot} />
                        {m.resolved ? "Settled" : "Open"}
                      </span>
                      <span className={s.tileGauge}>
                        <Gauge pct={pct} size={0.66} />
                      </span>
                    </div>
                    <h2 className={s.tileQ}>{m.question}</h2>
                    <div className={s.tileSides}>
                      <span className={`${s.tileSide} ${s.sideYes}`}>
                        <span className={s.yes}>Yes</span>
                        {m.kind === "cpmm" ? `${priceCents(m.priceYesBps)}¢` : fmtStrk(m.potYes)}
                      </span>
                      <span className={`${s.tileSide} ${s.sideNo}`}>
                        <span className={s.no}>No</span>
                        {m.kind === "cpmm"
                          ? `${priceCents(10000 - m.priceYesBps)}¢`
                          : fmtStrk(m.potNo)}
                      </span>
                    </div>
                    <div className={s.tileFoot}>
                      <span>{fmtStrk(m.volume)} STRK volume</span>
                      <span className={s.tileFootDim}>{closesIn(m)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <button className={s.back} onClick={() => selectMarket(null)}>
              ← All markets
            </button>

            <div className={s.grid}>
              <div>
                <article className={s.card}>
                  <div className={s.heroTop}>
                    <div className={settled ? `${s.status} ${s.statusClosed}` : s.status}>
                      <span className={s.statusDot} />
                      {settled ? winnerLabel : "Open · live on mainnet"}
                    </div>
                    <div className={s.heroRow}>
                      <h1 className={s.question}>{market.question}</h1>
                      <Gauge pct={yesPct} />
                    </div>
                  </div>

                  <div className={s.sides}>
                    <div className={`${s.side} ${s.sideYes}`}>
                      <span className={`${s.sideName} ${s.yes}`}>Yes</span>
                      <span className={s.sideAmt}>{fmtStrk(market.potYes)} STRK</span>
                    </div>
                    <div className={`${s.side} ${s.sideNo}`}>
                      <span className={`${s.sideName} ${s.no}`}>No</span>
                      <span className={s.sideAmt}>{fmtStrk(market.potNo)} STRK</span>
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
                        href={`https://voyager.online/contract/${market.address}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {market.address.slice(0, 8)}…{market.address.slice(-4)}
                      </a>
                    </span>
                  </div>
                </article>
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
                            <span className={s.pickSide}>Yes</span>
                            {market.kind === "cpmm" && (
                              <span className={s.pickPrice}>
                                {priceCents(market.priceYesBps)}¢
                              </span>
                            )}
                          </button>
                          <button
                            className={`${s.pickBtn} ${outcome === OUTCOME_NO ? s.pickNoOn : ""}`}
                            onClick={() => setOutcome(OUTCOME_NO)}
                          >
                            <span className={s.pickSide}>No</span>
                            {market.kind === "cpmm" && (
                              <span className={s.pickPrice}>
                                {priceCents(10000 - market.priceYesBps)}¢
                              </span>
                            )}
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
                        {market.kind === "cpmm" && quote != null && quote > 0n && (
                          <div className={s.fill}>
                            <div className={s.fillRow}>
                              <span>You receive</span>
                              <span className={s.fillVal}>{fmtStrk(quote)} shares</span>
                            </div>
                            <div className={s.fillRow}>
                              <span>If {outcome === OUTCOME_YES ? "YES" : "NO"} wins</span>
                              <span className={s.fillWin}>{fmtStrk(quote)} STRK</span>
                            </div>
                            <div className={s.fillRow}>
                              <span>Return</span>
                              <span className={s.fillVal}>
                                {(() => {
                                  let cost = 1n;
                                  try {
                                    cost = parseStrk(amount);
                                  } catch {}
                                  if (cost <= 0n) return "—";
                                  const pct = Number((quote * 10000n) / cost) / 100 - 100;
                                  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
                                })()}
                              </span>
                            </div>
                          </div>
                        )}

                        <button
                          className={s.cta}
                          onClick={stake}
                          disabled={!myWalletAccount || result.kind === "pending"}
                        >
                          {result.kind === "pending" ? "Working…" : "Bet privately"}
                        </button>
                        <p className={s.hint}>
                          Shield STRK first — a bet spends your shielded balance, not your public
                          one. Two wallet prompts: the pool withdraws to the market, then invokes
                          it.
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
                        {mySecrets.length > 0 && (
                          <div className={s.posList}>
                            <div className={s.posHead}>
                              Positions saved in this browser for this market
                            </div>
                            {mySecrets.map((p) => {
                              const won =
                                market.winningOutcome === OUTCOME_VOID ||
                                p.outcome === market.winningOutcome;
                              const side = p.outcome === OUTCOME_YES ? "YES" : "NO";
                              const payout =
                                market.winningOutcome === OUTCOME_VOID
                                  ? BigInt(p.amount)
                                  : won && market.total > 0n
                                    ? (BigInt(p.amount) * market.total) /
                                      (market.winningOutcome === OUTCOME_YES
                                        ? market.potYes
                                        : market.potNo)
                                    : 0n;
                              return (
                                <button
                                  key={p.commitment}
                                  className={`${s.posRow} ${won ? s.posWon : s.posLost}`}
                                  onClick={() => setClaimSecret(p.secret)}
                                  disabled={!won || result.kind === "pending"}
                                  title={won ? "Load this secret" : "This side lost"}
                                >
                                  <span className={p.outcome === OUTCOME_YES ? s.yes : s.no}>
                                    {side}
                                  </span>
                                  <span className={s.posAmt}>
                                    {fmtStrk(BigInt(p.amount))} STRK
                                  </span>
                                  <span className={s.posPay}>
                                    {won ? `→ ${fmtStrk(payout)}` : "lost"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <p className={s.hint}>
                          Revealing the secret links a payout to a bet. It still links neither to
                          you.
                        </p>
                      </>
                    )}

                    <div style={{ marginTop: 16 }}>
                      <SelectWallet />
                    </div>

                    {freshSecret && (
                      <div className={s.secret}>
                        <div className={s.secretTitle}>Save this. It is your bet.</div>
                        <div className={s.secretVal}>{freshSecret}</div>
                        <p className={s.secretWarn}>
                          Nobody can recover it — not us, not the contract, not StarkWare. Lose it
                          and the bet is unreachable forever. It is mirrored into this browser,
                          but that is convenience, not a backup.
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
          </>
        )}

        <section className={s.void}>
          <div className={s.voidHead}>
            <span className={s.voidTitle}>Top bettors</span>
            <span className={s.voidTag}>unavailable by design</span>
          </div>
          <p className={s.voidBody}>
            Polymarket ranks its whales here, and that leaderboard is exactly what causes
            herding, copy-betting and pressure on bettors. Doom cannot build one:{" "}
            <strong>positions key off a secret, not an address</strong>, every pool transaction
            is relayed, and no wallet-level history accumulates to profile. The odds above are
            fully public — that is what keeps the market accurate.
          </p>
          <div className={s.ghostRows}>
            <div className={s.ghostRow}>—</div>
            <div className={s.ghostRow}>—</div>
            <div className={s.ghostRow}>—</div>
          </div>
        </section>

        <p className={s.footNote}>
          Draft contract, unaudited, written during an 18-day sprint — bet small. Public by
          design: the question, the odds, every bet size, the resolution. That visibility is what
          makes the odds accurate. Hidden: who bet, and any cross-market profile of them. Claiming
          does reveal the secret, so a payout links back to its bet — but never to a person. The
          anonymity set is the STRK20 pool&apos;s, not Doom&apos;s alone.
        </p>
      </div>
    </main>
  );
}
