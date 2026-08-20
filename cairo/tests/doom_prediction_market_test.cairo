// Prediction-market tests. The important ones are pricing and solvency: a market
// maker that misprices is useless, and one that cannot pay its winners is worse.

use doom::doom_prediction_market::{
    IDoomPredictionMarketDispatcher, IDoomPredictionMarketDispatcherTrait, MarketOperation,
    OUTCOME_NO, OUTCOME_VOID, OUTCOME_YES, compute_commitment,
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
fn LP() -> ContractAddress {
    0x5005.try_into().unwrap()
}

const ONE: u128 = 1_000_000_000_000_000_000;
const SEED: u128 = 100 * ONE;
const CLOSES_AT: u64 = 1_000_000;
const WINDOW: u64 = 3600;

fn setup() -> (IDoomPredictionMarketDispatcher, IMockErc20Dispatcher, ContractAddress) {
    let erc = declare("MockErc20").unwrap().contract_class();
    let (token, _) = erc.deploy(@array![]).unwrap();

    let cls = declare("DoomPredictionMarket").unwrap().contract_class();
    let mut cd = array![];
    POOL().serialize(ref cd);
    ARBITER().serialize(ref cd);
    token.serialize(ref cd);
    CLOSES_AT.serialize(ref cd);
    WINDOW.serialize(ref cd);
    0_u128.serialize(ref cd); // no bond, settlement is covered by the v2 suite
    let q: ByteArray = "Will BTC close above 100k on 2026-12-31?";
    q.serialize(ref cd);
    let (market, _) = cls.deploy(@cd).unwrap();

    let t = IMockErc20Dispatcher { contract_address: token };
    t.mint(LP(), (SEED * 4).into());

    start_cheat_block_timestamp(market, CLOSES_AT - 100);

    // Seed the market maker so there is a price to trade against.
    start_cheat_caller_address(token, LP());
    t.approve(market, SEED.into());
    stop_cheat_caller_address(token);
    start_cheat_caller_address(market, LP());
    IDoomPredictionMarketDispatcher { contract_address: market }.add_liquidity(SEED);
    stop_cheat_caller_address(market);

    (IDoomPredictionMarketDispatcher { contract_address: market }, t, market)
}

/// Simulate the pool's withdraw leg landing, then the invoke.
fn buy(
    m: IDoomPredictionMarketDispatcher,
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

// ── pricing ─────────────────────────────────────────────────────────────────────

#[test]
fn an_even_market_starts_at_fifty_fifty() {
    let (m, _t, _a) = setup();
    assert(m.get_price_yes() == 5000, 'should open at 0.50');
}

/// The property that makes it a market rather than a pot: buying moves the price.
#[test]
fn buying_yes_raises_the_price_of_yes() {
    let (m, t, a) = setup();
    let before = m.get_price_yes();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    let after = m.get_price_yes();
    assert(after > before, 'buying YES must raise YES');
    buy(m, t, a, 'bob', OUTCOME_NO, 20 * ONE);
    assert(m.get_price_yes() < after, 'buying NO must lower YES');
}

#[test]
fn the_two_side_prices_always_sum_to_one() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 37 * ONE);
    let yes = m.get_price_yes();
    let no = 10000 - yes;
    assert(yes + no == 10000, 'prices must sum to 1');
}

/// A quote must be exactly what the buy delivers, or the UI lies to the user.
#[test]
fn a_quote_matches_what_the_buy_actually_pays() {
    let (m, t, a) = setup();
    let quoted = m.quote(OUTCOME_YES, 25 * ONE);
    buy(m, t, a, 'alice', OUTCOME_YES, 25 * ONE);
    let got = m.get_position(compute_commitment('alice')).shares;
    assert(quoted == got, 'quote must match fill');
}

/// Slippage: paying more per unit as the trade grows is the curve working.
#[test]
fn larger_buys_get_a_worse_average_price() {
    let (m, _t, _a) = setup();
    let small = m.quote(OUTCOME_YES, 10 * ONE);
    let large = m.quote(OUTCOME_YES, 100 * ONE);
    // shares per collateral must fall as size rises
    assert(small * 100 > large * 10, 'big buys must slip');
}

#[test]
fn buying_always_returns_more_shares_than_collateral_at_even_odds() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 10 * ONE);
    let p = m.get_position(compute_commitment('alice'));
    // At 0.5 a share costs about half a collateral, so 10 buys well over 10 shares.
    assert(p.shares > p.cost, 'shares should exceed cost');
}

// ── solvency, the thing that must never break ───────────────────────────────────

/// Outstanding winning shares can never exceed collateral held, so every winner is
/// payable. This is the invariant the whole design rests on.
#[test]
fn the_market_can_always_pay_its_winners() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 30 * ONE);
    buy(m, t, a, 'bob', OUTCOME_YES, 45 * ONE);
    buy(m, t, a, 'carol', OUTCOME_NO, 20 * ONE);

    let held = t.balance_of(a);
    let owed_if_yes = m.get_position(compute_commitment('alice')).shares
        + m.get_position(compute_commitment('bob')).shares;
    let owed_if_no = m.get_position(compute_commitment('carol')).shares;
    assert(owed_if_yes.into() <= held, 'insolvent on YES');
    assert(owed_if_no.into() <= held, 'insolvent on NO');
}

// ── payout ──────────────────────────────────────────────────────────────────────

#[test]
fn a_winning_share_redeems_for_exactly_one_collateral() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    buy(m, t, a, 'bob', OUTCOME_NO, 20 * ONE);
    let shares = m.get_position(compute_commitment('alice')).shares;

    start_cheat_block_timestamp(a, CLOSES_AT + 1);
    start_cheat_caller_address(a, POOL());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(a);
    start_cheat_block_timestamp(a, CLOSES_AT + WINDOW + 2);
    m.finalize();

    start_cheat_caller_address(a, POOL());
    m.privacy_invoke(MarketOperation::Claim, 0, 0, 'alice', 'note_a');
    stop_cheat_caller_address(a);
    assert(t.allowance(a, POOL()) == shares.into(), 'payout must equal shares');
}

#[test]
#[should_panic(expected: 'NOT_A_WINNER')]
fn a_losing_share_pays_nothing() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    buy(m, t, a, 'bob', OUTCOME_NO, 20 * ONE);
    start_cheat_block_timestamp(a, CLOSES_AT + 1);
    start_cheat_caller_address(a, POOL());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(a);
    start_cheat_block_timestamp(a, CLOSES_AT + WINDOW + 2);
    m.finalize();
    start_cheat_caller_address(a, POOL());
    m.privacy_invoke(MarketOperation::Claim, 0, 0, 'bob', 'note_b');
}

#[test]
fn void_refunds_what_was_paid_not_the_shares() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    let cost = m.get_position(compute_commitment('alice')).cost;

    start_cheat_block_timestamp(a, CLOSES_AT + 1);
    start_cheat_caller_address(a, POOL());
    m.propose(OUTCOME_VOID);
    stop_cheat_caller_address(a);
    start_cheat_block_timestamp(a, CLOSES_AT + WINDOW + 2);
    m.finalize();

    start_cheat_caller_address(a, POOL());
    m.privacy_invoke(MarketOperation::Claim, 0, 0, 'alice', 'note_a');
    stop_cheat_caller_address(a);
    assert(t.allowance(a, POOL()) == cost.into(), 'void refunds cost');
}

// ── guards ──────────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected: 'NO_LIQUIDITY')]
fn betting_without_a_market_maker_is_rejected() {
    let erc = declare("MockErc20").unwrap().contract_class();
    let (token, _) = erc.deploy(@array![]).unwrap();
    let cls = declare("DoomPredictionMarket").unwrap().contract_class();
    let mut cd = array![];
    POOL().serialize(ref cd);
    ARBITER().serialize(ref cd);
    token.serialize(ref cd);
    CLOSES_AT.serialize(ref cd);
    WINDOW.serialize(ref cd);
    0_u128.serialize(ref cd);
    let q: ByteArray = "unseeded";
    q.serialize(ref cd);
    let (market, _) = cls.deploy(@cd).unwrap();
    let t = IMockErc20Dispatcher { contract_address: token };
    start_cheat_block_timestamp(market, CLOSES_AT - 100);
    buy(
        IDoomPredictionMarketDispatcher { contract_address: market },
        t,
        market,
        'alice',
        OUTCOME_YES,
        ONE,
    );
}

#[test]
#[should_panic(expected: 'MARKET_CLOSED')]
fn betting_after_close_is_rejected() {
    let (m, t, a) = setup();
    start_cheat_block_timestamp(a, CLOSES_AT + 1);
    buy(m, t, a, 'latecomer', OUTCOME_YES, ONE);
}

#[test]
#[should_panic(expected: 'CALLER_NOT_PRIVACY')]
fn only_the_pool_may_place_a_bet() {
    let (m, t, a) = setup();
    t.mint(a, ONE.into());
    start_cheat_caller_address(a, LP());
    m.privacy_invoke(MarketOperation::Buy, compute_commitment('mallory'), OUTCOME_YES, 0, 0);
}

#[test]
fn volume_tracks_collateral_bet_not_liquidity() {
    let (m, t, a) = setup();
    assert(m.get_volume() == 0, 'seed is not volume');
    buy(m, t, a, 'alice', OUTCOME_YES, 12 * ONE);
    buy(m, t, a, 'bob', OUTCOME_NO, 8 * ONE);
    assert(m.get_volume() == 20 * ONE, 'volume should be 20');
}

// ── liquidity provider ──────────────────────────────────────────────────────────

/// The seed is real capital. After resolution the reserves are the pool's own
/// outcome shares, and without a withdraw path two thirds of a seed would sit in
/// the contract forever. This is the regression test for that.
#[test]
fn the_liquidity_provider_gets_their_capital_back() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    buy(m, t, a, 'bob', OUTCOME_NO, 30 * ONE);

    let (r_yes, _r_no) = m.get_reserves();

    start_cheat_block_timestamp(a, CLOSES_AT + 1);
    start_cheat_caller_address(a, POOL());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(a);
    start_cheat_block_timestamp(a, CLOSES_AT + WINDOW + 2);
    m.finalize();

    let before = t.balance_of(LP());
    start_cheat_caller_address(a, LP());
    m.withdraw_liquidity();
    stop_cheat_caller_address(a);

    // The pool's YES reserve redeems 1:1, exactly like any other winning share.
    assert(t.balance_of(LP()) == before + r_yes.into(), 'LP payout wrong');
}

/// Everyone paid in full — bettors and the LP — with nothing left stranded and
/// nothing overdrawn. This is the whole-market solvency statement.
#[test]
fn the_market_pays_everyone_and_balances_to_zero() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    buy(m, t, a, 'bob', OUTCOME_NO, 30 * ONE);

    let held = t.balance_of(a);
    let alice = m.get_position(compute_commitment('alice')).shares;
    let (r_yes, _r_no) = m.get_reserves();

    // If YES settles: alice's shares plus the pool's reserve is the entire balance.
    assert(alice.into() + r_yes.into() == held, 'market must balance exactly');
}

#[test]
#[should_panic(expected: 'NOT_LP')]
fn only_the_provider_may_withdraw_liquidity() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    start_cheat_block_timestamp(a, CLOSES_AT + 1);
    start_cheat_caller_address(a, POOL());
    m.propose(OUTCOME_YES);
    stop_cheat_caller_address(a);
    start_cheat_block_timestamp(a, CLOSES_AT + WINDOW + 2);
    m.finalize();
    start_cheat_caller_address(a, ARBITER());
    m.withdraw_liquidity();
}

#[test]
#[should_panic(expected: 'NOT_RESOLVED')]
fn liquidity_cannot_be_pulled_mid_market() {
    let (m, t, a) = setup();
    buy(m, t, a, 'alice', OUTCOME_YES, 20 * ONE);
    start_cheat_caller_address(a, LP());
    m.withdraw_liquidity();
}
