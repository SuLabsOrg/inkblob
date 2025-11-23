#[test_only]
module inkblob::balance_handling_tests {
    use std::string;
    use sui::test_scenario;
    use sui::coin;
    use sui::transfer;
    use inkblob::test_utils;
    use inkblob::notebook::{authorize_session_and_fund};

    #[test]
    fun test_authorize_session_balance_handling() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Test Notebook");

        // Setup funding coins
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            1000000000  // 1 WAL
        );

        let hot_wallet = test_utils::device_1();
        let device_fingerprint = string::utf8(b"test_device_fp");
        let expires_at = test_utils::future();
        let fund_amount_sui = 100000000; // 0.1 SUI
        let fund_amount_wal = 500000000; // 0.5 WAL

        // Record balances before funding
        let sui_balance_before = coin::value(&sui_coin);
        let wal_balance_before = coin::value(&wal_coin);

        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Execute session authorization
        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            device_fingerprint,
            hot_wallet,
            expires_at,
            option::some(fund_amount_sui),
            option::some(fund_amount_wal),
            ctx
        );

        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());

        // Verify remaining coin balances
        let sui_balance_after = coin::value(&sui_coin);
        let wal_balance_after = coin::value(&wal_coin);

        // Check that expected amounts were deducted
        assert!(sui_balance_after == sui_balance_before - fund_amount_sui, 1);
        assert!(wal_balance_after == wal_balance_before - fund_amount_wal, 2);

        // Verify the remaining coins still exist and have expected balances
        assert!(sui_balance_after > 0, 3);
        assert!(wal_balance_after > 0, 4);

        // Return remaining coins to sender (simulating proper balance handling)
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());

        test_scenario::end(scenario);
    }

  #[test]
    #[expected_failure(abort_code = 13)] // E_INSUFFICIENT_BALANCE
    fun test_authorize_session_insufficient_sui_balance() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Test Notebook");

        // Setup coins with insufficient SUI balance
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            50000000,  // 0.05 SUI (less than required 0.1 SUI)
            1000000000 // 1 WAL
        );

        let hot_wallet = test_utils::device_1();
        let device_fingerprint = string::utf8(b"test_device_fp");
        let expires_at = test_utils::future();
        let fund_amount_sui = 100000000; // 0.1 SUI - more than available
        let fund_amount_wal = 500000000; // 0.5 WAL

        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // This should fail due to insufficient SUI balance
        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            device_fingerprint,
            hot_wallet,
            expires_at,
            option::some(fund_amount_sui),
            option::some(fund_amount_wal),
            ctx
        );

        // Clean up if test doesn't abort
        test_scenario::return_shared(notebook);
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 21)] // E_INSUFFICIENT_WAL_BALANCE
    fun test_authorize_session_insufficient_wal_balance() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Test Notebook");

        // Setup coins with insufficient WAL balance
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            300000000   // 0.3 WAL (less than required 0.5 WAL)
        );

        let hot_wallet = test_utils::device_1();
        let device_fingerprint = string::utf8(b"test_device_fp");
        let expires_at = test_utils::future();
        let fund_amount_sui = 100000000; // 0.1 SUI
        let fund_amount_wal = 500000000; // 0.5 WAL - more than available

        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // This should fail due to insufficient WAL balance
        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            device_fingerprint,
            hot_wallet,
            expires_at,
            option::some(fund_amount_sui),
            option::some(fund_amount_wal),
            ctx
        );

        test_scenario::return_shared(notebook);

        // In case the test doesn't fail as expected, clean up coins
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());
        test_scenario::end(scenario);
    }

    #[test]
    fun test_authorize_session_default_amounts() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let notebook = test_utils::create_test_notebook(&mut scenario, b"Test Notebook");

        // Setup coins with sufficient balances
        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            &mut scenario,
            1000000000, // 1 SUI
            1000000000  // 1 WAL
        );

        let hot_wallet = test_utils::device_1();
        let device_fingerprint = string::utf8(b"test_device_fp");
        let expires_at = test_utils::future();

        // Record balances before funding
        let sui_balance_before = coin::value(&sui_coin);
        let wal_balance_before = coin::value(&wal_coin);

        test_utils::switch_to_user(&mut scenario, test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Execute session authorization with default amounts (None)
        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            device_fingerprint,
            hot_wallet,
            expires_at,
            option::none<u64>(),
            option::none<u64>(),
            ctx
        );

        test_scenario::return_shared(notebook);
        test_scenario::next_tx(&mut scenario, test_utils::owner());

        // Verify default amounts were deducted (0.1 SUI and 0.5 WAL)
        let default_sui = test_utils::default_sui_fund();
        let default_wal = test_utils::default_wal_fund();

        let sui_balance_after = coin::value(&sui_coin);
        let wal_balance_after = coin::value(&wal_coin);

        assert!(sui_balance_after == sui_balance_before - default_sui, 1);
        assert!(wal_balance_after == wal_balance_before - default_wal, 2);

        // Return remaining coins
        transfer::public_transfer(sui_coin, test_utils::owner());
        transfer::public_transfer(wal_coin, test_utils::owner());

        test_scenario::end(scenario);
    }
}