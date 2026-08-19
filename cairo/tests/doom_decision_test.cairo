// Futarchy tests: the decision is a pure function of two branch prices.

use doom::doom_decision::{Decision, IDoomDecisionDispatcher, IDoomDecisionDispatcherTrait};
use doom::doom_market_v2::{MarketOperation, OUTCOME_NO, OUTCOME_YES, compute_commitment};
use doom::doom_market_v2::{IDoomMarketV2Dispatcher, IDoomMarketV2DispatcherTrait};
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

const ONE: u128 = 1_000_000_000_000_000_000;
const CLOSES_AT: u64 = 1_000_000;

/// Deploy a token, two conditional branch markets, and the decision wrapper.
fn setup() -> (
    IDoomDecisionDispatcher,
    IDoomMarketV2Dispatcher,
    IDoomMarketV2Dispatcher,
    IMockErc20Dispatcher,
    ContractAddress,
    ContractAddress,
    ContractAddress,
) {
    let erc20 = declare("MockErc20").unwrap().contract_class();
    let (token, _) = erc20.deploy(@array![]).unwrap();

    let mkt = declare("DoomMarketV2").unwrap().contract_class();
    let mut branches = array![];
    let questions: [ByteArray; 2] = [
        "If we adopt the proposal, will TVL grow 20% by Dec 1?",
        "If we reject the proposal, will TVL grow 20% by Dec 1?",
    ];
    for q in questions.span() {
        let mut cd = array![];
        POOL().serialize(ref cd);
        ARBITER().serialize(ref cd);
        token.serialize(ref cd);
        CLOSES_AT.serialize(ref cd);
        3600_u64.serialize(ref cd); // challenge window
        0_u128.serialize(ref cd); // no bond needed for these tests
        q.serialize(ref cd);
        let (addr, _) = mkt.deploy(@cd).unwrap();
        branches.append(addr);
    }
    let adopt = *branches[0];
    let reject = *branches[1];

    let dec = declare("DoomDecision").unwrap().contract_class();
    let mut cd = array![];
    adopt.serialize(ref cd);
    reject.serialize(ref cd);
    let proposal: ByteArray = "Should the DAO deploy 1M STRK to liquidity incentives?";
    proposal.serialize(ref cd);
    let (decision_addr, _) = dec.deploy(@cd).unwrap();

    // All three share one clock.
    start_cheat_block_timestamp(adopt, CLOSES_AT - 100);
    start_cheat_block_timestamp(reject, CLOSES_AT - 100);
    start_cheat_block_timestamp(decision_addr, CLOSES_AT - 100);

    (
        IDoomDecisionDispatcher { contract_address: decision_addr },
        IDoomMarketV2Dispatcher { contract_address: adopt },
        IDoomMarketV2Dispatcher { contract_address: reject },
        IMockErc20Dispatcher { contract_address: token },
        adopt,
        reject,
        decision_addr,
    )
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

/// The core futarchy property: the branch that prices success higher wins.
#[test]
fn the_higher_priced_branch_wins() {
    let (dec, adopt, reject, t, a_addr, r_addr, d_addr) = setup();

    // Adopt branch: 4 YES vs 1 NO -> 80% confident the metric is met if adopted.
    buy(adopt, t, a_addr, 'a1', OUTCOME_YES, 4 * ONE);
    buy(adopt, t, a_addr, 'a2', OUTCOME_NO, ONE);
    // Reject branch: 1 YES vs 4 NO -> 20% confident if rejected.
    buy(reject, t, r_addr, 'r1', OUTCOME_YES, ONE);
    buy(reject, t, r_addr, 'r2', OUTCOME_NO, 4 * ONE);

    start_cheat_block_timestamp(d_addr, CLOSES_AT + 1);
    dec.decide();

    assert(dec.get_decision() == Decision::Adopt, 'market said adopt');
    let (a_bps, r_bps) = dec.get_final_shares();
    assert(a_bps == 8000, 'adopt share wrong');
    assert(r_bps == 2000, 'reject share wrong');
}

#[test]
fn ties_go_to_the_status_quo() {
    let (dec, adopt, reject, t, a_addr, r_addr, d_addr) = setup();
    buy(adopt, t, a_addr, 'a1', OUTCOME_YES, ONE);
    buy(adopt, t, a_addr, 'a2', OUTCOME_NO, ONE);
    buy(reject, t, r_addr, 'r1', OUTCOME_YES, ONE);
    buy(reject, t, r_addr, 'r2', OUTCOME_NO, ONE);

    start_cheat_block_timestamp(d_addr, CLOSES_AT + 1);
    dec.decide();
    assert(dec.get_decision() == Decision::Reject, 'ties must favor status quo');
}

#[test]
fn silence_is_inconclusive_not_a_mandate() {
    let (dec, _adopt, _reject, _t, _a, _r, d_addr) = setup();
    start_cheat_block_timestamp(d_addr, CLOSES_AT + 1);
    dec.decide();
    assert(dec.get_decision() == Decision::Inconclusive, 'empty books decide nothing');
}

/// One-sided participation still yields a decision: a staked branch beats silence.
#[test]
fn a_staked_branch_beats_an_empty_one() {
    let (dec, adopt, _reject, t, a_addr, _r, d_addr) = setup();
    buy(adopt, t, a_addr, 'a1', OUTCOME_YES, ONE);
    start_cheat_block_timestamp(d_addr, CLOSES_AT + 1);
    dec.decide();
    assert(dec.get_decision() == Decision::Adopt, 'staked beats empty');
}

#[test]
#[should_panic(expected: 'BRANCHES_STILL_OPEN')]
fn deciding_before_close_is_rejected() {
    let (dec, adopt, _reject, t, a_addr, _r, _d) = setup();
    buy(adopt, t, a_addr, 'a1', OUTCOME_YES, ONE);
    dec.decide();
}

#[test]
#[should_panic(expected: 'ALREADY_DECIDED')]
fn a_decision_is_permanent() {
    let (dec, adopt, _reject, t, a_addr, _r, d_addr) = setup();
    buy(adopt, t, a_addr, 'a1', OUTCOME_YES, ONE);
    start_cheat_block_timestamp(d_addr, CLOSES_AT + 1);
    dec.decide();
    dec.decide();
}

/// The losing branch's stakes are not lost: the branch voids (its condition never
/// happened) and refunds via the normal v2 path. Full conditional-market lifecycle.
#[test]
fn the_losing_branch_refunds_through_void() {
    let (dec, adopt, reject, t, a_addr, r_addr, d_addr) = setup();
    buy(adopt, t, a_addr, 'a1', OUTCOME_YES, 4 * ONE);
    buy(reject, t, r_addr, 'r1', OUTCOME_YES, ONE);
    buy(reject, t, r_addr, 'r2', OUTCOME_NO, 2 * ONE);

    start_cheat_block_timestamp(d_addr, CLOSES_AT + 1);
    dec.decide();
    assert(dec.get_decision() == Decision::Adopt, 'adopt should win');

    // Reject never happened. The arbiter path settles it VOID after a dispute-free
    // proposal would; here we exercise VOID via propose+finalize with zero bond.
    start_cheat_block_timestamp(r_addr, CLOSES_AT + 1);
    start_cheat_caller_address(r_addr, POOL()); // any caller: bond is zero
    reject.propose(2); // OUTCOME_VOID
    stop_cheat_caller_address(r_addr);
    start_cheat_block_timestamp(r_addr, CLOSES_AT + 3700);
    reject.finalize();

    // r2 claims their 2 STRK back in full.
    start_cheat_caller_address(r_addr, POOL());
    reject.privacy_invoke(MarketOperation::Claim, 0, 0, 'r2', 'note_r2');
    stop_cheat_caller_address(r_addr);
    assert(t.allowance(r_addr, POOL()) == (2 * ONE).into(), 'refund should be exact stake');
}
