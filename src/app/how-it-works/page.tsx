"use client";

// The explanation, given room.
//
// All of this used to be compressed into a footer paragraph under the board, where
// the one thing a new bettor most needs — that a bet costs a flat pool fee on top of
// the stake — was not said at all.

import Link from "next/link";
import s from "../market.module.css";
import h from "./how.module.css";
import Nav from "../components/Nav";

export default function HowItWorks() {
  return (
    <main className={s.page}>
      <Nav tag="what it is, and what it costs" />

      <div className={h.wrap}>
        <h1 className={h.title}>How Doom works</h1>
        <p className={h.lede}>
          A prediction market where the prices are public and the people are not. Bet
          sizes and odds stay visible, because that is what makes a market worth
          reading. Who is betting never touches the chain.
        </p>

        <section className={h.section}>
          <h2 className={h.h2}>The split</h2>
          <div className={h.ledger}>
            <div className={h.ledgerCol}>
              <span className={h.ledgerLabel}>Public</span>
              <span className={h.ledgerItems}>
                the question · the odds · every bet size · the resolution
              </span>
              <span className={h.ledgerWhy}>This is what makes the odds worth reading.</span>
            </div>
            <div className={h.ledgerCol}>
              <span className={`${h.ledgerLabel} ${h.ledgerLabelHot}`}>Hidden</span>
              <span className={h.ledgerItems}>
                who bet · what they have bet anywhere else
              </span>
              <span className={h.ledgerWhy}>This is what makes them manipulable.</span>
            </div>
          </div>
        </section>

        <section className={h.section}>
          <h2 className={h.h2}>A bet, end to end</h2>
          <ol className={h.steps}>
            <li>
              <b>Shield.</b> Move STRK into the STRK20 pool, where it becomes a note.{" "}
              <Link href="/wallet/" className={h.link}>Do that here →</Link>
            </li>
            <li>
              <b>Buy a side.</b> The pool calls the market, so the contract never sees an
              address — there is none in the call. Your position is keyed by a hash of a
              secret only you hold.
            </li>
            <li>
              <b>The price moves.</b> Every buy shifts the odds, which is what makes this a
              market rather than a pot.
            </li>
            <li>
              <b>Settle.</b> After close, anyone posts a bond and proposes the outcome.
              Anyone can dispute by matching it. No administrator.
            </li>
            <li>
              <b>Claim.</b> A winning share redeems for exactly 1 STRK, back into a shielded
              note.
            </li>
          </ol>
        </section>

        <section className={h.section}>
          <h2 className={h.h2}>What a bet costs</h2>
          <p className={h.body}>
            The pool charges a <b>flat fee per private operation</b> — about 6 STRK on
            mainnet. Not per STRK staked: per operation. It applies to shielding, to each
            bet, and to each claim.
          </p>
          <div className={h.table}>
            <div className={h.row}><span>Stake 1 STRK</span><span>pays 1.76 if right</span><span className={h.neg}>−74.9%</span></div>
            <div className={h.row}><span>Stake 5 STRK</span><span>pays 7.84 if right</span><span className={h.neg}>−28.7%</span></div>
            <div className={h.row}><span>Stake 20 STRK</span><span>pays 25.87 if right</span><span className={h.neg}>−0.5%</span></div>
            <div className={h.row}><span>Stake 40 STRK</span><span>pays 47.13 if right</span><span className={h.pos}>+2.5%</span></div>
          </div>
          <p className={h.body}>
            On a book this thin the fee is only covered past about 20 STRK, so a smaller
            bet loses money <i>even when it is right</i>. The trade panel says so before
            you sign. It is also why most of the board is untraded — an economic fact,
            not a missing feature.
          </p>
        </section>

        {/* The governance layer is in the repository, tested, and not yet deployed.
            Saying so plainly beats both silence and a screenshot of something that
            does not exist — and the moment an instance is live, the panel on the
            board renders it with no further change. */}
        <section className={h.section}>
          <h2 className={h.h2}>Deciding by market, not by vote</h2>
          <p className={h.body}>
            The same primitive answers a different question. A prediction market asks
            &ldquo;will X happen?&rdquo;. Futarchy asks &ldquo;should we do X?&rdquo;, by
            opening two conditional markets on the same outcome — one assuming the
            proposal is adopted, one assuming it is rejected. Whichever prices success
            higher <b>is</b> the decision. The losing branch never happened, so it voids
            and every stake in it is refunded.
          </p>
          <p className={h.body}>
            Every live futarchy — MetaDAO on Solana, Optimism&apos;s OP experiment — is
            fully transparent, and the documented failure is exactly that: whales get
            watched and copied, insiders get pressured, positions become politics. Over
            anonymous markets the prices stay public and the participants do not, so
            <code> decide()</code> takes no arguments, has no authorized caller, and the{" "}
            <code>Decided</code> event names no signer.
          </p>
          <p className={h.caveat}>
            <code>DoomDecision</code> is written and tested — seven Cairo tests covering
            the tie rule, the empty-book case and the losing branch&apos;s refund — but no
            instance is deployed on mainnet yet, so nothing for it appears on the board.
            The contract is in the repository if you want to read it before it runs.
          </p>
        </section>

        <section className={h.section}>
          <h2 className={h.h2}>What this does not hide</h2>
          <ul className={h.list}>
            <li>
              <b>Timing.</b> Shielding and betting are separate transactions. An observer
              can correlate a deposit with a bet of the same size shortly after.
            </li>
            <li>
              <b>Claiming.</b> A payout reveals the secret, so it links back to the bet that
              earned it — never to a person, but the pair is joined.
            </li>
            <li>
              <b>The anonymity set is the pool&apos;s.</b> Doom adds none of its own. Few
              depositors means a small set, whatever Doom does.
            </li>
            <li>
              <b>Thin books move.</b> Two STRK can shift a small market twenty points. Read
              the current odds accordingly.
            </li>
          </ul>
          <p className={h.caveat}>
            Draft contracts, unaudited, written in an eighteen-day sprint. Bet small.
          </p>
        </section>
      </div>
    </main>
  );
}
