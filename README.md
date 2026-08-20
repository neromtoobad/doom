# Doom

**A private prediction market on Starknet. Visible odds, invisible bettors.**

Bet sizes and odds stay fully public, so the information aggregation works. Who is
betting is hidden, so the identity-based manipulation that shapes Polymarket does not
happen. Built on [STRK20](https://strk20.starknet.io), the Starknet privacy pool, and
live on mainnet.

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

## The contracts

| contract | role |
|---|---|
| **`DoomMarketV2`** | The prediction market, implemented as a STRK20 anonymizer. Per-question state: outcomes, `closes_at` deadline, per-outcome volume. `privacy_invoke` handles bet and claim. Bets arrive as pool withdrawals and are measured by balance delta, never trusted from calldata. Winners claim parimutuel payouts straight back into shielded notes. |
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
covers the non-price path only.

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
| Markets | six deployed — [`cairo/address.md`](cairo/address.md) |
| Demo | https://neromtoobad.github.io/doom/ |

Verified mainnet transactions, each carrying both a pool event and a market event, are
listed in [`strk20.json`](strk20.json).

## Run it

```bash
yarn install
cp .env.example .env.local   # add your Alchemy Starknet key
yarn dev                     # localhost:3000
```

Cairo — 37 tests:

```bash
cd cairo && scarb build && snforge test
```

Toolchain: node 24.0.2, scarb 2.18.0, starknet-foundry 0.63.0.
Stack: Next.js 16 · React 19 · TypeScript 5.9 · starknet.js 10.4.0 · Cairo `2024_07`.

## AI tools

Built with Claude Code: planning and competitive research, Cairo drafting and review,
frontend scaffolding. Architecture, mechanism design and every mainnet transaction are
the author's own. Commits are authored by a human account.

## License

MIT — see [LICENSE](LICENSE).
