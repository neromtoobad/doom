"use client";

// Open a market.
//
// The share-market class is already declared on mainnet, so this is a deploy and a
// seed: two signatures, no terminal, no declare fee. Anyone with a wallet can put a
// question on chain and let strangers price it.

import { useState } from "react";
import Link from "next/link";
import { constants as SNconstants, num } from "starknet";
import s from "../market.module.css";
import c from "./create.module.css";
import SelectWallet from "../components/client/WalletHandle/SelectWallet";
import { useStoreWallet } from "../components/Wallet/walletContext";
import {
  MARKET_CLASS_HASH,
  marketConstructorCalldata,
  saveUserMarket,
  seedLiquidityCalls,
} from "@/lib/create";
import { fmtStrk, parseStrk } from "@/lib/doom";
import * as constants from "@/utils/constants";

type Step = { label: string; value?: string; href?: string };

/** Local datetime input value -> unix seconds. */
const toUnix = (v: string) => Math.floor(new Date(v).getTime() / 1000);

/** Default close: a week out, on the hour, in the shape the input wants. */
function defaultClose(): string {
  const d = new Date(Date.now() + 7 * 864e5);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

export default function CreatePage() {
  const myWalletAccount = useStoreWallet((st) => st.myWalletAccount);
  const address = useStoreWallet((st) => st.address);
  const chain = useStoreWallet((st) => st.chain);

  const [question, setQuestion] = useState("");
  const [closes, setCloses] = useState(defaultClose());
  const [liquidity, setLiquidity] = useState("10");
  const [bond, setBond] = useState("1");
  const [window_, setWindow] = useState("86400");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string>("");

  // The wallet signs; the provider is what waits for a receipt.
  const provider = constants.myFrontendProviders[0]; // mainnet

  const push = (st: Step) => setSteps((prev) => [...prev, st]);

  const closesAt = toUnix(closes);
  const liqWei = (() => {
    try {
      return parseStrk(liquidity);
    } catch {
      return 0n;
    }
  })();
  const bondWei = (() => {
    try {
      return parseStrk(bond);
    } catch {
      return 0n;
    }
  })();

  const problems: string[] = [];
  if (question.trim().length < 12) problems.push("The question needs to be a real question.");
  if (!Number.isFinite(closesAt) || closesAt * 1000 < Date.now() + 36e5)
    problems.push("Betting must close at least an hour from now.");
  if (liqWei <= 0n) problems.push("Seed some liquidity, or there is no price to trade against.");

  async function run() {
    setError("");
    setSteps([]);
    setDone("");
    if (!myWalletAccount || !address) return setError("Connect a wallet first.");
    if (chain !== SNconstants.StarknetChainId.SN_MAIN)
      return setError(`Wrong network. Wallet reports "${chain || "unknown"}", expected mainnet.`);
    if (problems.length) return setError(problems[0]);

    setBusy(true);
    try {
      push({ label: "Deploying the market…" });
      const { transaction_hash, contract_address } = await myWalletAccount.deployContract({
        classHash: MARKET_CLASS_HASH,
        constructorCalldata: marketConstructorCalldata({
          question: question.trim(),
          closesAt,
          challengeWindow: Number(window_) || 86400,
          bond: bondWei,
          // Only ever rules a contested market. The creator, by default.
          arbiter: address,
        }),
      });
      push({ label: "Deploy sent", value: transaction_hash, href: `https://voyager.online/tx/${transaction_hash}` });
      await provider.waitForTransaction(transaction_hash);

      const market = num.toHex(num.toBigInt(contract_address));
      push({ label: "Market live", value: market, href: `https://voyager.online/contract/${market}` });

      // Approve and seed in one signature, so the market cannot be left priceless.
      push({ label: `Seeding ${fmtStrk(liqWei)} STRK of liquidity…` });
      const seed = await myWalletAccount.execute(seedLiquidityCalls(market, liqWei));
      await provider.waitForTransaction(seed.transaction_hash);
      push({ label: "Seeded", value: seed.transaction_hash, href: `https://voyager.online/tx/${seed.transaction_hash}` });

      saveUserMarket({ address: market, question: question.trim(), mine: true, at: Date.now() });
      setDone(market);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={s.page}>
      <div className={c.wrap}>
      <div className={c.head}>
        <Link href="/" className={c.back}>← All markets</Link>
        <SelectWallet variant="nav" />
      </div>

      <h1 className={c.title}>Open a market</h1>
      <p className={c.lede}>
        The market-maker contract is already declared on mainnet, so this is a deploy
        and a seed — two signatures, no terminal. Whatever you write becomes a question
        strangers can price, and you cannot edit it afterwards.
      </p>

      <label className={c.label}>
        The question
        <textarea
          className={c.textarea}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="Will ETH close above $3,000 on 2026-12-31?"
        />
        <span className={c.hint}>
          It has to be answerable by a public fact, and it is fixed forever at deployment.
        </span>
      </label>

      <div className={c.row}>
        <label className={c.label}>
          Betting closes
          <input className={c.input} type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
          <span className={c.hint}>Settlement can be proposed after this.</span>
        </label>

        <label className={c.label}>
          Seed liquidity
          <span className={c.inputWrap}>
            <input className={c.input} value={liquidity} onChange={(e) => setLiquidity(e.target.value)} inputMode="decimal" />
            <span className={c.suffix}>STRK</span>
          </span>
          <span className={c.hint}>
            Both sides open at 50¢. Thin books move violently — 3 STRK means one 1 STRK
            bet swings the price 14 points, so seed more than feels necessary.
          </span>
        </label>
      </div>

      <div className={c.row}>
        <label className={c.label}>
          Settlement bond
          <span className={c.inputWrap}>
            <input className={c.input} value={bond} onChange={(e) => setBond(e.target.value)} inputMode="decimal" />
            <span className={c.suffix}>STRK</span>
          </span>
          <span className={c.hint}>What a proposer stakes and a disputer must match. Zero means anyone can propose for free.</span>
        </label>

        <label className={c.label}>
          Challenge window
          <select className={c.input} value={window_} onChange={(e) => setWindow(e.target.value)}>
            <option value="3600">1 hour</option>
            <option value="86400">24 hours</option>
            <option value="259200">3 days</option>
          </select>
          <span className={c.hint}>How long a proposed outcome can be disputed.</span>
        </label>
      </div>

      <p className={c.note}>
        You are the arbiter, which only matters if someone disputes a proposal. You are
        not the resolver: anyone can propose the outcome by posting the bond.
      </p>

      {problems.length > 0 && question.length > 0 && (
        <div className={c.problems}>{problems.map((p) => <div key={p}>{p}</div>)}</div>
      )}

      {!myWalletAccount ? (
        <SelectWallet />
      ) : (
        <button className={c.cta} onClick={run} disabled={busy || problems.length > 0}>
          {busy ? "Working…" : `Deploy and seed ${fmtStrk(liqWei)} STRK`}
        </button>
      )}

      {steps.length > 0 && (
        <div className={c.steps}>
          {steps.map((st, i) => (
            <div key={i} className={c.step}>
              <span>{st.label}</span>
              {st.value &&
                (st.href ? (
                  <a href={st.href} target="_blank" rel="noreferrer" className={c.mono}>
                    {st.value.slice(0, 14)}…
                  </a>
                ) : (
                  <span className={c.mono}>{st.value.slice(0, 14)}…</span>
                ))}
            </div>
          ))}
        </div>
      )}

      {done && (
        <div className={c.done}>
          <div className={c.doneTitle}>Your market is live.</div>
          <p className={c.doneBody}>
            It is on your board now. Anyone you send this link to can bet on it — they do
            not need anything from you.
          </p>
          <code className={c.link}>{`https://neromtoobad.github.io/doom/#${done}`}</code>
          <div className={c.doneRow}>
            <Link href={`/#${done}`} className={c.ghost}>Open it</Link>
          </div>
        </div>
      )}

        {error && <div className={`${s.result} ${s.err}`}>{error}</div>}
      </div>
    </main>
  );
}
