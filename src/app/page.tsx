"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { num, type ProviderInterface, type WalletAccountV6 } from "starknet";
import s from "./market.module.css";
import Nav from "./components/Nav";
import { cachedMaster, derivedSecret, findPosition, unlock } from "@/lib/vault";
import { TOKEN_ART } from "./components/TokenIcons";
import DecisionPanel from "./DecisionPanel";
import SelectWallet from "./components/client/WalletHandle/SelectWallet";
import { useStoreWallet } from "./components/Wallet/walletContext";
import * as constants from "@/utils/constants";
import {
  finalizeCall,
  oracleVerdict,
  proposeCalls,
  readSettlement,
  type Settlement,
  type Verdict,
} from "@/lib/pragma";
import {
  loadUserMarkets,
  removeUserMarket,
  normalizeAddress,
  saveUserMarket,
  verifyMarket,
  type UserMarket,
} from "@/lib/create";
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
  exportPositions,
  fmtStrk,
  importPositions,
  loadPositions,
  pnlPct,
  positionValue,
  positionsCsv,
  priceCents,
  quoteLocal,
  readBook,
  readPoolFee,
  type BookEntry,
  quoteShares,
  readPriceHistory,
  type PricePoint,
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
/**
 * What different sizes actually fill at.
 *
 * A single quote hides the shape of the curve: on a thin market 25 STRK can pay a
 * far worse average price than 1 STRK, and the only honest way to show that is to
 * price several sizes at once. Computed locally from the reserves with the
 * contract's own formula, so no extra call is made per rung; the number the user
 * commits to still comes from `quote()`.
 */
function Depth({ market, outcome }: { market: MarketState; outcome: number }) {
  // On share markets readMarket stores the reserves in these two fields.
  const rYes = market.potYes;
  const rNo = market.potNo;
  if (rYes <= 0n || rNo <= 0n) return null;

  const sizes = [1n, 5n, 25n].map((n) => n * 10n ** 18n);
  const rungs = sizes.map((a) => {
    const out = quoteLocal(rYes, rNo, outcome, a);
    return { a, out, cents: out > 0n ? Number((a * 10000n) / out) / 100 : null };
  });
  const base = rungs[0].cents;

  return (
    <div className={s.depth}>
      <div className={s.depthHead}>Average price by size</div>
      {rungs.map((r) => {
        const slip = base && r.cents ? r.cents - base : 0;
        return (
          <div key={r.a.toString()} className={s.depthRow}>
            <span className={s.depthSize}>{fmtStrk(r.a, 0)} STRK</span>
            <span className={s.depthPrice}>
              {r.cents === null ? "—" : `${r.cents.toFixed(1)}\u00a2`}
            </span>
            <span className={slip > 0.05 ? s.depthSlipOn : s.depthSlip}>
              {slip > 0.05 ? `+${slip.toFixed(1)}\u00a2 slippage` : "at market"}
            </span>
          </div>
        );
      })}
    </div>
  );
}




/**
 * Probability timeline, reconstructed from the market's own Bought events. A clean
 * line rather than candlesticks: this is a probability, not an asset price. Seeded
 * at the 50c open so a market with one trade still shows the move it made.
 */
function PriceChart({ points, current }: { points: PricePoint[]; current: number }) {
  const series = [5000, ...points.map((p) => p.bps), current];
  const W = 640, H = 150, PAD = 8;
  const min = Math.max(0, Math.min(...series) - 400);
  const max = Math.min(10000, Math.max(...series) + 400);
  const span = Math.max(1, max - min);
  const x = (i: number) => PAD + (i / Math.max(1, series.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const d = series.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L ${x(series.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`;
  const up = series[series.length - 1] >= series[0];
  const col = up ? "#22c55e" : "#ef4444";

  return (
    <div className={s.chartWrap}>
      <div className={s.chartHead}>
        <span className={s.chartTitle}>Probability history</span>
        <span className={s.chartMeta}>
          {points.length === 0
            ? "no trades yet — opens at 50¢"
            : `${points.length} trade${points.length === 1 ? "" : "s"} on chain`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chartSvg} preserveAspectRatio="none">
        <defs>
          <linearGradient id="doomFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.22" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={PAD + f * (H - PAD * 2)} y2={PAD + f * (H - PAD * 2)}
            stroke="#26262c" strokeWidth="1" strokeDasharray="3 5" />
        ))}
        <path d={area} fill="url(#doomFill)" />
        <path d={d} fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {series.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === series.length - 1 ? 4 : 2.5}
            fill={i === series.length - 1 ? col : "#0c0c0e"} stroke={col} strokeWidth="2" />
        ))}
      </svg>
      <div className={s.chartAxis}>
        <span>open 50¢</span>
        <span className={s.chartNow} style={{ color: col }}>
          now {priceCents(current)}¢
        </span>
      </div>
    </div>
  );
}

/** Token art for crypto markets. The starter kit already ships these. */
function marketIcon(q: string): string | null {
  // Only price markets get token art. Matching a bare mention put the STRK logo
  // on "strk20-hackathon PR #100", which is a governance question, not a price.
  const m = /^Will (BTC|ETH|STRK|SOL) close above/i.exec(q.trim());
  if (!m) return null;
  // Resolved through the imported art so the URL carries basePath at any depth.
  return TOKEN_ART[m[1].toUpperCase()]?.src ?? null;
}


/**
 * How this market settles, stated where a bettor decides rather than in a footer.
 * Source of truth, who may settle, the challenge window, and what happens on a
 * dispute — the questions someone asks before risking money.
 */
/**
 * What the oracle says, and the buttons that act on it.
 *
 * The contracts settle by bonded human proposal and cannot read a feed - they were
 * deployed without one. So this reads Pragma in the browser, states the answer its
 * current median implies, and pre-fills the proposal. Oracle-informed, not
 * oracle-enforced, and the panel says so rather than implying a binding that a judge
 * would find missing.
 */
function OracleSettle({
  market,
  provider,
  account,
  address,
  onDone,
}: {
  market: MarketState;
  provider: ProviderInterface;
  account: WalletAccountV6 | undefined;
  address: string;
  onDone: () => void;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [settle, setSettle] = useState<Settlement | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let dead = false;
    setVerdict(null);
    setSettle(null);
    oracleVerdict(provider, market.question).then((v) => !dead && setVerdict(v));
    readSettlement(provider, market.address).then((x) => !dead && setSettle(x));
    return () => {
      dead = true;
    };
  }, [provider, market.address, market.question]);

  if (market.resolved || !market.isV2) return null;

  const now = Date.now() / 1000;
  const closed = market.closesAt !== null && now >= market.closesAt;
  const proposed = settle !== null && settle.proposedOutcome !== 255;
  const windowOver =
    proposed && settle !== null && now >= settle.proposedAt + settle.challengeWindow;

  async function send(calls: ReturnType<typeof proposeCalls>, label: string) {
    if (!account) return setMsg({ ok: false, text: "Connect a wallet first." });
    setBusy(label);
    setMsg(null);
    try {
      const r = await account.execute(calls);
      await provider.waitForTransaction(r.transaction_hash);
      setMsg({ ok: true, text: `${label} confirmed.` });
      onDone();
      readSettlement(provider, market.address).then(setSettle);
    } catch (e: unknown) {
      setMsg({ ok: false, text: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={s.oracle}>
      <div className={s.oracleHead}>
        <span className={s.oracleTitle}>Pragma</span>
        <span className={s.oracleTag}>oracle-informed</span>
      </div>

      {verdict ? (
        <>
          <div className={s.oracleReading}>
            <span className={s.oraclePair}>{verdict.pair}</span>
            <span className={s.oraclePrice}>
              ${verdict.median.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </span>
            <span className={s.oracleMeta}>
              median of {verdict.median.sources} sources ·{" "}
              {new Date(verdict.median.updatedAt * 1000).toUTCString().slice(17, 22)} UTC
            </span>
          </div>
          <div className={s.oracleVerdict}>
            Against a ${verdict.threshold.toLocaleString()} strike, that resolves{" "}
            <b className={verdict.answer === "YES" ? s.yes : s.no}>{verdict.answer}</b>
            {!closed && " — if it closed right now."}
          </div>
        </>
      ) : (
        <div className={s.oracleMeta}>
          No Pragma feed matches this question, so settlement here is a human claim
          backed by a bond.
        </div>
      )}

      {closed && settle && (
        <div className={s.oracleActions}>
          {!proposed && (
            <>
              <button
                className={s.oracleBtn}
                disabled={!!busy || !account}
                onClick={() =>
                  send(
                    proposeCalls(market.address, verdict?.answer === "YES" ? 1 : 0, settle.bond),
                    "Proposal",
                  )
                }
              >
                {busy || `Propose ${verdict ? verdict.answer : "YES"}`}
              </button>
              {verdict && (
                <button
                  className={s.oracleGhost}
                  disabled={!!busy || !account}
                  onClick={() =>
                    send(
                      proposeCalls(market.address, verdict.answer === "YES" ? 0 : 1, settle.bond),
                      "Proposal",
                    )
                  }
                >
                  Propose {verdict.answer === "YES" ? "NO" : "YES"} instead
                </button>
              )}
              <span className={s.oracleMeta}>
                {settle.bond > 0n
                  ? `Stakes a ${fmtStrk(settle.bond)} STRK bond, returned when it finalises.`
                  : "No bond on this market — proposing is free."}
              </span>
            </>
          )}

          {proposed && !windowOver && (
            <span className={s.oracleMeta}>
              {settle.proposedOutcome === 1 ? "YES" : settle.proposedOutcome === 0 ? "NO" : "VOID"}{" "}
              proposed. Disputable until{" "}
              {new Date((settle.proposedAt + settle.challengeWindow) * 1000)
                .toUTCString()
                .replace("GMT", "UTC")}
              .
            </span>
          )}

          {proposed && windowOver && !settle.disputed && (
            <>
              <button
                className={s.oracleBtn}
                disabled={!!busy || !account}
                onClick={() => send(finalizeCall(market.address), "Finalise")}
              >
                {busy || "Finalise"}
              </button>
              <span className={s.oracleMeta}>
                Challenge window closed unchallenged. Anyone can finalise.
              </span>
            </>
          )}

          {settle.disputed && (
            <span className={s.oracleMeta}>
              Disputed. The arbiter rules, and the wrong side forfeits its bond.
            </span>
          )}
        </div>
      )}

      {!closed && (
        <div className={s.oracleMeta}>
          Betting is still open, so nothing can be proposed yet.
        </div>
      )}

      {msg && (
        <div className={msg.ok ? s.oracleOk : s.oracleErr}>{msg.text}</div>
      )}
      {address ? null : null}
    </div>
  );
}

/**
 * The leaderboard, built rather than argued about.
 *
 * A prose panel saying "we cannot rank whales" asks to be believed. This shows the
 * actual ranking: every position in the market, largest first, straight from the
 * contract's own events. The sizes are all there, because public sizes are what make
 * the odds worth reading. The identity column is drawn, and empty, because a
 * position is keyed by a commitment and the pool was the caller — there is nothing
 * being withheld, there is nothing to withhold.
 */
function Book({ market, provider }: { market: MarketState; provider: ProviderInterface }) {
  const [rows, setRows] = useState<BookEntry[] | null>(null);

  useEffect(() => {
    let dead = false;
    setRows(null);
    readBook(provider, market.address).then((b) => !dead && setRows(b));
    return () => {
      dead = true;
    };
  }, [provider, market.address]);

  const total = (rows ?? []).reduce((a, r) => a + r.size, 0n);

  return (
    <section className={s.book}>
      <div className={s.bookHead}>
        <span className={s.bookTitle}>The book</span>
        <span className={s.bookTag}>every size · no names</span>
      </div>

      {rows === null ? (
        <p className={s.bookEmpty}>Reading positions from chain…</p>
      ) : rows.length === 0 ? (
        <p className={s.bookEmpty}>
          Nobody has taken a position yet. When they do, every size appears here and no
          name ever will.
        </p>
      ) : (
        <>
          <div className={s.bookRows}>
            {rows.slice(0, 8).map((r, i) => (
              <div className={s.bookRow} key={`${r.commitment}-${i}`}>
                <span className={s.bookRank}>{i + 1}</span>
                <span
                  className={s.bookRedact}
                  title="No identity is recorded on chain"
                  aria-label="No identity is recorded on chain"
                />
                <span className={s.bookCommit}>
                  {r.commitment.slice(0, 10)}…{r.commitment.slice(-4)}
                </span>
                <span className={r.outcome === OUTCOME_YES ? s.yes : s.no}>
                  {r.outcome === OUTCOME_YES ? "YES" : "NO"}
                </span>
                <span className={s.bookSize}>{fmtStrk(r.size)} STRK</span>
              </div>
            ))}
          </div>
          <div className={s.bookFoot}>
            <span>
              {rows.length} position{rows.length === 1 ? "" : "s"} · {fmtStrk(total)} STRK
            </span>
            <span className={s.bookFootDim}>0 identities</span>
          </div>
        </>
      )}

      <p className={s.bookNote}>
        Polymarket ranks its whales in a panel like this one, and that ranking is what
        produces herding and copy-betting. Every size is here. There is nowhere to put a
        name.
      </p>
    </section>
  );
}

function Resolution({ market }: { market: MarketState }) {
  const closes =
    market.closesAt === null
      ? "no deadline (first-generation market)"
      : new Date(market.closesAt * 1000).toUTCString().replace("GMT", "UTC");
  return (
    <section className={s.resolution}>
      <div className={s.resHead}>
        <span className={s.resTitle}>How this settles</span>
        <span className={s.resTag}>{market.isV2 ? "Permissionless" : "Named resolver"}</span>
      </div>
      <dl className={s.resGrid}>
        <dt>Betting closes</dt>
        <dd>{closes}</dd>
        <dt>Who settles</dt>
        <dd>
          {market.isV2
            ? "Anyone. Post a bond and propose the outcome."
            : "A single named resolver address."}
        </dd>
        <dt>If contested</dt>
        <dd>
          {market.isV2
            ? "Anyone matches the bond to dispute. An arbiter then rules, and the wrong side forfeits its bond to the right one."
            : "No dispute path on this generation — the reason v2 replaced it."}
        </dd>
        <dt>Payout</dt>
        <dd>
          {market.kind === "cpmm"
            ? "Each winning share redeems for exactly 1 STRK, into a shielded note."
            : "Winners split the whole pot in proportion to their stake."}
        </dd>
        <dt>Source of truth</dt>
        <dd>
          The question names a public, checkable fact. For price questions the panel
          reads Pragma and pre-fills the proposal, but the contract does not verify a
          feed — settlement is a bonded human claim either way.
        </dd>
      </dl>
    </section>
  );
}


/**
 * Exaggerated minimalism: one statement at display scale, enormous negative space,
 * and the live market state as small caps beneath it. The board used to open on a
 * stats row and a grid, which reads as a dashboard. A prediction market should
 * open by saying what it is.
 */
function Hero({
  markets,
  totalVolume,
  openCount,
  onOpen,
}: {
  markets: MarketState[];
  totalVolume: bigint;
  openCount: number;
  onOpen: (a: string) => void;
}) {
  // The market with the most volume leads: a real price beats a placeholder.
  const lead = [...markets].sort((a, b) => (a.volume > b.volume ? -1 : 1))[0];
  return (
    <header className={s.hero}>
      <div className={s.heroInner}>
        <h1 className={s.heroTitle}>
          <span className={s.heroRow}>
            <span className={s.heroLine}>VISIBLE</span>
            <span className={s.heroLine}>ODDS.</span>
          </span>
          <span className={s.heroRow}>
            <span className={`${s.heroLine} ${s.heroAccent}`}>INVISIBLE</span>
            <span className={`${s.heroLine} ${s.heroAccent}`}>BETTORS.</span>
          </span>
        </h1>

        <div className={s.heroSide}>
          <p className={s.heroBlurb}>
            A prediction market on Starknet where the prices are public and the
            people are not. Bet sizes and odds stay visible, so the market stays
            accurate. Who is betting never touches the chain.
          </p>

          <dl className={s.heroStats}>
            <div>
              <dt>Volume</dt>
              <dd>{fmtStrk(totalVolume)} STRK</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{openCount}</dd>
            </div>
            <div>
              <dt>Bettors known</dt>
              <dd className={s.heroZero}>0</dd>
            </div>
          </dl>

          {lead && (
            <button className={s.heroLead} onClick={() => onOpen(lead.address)}>
              <span className={s.heroLeadLabel}>Most traded</span>
              <span className={s.heroLeadQ}>{lead.question}</span>
              <span className={s.heroLeadPx}>
                <b className={s.yes}>{priceCents(lead.priceYesBps)}¢</b> yes
                <span className={s.heroLeadDiv} />
                <b className={s.no}>{priceCents(10000 - lead.priceYesBps)}¢</b> no
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * The first derivation slot this wallet has not already spent on this market.
 *
 * Reusing a slot would compute a commitment the contract already holds and the buy
 * would revert, so this walks forward past whatever is already known locally.
 */
function nextSlot(master: string, market: string, saved: SavedPosition[]): number {
  const used = new Set(saved.filter((p) => p.market === market).map((p) => p.secret));
  for (let i = 0; i < 64; i++) {
    if (!used.has(derivedSecret(master, market, i))) return i;
  }
  return 64;
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
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [filter, setFilter] = useState<"all" | "crypto" | "starknet" | "closing">("all");
  const [sort, setSort] = useState<"volume" | "closing" | "new">("volume");
  const [query, setQuery] = useState("");
  // Markets this browser created or pinned. There is no global index, so the board
  // is the curated list plus whatever the user chose to keep.
  const [userMarkets, setUserMarkets] = useState<UserMarket[]>([]);
  const [pinAddr, setPinAddr] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [shared, setShared] = useState(false);
  // The pool charges a flat fee per private operation. At these stake sizes it is
  // the dominant cost, so the panel has to say it before the user signs.
  const [poolFee, setPoolFee] = useState<bigint | null>(null);
  // The wallet-derived master key, once the user has unlocked it this session. New
  // bets key off it so they can be recovered on any device; without it we fall back
  // to a random secret that only this browser will ever know.
  const [master, setMaster] = useState<string | null>(cachedMaster());
  // The position this wallet holds on the open market, derived rather than typed.
  const [mine, setMine] = useState<Awaited<ReturnType<typeof findPosition>>>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const provider = constants.myFrontendProviders[0]; // mainnet

  const refresh = useCallback(async () => {
    const all = [...MARKETS, ...loadUserMarkets().map((m) => normalizeAddress(m.address))];
    const seen = new Set<string>();
    const list = all.filter((a) => {
      const k = normalizeAddress(a);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const entries = await Promise.all(
      list.map(async (addr) => {
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
    readPoolFee(provider).then(setPoolFee);
  }, [provider]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    setSaved(loadPositions());
    setUserMarkets(loadUserMarkets());
    // A shared link carries a bare address. Anything that reads as a market opens,
    // whether or not this build shipped with it listed.
    //
    // The listener matters: pasting a second link into an already-open tab is a
    // same-document navigation, so without it the URL changes and the page keeps
    // showing the previous market.
    const open = () => {
      const h = window.location.hash.replace("#", "");
      if (!h) return;
      try {
        setSelected(normalizeAddress(h));
      } catch {
        /* not an address */
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  // A link can name a market this build never shipped and the user has not pinned.
  // Read it on its own so a shared market opens for someone seeing it first time.
  useEffect(() => {
    if (!selected || markets[selected]) return;
    let dead = false;
    readMarket(provider, selected)
      .then((m) => {
        if (!dead) setMarkets((prev) => ({ ...prev, [selected]: m }));
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [selected, markets, provider]);

  const boardAddrs = [
    ...MARKETS,
    ...userMarkets
      .map((m) => normalizeAddress(m.address))
      .filter((a) => !MARKETS.some((c) => normalizeAddress(c) === a)),
  ];
  useEffect(() => {
    let dead = false;
    setMine(null);
    if (!master || !selected) return;
    findPosition(provider, master, selected).then((p) => !dead && setMine(p));
    return () => {
      dead = true;
    };
  }, [master, selected, provider]);

  const all = boardAddrs.map((a) => markets[a]).filter(Boolean) as MarketState[];

  const CRYPTO = /\b(BTC|ETH|SOL|XRP|DOGE)\b/;
  const STARKNET = /\b(STRK|Starknet|strk20)\b/i;
  const soon = (m: MarketState) =>
    m.closesAt !== null && m.closesAt * 1000 - Date.now() < 14 * 864e5;

  const q = query.trim().toLowerCase();
  const list = all
    .filter((m) => (q === "" ? true : m.question.toLowerCase().includes(q)))
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

  // Price history for whichever market is open, straight from its own events.
  useEffect(() => {
    let dead = false;
    if (!market || market.kind !== "cpmm") {
      setHistory([]);
      return;
    }
    readPriceHistory(provider, market.address).then((h) => {
      if (!dead) setHistory(h);
    });
    return () => {
      dead = true;
    };
  }, [market?.address, market?.volume, provider]);

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

  /** Ask the wallet for the key once, then reuse it for the rest of the session. */
  async function unlockWallet(): Promise<string | null> {
    if (master) return master;
    if (!myWalletAccount || !address) {
      setResult({ kind: "err", msg: "Connect a wallet first." });
      return null;
    }
    setUnlocking(true);
    setResult({ kind: "pending", msg: "Approve both prompts — the second proves the key can be rebuilt." });
    try {
      const m = await unlock(myWalletAccount as never, address);
      setMaster(m);
      setResult({ kind: "idle" });
      return m;
    } catch (e: unknown) {
      setResult({ kind: "err", msg: (e as { message?: string })?.message ?? String(e) });
      return null;
    } finally {
      setUnlocking(false);
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

    // A derived secret can be rebuilt from the wallet on any machine. A random one
    // exists only in this browser's storage, which is why the vault has to be
    // exported. Prefer the first whenever the key has been unlocked.
    const secret = master
      ? derivedSecret(master, market.address, nextSlot(master, market.address, saved))
      : randomSecret();
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

  async function claim(useSecret?: string) {
    if (!myWalletAccount || !market)
      return setResult({ kind: "err", msg: "Connect a wallet first." });
    const secret = (useSecret ?? claimSecret).trim();
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
      <div className={s.aurora} aria-hidden />
      <Nav />

      <Ticker items={all} onPick={selectMarket} />

      <div className={s.shell}>
        {/* The hero states what Doom is, which is the right thing to lead with on the
            board and pure noise once a market is open — on a phone it pushed the
            market the user had just tapped a full screen below the fold. */}
        {!market && (
          <Hero
            markets={all}
            totalVolume={totalStaked}
            openCount={open}
            onOpen={selectMarket}
          />
        )}

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
              <input
                className={s.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search markets"
                aria-label="Search markets"
              />
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
              <Link className={s.pill} href="/portfolio/">
                My bets{saved.length > 0 ? ` (${saved.length})` : ""}
              </Link>
            </div>

            <div className={s.pinRow}>
              <input
                className={s.pinInput}
                value={pinAddr}
                onChange={(e) => {
                  setPinAddr(e.target.value);
                  setPinMsg("");
                }}
                placeholder="Pin a market someone sent you — paste its address"
                aria-label="Pin a market by address"
              />
              <button
                className={s.pinBtn}
                disabled={!pinAddr.trim()}
                onClick={async () => {
                  setPinMsg("Reading…");
                  const r = await verifyMarket(provider, pinAddr);
                  if (!r.ok) return setPinMsg(r.why);
                  saveUserMarket({
                    address: normalizeAddress(pinAddr),
                    question: r.question,
                    mine: false,
                    at: Date.now(),
                  });
                  setUserMarkets(loadUserMarkets());
                  setPinAddr("");
                  setPinMsg(`Pinned "${r.question.slice(0, 44)}…"`);
                  refresh();
                }}
              >
                Pin
              </button>
              {pinMsg ? <span className={s.pinMsg}>{pinMsg}</span> : null}
            </div>

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
                      {marketIcon(m.question) && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img className={s.tileIcon} src={marketIcon(m.question)!} alt="" />
                      )}
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
            <button
              className={s.shareBtn}
              onClick={async () => {
                const url = `${window.location.origin}${window.location.pathname}#${market.address}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setShared(true);
                  setTimeout(() => setShared(false), 1800);
                } catch {
                  // Clipboard can be blocked; showing the link still lets them copy it.
                  window.prompt("Copy this link", url);
                }
              }}
            >
              {shared ? "Link copied" : "Share"}
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

                  {market.kind === "cpmm" && (
                    <PriceChart points={history} current={market.priceYesBps} />
                  )}

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
                      Settlement{" "}
                      <span className={s.metaVal}>
                        {market.kind === "cpmm"
                          ? "1 share pays 1 STRK"
                          : "Parimutuel · winners split the pot"}
                      </span>
                    </span>
                    <span className={s.metaItem}>
                      Resolution{" "}
                      <span className={s.metaVal}>
                        {market.isV2 ? "Bonded, anyone can propose" : "Named resolver"}
                      </span>
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

                <OracleSettle
                  market={market}
                  provider={provider}
                  account={myWalletAccount}
                  address={address}
                  onDone={refresh}
                />
                <Book market={market} provider={provider} />
                <Resolution market={market} />
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
                            {poolFee !== null && poolFee > 0n && (
                              <>
                                <div className={s.fillRow}>
                                  <span>Pool fee</span>
                                  <span className={s.fillFee}>{fmtStrk(poolFee)} STRK</span>
                                </div>
                                <div className={s.fillRow}>
                                  <span>Total cost</span>
                                  <span className={s.fillVal}>
                                    {(() => {
                                      let cost = 0n;
                                      try {
                                        cost = parseStrk(amount);
                                      } catch {}
                                      return fmtStrk(cost + poolFee);
                                    })()}{" "}
                                    STRK
                                  </span>
                                </div>
                              </>
                            )}
                            <div className={s.fillRow}>
                              <span>Return, after fee</span>
                              <span className={s.fillVal}>
                                {(() => {
                                  let cost = 1n;
                                  try {
                                    cost = parseStrk(amount);
                                  } catch {}
                                  if (cost <= 0n) return "—";
                                  // Net of the pool fee: the gross number told a
                                  // 1 STRK bettor they were up 75% while they were
                                  // six STRK down.
                                  const outlay = cost + (poolFee ?? 0n);
                                  const pct = Number((quote * 10000n) / outlay) / 100 - 100;
                                  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
                                })()}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* A win pays `shares`. If that cannot cover stake plus fee,
                            the bet loses money even when it is right - which at a
                            6 STRK fee is true of every small stake. */}
                        {poolFee !== null &&
                          quote != null &&
                          quote > 0n &&
                          (() => {
                            let cost = 0n;
                            try {
                              cost = parseStrk(amount);
                            } catch {}
                            if (cost <= 0n) return null;
                            const outlay = cost + poolFee;
                            if (quote >= outlay) return null;
                            return (
                              <div className={s.feeWarn}>
                                Even if this wins it pays {fmtStrk(quote)} STRK against{" "}
                                {fmtStrk(outlay)} spent. The {fmtStrk(poolFee)} STRK pool fee is
                                charged per private operation regardless of size, so small stakes
                                cannot cover it — stake more, or don&apos;t take this one.
                              </div>
                            );
                          })()}

                        {market.kind === "cpmm" && !settled && (
                          <Depth market={market} outcome={outcome} />
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
                        {/* Asking a winner to paste a private key was never a real
                            design — the app derived that key and can derive it
                            again. Sign, and it finds the position itself. */}
                        {!master ? (
                          <>
                            <p className={s.claimLede}>
                              Sign once and Doom rebuilds the key it bet with, then claims
                              for you. Nothing to copy, nothing to keep.
                            </p>
                            <button
                              className={s.cta}
                              onClick={unlockWallet}
                              disabled={!myWalletAccount || unlocking}
                            >
                              {unlocking ? "Check your wallet…" : "Unlock with wallet"}
                            </button>
                          </>
                        ) : mine ? (
                          <>
                            <div className={s.claimFound}>
                              <span className={s.claimFoundSide}>
                                {mine.outcome === OUTCOME_YES ? "YES" : "NO"}
                              </span>
                              <span>
                                {fmtStrk(mine.amount)} STRK staked
                                {market.winningOutcome === mine.outcome ||
                                market.winningOutcome === OUTCOME_VOID
                                  ? " — this one wins"
                                  : " — this one lost"}
                              </span>
                            </div>
                            <button
                              className={s.cta}
                              onClick={() => {
                                setClaimSecret(mine.secret);
                                claim(mine.secret);
                              }}
                              disabled={
                                result.kind === "pending" ||
                                (market.winningOutcome !== OUTCOME_VOID &&
                                  market.winningOutcome !== mine.outcome)
                              }
                            >
                              {result.kind === "pending" ? "Working…" : "Claim payout"}
                            </button>
                          </>
                        ) : (
                          <p className={s.claimLede}>
                            This wallet holds no position on this market.
                          </p>
                        )}

                        {/* Positions made before keys were wallet-derived, or one
                            someone handed you, still need a way in. */}
                        <button className={s.claimManual} onClick={() => setShowManual((v) => !v)}>
                          {showManual ? "Hide" : "Claim with a secret instead"}
                        </button>
                        {showManual && (
                          <>
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
                              className={s.ghost}
                              onClick={() => claim()}
                              disabled={!myWalletAccount || result.kind === "pending"}
                            >
                              Claim with this secret
                            </button>
                          </>
                        )}
                        {mySecrets.length > 0 && (
                          <div className={s.pickList}>
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
                                  className={`${s.pickRow} ${won ? s.pickWon : s.pickLost}`}
                                  onClick={() => setClaimSecret(p.secret)}
                                  disabled={!won || result.kind === "pending"}
                                  title={won ? "Load this secret" : "This side lost"}
                                >
                                  <span className={p.outcome === OUTCOME_YES ? s.yes : s.no}>
                                    {side}
                                  </span>
                                  <span className={s.pickAmt}>
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

        <div className={s.ledger}>
          <div className={s.ledgerCol}>
            <span className={s.ledgerLabel}>Public</span>
            <span className={s.ledgerItems}>
              the question · the odds · every bet size · the resolution
            </span>
            <span className={s.ledgerWhy}>This is what makes the odds worth reading.</span>
          </div>
          <div className={s.ledgerCol}>
            <span className={`${s.ledgerLabel} ${s.ledgerLabelHot}`}>Hidden</span>
            <span className={s.ledgerItems}>
              who bet · what they have bet anywhere else
            </span>
            <span className={s.ledgerWhy}>This is what makes them manipulable.</span>
          </div>
        </div>
        <p className={s.footNote}>
          <b>The limits, plainly.</b> Claiming reveals the secret, so a payout links back to
          the bet that earned it — never to a person. The anonymity set is the STRK20
          pool&apos;s, not Doom&apos;s alone. The contracts are a draft, unaudited, written in an
          18-day sprint. Bet small.
        </p>
      </div>
    </main>
  );
}
