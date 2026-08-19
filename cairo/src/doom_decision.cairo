// DoomDecision — private futarchy. The market IS the vote.
//
// DoomMarketV2 answers "will X happen?". This contract answers "should we do X?",
// which is what futarchy actually is (Hanson): two conditional markets —
//
//   ADOPT  branch: "conditional on adopting, will the metric be met?"
//   REJECT branch: "conditional on rejecting, will the metric be met?"
//
// People stake shielded STRK in either branch. At close, the branch whose YES-share
// prices higher becomes the DECISION. The losing branch never happened, so it voids
// and every stake in it is refunded — the standard conditional-market rule. The
// winning branch stays live and settles later on whether the metric was actually met.
//
// Why privacy is load-bearing here and not decoration: every live futarchy
// (MetaDAO on Solana, Optimism's OP experiment) is fully transparent, and the
// documented failure mode is exactly that — whales get watched and copied, insiders
// get pressured, positions become politics. Doom's branches inherit STRK20 privacy:
// public prices, invisible participants. The decision gets made by information,
// not by watching who is betting.
//
// Composition, not reimplementation: the two branches are ordinary DoomMarketV2
// instances. This contract only reads their pots and pronounces the decision. It
// holds no funds and has no privileged role — anyone may call decide() after close.
//
// DRAFT — not audited.

use starknet::ContractAddress;

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum Decision {
    Pending,
    Adopt,
    Reject,
    /// Neither branch drew a single stake, so the market said nothing.
    Inconclusive,
}

#[starknet::interface]
pub trait IDoomMarketReader<TState> {
    fn get_pots(self: @TState) -> (u128, u128);
    fn get_closes_at(self: @TState) -> u64;
}

#[starknet::interface]
pub trait IDoomDecision<TState> {
    /// Callable by anyone once both branches are closed. Compares YES-shares and
    /// records the decision, permanently.
    fn decide(ref self: TState);

    fn get_decision(self: @TState) -> Decision;
    fn get_branches(self: @TState) -> (ContractAddress, ContractAddress);
    fn get_proposal(self: @TState) -> ByteArray;
    /// (adopt_yes_share_bps, reject_yes_share_bps) at decision time; (0,0) before.
    fn get_final_shares(self: @TState) -> (u128, u128);
}

#[starknet::contract]
pub mod DoomDecision {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_block_timestamp};
    use super::{
        Decision, IDoomDecision, IDoomMarketReaderDispatcher, IDoomMarketReaderDispatcherTrait,
    };

    pub mod errors {
        pub const ALREADY_DECIDED: felt252 = 'ALREADY_DECIDED';
        pub const BRANCHES_STILL_OPEN: felt252 = 'BRANCHES_STILL_OPEN';
    }

    #[storage]
    struct Storage {
        proposal: ByteArray,
        adopt_branch: ContractAddress,
        reject_branch: ContractAddress,
        decided: bool,
        decision: u8, // 0 pending, 1 adopt, 2 reject, 3 inconclusive
        adopt_share_bps: u128,
        reject_share_bps: u128,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Decided: Decided,
    }

    /// The governance act itself, on chain. No signer with authority appears
    /// anywhere in it: the decision is a pure function of two market prices.
    #[derive(Drop, starknet::Event)]
    pub struct Decided {
        #[key]
        pub decision: u8,
        pub adopt_share_bps: u128,
        pub reject_share_bps: u128,
        pub adopt_total: u128,
        pub reject_total: u128,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        adopt_branch: ContractAddress,
        reject_branch: ContractAddress,
        proposal: ByteArray,
    ) {
        self.adopt_branch.write(adopt_branch);
        self.reject_branch.write(reject_branch);
        self.proposal.write(proposal);
    }

    #[abi(embed_v0)]
    pub impl DoomDecisionImpl of IDoomDecision<ContractState> {
        fn decide(ref self: ContractState) {
            assert(!self.decided.read(), errors::ALREADY_DECIDED);

            let adopt = IDoomMarketReaderDispatcher {
                contract_address: self.adopt_branch.read(),
            };
            let reject = IDoomMarketReaderDispatcher {
                contract_address: self.reject_branch.read(),
            };

            // Prices can move until the last second, so the decision only exists
            // after both books are closed.
            let now = get_block_timestamp();
            assert(
                now >= adopt.get_closes_at() && now >= reject.get_closes_at(),
                errors::BRANCHES_STILL_OPEN,
            );

            let (a_no, a_yes) = adopt.get_pots();
            let (r_no, r_yes) = reject.get_pots();
            let a_total: u256 = a_no.into() + a_yes.into();
            let r_total: u256 = r_no.into() + r_yes.into();

            // YES-share in basis points. An empty branch prices at zero rather than
            // an even 50%: silence is not a forecast.
            let a_bps: u128 = if a_total == 0 {
                0
            } else {
                (a_yes.into() * 10000_u256 / a_total).try_into().unwrap()
            };
            let r_bps: u128 = if r_total == 0 {
                0
            } else {
                (r_yes.into() * 10000_u256 / r_total).try_into().unwrap()
            };

            let decision: u8 = if a_total == 0 && r_total == 0 {
                3 // inconclusive: the market said nothing
            } else if a_bps > r_bps {
                1 // adopt
            } else {
                2 // reject wins ties: the status quo needs no majority
            };

            self.decided.write(true);
            self.decision.write(decision);
            self.adopt_share_bps.write(a_bps);
            self.reject_share_bps.write(r_bps);

            self
                .emit(
                    Decided {
                        decision,
                        adopt_share_bps: a_bps,
                        reject_share_bps: r_bps,
                        adopt_total: a_total.try_into().unwrap(),
                        reject_total: r_total.try_into().unwrap(),
                    },
                );
        }

        fn get_decision(self: @ContractState) -> Decision {
            if !self.decided.read() {
                return Decision::Pending;
            }
            match self.decision.read() {
                0 => Decision::Pending,
                1 => Decision::Adopt,
                2 => Decision::Reject,
                _ => Decision::Inconclusive,
            }
        }

        fn get_branches(self: @ContractState) -> (ContractAddress, ContractAddress) {
            (self.adopt_branch.read(), self.reject_branch.read())
        }

        fn get_proposal(self: @ContractState) -> ByteArray {
            self.proposal.read()
        }

        fn get_final_shares(self: @ContractState) -> (u128, u128) {
            (self.adopt_share_bps.read(), self.reject_share_bps.read())
        }
    }
}
