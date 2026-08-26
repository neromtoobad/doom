# Doom

**A private prediction market on Starknet. Visible odds, invisible bettors.**

Bet sizes and odds stay fully public, so the information aggregation works. Who is
betting is hidden, so the identity-based manipulation that shapes Polymarket does not
happen. Built on [STRK20](https://strk20.starknet.io), the Starknet privacy pool, and
live on mainnet.

| | |
|---|---|
| **Demo** | https://neromtoobad.github.io/doom/ |
| **Video** | https://youtu.be/zUd1gX9ZN9Q — three minutes, including a bet end to end |

This is [RFP-07](https://github.com/starkience/strk20-hackathon/blob/main/IDEAS.md) —
*"Prediction markets with visible odds and invisible bettors"* — plus a governance
layer that the same primitive makes possible.

---

## Why anonymous betting produces better forecasts

Polymarket's accuracy comes from visible bet flow driving accurate odds. The same
visibility creates whale tracking, herding, and pressure on bettors. Three things
follow, and each is a market that cannot exist today:

- **Institutional forecasting.** Corporations want internal markets on project
  completion and strategic decisions, but positions become political. An executive
  betting against their own division's timeline is a career risk.
- **Political and sensitive markets.** Visible large positions create narratives that
  influence the outcome they are trying to measure.
- **Professional edge.** Wallet-level history lets observers profile hit rate, sector
  specialisation and holding patterns, so any edge gets copied.

Doom removes the attribution while keeping every number that makes the market work.

## Hidden vs visible

| Element | Hidden | Visible |
|---|---|---|
| Bettor identity | **Yes** — every pool transaction is relayed, so the on-chain sender is the relayer's account, never yours | |
| Bet amounts | | **Yes** — this is what drives accurate odds |
| Current odds, per-outcome volume | | **Yes** — read straight off the contract |
| Resolution | | **Yes** — bond, dispute and outcome are all public |
| Bettor's cross-market profile | **Yes** — positions key off a Poseidon commitment, so no wallet-level history accumulates | |

**The honest limitation:** claiming reveals the secret in public calldata, so a payout
can be linked back to the bet that earned it. It still links neither to a person.
Timing correlation between shielding and betting is a real side channel this does not
solve. The anonymity set is the STRK20 pool's, not Doom's alone.

## How a bet works

A market is a fixed-product market maker over binary outcome shares — the Gnosis
conditional-token construction, not a pot to be split.

```
reserves          r_yes * r_no = k
price of YES      r_no / (r_yes + r_no)      always in (0,1); both sides sum to 1
buying `a` of YES mints a YES and a NO, keeps the YES, sells the NO into the pool
                  shares_out = (r_yes + a) - k / (r_no + a)
redemption        one winning share pays exactly 1 collateral
```

Two properties matter. The price *is* a probability, readable straight off chain, and
every buy moves it, so the market aggregates information continuously rather than
merely recording who staked what. And solvency holds by construction: each deposit
mints one share of each side, so outstanding shares of either side can never exceed
the collateral held. `the_market_can_always_pay_its_winners` is a test.

The first generation was parimutuel — bet into a pot, "odds" were the pot ratio, and
you were locked in until resolution. That is horse-racing betting, not a prediction
market. Five of those markets are still live and still settling; the eight newer ones
are share markets.

### The privacy path

```
your wallet ──shield──▶ STRK20 pool ──privacy_invoke──▶ Doom market
                        (holds a note)                  (CPMM)
```

The pool is always the caller, so the market contract never sees an address — it
cannot, because there is no address in the call. Collateral is measured as the
contract's own balance delta, never taken from calldata, so a caller cannot claim to
have sent more than it did. The position is keyed by
`poseidon('DOOM_POSITION_TAG:V1', secret)`.

## The STRK20 stack

What Doom is actually built on, named precisely. Every item here is exercised by
the live app on mainnet, not aspirational.

| piece | how Doom uses it |
|---|---|
| **STRK20 privacy pool** | Holds the collateral. A bet is a pool `withdraw` to the market contract, so the stake arrives from the pool rather than from a wallet. Pool address `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`. |
| **Anonymizer contract** | `DoomPredictionMarket`, `DoomMarketV2` and `DoomMarket` are STRK20 anonymizers. Each exposes **`privacy_invoke`**, which only the pool may call, and returns `OpenNoteDeposit` spans describing the notes a payout lands in. |
| **STRK20 Wallet API** | The dapp route, so viewing keys never leave the wallet. Doom calls **`strk20InvokeTransaction`** to submit action lists and **`strk20Balances`** to read the shielded balance. Types come from `@starknet-io/types-js`; the wallet methods from `starknet` 10.4. |
| **`STRK20_ACTION` action lists** | A bet is `withdraw` → `invoke`. A claim is `transfer` with `amount: "OPEN"` → `invoke`, where the literal `${openNoteIds[0]}` placeholder is substituted by the wallet during assembly. |
| **Relayed submission** | Private transactions are relayed, so the on-chain `sender_address` is a relayer account and never the bettor. The four hashes in `strk20.json` have four different senders, none of them ours. |
| **Shielded notes** | Winnings are approved to the pool and land back inside a note. A payout never touches a public balance unless the winner unshields it. |

### What Doom deliberately does not use

- **The Privacy SDK** (`@starkware-libs/starknet-privacy-sdk`). It is the route for
  wallets and key-holding backends. Doom is a dapp on top of existing wallets, so
  the Wallet API is the correct integration and the viewing key stays in Ready.
- **Sub-accounts / shadow accounts, a self-hosted prover, and note discovery.**
  None are needed: positions key off a Poseidon commitment rather than an account,
  and the wallet handles discovery.
- **AVNU, Ekubo, Vesu.** Doom is its own market maker; there is no venue to route to.

## The contracts

| contract | role |
|---|---|
| **`DoomPredictionMarket`** | The product. A fixed-product market maker over binary outcome shares, implemented as a STRK20 anonymizer. `privacy_invoke` handles buy and claim; `quote()` prices a fill before it is committed to; `add_liquidity` / `withdraw_liquidity` seed and recover the market maker. Settlement is bonded-optimistic. |
| `DoomMarketV2` | The earlier parimutuel generation, with a `closes_at` deadline and the same bonded settlement. Kept because markets deployed against it are still live. |
| `DoomMarket` | The first parimutuel draft. No deadline, one named resolver. Superseded. |
| **`DoomDecision`** | The governance layer. Two conditional markets — *"if we adopt, will the metric be met?"* / *"if we reject, will it?"* — and `decide()`, callable by anyone, records whichever priced success higher. The losing branch voids and refunds. |
| `StrkInvokeHelper` | Upstream echo reference, kept verbatim for provenance. |

### Resolution without an administrator

The RFP allows a designated resolver. Doom goes further, because a market whose
settlement is one trusted address invites exactly the manipulation the privacy is
meant to remove:

```
close  →  anyone posts a bond and proposes an outcome
       →  anyone may dispute by matching the bond
       →  unchallenged: finalises, bond returns
       →  disputed:    escalates to an arbiter who can only ever
                       touch a contested market; the wrong side
                       forfeits its bond to the right one
```

`the_arbiter_cannot_touch_an_uncontested_market` is a test, not a promise.

**Not yet built:** Pragma oracle binding for price-resolved markets. Doom currently
covers the non-price path only. Because `propose()` is permissionless, an oracle
resolver can be added later without redeploying any existing market.

## In the app

- **Live pricing.** Every card shows a price in cents. The trade panel calls the
  contract's own `quote()`, so the number on screen is the number the buy delivers.
- **Depth.** A single quote hides the shape of the curve, so the panel prices 1, 5 and
  25 STRK at once. Computed locally from the reserves with the contract's formula; it
  agrees with `quote()` to the wei.
- **Mark to market.** Positions show what they are worth now, not only what they cost:
  `shares x side price` on a share market, or the payout the current pots imply on a
  parimutuel one.
- **Backup.** A position is a secret in one browser's storage, so clearing site data
  destroys the funds and no on-chain data can rebuild the secret. The vault exports to
  a file and imports back; re-importing is idempotent. The file never leaves the
  browser.
- **Probability history**, rebuilt from each market's own `Bought` events.

## What a bet actually costs

The STRK20 pool charges a **flat fee per private operation** — 6 STRK on mainnet at
the time of writing, read from the pool's `get_fee_amount` rather than hardcoded,
because it is governance-set and has moved before.

This is not a footnote. It dominates the economics at the sizes a hackathon demo
invites, and it is charged per *operation*, not per STRK. Measured from Doom's own
1 STRK bet, transaction
[`0x261d9a8f…`](https://voyager.online/tx/0x261d9a8f3e950b672607d5ba3fa919aab3c705f304bae23f5e1fdac3b76cebb),
the pool moved 1 STRK to the market and 6 STRK to the fee collector.

Buying YES on the live BTC market, whose reserves are 9.09 YES / 11.00 NO:

| stake | shares if you win | + pool fee | total out | return |
|---|---|---|---|---|
| 1 STRK | 1.76 | 6.00 | 7.00 | **−74.9%** |
| 5 STRK | 7.84 | 6.00 | 11.00 | −28.7% |
| 20 STRK | 25.87 | 6.00 | 26.00 | −0.5% |
| 40 STRK | 47.13 | 6.00 | 46.00 | +2.5% |

On that book the fee is only covered somewhere past 20 STRK, so **a smaller bet loses
money even when it is right**. The exact crossing point moves with the reserves —
deeper books cover the fee sooner — but on every market Doom has deployed it sits far
above the stake a first-time user would choose.

The trade panel says exactly that, and refuses to dress the number up: it shows the
fee, the total cost, and a return computed net of it. An earlier version
showed `+75.8%` on the first row of that table, which was the opposite of the truth.

Two consequences worth stating plainly. Doom's own board is mostly untraded, and this
is why — not a missing feature. And any design that assumes cheap, frequent private
operations is wrong on this chain today; batching is worth more here than anywhere,
which is what puts a batched claim near the top of the roadmap.

## Governance, as an extension

Futarchy — decide by market instead of by vote — is live this year on Solana via
MetaDAO, and Optimism ran a 500k-OP experiment. Every implementation is fully
transparent, and the documented failure mode is precisely whale-watching and insider
pressure. `DoomDecision` is the same idea over anonymous markets: the price is public,
the voters are not, and the `Decided` event has no authorized signer in it.

```
        "Should the DAO fund proposal X?"
                     │
        ┌────────────┴────────────┐
   ADOPT branch              REJECT branch
   "if adopted, will         "if rejected, will
    the metric be met?"       the metric be met?"
        │                        │
        └───────── decide() ─────┘
          higher YES-share wins
          losing branch voids → refunded
```

## Live on mainnet

| | |
|---|---|
| STRK20 pool | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| Markets | 13 — eight share markets, five earlier parimutuel ones. Addresses in [`cairo/address.md`](cairo/address.md) and [`src/utils/constants.ts`](src/utils/constants.ts) |
| Contracts | 14, listed in [`strk20.json`](strk20.json) |
| Settled so far | one, paying its winner the whole pot |

Verified mainnet transactions, each carrying both a pool event and a market event, are
listed in [`strk20.json`](strk20.json). Their senders are four different relayer
accounts — none of them the bettor's wallet, which is the whole point.

## Verify it yourself

Nothing here asks to be believed. Every claim above is checkable from a terminal.

```bash
yarn verify
```

Eight checks against mainnet — every submitted transaction succeeded and carries both
a pool event and a Doom contract event, its senders are four different relayers, all
thirteen markets answer, the settled one holds enough to pay its winner, the
market-maker class is declared, the pool fee is what this README says, and Pragma is
publishing the pairs the templates offer. Each prints the number it found rather than
a tick, so you can disagree with the figure instead of the verdict. Non-zero exit if
anything fails.

```
Transactions
  PASS  all submitted transactions succeeded — 4 of 4
  PASS  each carries a pool event and runs through a Doom contract
  PASS  senders are relayers, all different — 4 distinct senders

Markets
  PASS  every listed market answers — 13 markets, 8 of them share markets
  PASS  the settled market resolved and can pay its winner — settled NO, pot 4.00 STRK, holds 4.00 STRK

Integration
  PASS  the market-maker class is declared on mainnet
  PASS  the pool fee is what the README says — 6.00 STRK per private operation
  PASS  Pragma publishes the pairs the templates offer — BTC, ETH, STRK
```

| claim | where to check it |
|---|---|
| Markets are live and priced | [`src/utils/constants.ts`](src/utils/constants.ts) — call `get_price_yes` on any of them |
| Solvency holds | `cd cairo && snforge test` |
| The client's curve matches the contract | `yarn test` — `tests/curve.test.ts` pins six mainnet vectors |
| Senders are relayers, not the bettor | [`strk20.json`](strk20.json), then any explorer |
| A market settled and paid | `0x0205a8ad…f432c4` — `is_resolved`, `get_winning_outcome`, `get_pots` |

## Repository

| path | what it is |
|---|---|
| `cairo/` | The contracts and their tests. |
| `src/` | The Next.js app: board, trade panel, portfolio, resolution. |
| `scripts/verify.mjs` | `yarn verify` — checks this README against mainnet. |
| `tests/` | The client suite — the curve, valuation, the oracle parser, the secret vault. |
| `video/` | Source for the demo video, and the script that reads the submitted transactions back off chain. |
| `strk20.json` | The submission manifest: transactions, contracts, demo, video. |

## Run it

```bash
yarn install
cp .env.example .env.local   # add your Alchemy Starknet key
yarn dev                     # localhost:3000
```

Cairo — 55 tests:

```bash
cd cairo && scarb build && snforge test
```

Toolchain: node 24, scarb 2.18.0, starknet-foundry 0.63.0.
Stack: Next.js 16 · React 19 · TypeScript 5.9 · starknet.js 10.4.0 · Cairo `2024_07`.

## Testing

**86 tests: 55 in Cairo, 31 in TypeScript.** CI runs both before the build, so a
failure stops the deploy rather than shipping a page that quotes wrong numbers.

```bash
cd cairo && snforge test     # 55
yarn test                    # 31
```

The Cairo suite covers the parts where a contract bug costs money: solvency
(`the_market_can_always_pay_its_winners`), quote/fill agreement
(`a_quote_matches_what_the_buy_actually_pays`), stranded liquidity
(`the_liquidity_provider_gets_their_capital_back`), staking after close, reused
commitments, and the bonded settlement path including a dispute where the liar pays.
One test pins the JavaScript Poseidon implementation to the Cairo one, because a
commitment computed two ways has to match or a position becomes unclaimable.

The TypeScript suite exists because the client grew a **second copy of the contract's
arithmetic**. `quoteLocal` reimplements the market maker's curve so the size ladder
can be drawn without an RPC call per rung; `positionValue` reimplements payout;
`parseQuestion` decides what the oracle panel asserts next to a button that settles a
market. Each was checked once by hand against mainnet — nothing stopped them drifting
afterwards.

| file | what it defends |
|---|---|
| `tests/curve.test.ts` | Six vectors captured from `quote()` on the live BTC market, both sides, three sizes. A JS/Cairo divergence fails here instead of in a quote. |
| `tests/positions.test.ts` | Valuation, including the real settled parimutuel numbers, void refunds, losers, and an empty winning pot that must not divide by zero. |
| `tests/oracle.test.ts` | The question parser, pushed hardest on false positives — inventing an answer is worse than declining one when the answer sits beside a settle button. |
| `tests/backup.test.ts` | Restore is idempotent and a malformed file cannot half-apply. That vault is all that stands between a cleared browser and lost funds. |

Both bugs that reached production are regression tests now: `fmtStrk` truncating so a
summary visibly failed to add up, and unnormalised addresses opening the wrong market
from a shared link.

**The suite was checked against deliberate breakage.** A passing test proves nothing
on its own, so the code was mutated three ways and the results recorded: reverting
`fmtStrk` to truncation failed 2 tests, swapping the curve's YES/NO sides failed 1,
and exporting secrets instead of commitments in the CSV failed 1. Each failed the
right tests and only those, and reverting returned all 31 to green.

## What could go wrong

A privacy claim is only worth what its worst case is worth, so here is the worst case.

**Timing correlation.** Shielding and betting are separate transactions. An observer
watching the pool can see a deposit of size X and, shortly after, a market receiving
X. Doom does nothing to break that link. The mitigation is the pool's, not Doom's:
deposit early, bet later, and rely on other depositors' traffic.

**Claiming reveals the secret.** A payout is a public call carrying the secret in
calldata, so a claim links back to the bet that earned it. It does not link to a
person — but a bet and its payout are provably the same position. If you never claim,
nothing links; if you claim, that one pair is joined.

**The anonymity set is the pool's, not Doom's.** Doom contributes no anonymity of its
own. If the STRK20 pool has few depositors in a token, the set is small regardless of
what Doom does.

**Thin books are manipulable.** With 3 STRK a side, 2 STRK moves the price 23 points.
Any reading of Doom's current odds as a serious forecast is a mistake, and any future
feature that prices off spot — leverage especially — needs a time-weighted mark
before it is safe.

**A dispute concentrates power in the arbiter.** Settlement is permissionless until
someone disputes; then a single address rules and the losing bond is forfeit. The
arbiter cannot steal the pot, but it can decide a contested outcome. That is the
weakest link in the settlement design and it is deliberate — the alternative in
eighteen days was a single trusted resolver for *every* market, not just contested
ones.

**The oracle is informational.** The panel reads Pragma and pre-fills a proposal. The
contract does not verify a feed and cannot: the binding would have to live in the
class, and these classes are deployed. Oracle-enforced settlement is a new contract,
not a setting.

**Unaudited.** These are draft contracts written in an eighteen-day sprint. They have
tests, an invariant, and no audit. Bet small.

## Roadmap

Everything below needs new contract classes, which is why none of it shipped inside
the sprint. They are listed with what makes each hard, because a roadmap that hides
its own blockers is a wish list.

### Leveraged positions

The interesting part is that leverage is *compatible* with the privacy model, which
is not obvious and is not true of most margin systems.

Margin health is a function of public data. A position's size, entry and mark price
are already on chain — that is the whole thesis. Liquidation therefore needs to know
**which position** is underwater, never **who owns it**. A keeper liquidates a
commitment. Almost every margin system assumes an account; this one does not need to.

```
position   S shares, entry p0, margin M, borrowed B = S·p0 − M
equity     E = S·p − B
liquidate  when  p ≤ B / (S(1 − m))        m = maintenance ratio
```

100 YES at 50¢ is 50 STRK notional. Post 10, borrow 40, and that is 5×; at a 10%
maintenance ratio it liquidates at **44.4¢** — an 11% adverse move.

Three problems, hardest first:

1. **Resolution is a gap, not a slide.** At settlement a share jumps to 0 or 1 with
   nothing in between. No keeper can get in front of that, so the lender eats the bad
   debt. The only real answer is a mandatory de-leverage window: leverage disabled
   near close, open positions force-closed at market.
2. **The mark price is a thin AMM.** Liquidating off spot on a 3/3 book invites
   someone to push the curve, trigger liquidations and buy the wreckage. Needs a TWAP
   mark, which is worth building on its own.
3. **Someone has to lend.** A lending pool with real depositors, on a chain charging
   6 STRK per private operation.

### The rest

| feature | why it is interesting | what it needs |
|---|---|---|
| **Sealed-bid opening** | The first N bets are commitments; nothing prices until a reveal window closes, then all clear at one price. Kills first-mover advantage and makes the opening a genuine aggregate rather than one person's guess. A new use of the primitive Doom already has. | contract |
| **Batched claim** | With a flat fee per private operation, claiming three positions separately costs three fees. Batching is worth 12 STRK on three positions. The Wallet API indexes multiple open notes as `${openNoteIds[N]}`, but every documented example uses one invoke per transaction — this needs one real claim to establish whether N is allowed. | verification, then contract |
| **Private limit orders** | Post "buy YES at ≤ 40¢" as a commitment; a keeper fills it when the curve crosses and takes a bounty. Depth without an order book, and nobody learns whose order it was. | contract + keeper |
| **Anonymous track record** | Prove "five wins from seven resolved" without revealing which. Reputation is the thing privacy usually destroys, and commitments are exactly the material needed to rebuild it. The most valuable idea here and the hardest. | zero-knowledge proofs |
| **Dark-pool crossing** | Match opposing bets at mid before touching the curve. Two people wanting opposite sides currently pay slippage *and* two pool fees. Worth more on Doom than on a cheap chain. | contract |
| **Private liquidity** | Seeding a market is a public transaction today, so the market maker is identifiable even though the bettors are not. Routing it through the pool closes the last hole in the story. | contract |
| **TWAP settlement** | Settle against an average over the closing window rather than a point, so nobody can spike a feed at the bell. Also the prerequisite for leverage. | contract |
| **Oracle-enforced settlement** | The panel reads Pragma; the contract does not. Binding a market to a pair and threshold at construction would make settlement automatic rather than merely well-informed. | new class + declare |

## AI tools

Built with Claude Code: planning and competitive research, Cairo drafting and review,
frontend scaffolding. Architecture, mechanism design and every mainnet transaction are
the author's own. Commits are authored by a human account.

## License

MIT — see [LICENSE](LICENSE).
