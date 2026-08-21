// Pull the real transaction facts from the RPC. The video puts these numbers on
// screen, so they have to come from chain rather than from a note somewhere.
import { readFileSync, writeFileSync } from 'node:fs'

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = readFileSync(join(ROOT, '../.env.local'), 'utf8')
// The env var holds only the Alchemy key; constants.ts is what builds the URL.
const KEY = env.match(/NEXT_PUBLIC_PROVIDER_URL=(.+)/)[1].trim()
const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/' + KEY
const manifest = JSON.parse(
  readFileSync(join(ROOT, '../strk20.json'), 'utf8'),
)

const rpc = async (method, params) => {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await r.json()
  if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error))
  return j.result
}

const out = []
for (const hash of manifest.transactions) {
  const [tx, rcpt] = await Promise.all([
    rpc('starknet_getTransactionByHash', [hash]),
    rpc('starknet_getTransactionReceipt', [hash]),
  ])
  out.push({
    hash,
    sender: tx.sender_address ?? null,
    nonce: tx.nonce ? parseInt(tx.nonce, 16) : null,
    status: rcpt.execution_status,
    finality: rcpt.finality_status,
    block: rcpt.block_number,
    events: (rcpt.events ?? []).length,
  })
  const o = out.at(-1)
  console.log(hash.slice(0, 12) + '…', 'sender', (o.sender ?? '?').slice(0, 16) + '…',
              'nonce', o.nonce, o.status, 'block', o.block, 'events', o.events)
}

writeFileSync(join(ROOT, 'src/data/chain.json'),
              JSON.stringify(out, null, 2))
console.log('\nwrote src/data/chain.json')
