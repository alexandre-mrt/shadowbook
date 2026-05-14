module shadowbook::seal_policy;

use sui::{bcs::{Self, BCS}, clock::Clock};

// Error: caller does not have access yet (time-lock not expired)
const ENoAccess: u64 = 77;

/// SEAL time-lock policy — allow decryption only after the deadline encoded in `id`.
///
/// Key ID format: first 8 bytes = commit_deadline_ms (u64, little-endian BCS encoding).
/// This matches the MystenLabs/seal TLE (Time-Lock Encryption) pattern.
entry fun seal_approve(id: vector<u8>, c: &Clock) {
    let mut prepared: BCS = bcs::new(id);
    let t = prepared.peel_u64();
    let leftovers = prepared.into_remainder_bytes();
    assert!(leftovers.length() == 0 && c.timestamp_ms() >= t, ENoAccess);
}

#[test_only]
use sui::clock;

#[test]
fun test_seal_approve_after_deadline() {
    let ctx = &mut sui::tx_context::dummy();
    // Create a clock at 2000 ms
    let mut c = clock::create_for_testing(ctx);
    clock::set_for_testing(&mut c, 2000);

    // Encode deadline = 1000 ms (already past)
    let deadline: u64 = 1000;
    let id = bcs::to_bytes(&deadline);

    // Should not abort: current time (2000) >= deadline (1000)
    seal_approve(id, &c);

    clock::destroy_for_testing(c);
}

#[test]
#[expected_failure(abort_code = ENoAccess)]
fun test_seal_approve_before_deadline() {
    let ctx = &mut sui::tx_context::dummy();
    // Create a clock at 500 ms
    let mut c = clock::create_for_testing(ctx);
    clock::set_for_testing(&mut c, 500);

    // Encode deadline = 1000 ms (not yet reached)
    let deadline: u64 = 1000;
    let id = bcs::to_bytes(&deadline);

    // Should abort: current time (500) < deadline (1000)
    seal_approve(id, &c);

    clock::destroy_for_testing(c);
}

#[test]
#[expected_failure(abort_code = ENoAccess)]
fun test_seal_approve_extra_bytes_rejected() {
    let ctx = &mut sui::tx_context::dummy();
    let mut c = clock::create_for_testing(ctx);
    clock::set_for_testing(&mut c, 9999);

    // Valid deadline bytes + one extra byte — leftovers.length() != 0
    let deadline: u64 = 1000;
    let mut id = bcs::to_bytes(&deadline);
    vector::push_back(&mut id, 0xAB);

    // Should abort: leftovers not empty
    seal_approve(id, &c);

    clock::destroy_for_testing(c);
}
