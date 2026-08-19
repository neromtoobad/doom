// DoomMarket - a private decision market as a STRK20 anonymizer contract.
//
// A DAO asks a question. People stake shielded STRK on YES or NO. The pot split is
// public, so anyone can read the odds. Who staked is not, and this contract cannot
// learn it: inside `privacy_invoke` the caller is always the pool, never the user.
//
// Positions are keyed by poseidon(DOOM_POSITION_TAG, secret). The user picks the
// secret client-side, it never goes on chain on the buy leg, and revealing it on the
// claim leg is the only thing that links a payout to a stake.
//
// Settlement is parimutuel: winners split the whole pot in proportion to their stake.
// No curve, no oracle, one named resolver.
//
// DRAFT - written for the STRK20 Private Sprint. Adapted from the escrow pattern in
// the STRK20 docs, which is itself unofficial and unaudited. Not audited. Do not put
// funds you cannot lose behind it.

use starknet::ContractAddress;

/// Must match `privacy::objects::OpenNoteDeposit` (positional Serde). Declared locally
/// so this package needs no dependency beyond `starknet`, exactly as the starter kit's
/// helper does.
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
}

/// A stake held against a commitment.
#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct Position {
    /// OUTCOME_NO or OUTCOME_YES.
    pub outcome: u8,
    /// Amount actually received from the pool, in token units.
    pub amount: u128,
    pub claimed: bool,
}

/// What the pool is asking this contract to do.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum MarketOperation {
    /// Stake on an outcome. Funds stay here, so this returns an empty span.
    Buy,
    /// Prove a winning position and be paid into an open note.
    Claim,
}

pub const OUTCOME_NO: u8 = 0;
pub const OUTCOME_YES: u8 = 1;
/// Set by the resolver when the question cannot be settled, or when one side drew no
/// stake at all. Everyone claims their own stake back. Without this the pot is stuck.
pub const OUTCOME_VOID: u8 = 2;

/// Domain separation, so a Doom commitment cannot collide with a hash used elsewhere.
pub const DOOM_POSITION_TAG: felt252 = 'DOOM_POSITION_TAG:V1';

pub fn compute_commitment(secret: felt252) -> felt252 {
    core::poseidon::poseidon_hash_span([DOOM_POSITION_TAG, secret].span())
}

#[starknet::interface]
pub trait IDoomMarket<TState> {
    /// Called by the privacy pool via `selector!("privacy_invoke")`.
    ///
    /// **Buy** - the pool has already transferred the stake here. The amount is
    /// measured as a balance delta, never taken from calldata.
    /// - `commitment` - poseidon(DOOM_POSITION_TAG, secret), computed client-side
    /// - `outcome` - OUTCOME_NO or OUTCOME_YES
    /// - `secret`, `note_id` - ignored
    ///
    /// **Claim** - reveals the secret, marks the position claimed, approves the pool
    /// and returns the deposit instruction.
    /// - `secret` - preimage of a stored commitment
    /// - `note_id` - the open note to credit, from `${openNoteIds[0]}`
    /// - `commitment`, `outcome` - ignored
    fn privacy_invoke(
        ref self: TState,
        operation: MarketOperation,
        commitment: felt252,
        outcome: u8,
        secret: felt252,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;

    /// Settle the market. Resolver only, once.
    fn resolve(ref self: TState, winning_outcome: u8);

    // Views. The odds are public by design.
    fn get_pots(self: @TState) -> (u128, u128);
    fn get_position(self: @TState, commitment: felt252) -> Position;
    fn is_resolved(self: @TState) -> bool;
    fn get_winning_outcome(self: @TState) -> u8;
    fn get_question(self: @TState) -> ByteArray;
    fn get_resolver(self: @TState) -> ContractAddress;
    fn get_token(self: @TState) -> ContractAddress;
}

#[starknet::contract]
pub mod DoomMarket {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use super::{
        IDoomMarket, IErc20Dispatcher, IErc20DispatcherTrait, MarketOperation, OpenNoteDeposit,
        OUTCOME_NO, OUTCOME_VOID, OUTCOME_YES, Position, compute_commitment,
    };

    pub mod errors {
        /// Only the privacy pool may drive this contract.
        pub const CALLER_NOT_PRIVACY: felt252 = 'CALLER_NOT_PRIVACY';
        pub const NOT_RESOLVER: felt252 = 'NOT_RESOLVER';
        pub const ALREADY_RESOLVED: felt252 = 'ALREADY_RESOLVED';
        pub const NOT_RESOLVED: felt252 = 'NOT_RESOLVED';
        pub const BAD_OUTCOME: felt252 = 'BAD_OUTCOME';
        pub const ZERO_COMMITMENT: felt252 = 'ZERO_COMMITMENT';
        pub const COMMITMENT_EXISTS: felt252 = 'COMMITMENT_EXISTS';
        pub const POSITION_NOT_FOUND: felt252 = 'POSITION_NOT_FOUND';
        pub const ALREADY_CLAIMED: felt252 = 'ALREADY_CLAIMED';
        pub const NOT_A_WINNER: felt252 = 'NOT_A_WINNER';
        /// The pool sent nothing, so there is no stake to record.
        pub const NO_STAKE: felt252 = 'NO_STAKE';
        pub const AMOUNT_OVERFLOW: felt252 = 'AMOUNT_OVERFLOW';
    }

    #[storage]
    struct Storage {
        /// Pinned at construction. This contract holds funds across transactions, so the
        /// caller must be checked on every entry.
        privacy_contract: ContractAddress,
        resolver: ContractAddress,
        token: ContractAddress,
        question: ByteArray,
        pot_no: u128,
        pot_yes: u128,
        /// Token units this contract believes it holds. Used to derive each incoming
        /// stake as a delta, because `balance_of` alone includes every earlier pot.
        accounted: u128,
        resolved: bool,
        winning_outcome: u8,
        positions: Map<felt252, Position>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Staked: Staked,
        Resolved: Resolved,
        Claimed: Claimed,
    }

    /// Emitted on every buy. The hub only credits a transaction to this project if it
    /// carries an event from this contract, so every scored path must emit.
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
    pub struct Resolved {
        #[key]
        pub winning_outcome: u8,
        pub pot_no: u128,
        pub pot_yes: u128,
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
        resolver: ContractAddress,
        token: ContractAddress,
        question: ByteArray,
    ) {
        self.privacy_contract.write(privacy_contract);
        self.resolver.write(resolver);
        self.token.write(token);
        self.question.write(question);
    }

    #[abi(embed_v0)]
    pub impl DoomMarketImpl of IDoomMarket<ContractState> {
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

        fn resolve(ref self: ContractState, winning_outcome: u8) {
            assert(get_caller_address() == self.resolver.read(), errors::NOT_RESOLVER);
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
            assert(
                winning_outcome == OUTCOME_NO
                    || winning_outcome == OUTCOME_YES
                    || winning_outcome == OUTCOME_VOID,
                errors::BAD_OUTCOME,
            );

            let pot_no = self.pot_no.read();
            let pot_yes = self.pot_yes.read();

            // Resolving to a side that drew no stake would strand the whole pot, since
            // nobody could ever claim. Fall back to VOID and let everyone take their
            // own stake back.
            let effective = if winning_outcome == OUTCOME_YES && pot_yes == 0 {
                OUTCOME_VOID
            } else if winning_outcome == OUTCOME_NO && pot_no == 0 {
                OUTCOME_VOID
            } else {
                winning_outcome
            };

            self.resolved.write(true);
            self.winning_outcome.write(effective);
            self.emit(Resolved { winning_outcome: effective, pot_no, pot_yes });
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
        fn get_resolver(self: @ContractState) -> ContractAddress {
            self.resolver.read()
        }
        fn get_token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Record a stake. The pool has already sent the funds, so the amount is the
        /// balance delta against what we had accounted for. Calldata is never trusted
        /// for the amount: a caller could otherwise claim a position larger than paid.
        fn do_buy(
            ref self: ContractState, commitment: felt252, outcome: u8,
        ) -> Span<OpenNoteDeposit> {
            assert(!self.resolved.read(), errors::ALREADY_RESOLVED);
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

            // Funds stay here. Nothing for the pool to credit.
            [].span()
        }

        /// Pay a winning position into an open note.
        fn do_claim(
            ref self: ContractState, secret: felt252, note_id: felt252, pool: ContractAddress,
        ) -> Span<OpenNoteDeposit> {
            assert(self.resolved.read(), errors::NOT_RESOLVED);

            // Only the preimage matters. Any `commitment` passed in calldata is ignored.
            let commitment = compute_commitment(secret);
            let position = self.positions.read(commitment);
            assert(position.amount != 0, errors::POSITION_NOT_FOUND);
            assert(!position.claimed, errors::ALREADY_CLAIMED);

            let winner = self.winning_outcome.read();
            let payout = if winner == OUTCOME_VOID {
                // Refund: the stake, untouched.
                position.amount
            } else {
                assert(position.outcome == winner, errors::NOT_A_WINNER);
                self.parimutuel_payout(position.amount, winner)
            };

            self.positions.write(commitment, Position { claimed: true, ..position });
            self.accounted.write(self.accounted.read() - payout);

            let token = self.token.read();
            // Approve, never transfer. The pool pulls when it applies the deposit.
            IErc20Dispatcher { contract_address: token }.approve(pool, payout.into());

            self.emit(Claimed { commitment, payout });

            [OpenNoteDeposit { note_id, token, amount: payout }].span()
        }

        /// stake * total_pot / winning_pot, in u256 so the product cannot overflow.
        /// Integer division leaves dust in the contract, by design.
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

        /// What the pool just sent: current balance minus what we already accounted for.
        fn received_delta(self: @ContractState) -> u128 {
            let balance: u256 = IErc20Dispatcher { contract_address: self.token.read() }
                .balance_of(get_contract_address());
            let balance: u128 = balance.try_into().expect(errors::AMOUNT_OVERFLOW);
            balance - self.accounted.read()
        }
    }
}
