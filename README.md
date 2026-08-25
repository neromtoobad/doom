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

## Repository

| path | what it is |
|---|---|
| `cairo/` | The contracts and their tests. |
| `src/` | The Next.js app: board, trade panel, portfolio, resolution. |
| `video/` | The Remotion project the demo video is built from — see [`video/README.md`](video/README.md). |
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

## AI tools

Built with Claude Code: planning and competitive research, Cairo drafting and review,
frontend scaffolding. Architecture, mechanism design and every mainnet transaction are
the author's own. Commits are authored by a human account.

## License

MIT — see [LICENSE](LICENSE).
