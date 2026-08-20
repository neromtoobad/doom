// DoomPredictionMarket — Polymarket mechanics, STRK20 privacy.
//
// The earlier markets were parimutuel: bet into a pot, "odds" were just the pot
// ratio, and you were locked in until resolution. That is horse-racing betting, not
// a prediction market. This is the real thing.
//
// A fixed-product market maker over binary outcome shares, the same construction
// Gnosis and Polymarket use:
//
//   * The pool holds YES and NO share reserves with invariant  r_yes * r_no = k.
//   * Price of YES is  r_no / (r_yes + r_no)  — always between 0 and 1, and the two
//     side prices always sum to 1. That is a probability, readable straight off chain.
//   * Buying `a` collateral of YES mints `a` YES and `a` NO, keeps the YES, and sells
//     the NO into the pool:  shares_out = (r_yes + a) - k / (r_no + a).
//     Every buy moves the price, so the market aggregates information continuously.
//   * A winning share redeems for exactly 1 collateral.
//
// Solvency, which is the thing to get right: each deposit mints one share of each
// side, so the outstanding shares of either side can never exceed the collateral
// held. Winners are always payable.
//
// Privacy is unchanged from the rest of Doom, and is what the RFP asks for: bet
// sizes and prices are fully public so the odds stay accurate, while the bettor is
// hidden. Positions key off poseidon(tag, secret) and this contract is only ever
// called by the pool, so it never learns an address.
//
// Settlement is the v2 bonded-optimistic scheme: propose with a bond, dispute by
// matching it, an arbiter only ever touches a contested market.
//
// DRAFT — not audited.

use starknet::ContractAddress;

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

#[starknet::interface]
pub trait IErc20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
}

/// A holding of outcome shares, keyed by commitment rather than by address.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct Position {
    pub outcome: u8,
    /// Outcome shares, not collateral. Each redeems for 1 collateral if it wins.
    pub shares: u128,
    /// Collateral actually paid, kept so the UI can show a cost basis.
    pub cost: u128,
    pub claimed: bool,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum MarketOperation {
    Buy,
    Claim,
}

pub const OUTCOME_NO: u8 = 0;
pub const OUTCOME_YES: u8 = 1;
pub const OUTCOME_VOID: u8 = 2;
pub const OUTCOME_NONE: u8 = 255;

pub const DOOM_POSITION_TAG: felt252 = 'DOOM_POSITION_TAG:V1';

pub fn compute_commitment(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([DOOM_POSITION_TAG, secret].span())
}

#[starknet::interface]
pub trait IDoomPredictionMarket<TState> {
    /// Seed the market maker. Anyone may call it once, before any betting, and the
    /// collateral they post becomes the initial liquidity on both sides.
    fn add_liquidity(ref self: TState, amount: u128);

    /// After resolution, the liquidity provider redeems the shares still sitting in
    /// the market maker. Without this the seed is stranded: the pool's own winning
    /// shares are real collateral that nobody could ever claim.
    fn withdraw_liquidity(ref self: TState);

    /// Called by the privacy pool via `selector!("privacy_invoke")`.
    ///
    /// **Buy** — the pool has already sent the stake here. Collateral is measured as
    /// a balance delta, never taken from calldata. Shares are priced by the curve.
    /// **Claim** — reveals the secret; winning shares redeem 1:1 into an open note.
    fn privacy_invoke(
        ref self: TState,
        operation: MarketOperation,
        commitment: felt252,
        outcome: u8,
        secret: felt252,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;

    fn propose(ref self: TState, outcome: u8);
    fn dispute(ref self: TState);
    fn finalize(ref self: TState);
    fn arbitrate(ref self: TState, winning_outcome: u8);

    // ── views. Prices are public by design: that is what keeps odds accurate. ──
    /// (r_yes, r_no) share reserves.
    fn get_reserves(self: @TState) -> (u128, u128);
    /// Price of YES in basis points, 0..10000. NO is 10000 minus it.
    fn get_price_yes(self: @TState) -> u128;
    /// Shares `amount` of collateral would buy right now, before committing to it.
    fn quote(self: @TState, outcome: u8, amount: u128) -> u128;
    /// Total collateral bet into the market, the market's volume.
    fn get_volume(self: @TState) -> u128;
    fn get_position(self: @TState, commitment: felt252) -> Position;
    fn is_resolved(self: @TState) -> bool;
    fn get_winning_outcome(self: @TState) -> u8;
    fn get_question(self: @TState) -> ByteArray;
    fn get_token(self: @TState) -> ContractAddress;
    fn get_arbiter(self: @TState) -> ContractAddress;
    fn get_closes_at(self: @TState) -> u64;
    fn get_bond(self: @TState) -> u128;
    fn get_liquidity_provider(self: @TState) -> ContractAddress;
    fn get_proposal(self: @TState) -> (u8, u64, ContractAddress, ContractAddress, u64);
}

#[starknet::contract]
pub mod DoomPredictionMarket {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
    };
    use super::{
        IDoomPredictionMarket, IErc20Dispatcher, IErc20DispatcherTrait, MarketOperation,
        OpenNoteDeposit, OUTCOME_NO, OUTCOME_NONE, OUTCOME_VOID, OUTCOME_YES, Position,
        compute_commitment,
    };

    pub mod errors {
        pub const CALLER_NOT_PRIVACY: felt252 = 'CALLER_NOT_PRIVACY';
        pub const NOT_ARBITER: felt252 = 'NOT_ARBITER';
        pub const ALREADY_RESOLVED: felt252 = 'ALREADY_RESOLVED';
        pub const NOT_RESOLVED: felt252 = 'NOT_RESOLVED';
        pub const BAD_OUTCOME: felt252 = 'BAD_OUTCOME';
        pub const ZERO_COMMITMENT: felt252 = 'ZERO_COMMITMENT';
        pub const COMMITMENT_EXISTS: felt252 = 'COMMITMENT_EXISTS';
        pub const POSITION_NOT_FOUND: felt252 = 'POSITION_NOT_FOUND';
        pub const ALREADY_CLAIMED: felt252 = 'ALREADY_CLAIMED';
        pub const NOT_A_WINNER: felt252 = 'NOT_A_WINNER';
        pub const NO_STAKE: felt252 = 'NO_STAKE';
        pub const AMOUNT_OVERFLOW: felt252 = 'AMOUNT_OVERFLOW';
        pub const MARKET_CLOSED: felt252 = 'MARKET_CLOSED';
        pub const NOT_CLOSED_YET: felt252 = 'NOT_CLOSED_YET';
        pub const PROPOSAL_EXISTS: felt252 = 'PROPOSAL_EXISTS';
        pub const NO_PROPOSAL: felt252 = 'NO_PROPOSAL';
        pub const WINDOW_OPEN: felt252 = 'WINDOW_OPEN';
        pub const WINDOW_CLOSED: felt252 = 'WINDOW_CLOSED';
        pub const ALREADY_DISPUTED: felt252 = 'ALREADY_DISPUTED';
        pub const NOT_DISPUTED: felt252 = 'NOT_DISPUTED';
        pub const TRANSFER_FAILED: felt252 = 'TRANSFER_FAILED';
        /// No market maker yet, so there is no price to trade against.
        pub const NO_LIQUIDITY: felt252 = 'NO_LIQUIDITY';
        pub const ALREADY_SEEDED: felt252 = 'ALREADY_SEEDED';
        pub const ZERO_SHARES_OUT: felt252 = 'ZERO_SHARES_OUT';
        pub const NOT_LP: felt252 = 'NOT_LP';
        pub const LP_ALREADY_OUT: felt252 = 'LP_ALREADY_OUT';
    }

    #[storage]
    struct Storage {
        privacy_contract: ContractAddress,
        arbiter: ContractAddress,
        token: ContractAddress,
        question: ByteArray,
        closes_at: u64,
        challenge_window: u64,
        bond: u128,
        // ── market maker ──
        r_yes: u128,
        r_no: u128,
        /// Collateral bet by users. The market's public volume.
        volume: u128,
        /// Outstanding user-held shares per side, for solvency assertions in tests.
        out_yes: u128,
        out_no: u128,
        /// Everything this contract believes it holds: liquidity, bets and live bonds.
        accounted: u128,
        seeded: bool,
        /// Whoever seeded the market maker, and whether they have redeemed.
        lp: ContractAddress,
        lp_seed: u128,
        lp_withdrawn: bool,
        // ── settlement ──
        resolved: bool,
        winning_outcome: u8,
        proposed_outcome: u8,
        proposed_at: u64,
        proposer: ContractAddress,
        disputer: ContractAddress,
        positions: Map<felt252, Position>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        LiquidityAdded: LiquidityAdded,
        LiquidityWithdrawn: LiquidityWithdrawn,
        Bought: Bought,
        Proposed: Proposed,
        Disputed: Disputed,
        Resolved: Resolved,
        Claimed: Claimed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LiquidityAdded {
        #[key]
        pub provider: ContractAddress,
        pub amount: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LiquidityWithdrawn {
        #[key]
        pub provider: ContractAddress,
        pub amount: u128,
    }

    /// The public half of the market: size, price paid, and where the price landed.
    /// Everything a forecaster needs, and nothing that identifies the bettor.
    #[derive(Drop, starknet::Event)]
    pub struct Bought {
        #[key]
        pub commitment: felt252,
        pub outcome: u8,
        pub cost: u128,
        pub shares: u128,
        /// Price of YES after the trade, in basis points.
        pub price_yes_bps: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Proposed {
        #[key]
        pub proposer: ContractAddress,
        pub outcome: u8,
        pub at: u64,
        pub bond: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Disputed {
        #[key]
        pub disputer: ContractAddress,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Resolved {
        #[key]
        pub winning_outcome: u8,
        pub volume: u128,
        pub optimistic: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Claimed {
        #[key]
        pub commitment: felt252,
        pub shares: u128,
        pub payout: u128,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        privacy_contract: ContractAddress,
        arbiter: ContractAddress,
        token: ContractAddress,
        closes_at: u64,
        challenge_window: u64,
        bond: u128,
        question: ByteArray,
    ) {
        self.privacy_contract.write(privacy_contract);
        self.arbiter.write(arbiter);
        self.token.write(token);
        self.closes_at.write(closes_at);
        self.challenge_window.write(challenge_window);
        self.bond.write(bond);
        self.question.write(question);
        self.proposed_outcome.write(OUTCOME_NONE);
        self.winning_outcome.write(OUTCOME_NONE);
    }

    #[abi(embed_v0)]
    pub impl DoomPredictionMarketImpl of IDoomPredictionMarket<ContractState> {
        fn add_liquidity(ref self: ContractState, amount: u128) {
            assert(!self.seeded.read(), errors::ALREADY_SEEDED);
            assert(amount != 0, errors::NO_LIQUIDITY);
            let who = get_caller_address();
            let ok = IErc20Dispatcher { contract_address: self.token.read() }
                .transfer_from(who, get_contract_address(), amount.into());
            assert(ok, errors::TRANSFER_FAILED);

            // Equal reserves start the market at an even 50/50 price.
            self.r_yes.write(amount);
            self.r_no.write(amount);
            self.accounted.write(self.accounted.read() + amount);
            self.seeded.write(true);
            self.lp.write(who);
            self.lp_seed.write(amount);
            self.emit(LiquidityAdded { provider: who, amount });
        }

        fn withdraw_liquidity(ref self: ContractState) {
            assert(self.resolved.read(), errors::NOT_RESOLVED);
            let who = get_caller_address();
            assert(who == self.lp.read(), errors::NOT_LP);
            assert(!self.lp_withdrawn.read(), errors::LP_ALREADY_OUT);

            let winner = self.winning_outcome.read();
            // On a settled market the reserves are the pool's own outcome shares, and
            // a winning share is worth one collateral. On a void the seed comes back
            // untouched, because every bettor is refunded their cost instead.
            let owed = if winner == OUTCOME_VOID {
                self.lp_seed.read()
            } else if winner == OUTCOME_YES {
                self.r_yes.read()
            } else {
                self.r_no.read()
            };

            self.lp_withdrawn.write(true);
            self.push(who, owed);
            self.emit(LiquidityWithdrawn { provider: who, amount: owed });
        }

        fn privacy_invoke(
            ref self: ContractState,
            operation: MarketOperation,
            commitment: felt252,
            outcome: u8,
            secret: felt252,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let pool = self.privacy_contract.read();
            assert(get_caller_address() == pool, errors::CALLER_NOT_PRIVACY);
            match operation {
                MarketOperation::Buy => self.do_buy(commitment, outcome),
                MarketOperation::Claim => self.do_claim(secret, note_id, pool),
            }
        }

        fn propose(ref self: ContractState, outcome: u8) {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            assert(get_block_timestamp() >= self.closes_at.read(), errors::NOT_CLOSED_YET);
            assert(self.proposed_outcome.read() == OUTCOME_NONE, errors::PROPOSAL_EXISTS);
            assert(
                outcome == OUTCOME_NO || outcome == OUTCOME_YES || outcome == OUTCOME_VOID,
                errors::BAD_OUTCOME,
            );
            let who = get_caller_address();
            self.pull(who, self.bond.read());
            self.proposed_outcome.write(outcome);
            self.proposed_at.write(get_block_timestamp());
            self.proposer.write(who);
            self
                .emit(
                    Proposed {
                        proposer: who, outcome, at: get_block_timestamp(), bond: self.bond.read(),
                    },
                );
        }

        fn dispute(ref self: ContractState) {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            assert(self.proposed_outcome.read() != OUTCOME_NONE, errors::NO_PROPOSAL);
            assert(self.disputer.read().is_zero(), errors::ALREADY_DISPUTED);
            assert(
                get_block_timestamp() < self.proposed_at.read() + self.challenge_window.read(),
                errors::WINDOW_CLOSED,
            );
            let who = get_caller_address();
            self.pull(who, self.bond.read());
            self.disputer.write(who);
            self.emit(Disputed { disputer: who, at: get_block_timestamp() });
        }

        fn finalize(ref self: ContractState) {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            let proposed = self.proposed_outcome.read();
            assert(proposed != OUTCOME_NONE, errors::NO_PROPOSAL);
            assert(self.disputer.read().is_zero(), errors::NOT_DISPUTED);
            assert(
                get_block_timestamp() >= self.proposed_at.read() + self.challenge_window.read(),
                errors::WINDOW_OPEN,
            );
            self.push(self.proposer.read(), self.bond.read());
            self.settle(proposed, true);
        }

        fn arbitrate(ref self: ContractState, winning_outcome: u8) {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            assert(get_caller_address() == self.arbiter.read(), errors::NOT_ARBITER);
            assert(!self.disputer.read().is_zero(), errors::NOT_DISPUTED);
            assert(
                winning_outcome == OUTCOME_NO
                    || winning_outcome == OUTCOME_YES
                    || winning_outcome == OUTCOME_VOID,
                errors::BAD_OUTCOME,
            );
            let bond = self.bond.read();
            let winner = if winning_outcome == self.proposed_outcome.read() {
                self.proposer.read()
            } else {
                self.disputer.read()
            };
            self.push(winner, bond * 2);
            self.settle(winning_outcome, false);
        }

        fn get_reserves(self: @ContractState) -> (u128, u128) {
            (self.r_yes.read(), self.r_no.read())
        }

        fn get_price_yes(self: @ContractState) -> u128 {
            let ry = self.r_yes.read();
            let rn = self.r_no.read();
            if ry + rn == 0 {
                return 5000;
            }
            // Price of YES is the NO reserve's share: buying YES drains r_yes, which
            // raises this. Prices of the two sides always sum to 10000.
            rn * 10000 / (ry + rn)
        }

        fn quote(self: @ContractState, outcome: u8, amount: u128) -> u128 {
            if amount == 0 || !self.seeded.read() {
                return 0;
            }
            self.shares_out(outcome, amount)
        }

        fn get_volume(self: @ContractState) -> u128 {
            self.volume.read()
        }
        fn get_position(self: @ContractState, commitment: felt252) -> Position {
            self.positions.read(commitment)
        }
        fn is_resolved(self: @ContractState) -> bool {
            self.resolved.read()
        }
        fn get_winning_outcome(self: @ContractState) -> u8 {
            self.winning_outcome.read()
        }
        fn get_question(self: @ContractState) -> ByteArray {
            self.question.read()
        }
        fn get_token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }
        fn get_arbiter(self: @ContractState) -> ContractAddress {
            self.arbiter.read()
        }
        fn get_closes_at(self: @ContractState) -> u64 {
            self.closes_at.read()
        }
        fn get_bond(self: @ContractState) -> u128 {
            self.bond.read()
        }
        fn get_liquidity_provider(self: @ContractState) -> ContractAddress {
            self.lp.read()
        }
        fn get_proposal(self: @ContractState) -> (u8, u64, ContractAddress, ContractAddress, u64) {
            (
                self.proposed_outcome.read(),
                self.proposed_at.read(),
                self.proposer.read(),
                self.disputer.read(),
                self.challenge_window.read(),
            )
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// shares_out = (r_side + a) - k / (r_other + a), the fixed-product swap after
        /// minting one share of each side for the collateral.
        fn shares_out(self: @ContractState, outcome: u8, amount: u128) -> u128 {
            let ry: u256 = self.r_yes.read().into();
            let rn: u256 = self.r_no.read().into();
            let a: u256 = amount.into();
            let k = ry * rn;
            let out: u256 = if outcome == OUTCOME_YES {
                (ry + a) - k / (rn + a)
            } else {
                (rn + a) - k / (ry + a)
            };
            out.try_into().expect(errors::AMOUNT_OVERFLOW)
        }

        fn do_buy(
            ref self: ContractState, commitment: felt252, outcome: u8,
        ) -> Span<OpenNoteDeposit> {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            assert(get_block_timestamp() < self.closes_at.read(), errors::MARKET_CLOSED);
            assert(self.seeded.read(), errors::NO_LIQUIDITY);
            assert(commitment.is_non_zero(), errors::ZERO_COMMITMENT);
            assert(outcome == OUTCOME_NO || outcome == OUTCOME_YES, errors::BAD_OUTCOME);

            let existing = self.positions.read(commitment);
            assert(existing.shares == 0 && !existing.claimed, errors::COMMITMENT_EXISTS);

            let cost = self.received_delta();
            assert(cost != 0, errors::NO_STAKE);

            let shares = self.shares_out(outcome, cost);
            assert(shares != 0, errors::ZERO_SHARES_OUT);

            // Mint one share of each side for the collateral, hand the buyer their
            // side, and leave the rest with the market maker.
            if outcome == OUTCOME_YES {
                self.r_yes.write(self.r_yes.read() + cost - shares);
                self.r_no.write(self.r_no.read() + cost);
                self.out_yes.write(self.out_yes.read() + shares);
            } else {
                self.r_no.write(self.r_no.read() + cost - shares);
                self.r_yes.write(self.r_yes.read() + cost);
                self.out_no.write(self.out_no.read() + shares);
            }

            self
                .positions
                .write(commitment, Position { outcome, shares, cost, claimed: false });
            self.accounted.write(self.accounted.read() + cost);
            self.volume.write(self.volume.read() + cost);

            self
                .emit(
                    Bought {
                        commitment,
                        outcome,
                        cost,
                        shares,
                        price_yes_bps: self.price_now(),
                    },
                );
            [].span()
        }

        fn do_claim(
            ref self: ContractState, secret: felt252, note_id: felt252, pool: ContractAddress,
        ) -> Span<OpenNoteDeposit> {
            assert(self.resolved.read(), errors::NOT_RESOLVED);

            let commitment = compute_commitment(secret);
            let position = self.positions.read(commitment);
            assert(position.shares != 0, errors::POSITION_NOT_FOUND);
            assert(!position.claimed, errors::ALREADY_CLAIMED);

            let winner = self.winning_outcome.read();
            // A winning share is worth exactly one collateral. Void refunds cost.
            let payout = if winner == OUTCOME_VOID {
                position.cost
            } else {
                assert(position.outcome == winner, errors::NOT_A_WINNER);
                position.shares
            };

            self.positions.write(commitment, Position { claimed: true, ..position });
            self.accounted.write(self.accounted.read() - payout);

            let token = self.token.read();
            IErc20Dispatcher { contract_address: token }.approve(pool, payout.into());
            self.emit(Claimed { commitment, shares: position.shares, payout });

            [OpenNoteDeposit { note_id, token, amount: payout }].span()
        }

        fn price_now(self: @ContractState) -> u128 {
            let ry = self.r_yes.read();
            let rn = self.r_no.read();
            if ry + rn == 0 {
                5000
            } else {
                rn * 10000 / (ry + rn)
            }
        }

        fn settle(ref self: ContractState, outcome: u8, optimistic: bool) {
            // Settling a side nobody holds would strand the collateral.
            let effective = if outcome == OUTCOME_YES && self.out_yes.read() == 0 {
                OUTCOME_VOID
            } else if outcome == OUTCOME_NO && self.out_no.read() == 0 {
                OUTCOME_VOID
            } else {
                outcome
            };
            self.resolved.write(true);
            self.winning_outcome.write(effective);
            self
                .emit(
                    Resolved {
                        winning_outcome: effective, volume: self.volume.read(), optimistic,
                    },
                );
        }

        fn pull(ref self: ContractState, from: ContractAddress, amount: u128) {
            if amount == 0 {
                return;
            }
            let ok = IErc20Dispatcher { contract_address: self.token.read() }
                .transfer_from(from, get_contract_address(), amount.into());
            assert(ok, errors::TRANSFER_FAILED);
            self.accounted.write(self.accounted.read() + amount);
        }

        fn push(ref self: ContractState, to: ContractAddress, amount: u128) {
            if amount == 0 {
                return;
            }
            self.accounted.write(self.accounted.read() - amount);
            let ok = IErc20Dispatcher { contract_address: self.token.read() }
                .transfer(to, amount.into());
            assert(ok, errors::TRANSFER_FAILED);
        }

        /// What the pool just sent: balance minus everything already accounted for.
        fn received_delta(self: @ContractState) -> u128 {
            let balance: u256 = IErc20Dispatcher { contract_address: self.token.read() }
                .balance_of(get_contract_address());
            let balance: u128 = balance.try_into().expect(errors::AMOUNT_OVERFLOW);
            balance - self.accounted.read()
        }
    }
}
