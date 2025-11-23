#[test_only]
module inkblob::session_authorization_tests {
    use std::string;
    use std::option;
    use sui::test_scenario::{Self, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::object;
    use sui::transfer;
    use wal::wal::WAL;
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Notebook,
        NotebookRegistry,
        SessionCap,
        SessionAuthorized,
        SessionRevoked,
        authorize_session_and_fund,
        revoke_session,
        E_NOT_OWNER,
        E_SESSION_EXPIRED,
        E_INVALID_EXPIRATION,
        E_INSUFFICIENT_BALANCE,
    };

    // ========== POSITIVE TEST CASES ==========

    /// TC-SA-001: Create Session with Auto-Funding Success
    /// Verify successful session creation with automatic hot wallet funding
    #[test]
    public fun test_authorize_session_and_fund_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Test Notebook");

        // Setup funding coins
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            2000000000  // 2 WAL
        );

        let hot_wallet = test_utils::device_1();
        let device_fingerprint = string::utf8(b"device_fingerprint_12345");
        let expires_at = test_utils::future();

        // Execute: Create session with auto-funding
        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        authorize_session_and_fund(
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

        // Switch to hot wallet context to verify SessionCap exists
        test_utils::switch_to_user(&mut scenario, hot_wallet);
        let session_cap = test_scenario::take_from_sender<SessionCap>(&scenario);

        // Verify SessionCap was created successfully
        test_utils::verify_session_cap_exists();

        test_scenario::return_to_sender(&scenario, session_cap);
        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());
        test_scenario::end(scenario);
    }

    /// TC-SA-004: Session Revocation Success
    /// Verify session revocation functionality
    #[test]
    public fun test_revoke_session_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Test Notebook");

        // Setup funding coins
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            2000000000  // 2 WAL
        );

        // Execute: Create session
        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            string::utf8(b"device_fp"),
            test_utils::device_1(),
            test_utils::future(),
            option::none(),
            option::none(),
            ctx
        );

        // Switch to hot wallet context and get SessionCap
        test_utils::switch_to_user(&mut scenario, test_utils::device_1());
        let session_cap = test_scenario::take_from_sender<SessionCap>(&scenario);

        // Switch back to owner for revocation
        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx_owner = test_scenario::ctx(&mut scenario);

        // Execute: Revoke session as owner
        revoke_session(
            &notebook,
            session_cap,
            ctx_owner
        );

        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());
        test_scenario::end(scenario);
    }

    /// TC-SA-005: Multiple Sessions per Device Success
    /// Verify multiple sessions can coexist for different devices
    #[test]
    public fun test_multiple_sessions_per_device_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Multi-Device Notebook");

        // Setup funding coins
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            2000000000, // 2 SUI (enough for both sessions)
            4000000000  // 4 WAL (enough for both sessions)
        );

        // Execute: Create sessions for multiple devices
        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Device 1 session
        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            string::utf8(b"device_1_fingerprint"),
            test_utils::device_1(),
            test_utils::future(),
            option::none(),
            option::none(),
            ctx
        );

        // Device 2 session
        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            string::utf8(b"device_2_fingerprint"),
            test_utils::device_2(),
            test_utils::future(),
            option::none(),
            option::none(),
            ctx
        );

        // Verify: Both sessions exist
        test_utils::switch_to_user(&mut scenario, test_utils::device_1());
        let session_1 = test_scenario::take_from_sender<SessionCap>(&scenario);
        test_scenario::return_to_sender(&scenario, session_1);

        test_utils::switch_to_user(&mut scenario, test_utils::device_2());
        let session_2 = test_scenario::take_from_sender<SessionCap>(&scenario);
        test_scenario::return_to_sender(&scenario, session_2);

        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());
        test_scenario::end(scenario);
    }

    // ========== NEGATIVE TEST CASES ==========

    /// TC-SA-006: Unauthorized Session Creation Failure
    /// Verify only notebook owner can create sessions
    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_unauthorized_session_creation_fail() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Owner Notebook");

        // Switch to attacker context
        test_utils::switch_to_user(&mut scenario, test_utils::attacker());
        let (attacker_sui, attacker_wal) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            2000000000  // 2 WAL
        );

        let ctx_attacker = test_scenario::ctx(&mut scenario);
        let mut sui_coin = attacker_sui;
        let mut wal_coin = attacker_wal;

        // Execute: Attacker tries to create session for owner's notebook
        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            string::utf8(b"attacker_device"),
            test_utils::attacker(),
            test_utils::future(),
            option::none(),
            option::none(),
            ctx_attacker
        );

        // Should fail with E_NOT_OWNER
        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        transfer::public_transfer(sui_coin, test_utils::attacker());
        transfer::public_transfer(wal_coin, test_utils::attacker());
        test_scenario::end(scenario);
    }

    // ========== EDGE CASES AND BOUNDARY TESTS ==========

    /// TC-SA-010: Session Creation with Custom Amounts Success
    /// Verify custom funding amounts work correctly
    #[test]
    public fun test_session_custom_funding_amounts_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Custom Funding Notebook");

        // Setup coins with exact amounts
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            2000000000  // 2 WAL
        );

        let custom_sui_amount = test_utils::custom_sui_amount();
        let custom_wal_amount = test_utils::custom_wal_amount();

        // Execute: Create session with custom funding amounts
        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            string::utf8(b"custom_device_fp"),
            test_utils::device_1(),
            test_utils::future(),
            option::some(custom_sui_amount),
            option::some(custom_wal_amount),
            ctx
        );

        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());
        test_scenario::end(scenario);
    }

    /// TC-SA-011: Session Zero Expiration Time Failure
    /// Verify sessions cannot have zero expiration time
    #[test]
    #[expected_failure(abort_code = E_INVALID_EXPIRATION)]
    public fun test_session_zero_expiration_fail() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Test Notebook");

        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            2000000000  // 2 WAL
        );

        // Execute: Try to create session with zero expiration
        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            string::utf8(b"device_fp"),
            test_utils::device_1(),
            0, // Zero expiration time
            option::none(),
            option::none(),
            ctx
        );

        // Should fail with E_INVALID_EXPIRATION
        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());
        test_scenario::end(scenario);
    }
}