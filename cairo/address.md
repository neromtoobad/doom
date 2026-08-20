contract class hash : 0x2a4482a13cb7f70dce6f7ba99c4ee6ce404379abeddd9b831b6bf24eb71e137

contract address (mainnet) : 0x78ae662e0cc6d1ab2cfeaf2a51ba8783d88e31886f88a794d142f95a6f8735b

---

## DoomMarket (mainnet)

class hash       : 0xa8aa0595ab9099a13208546a9910c9d525dc13d124114de9541b6d71adce1f
contract address : 0x0205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4

declare tx : 0x6aa6528cb6e461412df1dc0b9efa54b673a719ab0b69c3dfa4e6a982b10ad29
deploy tx  : 0x0511ed09e8eb24869518db4f616e5e71126f988c15a760b8dcb09e7d0aaeb85e

constructor:
  privacy_contract 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
  resolver         0x0074f705582c31dded56a8758674d3b8157dc65448bb91c7541ace36df239a1
  token            0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
  question         "Will strk20-hackathon PR #100 merge before 2026-08-25 23:59 UTC?"

verified on chain: deployed class matches the local build the 18 tests ran against,
and get_question decodes back to the intended string.

---

## DoomPredictionMarket (mainnet) — the share markets

class hash : 0x59dc95c72ad09b4b7fd090351e0c152fdc17501f23fa44c92a1c1f0273953af
declare tx : 0x1bece394cbebf4f7f5f27e149cc9a88f6847a16971d2e90884900a1daddc119

0x026e1e64b1ed70983ff96d5f8605c0d3ad2ca13e4746e02875b0fa608932aa6b
  "Will Doom publish a demo video before 2026-08-30 23:59 UTC?"  closes 2026-08-29 12:00 UTC
0x00611045be3eb6172f9ca2603c1dfbdb1319151178c8aa8f990b02363f12730f
  "Will BTC close above $150,000 on 2026-12-31?"                 closes 2026-12-31 23:59 UTC

Both seeded with 10 STRK of liquidity, both opening at 50c with reserves 10/10.
Verified on chain: deployed class matches the tested build, questions decode back
to the intended strings, and the liquidity provider is recorded.

## Crypto share markets (mainnet)

Calibrated against live spot at deploy: BTC $71.6k, ETH $2,275, SOL $88, STRK $0.0247.
All six seeded with 3 STRK, opening at 50c, verified class + reserves on chain.

0x0754b7550d47441539fc2264e689d584f67e8667965240a98656230534cf4618  BTC > $80,000   2026-09-30
0x07450bbf75708b40107ba4210d80c3c13fe6e284087ab3401d9d26fdb9424afa  BTC > $100,000  2026-12-31
0x0734ffdb14dfe27a44ca3a4355a9cba2b522d888d6defc663617c0cfe6b4d0e8  ETH > $2,500    2026-09-30
0x06e5598cb11349ebd2254510c6107f10b755c7e025faea349223faa1de2cded2  ETH > $3,000    2026-12-31
0x02cf2324376fb1e01dfb9ea01438a794e7cf4b27505702cab88d4fe5d68f1296  SOL > $120      2026-12-31
0x02b48d0ab591cee1e1ee3877f46a20d39159ab5ba2d525b3df0dddeb62c37eab  STRK > $0.05    2026-12-31
