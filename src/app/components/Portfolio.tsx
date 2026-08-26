"use client";

// The position list.
//
// Export and restore used to live here. They existed because a position was a secret
// in this browser and nothing else could rebuild it; keys are derived from the wallet
// now, so a file to carry between machines is a worse answer to a solved problem.

import s from "../market.module.css";
import {
  OUTCOME_YES,
  fmtStrk,
  pnlPct,
  positionValue,
  type MarketState,
  type SavedPosition,
} from "@/lib/doom";

export default function Portfolio({
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
          No bets found yet. Positions are keyed by a secret rather than an account, so
          nothing on chain lists them — unlock with your wallet above and Doom rebuilds
          the keys, or restore a backup.
        </p>
      </div>
    );
  }

  // Marked against the live price, so the panel answers "what is this worth now"
  // rather than only "what did I pay".
  const marks = saved.map((p) => positionValue(p, markets[p.market]));
  const open = marks.filter((v) => v && v.status === "open");
  const bookBasis = open.reduce((a, v) => a + v!.basis, 0n);
  const bookValue = open.reduce((a, v) => a + v!.value, 0n);
  const claimable = saved.reduce(
    (a, p, i) => (marks[i]?.status === "won" ? a + marks[i]!.value : a),
    0n,
  );
  const order = saved.map((p, i) => ({ p, v: marks[i] })).reverse();
  return (
    <div className={s.portfolio}>
      <div className={s.portfolioHead}>
        My bets<span className={s.portfolioCount}>{saved.length}</span>
      </div>

      {(bookBasis > 0n || claimable > 0n) && (
        <div className={s.summaryRow}>
          {bookBasis > 0n && (
            <>
              <span className={s.summaryCell}>
                <span className={s.summaryLabel}>Open value</span>
                <span className={s.summaryValue}>{fmtStrk(bookValue)} STRK</span>
              </span>
              <span className={s.summaryCell}>
                <span className={s.summaryLabel}>Cost</span>
                <span className={s.summaryValue}>{fmtStrk(bookBasis)} STRK</span>
              </span>
              <span className={s.summaryCell}>
                <span className={s.summaryLabel}>Unrealised</span>
                <span
                  className={
                    bookValue >= bookBasis ? `${s.summaryValue} ${s.yes}` : `${s.summaryValue} ${s.no}`
                  }
                >
                  {bookValue >= bookBasis ? "+" : "−"}
                  {fmtStrk(bookValue >= bookBasis ? bookValue - bookBasis : bookBasis - bookValue)}
                </span>
              </span>
            </>
          )}
          {claimable > 0n && (
            <span className={s.summaryCell}>
              <span className={s.summaryLabel}>Claimable</span>
              <span className={`${s.summaryValue} ${s.yes}`}>{fmtStrk(claimable)} STRK</span>
            </span>
          )}
        </div>
      )}

      <div className={s.posList}>
        {order.map(({ p, v }, i) => {
          const m = markets[p.market];
          const shares = p.shares ? BigInt(p.shares) : null;
          const pct = v ? pnlPct(v) : null;
          const up = v ? v.value >= v.basis : true;
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
                {v && (
                  <span className={s.posMark}>
                    {fmtStrk(v.value)} STRK
                    {pct !== null && v.status === "open" && (
                      <span className={up ? s.yes : s.no}>
                        {" "}
                        {up ? "+" : ""}
                        {pct.toFixed(1)}%
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span
                className={
                  v?.status === "won"
                    ? s.posWon
                    : v?.status === "lost"
                      ? s.posLost
                      : s.posOpen
                }
              >
                {v?.status === "won"
                  ? "claimable"
                  : v?.status === "lost"
                    ? "lost"
                    : v?.status === "void"
                      ? "void"
                      : "open"}
              </span>
            </button>
          );
        })}
      </div>
      <p className={s.portfolioNote}>
        Bets made with a wallet-derived key can be rebuilt by signing again, on any
        device. Older ones exist only in this browser — clear your site data and those
        become unreachable by anyone, including us, so export them.
      </p>
    </div>
  );
}
