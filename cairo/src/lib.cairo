// Doom - private decision markets on STRK20.
//
// echo_helper: the starter kit's reference anonymizer, kept verbatim. Its class is
//              already declared on mainnet and we exercised it to prove the loop.
// doom_market: our anonymizer. The market itself.
pub mod echo_helper;
pub mod doom_market;
// v2: staking deadline + bonded optimistic resolution, no trusted admin.
pub mod doom_market_v2;
// futarchy: two conditional branches, the prices make the decision.
pub mod doom_decision;

// Test-only. Never deployed.
pub mod mock_erc20;
