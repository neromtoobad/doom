// Prepare a futarchy decision for mainnet, without signing anything.
//
// DoomDecision reads two branch markets through IDoomMarketReader — get_pots() and
// get_closes_at(). Neither class currently declared on mainnet has both: the
// parimutuel DoomMarket has pots and no close time, the CPMM DoomPredictionMarket has
// a close time and no pots. DoomMarketV2 has both and is not declared. So a live
// decision is two declares and three deploys, and this prints exactly those, with the
// calldata computed and the preconditions checked first.
//
// It signs nothing and touches no key. Every command it prints is one you run in your
// own terminal against an account you imported yourself.

import { readFileSync, existsSync } from 'node:fs'
import { byteArray, hash } from 'starknet'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const KEY = read('.env.local').match(/NEXT_PUBLIC_PROVIDER_URL=(.+)/)?.[1].trim()
if (!KEY) {
  console.error('No NEXT_PUBLIC_PROVIDER_URL in .env.local')
  process.exit(2)
}
const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/' + KEY
const POOL = '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a'
const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'

const rpc = async (method, params) => {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await r.json()
  return j.error ? { __err: j.error.message ?? j.error.code } : j.result
}

const norm = (h) => '0x' + BigInt(h).toString(16)
const classHashOf = (name) => {
  const f = `cairo/target/dev/${name}.contract_class.json`
  const abs = new URL(`../${f}`, import.meta.url)
  if (!existsSync(abs)) {
    console.error(`${f} is missing — run \`scarb build\` in cairo/ first.`)
    process.exit(2)
  }
  return norm(hash.computeContractClassHash(JSON.parse(read(f))))
}

const ba = (s) => {
  const b = byteArray.byteArrayFromString(s)
  return [
    b.data.length.toString(),
    ...b.data.map((d) => BigInt(d).toString()),
    BigInt(b.pending_word).toString(),
    b.pending_word_len.toString(),
  ]
}

// ── the proposal ────────────────────────────────────────────────────────────────
// Edit these four lines; everything below is derived.
const PROPOSAL = process.env.PROPOSAL ?? 'Should Doom seed a STRK/USD market at 2x current depth?'
const METRIC = process.env.METRIC ?? 'daily volume exceeds 50 STRK by 2026-09-30'
const CLOSES_AT = Number(process.env.CLOSES_AT ?? Math.floor(Date.parse('2026-09-06T23:59:00Z') / 1000))
const CHALLENGE = Number(process.env.CHALLENGE ?? 3600)
const BOND = process.env.BOND ?? '0'
const ARBITER = process.env.ARBITER ?? null

const branchQuestion = (side) =>
  `If Doom ${side} this proposal, will ${METRIC}?`

console.log('\nDoom — preparing a futarchy decision for mainnet\n')
console.log(`  proposal   ${PROPOSAL}`)
console.log(`  metric     ${METRIC}`)
console.log(`  closes at  ${new Date(CLOSES_AT * 1000).toISOString()} (${CLOSES_AT})`)

if (!ARBITER) {
  console.log('\n  Set ARBITER=0x... to the address that settles a disputed branch.')
  console.log('  Re-run with it set to get the deploy commands.\n')
}

const V2 = classHashOf('doom_DoomMarketV2')
const DEC = classHashOf('doom_DoomDecision')

console.log('\nPreconditions\n')
for (const [label, h] of [['DoomMarketV2', V2], ['DoomDecision', DEC]]) {
  const got = await rpc('starknet_getClass', ['latest', h])
  console.log(`  ${label.padEnd(14)} ${h}`)
  console.log(`  ${''.padEnd(14)} ${got.__err ? 'NOT declared — needs a declare' : 'already declared'}`)
}

console.log('\nSteps — run these yourself; this script signs nothing\n')
console.log('  1. Declare the two classes (skip either if it already says declared above):\n')
console.log('     sncast declare --contract-name DoomMarketV2')
console.log('     sncast declare --contract-name DoomDecision\n')

if (ARBITER) {
  for (const side of ['adopts', 'rejects']) {
    const q = branchQuestion(side)
    const cd = [POOL, ARBITER, STRK, String(CLOSES_AT), String(CHALLENGE), BOND, ...ba(q)]
    console.log(`  2${side === 'adopts' ? 'a' : 'b'}. Deploy the ${side.toUpperCase()} branch:`)
    console.log(`      "${q}"\n`)
    console.log(`     sncast deploy --class-hash ${V2} \\`)
    console.log(`       --constructor-calldata ${cd.join(' ')}\n`)
  }
  console.log('  3. With both branch addresses in hand, deploy the decision:\n')
  const p = ba(PROPOSAL)
  console.log(`     sncast deploy --class-hash ${DEC} \\`)
  console.log(`       --constructor-calldata <ADOPT_ADDR> <REJECT_ADDR> ${p.join(' ')}\n`)
  console.log('  4. Add the decision address to DoomDecisions in src/utils/constants.ts,')
  console.log('     and both branch addresses to DoomMarkets, then add all three to')
  console.log('     strk20.json contracts.\n')
  console.log('  5. Stake both branches through the pool so the decision has prices to')
  console.log('     read. Each private operation costs a flat 6 STRK.\n')
} else {
  console.log('  (deploy commands appear once ARBITER is set)\n')
}
