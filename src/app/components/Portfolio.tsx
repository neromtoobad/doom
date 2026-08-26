"use client";

// Positions and the secret vault. Extracted from the board when the portfolio got
// its own route: the same component now backs /portfolio, and nothing renders it
// inline on the market list any more.

import { useRef, useState } from "react";
import s from "../market.module.css";
import {
  OUTCOME_YES,
  exportPositions,
  fmtStrk,
  importPositions,
  pnlPct,
  positionValue,
  positionsCsv,
  type MarketState,
  type SavedPosition,
} from "@/lib/doom";

/**
 * Export and restore the secret vault.
 *
 * The privacy design has one hard edge: a position is a secret in localStorage, so
 * clearing site data burns the money and nobody — us included — can undo it. This
 * is the cheapest possible insurance, and it stays offline: the file never leaves
 * the browser.
 */
function Backup({
  saved,
  markets,
  onRestored,
}: {
  saved: SavedPosition[];
  markets: Record<string, MarketState>;
  onRestored: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>("");

  function save(text: string, name: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function download() {
    const blob = new Blob([exportPositions()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `doom-positions-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`Saved ${saved.length} position${saved.length === 1 ? "" : "s"}.`);
  }

  async function restore(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { added, skipped } = importPositions(await f.text());
      setMsg(
        added === 0
          ? `Already had all ${skipped} of those.`
          : `Restored ${added}${skipped ? `, skipped ${skipped} already here` : ""}.`,
      );
      onRestored();
    } catch (err: unknown) {
      setMsg((err as { message?: string })?.message ?? "Could not read that file.");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className={s.backup}>
      <button className={s.backupBtn} onClick={download} disabled={saved.length === 0}>
        Back up
      </button>
      <button className={s.backupBtn} onClick={() => file.current?.click()}>
        Restore
      </button>
      <button
        className={s.backupBtn}
        disabled={saved.length === 0}
        onClick={() => {
          const stamp = new Date().toISOString().slice(0, 10);
          save(
            positionsCsv(saved.map((p) => ({ p, m: markets[p.market] }))),
            `doom-positions-${stamp}.csv`,
            "text/csv",
          );
          setMsg("CSV saved — it carries commitments, not secrets.");
        }}
      >
        CSV
      </button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        onChange={restore}
        style={{ display: "none" }}
      />
      {msg ? <span className={s.backupMsg}>{msg}</span> : null}
    </div>
  );
}

export default function Portfolio({
  saved,
  markets,
  onOpen,
  onRestored,
}: {
  saved: SavedPosition[];
  markets: Record<string, MarketState>;
  onOpen: (a: string) => void;
  onRestored: () => void;
}) {
  const backup = <Backup saved={saved} markets={markets} onRestored={onRestored} />;

  if (saved.length === 0) {
    return (
      <div className={s.portfolio}>
        <div className={s.portfolioHead}>My bets</div>
        <p className={s.portfolioEmpty}>
          No bets found yet. Positions are keyed by a secret rather than an account, so
          nothing on chain lists them — unlock with your wallet above and Doom rebuilds
          the keys, or restore a backup.
        </p>
        {backup}
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
        <div className={s.bookRow}>
          {bookBasis > 0n && (
            <>
              <span className={s.bookCell}>
                <span className={s.bookLabel}>Open value</span>
                <span className={s.bookValue}>{fmtStrk(bookValue)} STRK</span>
              </span>
              <span className={s.bookCell}>
                <span className={s.bookLabel}>Cost</span>
                <span className={s.bookValue}>{fmtStrk(bookBasis)} STRK</span>
              </span>
              <span className={s.bookCell}>
                <span className={s.bookLabel}>Unrealised</span>
                <span
                  className={
                    bookValue >= bookBasis ? `${s.bookValue} ${s.yes}` : `${s.bookValue} ${s.no}`
                  }
                >
                  {bookValue >= bookBasis ? "+" : "−"}
                  {fmtStrk(bookValue >= bookBasis ? bookValue - bookBasis : bookBasis - bookValue)}
                </span>
              </span>
            </>
          )}
          {claimable > 0n && (
            <span className={s.bookCell}>
              <span className={s.bookLabel}>Claimable</span>
              <span className={`${s.bookValue} ${s.yes}`}>{fmtStrk(claimable)} STRK</span>
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
      {backup}
    </div>
  );
}
