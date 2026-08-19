// Doom - private decision markets on STRK20.
//
// echo_helper: the starter kit's reference anonymizer, kept verbatim. Its class is
//              already declared on mainnet and we exercised it to prove the loop.
// doom_market: our anonymizer. The market itself.
pub mod echo_helper;
pub mod doom_market;

// Test-only. Never deployed.
pub mod mock_erc20;
