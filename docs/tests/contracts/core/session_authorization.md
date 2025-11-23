# Session Authorization Integration Tests

**Version:** 1.0
**Date:** 2025-11-23
**Requirements Coverage:** REQ-SESSION-001 to REQ-SESSION-009
**Target File:** contracts/inkblob/sources/notebook.move

---

## 1. Test Cases Overview

This module tests the SessionCap authorization system that enables frictionless multi-device operation without repeated wallet prompts.

### 1.1 Requirements Mapped

| Test Case | Requirements Covered |
|-----------|---------------------|
| TC-SA-001 | REQ-SESSION-001, REQ-SESSION-002 |
| TC-SA-002 | REQ-SESSION-003, REQ-SESSION-004 |
| TC-SA-003 | REQ-SESSION-005, REQ-SESSION-006 |
| TC-SA-004 | REQ-SESSION-007, REQ-SESSION-008 |
| TC-SA-005 | REQ-SESSION-009, Security validation |
| TC-SA-006 | Edge cases and error handling |

---

## 2. Positive Test Cases

### TC-SA-001: Create Session with Auto-Funding Success

**Objective:** Verify successful session creation with automatic hot wallet funding
**Requirements:** REQ-SESSION-002, REQ-SESSION-003

```move
#[test]
public fun test_authorize_session_and_fund_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook for session authorization
    inkblob::notebook::create_notebook(b"Test Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Setup funding coins
    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    let hot_wallet = test_utils::DEVICE_1;
    let device_fingerprint = b"device_fingerprint_12345";
    let expires_at = test_utils::FUTURE;

    // Execute: Create session with auto-funding
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        device_fingerprint,
        hot_wallet,
        expires_at,
        option::none(), // Use default SUI amount
        option::none(), // Use default WAL amount
        ctx
    );

    // Verify: SessionCap created and transferred to hot wallet
    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        hot_wallet
    );

    // Verify SessionCap fields
    assert!(session_cap.notebook_id == object::uid_to_inner(&notebook.id), E_WRONG_NOTEBOOK);
    assert!(session_cap.hot_wallet_address == hot_wallet, E_WRONG_HOT_WALLET);
    assert!(session_cap.device_fingerprint == device_fingerprint, 0);
    assert!(session_cap.expires_at == expires_at, E_INVALID_EXPIRATION);
    assert!(session_cap.auto_funded == true, 0);

    // Verify event emission
    let event = test_scenario::next_event<SessionAuthorized>(&mut scenario);
    assert!(event.notebook_id == object::uid_to_inner(&notebook.id), 0);
    assert!(event.hot_wallet_address == hot_wallet, 0);
    assert!(event.device_fingerprint == device_fingerprint, 0);
    assert!(event.owner == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(session_cap);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- SessionCap object created with correct metadata
- Hot wallet funded with default amounts (0.1 SUI, 0.5 WAL)
- SessionCap transferred to hot wallet address
- SessionAuthorized event emitted with correct data
- Auto-funding flag set to true

---

### TC-SA-002: Session Valid Authorization Success

**Objective:** Verify session authorization validation for notebook operations
**Requirements:** REQ-SESSION-006, REQ-SESSION-009

```move
#[test]
public fun test_session_valid_authorization_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and session
    inkblob::notebook::create_notebook(b"Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"device_fp",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    // Switch to hot wallet context for operations
    test_scenario::next_tx(&mut scenario, test_utils::DEVICE_1);
    let ctx_device = test_scenario::ctx(&mut scenario);

    // Execute: Create note using session authorization
    let note_id = test_utils::generate_note_id();
    let blob_id = b"test_blob_id";
    let blob_object_id = b"test_blob_object_id";
    let encrypted_title = b"test_encrypted_title";

    inkblob::notebook::update_note_with_session(
        &mut notebook,
        session_cap,
        note_id,
        blob_id,
        blob_object_id,
        encrypted_title,
        option::none(),
        ctx_device
    );

    // Verify: Note created successfully
    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);
    let note = table::borrow(&notebook.notes, note_id);
    assert!(note.encrypted_title == encrypted_title, 0);
    assert!(note.blob_id == blob_id, 0);

    // Verify NoteUpdated event
    let event = test_scenario::next_event<NoteUpdated>(&mut scenario);
    assert!(event.note_id == note_id, 0);
    assert!(event.operator == test_utils::DEVICE_1, 0);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Session authorization passes validation
- Note operations succeed using SessionCap
- Operator address correctly recorded as hot wallet
- No owner wallet signature required

---

### TC-SA-003: Session Expiration Handling Success

**Objective:** Verify session expiration prevents unauthorized access
**Requirements:** REQ-SESSION-004

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_SESSION_EXPIRED)]
public fun test_session_expiration_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook with expired session
    inkblob::notebook::create_notebook(b"Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    // Create session with past expiration time
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"device_fp",
        test_utils::DEVICE_1,
        test_utils::PAST, // Expired timestamp
        option::none(),
        option::none(),
        ctx
    );

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    // Switch to hot wallet context
    test_scenario::next_tx(&mut scenario, test_utils::DEVICE_1);
    let ctx_device = test_scenario::ctx(&mut scenario);

    // Execute: Try to use expired session
    inkblob::notebook::update_note_with_session(
        &mut notebook,
        session_cap,
        test_utils::generate_note_id(),
        b"blob_id",
        b"blob_object_id",
        b"title",
        option::none(),
        ctx_device
    );

    // Should fail with E_SESSION_EXPIRED
    test_scenario::return_shared(notebook);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Expired session rejected with E_SESSION_EXPIRED error
- No operations allowed with expired SessionCap
- Session expiration properly enforced

---

### TC-SA-004: Session Revocation Success

**Objective:** Verify session revocation functionality
**Requirements:** REQ-SESSION-007, REQ-SESSION-008

```move
#[test]
public fun test_revoke_session_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and session
    inkblob::notebook::create_notebook(b"Test Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"device_fp",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    // Execute: Revoke session as owner
    inkblob::notebook::revoke_session(
        &notebook,
        session_cap,
        ctx
    );

    // Verify: SessionRevoked event emitted
    let event = test_scenario::next_event<SessionRevoked>(&mut scenario);
    assert!(event.notebook_id == object::uid_to_inner(&notebook.id), 0);
    assert!(event.owner == test_utils::OWNER, 0);

    // Verify: SessionCap object deleted (transferred to owner)
    let _revoked_session = test_scenario::take_owned<SessionCap>(&mut scenario);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- SessionCap successfully revoked by notebook owner
- SessionRevoked event emitted with correct data
- Revoked SessionCap transferred to owner (effectively deleted from hot wallet)
- Future operations with revoked session fail

---

### TC-SA-005: Multiple Sessions per Device Success

**Objective:** Verify multiple sessions can coexist for different devices
**Requirements:** Multi-device support extension

```move
#[test]
public fun test_multiple_sessions_per_device_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Multi-Device Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    // Execute: Create sessions for multiple devices
    // Device 1 session
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"device_1_fingerprint",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    // Device 2 session
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"device_2_fingerprint",
        test_utils::DEVICE_2,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    // Verify: Both sessions exist
    let session_1 = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    let session_2 = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_2
    );

    // Verify both sessions reference same notebook
    let notebook_id = object::uid_to_inner(&notebook.id);
    assert!(session_1.notebook_id == notebook_id, 0);
    assert!(session_2.notebook_id == notebook_id, 0);

    // Verify different device fingerprints
    assert!(session_1.device_fingerprint == b"device_1_fingerprint", 0);
    assert!(session_2.device_fingerprint == b"device_2_fingerprint", 0);

    // Verify two SessionAuthorized events
    let event_1 = test_scenario::next_event<SessionAuthorized>(&mut scenario);
    let event_2 = test_scenario::next_event<SessionAuthorized>(&mut scenario);
    assert!(event_1.hot_wallet_address == test_utils::DEVICE_1, 0);
    assert!(event_2.hot_wallet_address == test_utils::DEVICE_2, 0);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(session_1);
    test_scenario::return_owned(session_2);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Multiple devices can have active sessions simultaneously
- Each session maintains unique device fingerprint
- All sessions reference same notebook
- Events emitted for each session creation

---

## 3. Negative Test Cases

### TC-SA-006: Unauthorized Session Creation Failure

**Objective:** Verify only notebook owner can create sessions
**Requirements:** REQ-SESSION-002, implicit access control

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_NOT_OWNER)]
public fun test_unauthorized_session_creation_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Owner creates notebook
    inkblob::notebook::create_notebook(b"Owner Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Attacker setup
    test_scenario::next_tx(&mut scenario, test_utils::ATTACKER);
    let ctx_attacker = test_scenario::ctx(&mut scenario);

    let mut attacker_sui = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut attacker_wal = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    // Execute: Attacker tries to create session for owner's notebook
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut attacker_sui,
        &mut attacker_wal,
        b"attacker_device",
        test_utils::ATTACKER,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx_attacker
    );

    // Should fail with E_NOT_OWNER
    test_scenario::return_shared(notebook);
    test_scenario::return_owned(attacker_sui);
    test_scenario::return_owned(attacker_wal);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Non-owner cannot create sessions for notebook
- Transaction aborts with E_NOT_OWNER error
- Notebook access control properly enforced

---

### TC-SA-007: Wrong Hot Wallet Address Failure

**Objective:** Verify session must be used by designated hot wallet
**Requirements:** REQ-SESSION-006

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_WRONG_HOT_WALLET)]
public fun test_wrong_hot_wallet_usage_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create session for DEVICE_1
    inkblob::notebook::create_notebook(b"Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"device_1_fp",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    // Transfer session to DEVICE_2 (simulating theft/side-channel)
    test_scenario::transfer_to_address(session_cap, test_utils::DEVICE_2);
    test_scenario::next_tx(&mut scenario, test_utils::DEVICE_2);
    let ctx_device2 = test_scenario::ctx(&mut scenario);

    let stolen_session = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_2
    );

    // Execute: Try to use stolen session from wrong wallet
    inkblob::notebook::update_note_with_session(
        &mut notebook,
        stolen_session,
        test_utils::generate_note_id(),
        b"blob_id",
        b"blob_object_id",
        b"title",
        option::none(),
        ctx_device2
    );

    // Should fail with E_WRONG_HOT_WALLET
    test_scenario::return_shared(notebook);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Session can only be used by designated hot wallet address
- Transfer of SessionCap to other addresses doesn't enable access
- Transaction aborts with E_WRONG_HOT_WALLET error

---

### TC-SA-008: Wrong Notebook Reference Failure

**Objective:** Verify session only works for designated notebook
**Requirements:** REQ-SESSION-003

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_WRONG_NOTEBOOK)]
public fun test_wrong_notebook_reference_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create two notebooks
    inkblob::notebook::create_notebook(b"Notebook 1", ctx);
    let notebook1 = test_scenario::take_shared<Notebook>(&mut scenario);

    inkblob::notebook::create_notebook(b"Notebook 2", ctx);
    let mut notebook2 = test_scenario::take_shared<Notebook>(&mut scenario);

    // Create session for notebook 1
    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    inkblob::notebook::authorize_session_and_fund(
        &notebook1,
        &mut sui_coin,
        &mut wal_coin,
        b"device_fp",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    // Switch to hot wallet context
    test_scenario::next_tx(&mut scenario, test_utils::DEVICE_1);
    let ctx_device = test_scenario::ctx(&mut scenario);

    // Execute: Try to use notebook 1 session on notebook 2
    inkblob::notebook::update_note_with_session(
        &mut notebook2,  // Wrong notebook!
        session_cap,
        test_utils::generate_note_id(),
        b"blob_id",
        b"blob_object_id",
        b"title",
        option::none(),
        ctx_device
    );

    // Should fail with E_WRONG_NOTEBOOK
    test_scenario::return_shared(notebook1);
    test_scenario::return_shared(notebook2);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- SessionCap only works for designated notebook
- Cross-notebook session usage blocked
- Transaction aborts with E_WRONG_NOTEBOOK error

---

### TC-SA-009: Insufficient Balance for Auto-Funding Failure

**Objective:** Verify balance checks before session funding
**Requirements:** Security requirement from design review

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_INSUFFICIENT_BALANCE)]
public fun test_insufficient_balance_for_funding_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Test Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Setup coins with insufficient balance
    let mut small_sui_coin = coin::zero<SUI>(ctx);
    let mut small_wal_coin = coin::zero<WAL>(ctx);

    // Execute: Try to create session with insufficient funds
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut small_sui_coin,  // Zero balance
        &mut small_wal_coin,  // Zero balance
        b"device_fp",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::some(1000000000), // Request 1 SUI (more than available)
        option::some(1000000000), // Request 1 WAL (more than available)
        ctx
    );

    // Should fail with E_INSUFFICIENT_BALANCE or E_INSUFFICIENT_WAL_BALANCE
    test_scenario::return_shared(notebook);
    test_scenario::return_owned(small_sui_coin);
    test_scenario::return_owned(small_wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Balance verification occurs before transfer attempts
- Insufficient balance rejection with appropriate error code
- No partial transfers or state corruption

---

## 4. Edge Cases and Boundary Tests

### TC-SA-010: Session Creation with Custom Amounts Success

**Objective:** Verify custom funding amounts work correctly
**Requirements:** REQ-SESSION-002 (funding flexibility)

```move
#[test]
public fun test_session_custom_funding_amounts_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Custom Funding Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Setup coins with exact amounts
    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    let custom_sui_amount = 500000000; // 0.5 SUI
    let custom_wal_amount = 1000000000; // 1.0 WAL

    // Execute: Create session with custom funding amounts
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"custom_device_fp",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::some(custom_sui_amount),
        option::some(custom_wal_amount),
        ctx
    );

    // Verify: SessionCreated event with custom amounts
    let event = test_scenario::next_event<SessionAuthorized>(&mut scenario);
    assert!(event.sui_funded == custom_sui_amount, 0);
    assert!(event.wal_funded == custom_wal_amount, 0);

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(session_cap);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Custom funding amounts properly applied
- Event emission reflects actual amounts transferred
- Hot wallet receives exact specified amounts

---

### TC-SA-011: Session Zero Expiration Time Failure

**Objective:** Verify sessions cannot have zero expiration time
**Requirements:** REQ-SESSION-003 (valid expiration)

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_INVALID_EXPIRATION)]
public fun test_session_zero_expiration_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Test Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    // Execute: Try to create session with zero expiration
    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"device_fp",
        test_utils::DEVICE_1,
        0, // Zero expiration time
        option::none(),
        option::none(),
        ctx
    );

    // Should fail with E_INVALID_EXPIRATION
    test_scenario::return_shared(notebook);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Zero expiration time rejected
- Transaction aborts with E_INVALID_EXPIRATION
- No session created with invalid timestamp

---

## 5. Performance and Gas Tests

### TC-SA-012: Session Authorization Gas Measurement

**Objective:** Measure gas usage for session operations
**Requirements:** REQ-PERF-006, REQ-PERF-007

```move
#[test]
public fun test_session_operations_gas_usage() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Gas Test Notebook", ctx);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    // Measure gas for session creation
    let start_gas = tx_context::gas_used(ctx);

    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"gas_test_device",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    let creation_gas = tx_context::gas_used(ctx) - start_gas;

    // Verify reasonable gas usage (adjust thresholds based on measurements)
    let max_creation_gas = 8000000; // 8M gas units
    assert!(creation_gas <= max_creation_gas, 0);

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    // Measure gas for session-based operation
    test_scenario::next_tx(&mut scenario, test_utils::DEVICE_1);
    let ctx_device = test_scenario::ctx(&mut scenario);
    let mut notebook_mut = notebook;

    let start_operation_gas = tx_context::gas_used(ctx_device);

    inkblob::notebook::update_note_with_session(
        &mut notebook_mut,
        session_cap,
        test_utils::generate_note_id(),
        b"blob_id",
        b"blob_object_id",
        b"title",
        option::none(),
        ctx_device
    );

    let operation_gas = tx_context::gas_used(ctx_device) - start_operation_gas;

    // Verify operation gas is reasonable
    let max_operation_gas = 3000000; // 3M gas units
    assert!(operation_gas <= max_operation_gas, 0);

    test_scenario::return_shared(notebook_mut);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Session creation gas usage within acceptable bounds
- Session-based operations more efficient than owner operations
- No unexpected gas consumption spikes

---

## 6. Test Execution Checklist

### Pre-Test Setup
- [ ] Test environment with WAL token support
- [ ] Multi-address test setup (owner, devices, attacker)
- [ ] Sufficient token balances for funding tests
- [ ] Mock device fingerprints generated

### Test Execution
- [ ] All positive session creation tests pass
- [ ] Authorization validation enforced correctly
- [ ] Expiration handling works as expected
- [ ] Revocation functionality verified
- [ ] All negative tests fail with correct error codes

### Post-Test Verification
- [ ] SessionCap objects properly isolated by hot wallet
- [ ] Multi-device scenarios work correctly
- [ ] Gas usage measurements collected
- [ ] Security edge cases covered

### Requirements Traceability
- [ ] REQ-SESSION-001: ✅ SessionCap supports ephemeral keys
- [ ] REQ-SESSION-002: ✅ Session creation with wallet signature
- [ ] REQ-SESSION-003: ✅ SessionCap fields correctly populated
- [ ] REQ-SESSION-004: ✅ Session expiration enforced
- [ ] REQ-SESSION-005: ✅ Ephemeral key storage (conceptual)
- [ ] REQ-SESSION-006: ✅ Operations signed by ephemeral key
- [ ] REQ-SESSION-007: ✅ Owner can revoke sessions
- [ ] REQ-SESSION-008: ✅ Revocation clears access
- [ ] REQ-SESSION-009: ✅ Session validity verified before operations

---

**Test Status:** Ready for Implementation
**Implementation Priority:** High (Core authentication)
**Dependencies:** Notebook lifecycle tests complete