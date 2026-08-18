# Doom

**Private decision markets on Starknet. Your DAO prices a question instead of voting on it: public odds, invisible participants.**

Built on [STRK20](https://strk20.starknet.io), the Starknet privacy pool, for the Private Sprint.

---

## The problem

Token-weighted governance is a popularity contest. Whales get watched, small holders copy them, and nobody publicly bets against the people who control their funding.

So the vote measures who is loud, not what is true.

## What Doom does

A team or DAO asks a question — *"will we ship by Nov 1?"* — and a market prices it instead of a vote deciding it. Participants stake shielded STRK on YES or NO through the STRK20 pool.

**The price is public. The participants are not.**

Privacy here is not a feature bolted onto a betting app. It is the reason the mechanism works: an anonymous market is the only version that produces an honest number.

## How it works

```
  wallet ──shield──▶  STRK20 pool  ──privacy_invoke──▶  DoomMarket
                           │                               │
                           │                          stake recorded
                           │                        against a note ID
                           │                               │
                           ◀────── OpenNoteDeposit ────────┘
                                    (payout on claim)
```

The pool calls `DoomMarket.privacy_invoke` atomically. Inside that call **the caller is the pool, not the user** — so positions are keyed by note ID and the contract structurally cannot learn who staked.

Settlement is parimutuel: no AMM curve, no oracle, one named resolver. Both were cut deliberately to keep the privacy path the only hard part.

## What is private, and what is not

Stated precisely. Overclaiming would be worse than the feature.

| Public | Private |
|---|---|
| the question, the odds, total staked | who staked |
| the market contract and its events | how much any individual staked |
| that a stake happened, and its transaction | which side any individual took |
| the resolved outcome and total payouts | which notes belong to whom |

The anonymity set is the STRK20 pool's, not Doom's alone. Timing correlation between a shield and a stake is a real leak and is **not** solved here.

## Live on mainnet

| | |
|---|---|
| STRK20 pool | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| DoomMarket | _not yet deployed_ |
| Demo | _not yet live_ |

Mainnet transactions are listed in [`strk20.json`](strk20.json).

## Run it locally

```bash
yarn install
cp .env.example .env.local   # add your Alchemy Starknet key
yarn dev                     # localhost:3000
```

Cairo:

```bash
cd cairo
scarb build
snforge test
```

Toolchain: node 24.0.2, scarb 2.18.0, starknet-foundry 0.63.0.

## Stack

Next.js 16 · React 19 · TypeScript 5.9 · starknet.js 10.4.0 · Cairo (edition 2024_07) · STRK20 privacy pool

## AI tools

Built with Claude Code: planning and competitive research, Cairo contract drafting and review, and frontend scaffolding. All architecture decisions, the mechanism design and every mainnet transaction are the author's own. Commits are authored by a human account.

## License

MIT — see [LICENSE](LICENSE).
