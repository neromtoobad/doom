"use client";

// The futarchy screen. Two conditional branches face each other, and the one that
// prices success higher becomes the decision — executed by decide(), which anyone
// may call and which takes no arguments. There is no authorized signer in a Doom
// governance decision; there is only a comparison of two market prices.

import { useEffect, useState } from "react";
import s from "./decision.module.css";
import {
  DECISION_ADOPT,
  DECISION_INCONCLUSIVE,
  DECISION_PENDING,
  DECISION_REJECT,
  branchShareBps,
  fmtStrk,
  type DecisionState,
  type MarketState,
} from "@/lib/doom";

function Dial({ bps, tone }: { bps: number; tone: "adopt" | "reject" }) {
  const pct = Math.round(bps / 100);
  const r = 54;
  const len = Math.PI * r;
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  const color = tone === "adopt" ? "#22c55e" : "#ff6b35";
  return (
    <div className={s.dial}>
      <svg width="132" height="82" viewBox="0 0 132 82" aria-hidden>
        <path
          d={`M 12 70 A ${r} ${r} 0 0 1 120 70`}
          fill="none"
          stroke="#2a2a31"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={`M 12 70 A ${r} ${r} 0 0 1 120 70`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(drawn / 100) * len} ${len}`}
          style={{
            transition: "stroke-dasharray 1.2s cubic-bezier(.22,1,.36,1)",
            filter: `drop-shadow(0 0 7px ${color}66)`,
          }}
        />
      </svg>
      <div className={s.dialVal} style={{ color }}>
        {pct}%
      </div>
    </div>
  );
}

function Branch({
  label,
  sub,
  market,
  tone,
  winning,
  decided,
}: {
  label: string;
  sub: string;
  market: MarketState;
  tone: "adopt" | "reject";
  winning: boolean;
  decided: boolean;
}) {
  return (
    <div
      className={`${s.branch} ${tone === "adopt" ? s.branchAdopt : s.branchReject} ${
        decided && winning ? s.branchWon : ""
      } ${decided && !winning ? s.branchLost : ""}`}
    >
      <div className={s.branchHead}>
        <span className={`${s.branchLabel} ${tone === "adopt" ? s.adoptTx : s.rejectTx}`}>
          {label}
        </span>
        {decided && winning && <span className={s.wonTag}>the decision</span>}
      </div>
      <p className={s.branchSub}>{sub}</p>
      <Dial bps={branchShareBps(market)} tone={tone} />
      <p className={s.branchQ}>{market.question}</p>
      <div className={s.branchFoot}>
        <span>{fmtStrk(market.total)} STRK staked</span>
        <span className={s.branchDim}>holders hidden</span>
      </div>
    </div>
  );
}

export default function DecisionPanel({
  state,
  canDecide,
  onDecide,
  busy,
}: {
  state: DecisionState;
  canDecide: boolean;
  onDecide: () => void;
  busy: boolean;
}) {
  const decided = state.decision !== DECISION_PENDING;
  const adoptBps = decided ? state.adoptBps : branchShareBps(state.adopt);
  const rejectBps = decided ? state.rejectBps : branchShareBps(state.reject);
  const adoptWins = state.decision === DECISION_ADOPT;

  const verdict =
    state.decision === DECISION_ADOPT
      ? "ADOPT"
      : state.decision === DECISION_REJECT
        ? "REJECT"
        : state.decision === DECISION_INCONCLUSIVE
          ? "INCONCLUSIVE"
          : null;

  const closesIn = state.closesAt ? state.closesAt * 1000 - Date.now() : null;
  const open = closesIn !== null && closesIn > 0;

  return (
    <section className={s.wrap}>
      <div className={s.kicker}>
        <span className={s.kickerTag}>Futarchy</span>
        the market is the vote
      </div>

      <h1 className={s.proposal}>{state.proposal}</h1>

      <p className={s.explain}>
        Two conditional markets price the same outcome — one assuming we adopt, one
        assuming we reject. Whichever prices success higher <strong>is</strong> the
        decision. Nobody votes, nobody has authority, and nobody can see who staked.
      </p>

      <div className={s.pair}>
        <Branch
          label="ADOPT"
          sub="conditional on adopting"
          market={state.adopt}
          tone="adopt"
          winning={adoptWins}
          decided={decided}
        />
        <div className={s.versus}>
          <span className={s.vsLine} />
          <span className={s.vsText}>vs</span>
          <span className={s.vsLine} />
        </div>
        <Branch
          label="REJECT"
          sub="conditional on rejecting"
          market={state.reject}
          tone="reject"
          winning={!adoptWins && state.decision === DECISION_REJECT}
          decided={decided}
        />
      </div>

      {decided ? (
        <div className={`${s.verdict} ${adoptWins ? s.verdictAdopt : s.verdictReject}`}>
          <div className={s.verdictLabel}>The market decided</div>
          <div className={s.verdictValue}>{verdict}</div>
          <div className={s.verdictMath}>
            adopt priced {Math.round(adoptBps / 100)}% · reject priced{" "}
            {Math.round(rejectBps / 100)}%
          </div>
          <p className={s.verdictNote}>
            Recorded on chain by <code>decide()</code>, a function with no owner and no
            arguments. The losing branch never happened, so every stake in it is refunded.
          </p>
        </div>
      ) : (
        <div className={s.pending}>
          <div className={s.pendingRow}>
            <span className={s.pendingLabel}>
              {open ? "Staking open" : "Books closed — awaiting decide()"}
            </span>
            <span className={s.pendingLead}>
              {adoptBps === rejectBps
                ? "dead heat"
                : adoptBps > rejectBps
                  ? "ADOPT leads"
                  : "REJECT leads"}
            </span>
          </div>
          <button className={s.decideBtn} onClick={onDecide} disabled={!canDecide || busy}>
            {busy ? "Confirm in your wallet…" : open ? "decide() — locked until close" : "Call decide()"}
          </button>
          <p className={s.pendingNote}>
            Anyone can call it. It reads two prices and writes the result. That is the
            entire governance process.
          </p>
        </div>
      )}
    </section>
  );
}
