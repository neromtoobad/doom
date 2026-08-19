# Doom

**Private futarchy on Starknet. The market is the vote — public prices, invisible voters.**

Built on [STRK20](https://strk20.starknet.io), the Starknet privacy pool, for the Private Sprint.

---

## The problem, and why it is timely

Futarchy — govern by decision markets instead of token votes — stopped being a thought
experiment this year. MetaDAO runs it in production on Solana; Sanctum's first decision
market drew 200+ trades in three hours; Optimism ran a 500k-OP futarchy experiment.

And every one of those implementations shares the same documented failure mode:
**they are fully transparent.** Whales get watched and copied. Insiders get pressured
about their positions. Betting against your own leadership is career risk. The market
stops aggregating information and starts performing politics — which is the exact
disease futarchy was invented to cure.

Transparency is not incidental to that failure. It is the cause.

## What Doom is

The first private futarchy implementation. Three Cairo contracts, live on Starknet
mainnet, settling through the STRK20 privacy pool:

| contract | what it does |
|---|---|
| `DoomMarketV2` | A conditional market as a STRK20 anonymizer. Stakes are shielded notes keyed by `poseidon(tag, secret)` — the contract is only ever called by the pool and never learns an address. Hard staking deadline. Bonded optimistic settlement: anyone proposes an outcome with a bond, anyone disputes by matching it, an arbiter rules only on contested markets and the wrong side forfeits its bond. No admin anywhere on the happy path. |
| `DoomDecision` | The futarchy layer. Wraps two conditional branches — *"if we adopt, will the metric be met?"* / *"if we reject, will it?"* — and at close, `decide()` (callable by anyone) records whichever branch priced success higher as the decision. Ties favor the status quo. The losing branch voids and refunds every stake, the standard conditional-market rule. The `Decided` event is a governance act with no authorized signer in it: a pure function of two market prices. |
| `StrkInvokeHelper` | The upstream echo reference, kept verbatim for provenance. |

```
        "Should the DAO fund proposal X?"
                     │
        ┌────────────┴────────────┐
   ADOPT branch              REJECT branch          each an anonymizer:
   "if adopted, will         "if rejected, will     shield → stake against
    the metric be met?"       the metric be met?"   a secret, not an address
        │                        │
        └───────── decide() ─────┘
                     │
        higher YES-share wins → Decided event
        losing branch voids → everyone refunded
```

## Why privacy is load-bearing, not decoration

An anonymous decision market is the only version that produces an honest number.
Nobody can copy the whale, because nobody can find the whale. Nobody can retaliate
against the engineer who priced the launch date as a lie, because the position is a
Poseidon commitment, not a name. The price is public and verifiable by anyone; the
voters are not, by construction.

## What is private, and what is not — stated precisely

| Public | Private |
|---|---|
| the question, the odds, totals, every tx | **who** staked |
| stake amounts (the pool's withdraw leg is a plain transfer) | which person took which side |
| the stake↔claim link (claiming reveals the secret) | any address behind a position |
| decisions, proposals, disputes, bonds | — |

The anonymity set is the STRK20 pool's, not Doom's alone. Timing correlation between
a shield and a stake is a real leak this does not solve. We would rather under-claim
than over-claim.

## Live on mainnet

| | |
|---|---|
| STRK20 pool | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| Markets | six deployed instances — see [`cairo/address.md`](cairo/address.md) and [`strk20.json`](strk20.json) |
| Demo | https://neromtoobad.github.io/doom/ |

Verified mainnet transactions (each carrying both a pool event and a market event)
are listed in [`strk20.json`](strk20.json).

## Run it locally

```bash
yarn install
cp .env.example .env.local   # add your Alchemy Starknet key
yarn dev                     # localhost:3000
```

Cairo — 37 tests:

```bash
cd cairo
scarb build
snforge test
```

Toolchain: node 24.0.2, scarb 2.18.0, starknet-foundry 0.63.0.

## Stack

Next.js 16 · React 19 · TypeScript 5.9 · starknet.js 10.4.0 · Cairo (edition 2024_07) · STRK20 privacy pool

## AI tools

Built with Claude Code: planning and competitive research, Cairo drafting and review,
frontend scaffolding. Architecture, mechanism design and every mainnet transaction are
the author's own. Commits are authored by a human account.

## License

MIT — see [LICENSE](LICENSE).
