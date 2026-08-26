"use client";

// Shielding, which the app previously never told anyone how to do.
//
// A bet spends shielded balance, and the trade panel said so — but the only screen
// that could shield was an unlinked starter-kit page still carrying its upstream
// branding. This is that functionality, in Doom's own frame, linked from the nav and
// from the sentence that sends people here.

import Link from "next/link";
import s from "../market.module.css";
import w from "./wallet.module.css";
import Nav from "../components/Nav";
import WalletAccountV6Tag from "../components/client/WalletHandle/WalletAccountV6Tag";

export default function WalletPage() {
  return (
    <main className={s.page}>
      <Nav tag="shield · unshield · balances" />

      <div className={w.wrap}>
        <h1 className={w.title}>Your shielded balance</h1>
        <p className={w.lede}>
          A bet spends shielded STRK, never your public balance — that is what keeps
          the market from learning who you are. Shield here first, then bet.
        </p>

        <div className={w.steps}>
          <div className={w.step}>
            <span className={w.stepNum}>1</span>
            <div>
              <div className={w.stepTitle}>Shield</div>
              <p className={w.stepBody}>
                Moves STRK from your wallet into the STRK20 pool, where it becomes a
                note. Two prompts: an approve, then the deposit.
              </p>
            </div>
          </div>
          <div className={w.step}>
            <span className={w.stepNum}>2</span>
            <div>
              <div className={w.stepTitle}>Bet</div>
              <p className={w.stepBody}>
                The pool calls the market on your behalf, so the contract never sees
                an address. <Link href="/" className={w.link}>Back to the markets →</Link>
              </p>
            </div>
          </div>
          <div className={w.step}>
            <span className={w.stepNum}>3</span>
            <div>
              <div className={w.stepTitle}>Unshield, whenever</div>
              <p className={w.stepBody}>
                Winnings land back in a note. Unshield only when you want the STRK
                public again.
              </p>
            </div>
          </div>
        </div>

        <div className={w.costNote}>
          The pool charges a flat fee per private operation — around 6 STRK on mainnet.
          It applies to shielding, to each bet and to each claim, so plan for it before
          you size a position. <Link href="/how-it-works/" className={w.link}>What a bet costs →</Link>
        </div>

        <WalletAccountV6Tag />
      </div>
    </main>
  );
}
