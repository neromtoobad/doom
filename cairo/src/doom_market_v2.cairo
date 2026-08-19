// DoomMarket v2 — a private decision market that nobody administers.
//
// v1 had two holes, both fatal to the pitch:
//
//   1. No staking deadline. Between an outcome becoming public and the resolver
//      settling, anyone could stake on the known winner and take the pot. Free money.
//   2. A single named resolver decided every outcome. A governance product whose
//      settlement layer is a trusted admin refutes its own thesis.
//
// v2 closes both. Staking stops at `closes_at`. Settlement is optimistic and
// permissionless: after close, anyone posts a bond and proposes an outcome; if no
// one disputes within the challenge window it finalises and the bond comes back.
// A dispute costs an equal bond and escalates to a named arbiter, who only ever
// rules on contested markets — and the losing side forfeits its bond to the winner.
//
// So the honest claim is: nobody decides unilaterally, and lying costs money.
//
// What is still public, stated precisely because overclaiming is worse than the
// feature: stake amounts (the pool's withdraw leg is a plain ERC-20 transfer), and
// the link between a stake and its claim (the claim reveals the secret in calldata).
// What is hidden is the human behind a position. That is the pool's contribution
// plus this contract never learning an address.
//
// DRAFT — not audited.

use starknet::ContractAddress;

/// Must match `privacy::objects::OpenNoteDeposit` (positional Serde).
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

#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct Position {
    pub outcome: u8,
    pub amount: u128,
    pub claimed: bool,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum MarketOperation {
    Buy,
    Claim,
}

pub const OUTCOME_NO: u8 = 0;
pub const OUTCOME_YES: u8 = 1;
/// Unresolvable, or one side drew no stake. Everyone takes their own stake back.
pub const OUTCOME_VOID: u8 = 2;
pub const OUTCOME_NONE: u8 = 255;

pub const DOOM_POSITION_TAG: felt252 = 'DOOM_POSITION_TAG:V1';

pub fn compute_commitment(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([DOOM_POSITION_TAG, secret].span())
}

#[starknet::interface]
pub trait IDoomMarketV2<TState> {
    /// Called by the privacy pool via `selector!("privacy_invoke")`.
    fn privacy_invoke(
        ref self: TState,
        operation: MarketOperation,
        commitment: felt252,
        outcome: u8,
        secret: felt252,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;

    /// After close, anyone may propose an outcome by posting the bond. One live
    /// proposal at a time.
    fn propose(ref self: TState, outcome: u8);
    /// Within the challenge window, anyone may dispute by matching the bond. The
    /// market escalates to the arbiter.
    fn dispute(ref self: TState);
    /// After an unchallenged window, anyone may finalise. The proposer's bond returns.
    fn finalize(ref self: TState);
    /// Arbiter, disputed markets only. The honest side takes both bonds.
    fn arbitrate(ref self: TState, winning_outcome: u8);

    fn get_pots(self: @TState) -> (u128, u128);
    fn get_position(self: @TState, commitment: felt252) -> Position;
    fn is_resolved(self: @TState) -> bool;
    fn get_winning_outcome(self: @TState) -> u8;
    fn get_question(self: @TState) -> ByteArray;
    fn get_token(self: @TState) -> ContractAddress;
    fn get_arbiter(self: @TState) -> ContractAddress;
    fn get_closes_at(self: @TState) -> u64;
    fn get_bond(self: @TState) -> u128;
    /// (proposed_outcome, proposed_at, proposer, disputer, challenge_window)
    fn get_proposal(
        self: @TState,
    ) -> (u8, u64, ContractAddress, ContractAddress, u64);
}

#[starknet::contract]
pub mod DoomMarketV2 {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
    };
    use super::{
        IDoomMarketV2, IErc20Dispatcher, IErc20DispatcherTrait, MarketOperation, OpenNoteDeposit,
        OUTCOME_NO, OUTCOME_NONE, OUTCOME_VOID, OUTCOME_YES, Position, compute_commitment,
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
        /// The whole point of v2: no staking once the question can be answered.
        pub const MARKET_CLOSED: felt252 = 'MARKET_CLOSED';
        pub const NOT_CLOSED_YET: felt252 = 'NOT_CLOSED_YET';
        pub const PROPOSAL_EXISTS: felt252 = 'PROPOSAL_EXISTS';
        pub const NO_PROPOSAL: felt252 = 'NO_PROPOSAL';
        pub const WINDOW_OPEN: felt252 = 'WINDOW_OPEN';
        pub const WINDOW_CLOSED: felt252 = 'WINDOW_CLOSED';
        pub const ALREADY_DISPUTED: felt252 = 'ALREADY_DISPUTED';
        pub const NOT_DISPUTED: felt252 = 'NOT_DISPUTED';
        pub const BOND_TRANSFER_FAILED: felt252 = 'BOND_TRANSFER_FAILED';
    }

    #[storage]
    struct Storage {
        privacy_contract: ContractAddress,
        /// Rules only on disputed markets. Never touches an uncontested one.
        arbiter: ContractAddress,
        token: ContractAddress,
        question: ByteArray,
        closes_at: u64,
        challenge_window: u64,
        bond: u128,
        pot_no: u128,
        pot_yes: u128,
        /// Everything this contract believes it holds: stakes plus live bonds. Each
        /// incoming stake is derived as a delta against it.
        accounted: u128,
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
        Staked: Staked,
        Proposed: Proposed,
        Disputed: Disputed,
        Resolved: Resolved,
        Claimed: Claimed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Staked {
        #[key]
        pub commitment: felt252,
        pub outcome: u8,
        pub amount: u128,
        pub pot_no: u128,
        pub pot_yes: u128,
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
        pub pot_no: u128,
        pub pot_yes: u128,
        /// true when it settled with no dispute and no arbiter involvement.
        pub optimistic: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Claimed {
        #[key]
        pub commitment: felt252,
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
    pub impl DoomMarketV2Impl of IDoomMarketV2<ContractState> {
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

        /// Permissionless. Costs a bond, so a false proposal is only profitable if
        /// nobody is watching for the length of the challenge window.
        fn propose(ref self: ContractState, outcome: u8) {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            assert(get_block_timestamp() >= self.closes_at.read(), errors::NOT_CLOSED_YET);
            assert(self.proposed_outcome.read() == OUTCOME_NONE, errors::PROPOSAL_EXISTS);
            assert(
                outcome == OUTCOME_NO || outcome == OUTCOME_YES || outcome == OUTCOME_VOID,
                errors::BAD_OUTCOME,
            );

            let who = get_caller_address();
            self.pull_bond(who);

            self.proposed_outcome.write(outcome);
            self.proposed_at.write(get_block_timestamp());
            self.proposer.write(who);
            self
                .emit(
                    Proposed {
                        proposer: who,
                        outcome,
                        at: get_block_timestamp(),
                        bond: self.bond.read(),
                    },
                );
        }

        /// Matching the bond buys the right to be wrong at your own expense.
        fn dispute(ref self: ContractState) {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            assert(self.proposed_outcome.read() != OUTCOME_NONE, errors::NO_PROPOSAL);
            assert(self.disputer.read().is_zero(), errors::ALREADY_DISPUTED);
            assert(
                get_block_timestamp() < self.proposed_at.read() + self.challenge_window.read(),
                errors::WINDOW_CLOSED,
            );

            let who = get_caller_address();
            self.pull_bond(who);
            self.disputer.write(who);
            self.emit(Disputed { disputer: who, at: get_block_timestamp() });
        }

        /// Anyone may call. An unchallenged proposal is the outcome.
        fn finalize(ref self: ContractState) {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            let proposed = self.proposed_outcome.read();
            assert(proposed != OUTCOME_NONE, errors::NO_PROPOSAL);
            assert(self.disputer.read().is_zero(), errors::NOT_DISPUTED);
            assert(
                get_block_timestamp() >= self.proposed_at.read() + self.challenge_window.read(),
                errors::WINDOW_OPEN,
            );

            // Honest proposer, bond returned.
            self.push_bond(self.proposer.read(), self.bond.read());
            self.settle(proposed, true);
        }

        /// Only reachable on a disputed market. The wrong side loses its bond.
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
                self.proposer.read() // proposer was right
            } else {
                self.disputer.read() // disputer was right
            };
            self.push_bond(winner, bond * 2);
            self.settle(winning_outcome, false);
        }

        fn get_pots(self: @ContractState) -> (u128, u128) {
            (self.pot_no.read(), self.pot_yes.read())
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
        fn get_proposal(
            self: @ContractState,
        ) -> (u8, u64, ContractAddress, ContractAddress, u64) {
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
        fn do_buy(
            ref self: ContractState, commitment: felt252, outcome: u8,
        ) -> Span<OpenNoteDeposit> {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            // v2's headline fix. Staking after the question can be answered was free money.
            assert(get_block_timestamp() < self.closes_at.read(), errors::MARKET_CLOSED);
            assert(commitment.is_non_zero(), errors::ZERO_COMMITMENT);
            assert(outcome == OUTCOME_NO || outcome == OUTCOME_YES, errors::BAD_OUTCOME);

            let existing = self.positions.read(commitment);
            assert(existing.amount == 0 && !existing.claimed, errors::COMMITMENT_EXISTS);

            let stake = self.received_delta();
            assert(stake != 0, errors::NO_STAKE);

            self.positions.write(commitment, Position { outcome, amount: stake, claimed: false });
            self.accounted.write(self.accounted.read() + stake);

            let (pot_no, pot_yes) = if outcome == OUTCOME_YES {
                let p = self.pot_yes.read() + stake;
                self.pot_yes.write(p);
                (self.pot_no.read(), p)
            } else {
                let p = self.pot_no.read() + stake;
                self.pot_no.write(p);
                (p, self.pot_yes.read())
            };

            self.emit(Staked { commitment, outcome, amount: stake, pot_no, pot_yes });
            [].span()
        }

        fn do_claim(
            ref self: ContractState, secret: felt252, note_id: felt252, pool: ContractAddress,
        ) -> Span<OpenNoteDeposit> {
            assert(self.resolved.read(), errors::NOT_RESOLVED);

            let commitment = compute_commitment(secret);
            let position = self.positions.read(commitment);
            assert(position.amount != 0, errors::POSITION_NOT_FOUND);
            assert(!position.claimed, errors::ALREADY_CLAIMED);

            let winner = self.winning_outcome.read();
            let payout = if winner == OUTCOME_VOID {
                position.amount
            } else {
                assert(position.outcome == winner, errors::NOT_A_WINNER);
                self.parimutuel_payout(position.amount, winner)
            };

            self.positions.write(commitment, Position { claimed: true, ..position });
            self.accounted.write(self.accounted.read() - payout);

            let token = self.token.read();
            IErc20Dispatcher { contract_address: token }.approve(pool, payout.into());
            self.emit(Claimed { commitment, payout });

            [OpenNoteDeposit { note_id, token, amount: payout }].span()
        }

        fn settle(ref self: ContractState, outcome: u8, optimistic: bool) {
            let pot_no = self.pot_no.read();
            let pot_yes = self.pot_yes.read();
            // Settling on a side nobody staked would strand the pot forever.
            let effective = if outcome == OUTCOME_YES && pot_yes == 0 {
                OUTCOME_VOID
            } else if outcome == OUTCOME_NO && pot_no == 0 {
                OUTCOME_VOID
            } else {
                outcome
            };
            self.resolved.write(true);
            self.winning_outcome.write(effective);
            self
                .emit(
                    Resolved { winning_outcome: effective, pot_no, pot_yes, optimistic },
                );
        }

        fn pull_bond(ref self: ContractState, from: ContractAddress) {
            let bond = self.bond.read();
            if bond == 0 {
                return;
            }
            let ok = IErc20Dispatcher { contract_address: self.token.read() }
                .transfer_from(from, get_contract_address(), bond.into());
            assert(ok, errors::BOND_TRANSFER_FAILED);
            // Bonds sit in the same balance as stakes, so they must be accounted for or
            // the next stake's delta would absorb them.
            self.accounted.write(self.accounted.read() + bond);
        }

        fn push_bond(ref self: ContractState, to: ContractAddress, amount: u128) {
            if amount == 0 {
                return;
            }
            self.accounted.write(self.accounted.read() - amount);
            let ok = IErc20Dispatcher { contract_address: self.token.read() }
                .transfer(to, amount.into());
            assert(ok, errors::BOND_TRANSFER_FAILED);
        }

        fn parimutuel_payout(self: @ContractState, stake: u128, winner: u8) -> u128 {
            let pot_no = self.pot_no.read();
            let pot_yes = self.pot_yes.read();
            let total: u256 = pot_no.into() + pot_yes.into();
            let winning_pot: u256 = if winner == OUTCOME_YES {
                pot_yes.into()
            } else {
                pot_no.into()
            };
            let payout: u256 = stake.into() * total / winning_pot;
            payout.try_into().expect(errors::AMOUNT_OVERFLOW)
        }

        fn received_delta(self: @ContractState) -> u128 {
            let balance: u256 = IErc20Dispatcher { contract_address: self.token.read() }
                .balance_of(get_contract_address());
            let balance: u128 = balance.try_into().expect(errors::AMOUNT_OVERFLOW);
            balance - self.accounted.read()
        }
    }
}
