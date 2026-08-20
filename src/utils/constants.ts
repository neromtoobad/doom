import { ProviderInterface, RpcProvider } from "starknet";

// ─── Example config — swap these for your own token / pool / helper ─────────

// DEMO VALUE: the ERC-20 this starter shields. Replace with the token your app
// moves privately (STRK on Starknet here).
export const addrSTRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Frontend RPC providers, indexed. The STRK20 privacy pool lives on Mainnet (0)
// and Sepolia (2); index 1 is a spare public testnet endpoint. NEXT_PUBLIC_PROVIDER_URL
// is your Alchemy key (see .env.example).
export const myFrontendProviders: ProviderInterface[] = [
    new RpcProvider({ nodeUrl: "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/" + process.env.NEXT_PUBLIC_PROVIDER_URL }),
    new RpcProvider({ nodeUrl: "https://starknet-testnet.public.blastapi.io/rpc/v0_7" }),
    new RpcProvider({ nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/" + process.env.NEXT_PUBLIC_PROVIDER_URL })];

// ─── Example anonymizer (echo helper) ───────────────────────────────────────
// DEMO CONTRACT: StrkInvokeHelper (cairo/src/lib.cairo) just round-trips STRK
// through an open note to exercise the privacy_invoke flow end to end. Replace
// with your real anonymizer that performs an actual protocol action.

// DEMO VALUE: echo helper deployed on Mainnet.
export const Strk20EchoHelperAddress = "0x78ae662e0cc6d1ab2cfeaf2a51ba8783d88e31886f88a794d142f95a6f8735b";

// Echo helper on Sepolia — set NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA to enable the
// Echo action there. "0x0" = not deployed (the action stays disabled). Deploy a fresh
// instance from the Echo tab, then paste the address into .env.local.
export const Strk20EchoHelperSepolia = process.env.NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA ?? "0x0";

// Declared class hash of the echo helper (Mainnet + Sepolia). Deploying a fresh
// instance (no constructor args) needs only this class hash + a signed UDC deploy.
// See cairo/address.md.
export const Strk20EchoHelperClassHash = "0x2a4482a13cb7f70dce6f7ba99c4ee6ce404379abeddd9b831b6bf24eb71e137";

// Resolve the echo helper for a frontend provider index (0 = Mainnet, 2 = Sepolia).
// Returns "0x0" when no helper is deployed on that network.
export function echoHelperForIndex(index: number): string {
    if (index === 0) return Strk20EchoHelperAddress;
    if (index === 2) return Strk20EchoHelperSepolia;
    return "0x0";
}

// Frontend provider indices where the STRK20 privacy pool is available, mapped to a
// display name. Used to gate the WalletAccountV6 STRK20 actions.
export const Strk20Networks: Record<number, string> = { 0: "MAINNET", 2: "SEPOLIA" };

// ─── Doom ───────────────────────────────────────────────────────────────────
// DoomMarket on mainnet. The market itself: a binary parimutuel decision market
// where positions are keyed by poseidon(tag, secret), so the contract never
// learns who staked. See cairo/address.md.
export const DoomMarketAddress = "0x0205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4";
// Every deployed market, newest last. Each is a separate instance of the same
// declared class — deploy more from /deploy and paste the address in here.
export const DoomMarkets: string[] = [
    // ── share markets (DoomPredictionMarket): real prices on a curve ──
    "0x026e1e64b1ed70983ff96d5f8605c0d3ad2ca13e4746e02875b0fa608932aa6b", // demo video, closes Aug 29
    "0x00611045be3eb6172f9ca2603c1dfbdb1319151178c8aa8f990b02363f12730f", // BTC $150k, closes Dec 31
    // ── the earlier parimutuel markets, still live and still settling ──
    "0x0205a8ad149048619f6b8ee19968e119009848a7f6645d862e949bcf1ef432c4",
    "0x05898fb214fb5c2c23f12601b8f4350612fc614642942ea80adb7145dba6ae48",
    "0x06e052635f96b98184cffa3a5d2e416ec0a3d288ac54a66b23a41e8c149b30b5",
    "0x04f8f4a1a90899b6b61b98cebc245fbb49a139a4be7448685593bb10be969d21",
    "0x013c507ad43b4f2e61037cbd08ee3f15606d2dc538a17135b46c8c095415b0ab",
    "0x073f3dddde000eeddfa0974385cecd36d91237c1efc5a6cab9a4039d543595db",
];
export const DoomMarketClassHash = "0xa8aa0595ab9099a13208546a9910c9d525dc13d124114de9541b6d71adce1f";
export const DoomMarketQuestion = "Will strk20-hackathon PR #100 merge before 2026-08-25 23:59 UTC?";

// Futarchy decisions. Each wraps two conditional DoomMarketV2 branches and
// pronounces the outcome from their prices. See cairo/src/doom_decision.cairo.
export const DoomDecisions: string[] = [];
