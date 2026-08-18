# CLAUDE.md — Doom

project brain. read this at the start of every session.

---

## one line

**Doom is a private decision market: a DAO prices a question instead of voting on it, and the price is public while the participants are not.**

## what we are building, and why it qualifies

a binary YES/NO market on a governance question — "will we ship by Nov 1?" — where stakes are shielded STRK20 notes. anyone can read the odds. nobody can see who staked what.

qualification against the STRK20 Private Sprint rubric:

| weight | criterion | how Doom scores it |
|---|---|---|
| 30% | STRK20 integration depth | **a custom `privacy_invoke` anonymizer contract on mainnet**, plus shielded balances, private transfers and the wallet API. the rubric names anonymizer contracts explicitly |
| 30% | working mainnet product | one real market, seeded, live on mainnet, open URL, no login |
| 25% | innovation | nobody in the 63-team field is doing markets-as-governance. privacy is load-bearing, not decorative |
| 15% | docs and OSS quality | README as product page, licence, reproducible build |

**the innovation argument, say it exactly this way:** token-weighted governance is a popularity contest. whales get watched, small holders copy them, and nobody publicly bets against the people who control their funding. an anonymous market is the only version that produces an honest number. our competitors' privacy is a feature on a betting app. ours is why the product functions.

**positioning against the field:** `zkasuran/veilcast` owns public price markets with Pragma settlement and is three days ahead of us. we are not a betting board. different user, different screen, different question. never describe Doom as a prediction market in the README or the video — it is a **decision market**.

## tech stack

pinned. do not drift.

| layer | thing | version |
|---|---|---|
| runtime | node | 24.0.2 |
| cairo | scarb | 2.18.0 |
| cairo | starknet-foundry | 0.63.0 |
| cairo | `starknet` crate | 2.18.0, edition `2024_07` |
| app | Next.js | 16.0.8 |
| app | React / react-dom | 19.2.1 |
| app | TypeScript | 5.9.3 |
| chain | `starknet` (js) | 10.4.0 |
| wallet | `@starknet-io/get-starknet-discovery` | 6.0.2 |
| wallet | `@starknet-io/get-starknet-wallet-standard` | 6.0.2 |
| state | `zustand` | 5.0.9 |
| rpc | Alchemy Starknet mainnet | `https://starknet-mainnet.g.alchemy.com/v2/<KEY>` |
| chain | CHAIN_ID | `SN_MAIN` |

**the pool — the contract every entry must touch:**

```
0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

all three required mainnet transactions must carry an event from this address. it is the single most important constant in the project.

**base:** fork `Akashneelesh/strk20-starter-kit`. it ships the wallet picker, shield / unshield / private transfer, shielded balances, and a deployable `privacy_invoke` helper. do not rebuild any of that.

**reference contracts** in `starkware-libs/starknet-privacy` (Apache-2.0):
`packages/ekubo_swap_anonymizer`, `packages/vesu_lending_anonymizer`, `packages/shadow_account_anonymizer`, and the pool itself at `packages/privacy`.

## repo structure

```
doom/
├── cairo/
│   ├── Scarb.toml           scarb 2.18.0, starknet 2.18.0, edition 2024_07
│   ├── src/lib.cairo        DoomMarket — our privacy_invoke anonymizer
│   └── address.md           deployed class hash + mainnet address, kept current
├── src/
│   ├── app/                 Next.js routes. / = market page, /verify = disclosure
│   ├── components/          UI. reuse the starter kit's wallet picker unchanged
│   ├── lib/strk20/          wallet API calls: shield, privacy_invoke, unshield
│   └── utils/constants.ts   RPC URLs, pool address, market address
├── strk20.json              THE submission artefact. see below
├── README.md                product page, not documentation
├── LICENSE                  MIT
└── AGENTS.md                this file, renamed at submission
```

## strk20.json — the submission artefact

lives at repo root. the hub reads it every 30 minutes and publicly shows what is missing. keep it valid from day zero and fill fields as they land.

```json
{
  "transactions": ["0x...", "0x...", "0x..."],
  "contracts": ["0x..."],
  "demo_video": "https://...",
  "demo_url": "https://..."
}
```

`contracts` is a flat array of address strings. the hub resolves the network itself.

### 🔴 the rule that shapes the whole build

from CONTRIBUTING.md, verbatim in effect:

> **if you list anything in `contracts`, every listed transaction must also carry an event from one of them.** touching the pool through someone else's contract is not your project running on mainnet.

two consequences, and neither is optional:

1. **a plain shield transaction does not count for us.** it touches the pool but carries no DoomMarket event. all three listed transactions must be buy / buy / claim **through DoomMarket**
2. **DoomMarket must emit an event on every scored path.** no event, no credit. emit on buy, on resolve, and on claim

the shield on day 1 still matters as proof the wallet works. it is just not one of the three.

**`demo_url` is often auto-detected** — the hub reads the repo's Website field, GitHub Pages, and the most recent successful Vercel/Netlify deploy without being told. set the Website field and this may fill itself. declare it anyway; a duplicate costs nothing and a blank costs the submission.

## the mechanism

parimutuel, not a CPMM. we deliberately dropped the curve.

➠ the pool calls our contract via `selector!("privacy_invoke")`. the caller **is** the pool — assert that
➠ the pool sends STRK to our contract *before* invoking. read our own balance to learn the stake amount
➠ **positions are keyed by `note_id`, never by an address.** that is the whole privacy mechanism. our contract never learns who the user is
➠ BUY: record `note_id -> (outcome, amount)`, add to the outcome pot, return an empty deposit span so nothing flows back
➠ CLAIM: given a winning `note_id`, compute `stake * total_pot / winning_pot`, approve the pool, return an `OpenNoteDeposit` so the payout lands back in a shielded note
➠ RESOLVE: a single named resolver address sets the outcome. no oracle

the starter kit's echo helper is the template. it approves everything back and returns one `OpenNoteDeposit`. we change what happens in between.

## build phases

- [ ] **0 — register.** repo public, MIT licence, README stub, valid `strk20.json`, registration PR opened against `starkience/strk20-hackathon`
- [ ] **1 — starter kit runs.** wallet connects on mainnet, one real shield tx confirmed → **tx #1**
- [ ] **2 — cairo spike.** deploy the starter kit's echo helper *unmodified* to mainnet and call it. proves the whole loop before we write any Cairo → **tx #2**
- [ ] **3 — DoomMarket contract.** buy / resolve / claim, keyed by note_id. `snforge test` green
- [ ] **4 — buy on mainnet.** market deployed, one stake placed through `privacy_invoke` → **tx #3**
- [ ] **5 — resolve and claim.** full cycle on mainnet, payout lands in a shielded note
- [ ] **6 — frontend.** market page, odds, buy, claim. **feature freeze at end of phase 6**
- [ ] **7 — seed and demo.** both sides staked, org dashboard view, demo URL live
- [ ] **8 — ship.** README, video, cleanup, `strk20.json` 4/4 green on the hub

## commands

```bash
# app
yarn install
yarn dev                       # localhost:3000
yarn build

# cairo
cd cairo
scarb build
snforge test
SNFORGE_BACKTRACE=1 snforge test    # when a test fails and the panic is opaque

# declare + deploy to mainnet
sncast declare --contract-name DoomMarket --network mainnet
sncast deploy --class-hash <HASH> --network mainnet

# verify a tx actually hit the pool
open https://voyager.online/tx/<TX_HASH>

# toolchain
asdf install scarb 2.18.0 && asdf install starknet-foundry 0.63.0
scarb --version && snforge --version && node --version
```

## demo plan — what the judge sees, in order

90 seconds, must read without narration.

1. **the question.** a real proposal page. "Will Starknet v0.15 ship before Nov 1?" odds sitting at 23% YES
2. **the stake.** connect, shield STRK, buy NO. the odds move to 19% on screen
3. **the proof.** Voyager, same moment, showing the mainnet tx hitting the STRK20 pool — **and no way to get from that tx to the buyer**
4. **the payoff.** the org dashboard: the forecast disagrees with management, and there is no participant list to appeal to
5. **the exit.** resolve, claim, payout lands in a shielded balance

the moment a judge remembers is **step 3 next to step 4**: a public number that is provably real and privately produced.

## pitch, 60 seconds, spoken

> Token-weighted governance is a popularity contest. Whales get watched, small holders copy them, and nobody publicly bets against the people who control their funding — so the vote tells you who is loud, not what is true.
>
> Doom replaces the vote with a market. Your DAO asks a question. People stake shielded STRK on an outcome. The price is public and anyone can read it. The participants are not, and nobody can find them.
>
> Every stake runs through our own anonymizer contract on Starknet mainnet — the pool calls it, it keys your position by note ID, and it never learns your address. That is the STRK20 privacy pool doing something it was built for and nobody has done yet.
>
> This is live on mainnet right now. Here is the market, here is the transaction, and here is why you cannot tell who I am.
>
> Public price. Private voters. That is the whole product.

## things that burned us

➠ **git identity was configured after the first commit.** it cost a submission at ETHGlobal Open Agents when commits were attributed to an AI account. configure it before `git init` finishes, every time
➠ `edition = "2024_07"` and `starknet = "2.18.0"` must match the installed scarb 2.18.0. a mismatch fails with an unhelpful message
➠ the pool is the caller inside `privacy_invoke`. `get_caller_address()` is the pool, never the user. any logic that expects a user address is wrong by construction
➠ the pool sends funds **before** invoking, so read `balance_of(get_contract_address())` — do not expect an amount argument
➠ `u256` → `u128` needs `try_into().expect(...)`. it will silently be the bug if you skip it
➠ `strk20-by-example.org` was unreachable from this network during planning. the monorepo source is the authority — read the Cairo, not the docs site
➠ `.env.local` holds the Alchemy key. it is gitignored. confirm that before the first push, not after

## things NOT to do

➠ **no CPMM, no LMSR.** parimutuel only. the curve was cut on purpose
➠ **no oracle, no Pragma.** a named resolver address. Veilcast already won that race
➠ **no multi-outcome, no scalar markets.** binary YES/NO only
➠ **no secondary trading, no order book**
➠ **no board of markets.** one seeded market, done properly
➠ **no login on the demo.** the rubric says "not a prototype behind a login"
➠ **no testnet-only anything.** sepolia is for rehearsal, mainnet is the submission
➠ **do not rebuild the wallet picker, shield, or unshield.** the starter kit has them
➠ **do not rename this file to AGENTS.md until submission day**, and never commit it under the name CLAUDE.md
➠ **do not add a feature after phase 6 freeze.** days 12 and 13 are buffer, not scope
