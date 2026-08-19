// v2 tests. The first one is the regression that motivated the whole rewrite.

use doom::doom_market_v2::{
    IDoomMarketV2Dispatcher, IDoomMarketV2DispatcherTrait, MarketOperation, OUTCOME_NO,
    OUTCOME_VOID, OUTCOME_YES, compute_commitment,
};
use doom::mock_erc20::{IMockErc20Dispatcher, IMockErc20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn POOL() -> ContractAddress {
    0x1001.try_into().unwrap()
}
fn ARBITER() -> ContractAddress {
    0x2002.try_into().unwrap()
}
fn ALICE() -> ContractAddress {
    0x3003.try_into().unwrap()
}
fn BOB() -> ContractAddress {
    0x4004.try_into().unwrap()
}

const ONE: u128 = 1_000_000_000_000_000_000;
const BOND: u128 = 5_000_000_000_000_000_000; // 5
const CLOSES_AT: u64 = 1_000_000;
const WINDOW: u64 = 3600;

fn setup() -> (IDoomMarketV2Dispatcher, IMockErc20Dispatcher, ContractAddress) {
    let erc20 = declare("MockErc20").unwrap().contract_class();
    let (token, _) = erc20.deploy(@array![]).unwrap();

    let cls = declare("DoomMarketV2").unwrap().contract_class();
    let mut cd = array![];
    POOL().serialize(ref cd);
    ARBITER().serialize(ref cd);
    token.serialize(ref cd);
    CLOSES_AT.serialize(ref cd);
    WINDOW.serialize(ref cd);
    BOND.serialize(ref cd);
    let q: ByteArray = "Will we ship by Nov 1?";
    q.serialize(ref cd);
    let (market, _) = cls.deploy(@cd).unwrap();

    // Bonds are pulled with transfer_from, so proposers need a balance.
    let erc = IMockErc20Dispatcher { contract_address: token };
    erc.mint(ALICE(), (BOND * 4).into());
    erc.mint(BOB(), (BOND * 4).into());

    start_cheat_block_timestamp(market, CLOSES_AT - 100); // open
    (IDoomMarketV2Dispatcher { contract_address: market }, erc, market)
}

fn buy(
    m: IDoomMarketV2Dispatcher,
    t: IMockErc20Dispatcher,
    addr: ContractAddress,
    secret: felt252,
    outcome: u8,
    amount: u128,
) {
    t.mint(addr, amount.into());
    start_cheat_caller_address(addr, POOL());
    m.privacy_invoke(MarketOperation::Buy, compute_commitment(secret), outcome, 0, 0);
    stop_cheat_caller_address(addr);
}

// ── the v1 exploit, now impossible ──────────────────────────────────────────────

/// v1 let anyone stake on a known winner right up until the resolver settled. The
/// deadline is the fix, and this is the regression test for it.
#[test]
#[should_panic(expected: 'MARKET_CLOSED')]
fn staking_after_close_is_rejected() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, ONE);
    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    buy(m, t, addr, 'latecomer', OUTCOME_YES, 10 * ONE);
}

#[test]
fn staking_before_close_is_fine() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, 2 * ONE);
    let (pot_no, pot_yes) = m.get_pots();
    assert(pot_yes == 2 * ONE && pot_no == 0, 'stake not recorded');
}

// ── optimistic settlement, no admin ─────────────────────────────────────────────

#[test]
fn an_unchallenged_proposal_settles_itself() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, 3 * ONE);
    buy(m, t, addr, 'bob', OUTCOME_NO, ONE);

    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(addr);

    assert(!m.is_resolved(), 'must not settle instantly');

    // Nobody disputes. Anyone may finalise once the window has passed.
    start_cheat_block_timestamp(addr, CLOSES_AT + WINDOW + 2);
    start_cheat_caller_address(addr, BOB()); // deliberately not the proposer
    m.finalize();
    stop_cheat_caller_address(addr);

    assert(m.is_resolved(), 'should be resolved');
    assert(m.get_winning_outcome() == OUTCOME_YES, 'wrong outcome');
}

#[test]
#[should_panic(expected: 'WINDOW_OPEN')]
fn finalizing_early_is_rejected() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, ONE);
    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_YES);
    m.finalize();
}

#[test]
#[should_panic(expected: 'NOT_CLOSED_YET')]
fn proposing_before_close_is_rejected() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, ONE);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_YES);
}

// ── disputes ────────────────────────────────────────────────────────────────────

/// A lie costs the liar their bond, and the honest disputer takes both.
#[test]
fn a_dispute_escalates_and_the_liar_pays() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, 3 * ONE);
    buy(m, t, addr, 'bob', OUTCOME_NO, ONE);

    start_cheat_block_timestamp(addr, CLOSES_AT + 1);

    // Alice proposes the wrong answer.
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_NO);
    stop_cheat_caller_address(addr);

    // Bob disputes.
    let bob_before = t.balance_of(BOB());
    start_cheat_caller_address(t.contract_address, BOB());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, BOB());
    m.dispute();
    stop_cheat_caller_address(addr);

    // The arbiter only ever rules on a contested market.
    start_cheat_caller_address(addr, ARBITER());
    m.arbitrate(OUTCOME_YES);
    stop_cheat_caller_address(addr);

    assert(m.get_winning_outcome() == OUTCOME_YES, 'wrong outcome');
    // Bob staked one bond and got two back: net +BOND.
    assert(t.balance_of(BOB()) == bob_before + BOND.into(), 'disputer not paid');
}

#[test]
#[should_panic(expected: 'NOT_DISPUTED')]
fn the_arbiter_cannot_touch_an_uncontested_market() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, ONE);
    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(addr);

    start_cheat_caller_address(addr, ARBITER());
    m.arbitrate(OUTCOME_NO);
}

#[test]
#[should_panic(expected: 'NOT_ARBITER')]
fn a_stranger_cannot_arbitrate() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, ONE);
    buy(m, t, addr, 'bob', OUTCOME_NO, ONE);
    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_NO);
    stop_cheat_caller_address(addr);
    start_cheat_caller_address(t.contract_address, BOB());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, BOB());
    m.dispute();
    stop_cheat_caller_address(addr);

    start_cheat_caller_address(addr, ALICE());
    m.arbitrate(OUTCOME_NO);
}

#[test]
#[should_panic(expected: 'WINDOW_CLOSED')]
fn disputing_after_the_window_is_rejected() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, ONE);
    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(addr);

    start_cheat_block_timestamp(addr, CLOSES_AT + WINDOW + 10);
    start_cheat_caller_address(t.contract_address, BOB());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, BOB());
    m.dispute();
}

// ── payouts still work through the new settlement ───────────────────────────────

#[test]
fn winners_split_the_pot_after_an_optimistic_settle() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, 3 * ONE);
    buy(m, t, addr, 'bob', OUTCOME_YES, ONE);
    buy(m, t, addr, 'carol', OUTCOME_NO, 4 * ONE);

    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(addr);
    start_cheat_block_timestamp(addr, CLOSES_AT + WINDOW + 2);
    start_cheat_caller_address(addr, ALICE());
    m.finalize();
    stop_cheat_caller_address(addr);

    // total 8, winning pot 4: alice 3 -> 6, bob 1 -> 2.
    start_cheat_caller_address(addr, POOL());
    m.privacy_invoke(MarketOperation::Claim, 0, 0, 'alice', 'note_a');
    stop_cheat_caller_address(addr);
    assert(t.allowance(addr, POOL()) == (6 * ONE).into(), 'alice payout wrong');
}

/// The bond must not be mistaken for a stake. It lands in the same balance, so if
/// accounting were wrong the next staker would be credited someone else's bond.
#[test]
fn a_bond_is_never_counted_as_a_stake() {
    let (m, t, addr) = setup();
    buy(m, t, addr, 'alice', OUTCOME_YES, 2 * ONE);
    buy(m, t, addr, 'bob', OUTCOME_NO, 2 * ONE);
    let (pot_no_before, pot_yes_before) = m.get_pots();

    start_cheat_block_timestamp(addr, CLOSES_AT + 1);
    start_cheat_caller_address(t.contract_address, ALICE());
    t.approve(addr, BOND.into());
    stop_cheat_caller_address(t.contract_address);
    start_cheat_caller_address(addr, ALICE());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(addr);

    let (pot_no_after, pot_yes_after) = m.get_pots();
    assert(pot_no_after == pot_no_before, 'bond leaked into NO pot');
    assert(pot_yes_after == pot_yes_before, 'bond leaked into YES pot');
}
