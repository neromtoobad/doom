// DoomMarket tests.
//
// The pool is simulated: we cheat the caller address to the pinned pool, and "the pool
// sent funds" is a mint into the market before the invoke. That is exactly what happens
// on chain, where the withdraw leg lands before privacy_invoke runs.

use doom::doom_market::{
    IDoomMarketDispatcher, IDoomMarketDispatcherTrait, MarketOperation, OUTCOME_NO, OUTCOME_VOID,
    OUTCOME_YES, compute_commitment,
};
use doom::mock_erc20::{IMockErc20Dispatcher, IMockErc20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn POOL() -> ContractAddress {
    0x1001.try_into().unwrap()
}
fn RESOLVER() -> ContractAddress {
    0x2002.try_into().unwrap()
}
fn RANDOM() -> ContractAddress {
    0x3003.try_into().unwrap()
}

const ONE: u128 = 1_000_000_000_000_000_000;

/// Deploy a mock token and a market wired to it.
fn setup() -> (IDoomMarketDispatcher, IMockErc20Dispatcher, ContractAddress) {
    let erc20_class = declare("MockErc20").unwrap().contract_class();
    let (token_addr, _) = erc20_class.deploy(@array![]).unwrap();

    let market_class = declare("DoomMarket").unwrap().contract_class();
    let mut calldata = array![];
    POOL().serialize(ref calldata);
    RESOLVER().serialize(ref calldata);
    token_addr.serialize(ref calldata);
    let question: ByteArray = "Will we ship by Nov 1?";
    question.serialize(ref calldata);
    let (market_addr, _) = market_class.deploy(@calldata).unwrap();

    (
        IDoomMarketDispatcher { contract_address: market_addr },
        IMockErc20Dispatcher { contract_address: token_addr },
        market_addr,
    )
}

/// Simulate the pool's withdraw leg, then the invoke.
fn buy(
    market: IDoomMarketDispatcher,
    token: IMockErc20Dispatcher,
    market_addr: ContractAddress,
    secret: felt252,
    outcome: u8,
    amount: u128,
) {
    token.mint(market_addr, amount.into());
    start_cheat_caller_address(market_addr, POOL());
    market
        .privacy_invoke(MarketOperation::Buy, compute_commitment(secret), outcome, 0, 0);
    stop_cheat_caller_address(market_addr);
}

fn resolve(market: IDoomMarketDispatcher, market_addr: ContractAddress, outcome: u8) {
    start_cheat_caller_address(market_addr, RESOLVER());
    market.resolve(outcome);
    stop_cheat_caller_address(market_addr);
}

fn claim(
    market: IDoomMarketDispatcher, market_addr: ContractAddress, secret: felt252, note_id: felt252,
) {
    start_cheat_caller_address(market_addr, POOL());
    market.privacy_invoke(MarketOperation::Claim, 0, 0, secret, note_id);
    stop_cheat_caller_address(market_addr);
}

// ── buying ──────────────────────────────────────────────────────────────────────

#[test]
fn buy_records_position_and_moves_the_pot() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, 3 * ONE);

    let position = market.get_position(compute_commitment('alice'));
    assert(position.amount == 3 * ONE, 'stake not recorded');
    assert(position.outcome == OUTCOME_YES, 'wrong outcome');
    assert(!position.claimed, 'should not be claimed');

    let (pot_no, pot_yes) = market.get_pots();
    assert(pot_yes == 3 * ONE, 'yes pot wrong');
    assert(pot_no == 0, 'no pot should be empty');
}

/// The security property: the stake is the balance delta, so a second buy is credited
/// only what the pool sent for it, never the running balance.
#[test]
fn stake_is_the_delta_not_the_balance() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, 5 * ONE);
    buy(market, token, addr, 'bob', OUTCOME_NO, 2 * ONE);

    assert(market.get_position(compute_commitment('bob')).amount == 2 * ONE, 'bob got the balance');
    let (pot_no, pot_yes) = market.get_pots();
    assert(pot_yes == 5 * ONE, 'yes pot wrong');
    assert(pot_no == 2 * ONE, 'no pot wrong');
}

#[test]
#[should_panic(expected: 'CALLER_NOT_PRIVACY')]
fn buy_rejects_a_caller_that_is_not_the_pool() {
    let (market, token, addr) = setup();
    token.mint(addr, ONE.into());
    start_cheat_caller_address(addr, RANDOM());
    market.privacy_invoke(MarketOperation::Buy, compute_commitment('mallory'), OUTCOME_YES, 0, 0);
}

#[test]
#[should_panic(expected: 'NO_STAKE')]
fn buy_rejects_an_empty_stake() {
    let (market, _token, addr) = setup();
    start_cheat_caller_address(addr, POOL());
    market.privacy_invoke(MarketOperation::Buy, compute_commitment('alice'), OUTCOME_YES, 0, 0);
}

#[test]
#[should_panic(expected: 'COMMITMENT_EXISTS')]
fn buy_rejects_a_reused_commitment() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    buy(market, token, addr, 'alice', OUTCOME_NO, ONE);
}

#[test]
#[should_panic(expected: 'BAD_OUTCOME')]
fn buy_rejects_an_unknown_outcome() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', 7, ONE);
}

#[test]
#[should_panic(expected: 'ALREADY_RESOLVED')]
fn buy_rejects_a_resolved_market() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    resolve(market, addr, OUTCOME_YES);
    buy(market, token, addr, 'bob', OUTCOME_YES, ONE);
}

// ── resolving ───────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected: 'NOT_RESOLVER')]
fn resolve_rejects_anyone_but_the_resolver() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    start_cheat_caller_address(addr, RANDOM());
    market.resolve(OUTCOME_YES);
}

#[test]
#[should_panic(expected: 'ALREADY_RESOLVED')]
fn resolve_happens_once() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    resolve(market, addr, OUTCOME_YES);
    resolve(market, addr, OUTCOME_NO);
}

/// Resolving to a side nobody staked would strand the pot, so it downgrades to VOID.
#[test]
fn resolving_to_an_empty_side_becomes_void() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_NO, 4 * ONE);
    resolve(market, addr, OUTCOME_YES);
    assert(market.get_winning_outcome() == OUTCOME_VOID, 'should have voided');
}

// ── claiming ────────────────────────────────────────────────────────────────────

/// Two winners on YES against a losing NO pot: each takes their share of the whole pot.
#[test]
fn winners_split_the_whole_pot_in_proportion() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, 3 * ONE);
    buy(market, token, addr, 'bob', OUTCOME_YES, ONE);
    buy(market, token, addr, 'carol', OUTCOME_NO, 4 * ONE);
    resolve(market, addr, OUTCOME_YES);

    // total 8, winning pot 4. alice staked 3 -> 6, bob staked 1 -> 2.
    claim(market, addr, 'alice', 'note_a');
    assert(token.allowance(addr, POOL()) == (6 * ONE).into(), 'alice payout wrong');

    claim(market, addr, 'bob', 'note_b');
    assert(token.allowance(addr, POOL()) == (2 * ONE).into(), 'bob payout wrong');

    assert(market.get_position(compute_commitment('alice')).claimed, 'alice not marked');
}

#[test]
fn void_refunds_the_original_stake() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_NO, 4 * ONE);
    resolve(market, addr, OUTCOME_YES); // no YES stake -> VOID

    claim(market, addr, 'alice', 'note_a');
    assert(token.allowance(addr, POOL()) == (4 * ONE).into(), 'refund wrong');
}

#[test]
#[should_panic(expected: 'NOT_A_WINNER')]
fn a_loser_cannot_claim() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    buy(market, token, addr, 'bob', OUTCOME_NO, ONE);
    resolve(market, addr, OUTCOME_YES);
    claim(market, addr, 'bob', 'note_b');
}

#[test]
#[should_panic(expected: 'ALREADY_CLAIMED')]
fn a_position_cannot_be_claimed_twice() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    buy(market, token, addr, 'bob', OUTCOME_NO, ONE);
    resolve(market, addr, OUTCOME_YES);
    claim(market, addr, 'alice', 'note_a');
    claim(market, addr, 'alice', 'note_a');
}

#[test]
#[should_panic(expected: 'NOT_RESOLVED')]
fn claiming_before_resolution_reverts() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    claim(market, addr, 'alice', 'note_a');
}

/// The whole privacy mechanism: only the preimage opens a position. A wrong secret
/// hashes to a commitment that was never stored.
#[test]
#[should_panic(expected: 'POSITION_NOT_FOUND')]
fn a_wrong_secret_opens_nothing() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    resolve(market, addr, OUTCOME_YES);
    claim(market, addr, 'not_alices_secret', 'note_a');
}

#[test]
#[should_panic(expected: 'CALLER_NOT_PRIVACY')]
fn claim_rejects_a_caller_that_is_not_the_pool() {
    let (market, token, addr) = setup();
    buy(market, token, addr, 'alice', OUTCOME_YES, ONE);
    resolve(market, addr, OUTCOME_YES);
    start_cheat_caller_address(addr, RANDOM());
    market.privacy_invoke(MarketOperation::Claim, 0, 0, 'alice', 'note_a');
}

// ── wiring ──────────────────────────────────────────────────────────────────────

#[test]
fn constructor_stores_the_question_and_roles() {
    let (market, token, _addr) = setup();
    assert(market.get_question() == "Will we ship by Nov 1?", 'question wrong');
    assert(market.get_resolver() == RESOLVER(), 'resolver wrong');
    assert(market.get_token() == token.contract_address, 'token wrong');
    assert(!market.is_resolved(), 'should start unresolved');
}

/// Cross-check against starknet.js. The frontend computes the commitment client-side and
/// the contract recomputes it on claim; if the two hash differently, every claim fails
/// with POSITION_NOT_FOUND and the funds are unreachable. This pins the exact value
/// produced by `hash.computePoseidonHashOnElements([TAG, 'alice'])` in the browser.
#[test]
fn commitment_matches_the_javascript_implementation() {
    assert(
        compute_commitment('alice') == 0x20f966fba4f27fff58e912c1b5dc2ff927640b6d2fd529dbf929d1398bf1b5c,
        'js/cairo hash mismatch',
    );
}
