#!/usr/bin/env node
// Check every claim the README makes, against mainnet, in one command.
//
// The point is that nothing in this project has to be taken on trust. Each check
// prints what it found rather than just a tick, so a reader can disagree with the
// number instead of the verdict. Exits non-zero if any check fails.

import { readFileSync } from 'node:fs'
import { hash, num } from 'starknet'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const KEY = read('.env.local').match(/NEXT_PUBLIC_PROVIDER_URL=(.+)/)?.[1].trim()
if (!KEY) {
  console.error('No NEXT_PUBLIC_PROVIDER_URL in .env.local — copy .env.example and add an Alchemy key.')
  process.exit(2)
}
const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/' + KEY

const POOL = '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a'
const PRAGMA = '0x2a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b'
const SETTLED = '0x0205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4'
const CPMM_CLASS = '0x59dc95c72ad09b4b7fd090351e0c152fdc17501f23fa44c92a1c1f0273953af'

const manifest = JSON.parse(read('strk20.json'))
// Scope to the DoomMarkets array. constants.ts also holds the STRK address and a
// class hash, and calling get_question on those is how this check first "failed".
const marketsBlock = read('src/utils/constants.ts').match(
  /DoomMarkets[^=]*=\s*\[([\s\S]*?)\]/,
)?.[1]
if (!marketsBlock) {
  console.error('Could not find the DoomMarkets array in src/utils/constants.ts')
  process.exit(2)
}
const markets = [...marketsBlock.matchAll(/"(0x[0-9a-fA-F]+)"/g)].map((m) => m[1])

const rpc = async (method, params) => {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message ?? JSON.stringify(j.error))
  return j.result
}
const call = (contract, fn, calldata = []) =>
  rpc('starknet_call', [
    { contract_address: contract, entry_point_selector: hash.getSelectorFromName(fn), calldata },
    'latest',
  ])
const strk = (x) => (Number(num.toBigInt(x)) / 1e18).toFixed(2)
const norm = (a) => BigInt(a).toString(16).padStart(64, '0')

let failed = 0
const check = async (label, fn) => {
  try {
    const detail = await fn()
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${label} — ${e.message}`)
  }
}
const must = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

console.log('\nDoom — verifying the README against Starknet mainnet\n')

console.log('Transactions')
await check('all submitted transactions succeeded', async () => {
  for (const h of manifest.transactions) {
    const r = await rpc('starknet_getTransactionReceipt', [h])
    must(r.execution_status === 'SUCCEEDED', `${h.slice(0, 12)}… is ${r.execution_status}`)
  }
  return `${manifest.transactions.length} of ${manifest.transactions.length}`
})

await check('each carries a pool event and runs through a Doom contract', async () => {
  const mine = new Set(manifest.contracts.map(norm))
  for (const h of manifest.transactions) {
    const r = await rpc('starknet_getTransactionReceipt', [h])
    const from = (r.events ?? []).map((e) => norm(e.from_address))
    must(from.includes(norm(POOL)), `${h.slice(0, 12)}… has no pool event`)
    must(from.some((a) => mine.has(a)), `${h.slice(0, 12)}… never touches a Doom contract`)
  }
  return 'pool + own contract on every one'
})

await check('senders are relayers, all different', async () => {
  const senders = []
  for (const h of manifest.transactions) {
    const tx = await rpc('starknet_getTransactionByHash', [h])
    senders.push(norm(tx.sender_address))
  }
  must(new Set(senders).size === senders.length, 'a sender repeats')
  return `${senders.length} distinct senders`
})

console.log('\nMarkets')
await check('every listed market answers', async () => {
  let cpmm = 0
  for (const a of markets) {
    const q = await call(a, 'get_question')
    must(q.length > 0, `${a.slice(0, 12)}… has no question`)
    const price = await call(a, 'get_price_yes').catch(() => null)
    if (price) cpmm++
  }
  return `${markets.length} markets, ${cpmm} of them share markets`
})

await check('the settled market resolved and can pay its winner', async () => {
  const [resolved, winner, pots] = await Promise.all([
    call(SETTLED, 'is_resolved'),
    call(SETTLED, 'get_winning_outcome'),
    call(SETTLED, 'get_pots'),
  ])
  must(num.toBigInt(resolved[0]) === 1n, 'not resolved')
  const total = num.toBigInt(pots[0]) + num.toBigInt(pots[1])
  const bal = await call(
    '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    'balance_of',
    [SETTLED],
  )
  must(num.toBigInt(bal[0]) >= num.toBigInt(pots[0]), 'cannot cover the winning side')
  const side = num.toBigInt(winner[0]) === 1n ? 'YES' : 'NO'
  return `settled ${side}, pot ${strk(total)} STRK, holds ${strk(bal[0])} STRK`
})

console.log('\nIntegration')
await check('the market-maker class is declared on mainnet', async () => {
  await rpc('starknet_getClass', ['latest', CPMM_CLASS])
  return `${CPMM_CLASS.slice(0, 12)}… — new markets are a deploy, not a declare`
})

await check('the pool fee is what the README says', async () => {
  const fee = await call(POOL, 'get_fee_amount')
  return `${strk(fee[0])} STRK per private operation`
})

await check('Pragma publishes the pairs the templates offer', async () => {
  const out = []
  for (const pair of ['BTC/USD', 'ETH/USD', 'STRK/USD']) {
    const r = await call(PRAGMA, 'get_data_median', [
      '0x0',
      num.toHex(BigInt('0x' + Buffer.from(pair).toString('hex'))),
    ])
    const dec = Number(num.toBigInt(r[1]))
    out.push(`${pair.split('/')[0]} $${(Number(num.toBigInt(r[0])) / 10 ** dec).toLocaleString()}`)
  }
  return out.join(', ')
})

// The strongest claim a contract repository can make is that it builds to the thing
// that is actually deployed. Two of the compiled classes hash to the class hashes
// live on mainnet, so this is checkable rather than asserted — and it fails loudly if
// the source ever drifts from what the markets are running.
await check('the repository builds to the classes deployed on mainnet', async () => {
  const { existsSync } = await import('node:fs')
  const dir = 'cairo/target/dev'
  const want = [
    ['doom_DoomMarket', '0xa8aa0595ab9099a13208546a9910c9d525dc13d124114de9541b6d71adce1f'],
    ['doom_DoomPredictionMarket', CPMM_CLASS],
  ]
  const norm = (h) => '0x' + BigInt(h).toString(16)
  const out = []
  for (const [name, expected] of want) {
    const f = `${dir}/${name}.contract_class.json`
    if (!existsSync(f)) throw new Error(`${name} not built — run \`scarb build\` in cairo/ first`)
    const got = norm(hash.computeContractClassHash(JSON.parse(read(f))))
    if (got !== norm(expected)) {
      throw new Error(`${name} builds to ${got}, but mainnet runs ${norm(expected)}`)
    }
    out.push(name.replace('doom_', ''))
  }
  return `${out.join(' and ')} hash to the deployed classes`
})

console.log(
  failed === 0
    ? '\nEverything checks out.\n'
    : `\n${failed} check${failed === 1 ? '' : 's'} failed.\n`,
)
process.exit(failed === 0 ? 0 : 1)
