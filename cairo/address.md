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
