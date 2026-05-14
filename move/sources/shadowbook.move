#[allow(lint(self_transfer))]
module shadowbook::shadowbook;

use sui::{
    balance::{Self, Balance},
    clock::Clock,
    coin::{Self, Coin},
    event,
    hash::keccak256,
    object::ID,
    sui::SUI,
    table::{Self, Table},
    transfer,
    tx_context::TxContext,
};

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------
const ERoundNotOpen: u64 = 1;
const ERoundNotReveal: u64 = 2;
const ERoundNotExecute: u64 = 3;
const EAlreadyCommitted: u64 = 4;
const ENotCommitted: u64 = 5;
const ECommitDeadlineNotPassed: u64 = 6;
const EInvalidHash: u64 = 7;
const EZeroAmount: u64 = 8;
const EInvalidDuration: u64 = 9;
const ERoundNotSettleable: u64 = 10;
const ERoundAlreadySettled: u64 = 11;
const ERevealDeadlineNotPassed: u64 = 12;

// ---------------------------------------------------------------------------
// Round status constants
// ---------------------------------------------------------------------------
const STATUS_OPEN: u8 = 0;
const STATUS_REVEAL: u8 = 1;
const STATUS_EXECUTE: u8 = 2;
const STATUS_SETTLED: u8 = 3;
const STATUS_CANCELLED: u8 = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Admin capability — required for privileged operations.
public struct AdminCap has key {
    id: UID,
}

/// A single committed order (stored in the Round's Table, keyed by trader address).
public struct Commitment has store {
    order_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    timestamp_ms: u64,
    amount: u64,
}

/// A revealed order (stored in the Round after successful reveal).
public struct RevealedOrder has store, copy, drop {
    trader: address,
    is_up: bool,
    amount: u64,
}

/// The main shared object representing a prediction round.
public struct Round has key, store {
    id: UID,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    commit_deadline_ms: u64,
    reveal_deadline_ms: u64,
    commitments: Table<address, Commitment>,
    revealed_orders: vector<RevealedOrder>,
    escrow: Balance<SUI>,
    total_escrowed: u64,
    actual_outcome: Option<bool>,
    status: u8,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

public struct RoundCreated has copy, drop {
    round_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    commit_deadline_ms: u64,
    reveal_deadline_ms: u64,
}

public struct OrderCommitted has copy, drop {
    round_id: ID,
    trader: address,
    amount: u64,
    timestamp_ms: u64,
}

public struct OrderRevealed has copy, drop {
    round_id: ID,
    trader: address,
    is_up: bool,
    amount: u64,
}

public struct RoundResolved has copy, drop {
    round_id: ID,
    actual_outcome: bool,
}

public struct PayoutClaimed has copy, drop {
    round_id: ID,
    trader: address,
    amount: u64,
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

fun init(ctx: &mut TxContext) {
    let cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(cap, ctx.sender());
}

// ---------------------------------------------------------------------------
// Admin: create_round
// ---------------------------------------------------------------------------

public fun create_round(
    _cap: &AdminCap,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    commit_duration_ms: u64,
    reveal_duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(commit_duration_ms > 0, EInvalidDuration);
    assert!(reveal_duration_ms > 0, EInvalidDuration);

    let now = clock.timestamp_ms();
    let commit_deadline_ms = now + commit_duration_ms;
    let reveal_deadline_ms = commit_deadline_ms + reveal_duration_ms;

    let round_uid = object::new(ctx);
    let round_id = object::uid_to_inner(&round_uid);

    let round = Round {
        id: round_uid,
        oracle_id,
        expiry_ms,
        strike,
        commit_deadline_ms,
        reveal_deadline_ms,
        commitments: table::new(ctx),
        revealed_orders: vector[],
        escrow: balance::zero(),
        total_escrowed: 0,
        actual_outcome: option::none(),
        status: STATUS_OPEN,
    };

    event::emit(RoundCreated {
        round_id,
        oracle_id,
        expiry_ms,
        strike,
        commit_deadline_ms,
        reveal_deadline_ms,
    });

    transfer::share_object(round);
}

// ---------------------------------------------------------------------------
// Trader: commit_order
// ---------------------------------------------------------------------------

public fun commit_order(
    round: &mut Round,
    order_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let now = clock.timestamp_ms();
    // Auto-advance status if commit deadline passed
    maybe_advance_to_reveal(round, now);

    assert!(round.status == STATUS_OPEN, ERoundNotOpen);
    assert!(now < round.commit_deadline_ms, ECommitDeadlineNotPassed);

    let sender = ctx.sender();
    assert!(!round.commitments.contains(sender), EAlreadyCommitted);

    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroAmount);

    // Escrow the payment
    let paid_balance = coin::into_balance(payment);
    balance::join(&mut round.escrow, paid_balance);
    round.total_escrowed = round.total_escrowed + amount;

    let commitment = Commitment {
        order_hash,
        walrus_blob_id,
        timestamp_ms: now,
        amount,
    };
    round.commitments.add(sender, commitment);

    let round_id = object::uid_to_inner(&round.id);
    event::emit(OrderCommitted {
        round_id,
        trader: sender,
        amount,
        timestamp_ms: now,
    });
}

// ---------------------------------------------------------------------------
// Trader: reveal_order
// ---------------------------------------------------------------------------

public fun reveal_order(
    round: &mut Round,
    is_up: bool,
    amount: u64,
    salt: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let now = clock.timestamp_ms();
    // Auto-advance: Open → Reveal if commit deadline passed
    maybe_advance_to_reveal(round, now);

    assert!(round.status == STATUS_REVEAL, ERoundNotReveal);
    assert!(now < round.reveal_deadline_ms, ERevealDeadlineNotPassed);

    let sender = ctx.sender();
    assert!(round.commitments.contains(sender), ENotCommitted);

    // Build hash: [is_up as u8] ++ [amount as 8 bytes LE] ++ salt ++ address_bytes
    let mut data: vector<u8> = vector[];
    vector::push_back(&mut data, if (is_up) { 1u8 } else { 0u8 });

    // amount as 8 bytes little-endian
    let mut amt = amount;
    let mut i = 0u8;
    while (i < 8) {
        vector::push_back(&mut data, (amt & 0xFF) as u8);
        amt = amt >> 8;
        i = i + 1;
    };

    vector::append(&mut data, salt);

    // Use sui::address::to_bytes(sender) — NOT bcs::to_bytes(&sender)
    let addr_bytes = sui::address::to_bytes(sender);
    vector::append(&mut data, addr_bytes);

    let computed_hash = keccak256(&data);

    // Retrieve and verify commitment
    let commitment = round.commitments.borrow(sender);
    assert!(computed_hash == commitment.order_hash, EInvalidHash);

    // Remove commitment (prevent double-reveal)
    let Commitment { order_hash: _, walrus_blob_id: _, timestamp_ms: _, amount: _ } =
        round.commitments.remove(sender);

    // Record revealed order
    vector::push_back(&mut round.revealed_orders, RevealedOrder {
        trader: sender,
        is_up,
        amount,
    });

    let round_id = object::uid_to_inner(&round.id);
    event::emit(OrderRevealed {
        round_id,
        trader: sender,
        is_up,
        amount,
    });
}

// ---------------------------------------------------------------------------
// Admin: resolve_round
// ---------------------------------------------------------------------------

public fun resolve_round(
    round: &mut Round,
    _cap: &AdminCap,
    actual_outcome: bool,
    clock: &Clock,
) {
    let now = clock.timestamp_ms();
    // Auto-advance: Reveal → Execute if reveal deadline passed
    maybe_advance_to_execute(round, now);

    assert!(round.status == STATUS_EXECUTE, ERoundNotExecute);

    round.actual_outcome = option::some(actual_outcome);
    round.status = STATUS_SETTLED;

    let round_id = object::uid_to_inner(&round.id);
    event::emit(RoundResolved {
        round_id,
        actual_outcome,
    });
}

// ---------------------------------------------------------------------------
// Trader: claim_payout
// ---------------------------------------------------------------------------

public fun claim_payout(
    round: &mut Round,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms();
    // Allow auto-advance chains for edge cases
    maybe_advance_to_reveal(round, now);
    maybe_advance_to_execute(round, now);

    assert!(round.status == STATUS_SETTLED, ERoundNotSettleable);

    let sender = ctx.sender();

    // Find the caller's revealed order
    let n = vector::length(&round.revealed_orders);
    let mut caller_order_opt: Option<RevealedOrder> = option::none();
    let mut i = 0;
    while (i < n) {
        let order = vector::borrow(&round.revealed_orders, i);
        if (order.trader == sender) {
            caller_order_opt = option::some(*order);
            break
        };
        i = i + 1;
    };

    assert!(option::is_some(&caller_order_opt), ENotCommitted);
    let caller_order = option::destroy_some(caller_order_opt);

    // Remove the caller's revealed order to prevent double-claim
    let mut j = 0;
    while (j < vector::length(&round.revealed_orders)) {
        let order = vector::borrow(&round.revealed_orders, j);
        if (order.trader == sender) {
            vector::remove(&mut round.revealed_orders, j);
            break
        };
        j = j + 1;
    };

    let outcome = *option::borrow(&round.actual_outcome);
    let caller_is_winner = caller_order.is_up == outcome;

    // Compute totals across remaining revealed orders + caller
    let mut total_winners: u64 = 0;
    let mut total_losers: u64 = 0;
    let all_orders = &round.revealed_orders;
    let m = vector::length(all_orders);
    let mut k = 0;
    while (k < m) {
        let order = vector::borrow(all_orders, k);
        if (order.is_up == outcome) {
            total_winners = total_winners + order.amount;
        } else {
            total_losers = total_losers + order.amount;
        };
        k = k + 1;
    };

    // Add caller's contribution back into totals
    if (caller_is_winner) {
        total_winners = total_winners + caller_order.amount;
    } else {
        total_losers = total_losers + caller_order.amount;
    };

    // Parimutuel settlement
    let payout = if (total_winners == 0 || total_losers == 0) {
        // No winners or no losers → refund caller's stake
        caller_order.amount
    } else if (caller_is_winner) {
        // Winner: stake + proportional share of losers' pool
        // payout = amount + (amount * total_losers / total_winners)
        let winnings = (caller_order.amount as u128) * (total_losers as u128) / (total_winners as u128);
        caller_order.amount + (winnings as u64)
    } else {
        // Loser: no payout
        0
    };

    if (payout > 0) {
        let payout_coin = coin::from_balance(
            balance::split(&mut round.escrow, payout),
            ctx,
        );
        let round_id = object::uid_to_inner(&round.id);
        event::emit(PayoutClaimed {
            round_id,
            trader: sender,
            amount: payout,
        });
        transfer::public_transfer(payout_coin, sender);
    };
}

// ---------------------------------------------------------------------------
// Admin: cancel_round
// ---------------------------------------------------------------------------

public fun cancel_round(
    round: &mut Round,
    _cap: &AdminCap,
    ctx: &mut TxContext,
) {
    assert!(round.status != STATUS_SETTLED, ERoundAlreadySettled);
    assert!(round.status != STATUS_CANCELLED, ERoundAlreadySettled);

    round.status = STATUS_CANCELLED;

    // Refund all revealed orders from escrow.
    // NIGHT-SHIFT-REVIEW: traders who committed but never revealed cannot be
    // iterated (Table has no key iteration). They need a separate
    // `refund_commitment(round, ctx)` function — add in next iteration.
    let n = vector::length(&round.revealed_orders);
    let mut i = 0;
    while (i < n) {
        let order = *vector::borrow(&round.revealed_orders, i);
        if (balance::value(&round.escrow) >= order.amount) {
            let refund = coin::from_balance(
                balance::split(&mut round.escrow, order.amount),
                ctx,
            );
            transfer::public_transfer(refund, order.trader);
        };
        i = i + 1;
    };

    round.revealed_orders = vector[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fun maybe_advance_to_reveal(round: &mut Round, now: u64) {
    if (round.status == STATUS_OPEN && now >= round.commit_deadline_ms) {
        round.status = STATUS_REVEAL;
    };
}

fun maybe_advance_to_execute(round: &mut Round, now: u64) {
    if (round.status == STATUS_REVEAL && now >= round.reveal_deadline_ms) {
        round.status = STATUS_EXECUTE;
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test_only]
use sui::{
    clock,
    test_scenario::{Self as ts, Scenario},
};

#[test_only]
const ADMIN: address = @0xAD;
#[test_only]
const ALICE: address = @0xA1;
#[test_only]
const BOB: address = @0xB0;

/// Helper: initialize module and create a fresh round, returns the test scenario positioned at ADMIN.
#[test_only]
fun setup_round(commit_dur: u64, reveal_dur: u64): Scenario {
    let mut scenario = ts::begin(ADMIN);
    {
        let ctx = ts::ctx(&mut scenario);
        init(ctx);
    };
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 1000);

        create_round(
            &cap,
            object::id_from_address(@0xDA),
            9_999_000,
            100,
            commit_dur,
            reveal_dur,
            &c,
            ts::ctx(&mut scenario),
        );

        clock::destroy_for_testing(c);
        ts::return_to_sender(&scenario, cap);
    };
    scenario
}

/// Build the keccak256 commitment hash for a given order (mirrors on-chain logic).
#[test_only]
fun make_hash(is_up: bool, amount: u64, salt: vector<u8>, trader: address): vector<u8> {
    let mut data: vector<u8> = vector[];
    vector::push_back(&mut data, if (is_up) { 1u8 } else { 0u8 });
    let mut amt = amount;
    let mut i = 0u8;
    while (i < 8) {
        vector::push_back(&mut data, (amt & 0xFF) as u8);
        amt = amt >> 8;
        i = i + 1;
    };
    vector::append(&mut data, salt);
    vector::append(&mut data, sui::address::to_bytes(trader));
    keccak256(&data)
}

#[test]
fun test_create_round() {
    let mut scenario = setup_round(5000, 5000);
    ts::next_tx(&mut scenario, ADMIN);
    {
        let round = ts::take_shared<Round>(&scenario);
        assert!(round.status == STATUS_OPEN, 0);
        assert!(round.commit_deadline_ms == 6000, 1); // 1000 + 5000
        assert!(round.reveal_deadline_ms == 11000, 2); // 6000 + 5000
        ts::return_shared(round);
    };
    ts::end(scenario);
}

#[test]
fun test_commit_and_reveal() {
    let mut scenario = setup_round(5000, 5000);

    // ALICE commits within the commit window
    ts::next_tx(&mut scenario, ALICE);
    {
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 2000);

        let amount: u64 = 500;
        let order_hash = make_hash(true, amount, vector[], ALICE);
        let payment = coin::mint_for_testing<SUI>(amount, ts::ctx(&mut scenario));

        commit_order(&mut round, order_hash, vector[], payment, &c, ts::ctx(&mut scenario));

        assert!(round.commitments.contains(ALICE), 0);
        assert!(round.total_escrowed == 500, 1);

        clock::destroy_for_testing(c);
        ts::return_shared(round);
    };

    // ALICE reveals after the commit deadline has passed
    ts::next_tx(&mut scenario, ALICE);
    {
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 7000); // past commit_deadline (6000)

        reveal_order(&mut round, true, 500, vector[], &c, ts::ctx(&mut scenario));

        // Commitment must be removed after reveal (prevent double-reveal)
        assert!(!round.commitments.contains(ALICE), 0);
        assert!(vector::length(&round.revealed_orders) == 1, 1);
        let revealed = vector::borrow(&round.revealed_orders, 0);
        assert!(revealed.trader == ALICE, 2);
        assert!(revealed.is_up == true, 3);

        clock::destroy_for_testing(c);
        ts::return_shared(round);
    };

    ts::end(scenario);
}

#[test]
fun test_settlement_winner_takes_loser_pool() {
    let mut scenario = setup_round(3000, 3000);

    // ALICE commits: is_up = true, amount = 300 (clock = 1000, deadline = 4000)
    ts::next_tx(&mut scenario, ALICE);
    {
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 1500);

        let amount: u64 = 300;
        let order_hash = make_hash(true, amount, b"salt_alice", ALICE);
        let payment = coin::mint_for_testing<SUI>(amount, ts::ctx(&mut scenario));
        commit_order(&mut round, order_hash, vector[], payment, &c, ts::ctx(&mut scenario));

        clock::destroy_for_testing(c);
        ts::return_shared(round);
    };

    // BOB commits: is_up = false, amount = 200
    ts::next_tx(&mut scenario, BOB);
    {
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 1600);

        let amount: u64 = 200;
        let order_hash = make_hash(false, amount, b"salt_bob", BOB);
        let payment = coin::mint_for_testing<SUI>(amount, ts::ctx(&mut scenario));
        commit_order(&mut round, order_hash, vector[], payment, &c, ts::ctx(&mut scenario));

        clock::destroy_for_testing(c);
        ts::return_shared(round);
    };

    // Both reveal after commit deadline (clock = 5000, deadline = 4000)
    ts::next_tx(&mut scenario, ALICE);
    {
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 5000);
        reveal_order(&mut round, true, 300, b"salt_alice", &c, ts::ctx(&mut scenario));
        clock::destroy_for_testing(c);
        ts::return_shared(round);
    };

    ts::next_tx(&mut scenario, BOB);
    {
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 5000);
        reveal_order(&mut round, false, 200, b"salt_bob", &c, ts::ctx(&mut scenario));
        clock::destroy_for_testing(c);
        ts::return_shared(round);
    };

    // Admin resolves: outcome = true (UP wins), clock = 8000 > reveal_deadline = 7000
    ts::next_tx(&mut scenario, ADMIN);
    {
        let cap = ts::take_from_sender<AdminCap>(&scenario);
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 8000);

        resolve_round(&mut round, &cap, true, &c);

        assert!(round.status == STATUS_SETTLED, 0);
        assert!(*option::borrow(&round.actual_outcome) == true, 1);

        clock::destroy_for_testing(c);
        ts::return_to_sender(&scenario, cap);
        ts::return_shared(round);
    };

    // ALICE claims payout: 300 stake + 200 loser pool = 500
    ts::next_tx(&mut scenario, ALICE);
    {
        let mut round = ts::take_shared<Round>(&scenario);
        let mut c = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut c, 8000);
        claim_payout(&mut round, &c, ts::ctx(&mut scenario));
        clock::destroy_for_testing(c);
        ts::return_shared(round);
    };

    ts::next_tx(&mut scenario, ALICE);
    {
        let payout = ts::take_from_sender<Coin<SUI>>(&scenario);
        assert!(coin::value(&payout) == 500, 0);
        ts::return_to_sender(&scenario, payout);
    };

    ts::end(scenario);
}
