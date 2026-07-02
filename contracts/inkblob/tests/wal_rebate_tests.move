#[test_only]
module inkblob::wal_rebate_tests {
    use std::string;
    use std::option;
    use sui::test_scenario::{Self, Scenario};
    use sui::coin;
    use sui::transfer;
    use wal::wal::WAL;
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Notebook,
        WalFeeReserve,
        update_note,
        claim_wal_storage_rebate,
        process_wal_storage_rebate,
        create_test_id_from_address,
        E_REBATE_ALREADY_CLAIMED,
        E_RESERVE_INSUFFICIENT_BALANCE,
        E_WRONG_RESERVE,
    };

    /// 1 MB * WAL_STORAGE_FEE_PER_MB (1,000,000 frost per MB) = required fee for a
    /// single-MB blob. Comfortably above WAL_MIN_PAYMENT (100,000 frost).
    const BLOB_SIZE_MB: u64 = 1;
    const REQUIRED_FEE: u64 = 1000000;

    /// Creates a note in `notebook`, paying exactly REQUIRED_FEE worth of real WAL (minted
    /// for testing, mirroring balance_handling_tests.move's coin::mint_for_testing<WAL>
    /// pattern) into the reserve as the storage fee for a BLOB_SIZE_MB blob.
    /// Returns the note ID.
    fun create_test_note_with_wal_payment(
        scenario: &mut Scenario,
        notebook: &mut Notebook,
        reserve: &mut WalFeeReserve
    ): sui::object::ID {
        let ctx = test_scenario::ctx(scenario);
        let note_id = create_test_id_from_address(test_utils::owner(), ctx);
        let wal_coin = coin::mint_for_testing<WAL>(REQUIRED_FEE, ctx);

        update_note(
            notebook,
            reserve,
            note_id,
            string::utf8(b"blob_id"),
            string::utf8(b"blob_object_id"),
            string::utf8(b"encrypted_title"),
            option::none(),
            option::none(),
            option::none(),
            option::some(BLOB_SIZE_MB),
            option::some(wal_coin),
            ctx
        );
        note_id
    }

    // ========== Payment deposits into reserve ==========

    #[test]
    public fun test_wal_payment_deposits_into_reserve() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"WAL Payment Test");

        assert!(notebook::get_reserve_balance(&reserve) == 0, 0);

        let note_id = create_test_note_with_wal_payment(&mut scenario, &mut notebook, &mut reserve);

        // The reserve balance must have increased by exactly the required fee.
        assert!(notebook::get_reserve_balance(&reserve) == REQUIRED_FEE, 1);

        // The note's on-chain wal_paid record must match what was actually deposited.
        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::get_note_wal_paid(note) == REQUIRED_FEE, 2);
        assert!(!notebook::note_rebate_claimed(note), 3);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_wal_payment_returns_change_to_caller() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"WAL Payment Change Test");

        let ctx = test_scenario::ctx(&mut scenario);
        let note_id = create_test_id_from_address(test_utils::owner(), ctx);
        // Pay double the required fee - the excess must come back to the sender as change.
        let overpay_amount = REQUIRED_FEE * 2;
        let wal_coin = coin::mint_for_testing<WAL>(overpay_amount, ctx);

        update_note(
            &mut notebook,
            &mut reserve,
            note_id,
            string::utf8(b"blob_id"),
            string::utf8(b"blob_object_id"),
            string::utf8(b"encrypted_title"),
            option::none(),
            option::none(),
            option::none(),
            option::some(BLOB_SIZE_MB),
            option::some(wal_coin),
            ctx
        );

        // Only the required fee should have landed in the reserve / been recorded.
        assert!(notebook::get_reserve_balance(&reserve) == REQUIRED_FEE, 0);
        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::get_note_wal_paid(note) == REQUIRED_FEE, 1);

        // The change coin (overpay_amount - REQUIRED_FEE) should have been transferred
        // back to the sender.
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let change_coin = test_scenario::take_from_sender<sui::coin::Coin<WAL>>(&scenario);
        assert!(coin::value(&change_coin) == overpay_amount - REQUIRED_FEE, 2);
        test_scenario::return_to_sender(&scenario, change_coin);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Rebate happy path ==========

    #[test]
    public fun test_claim_rebate_happy_path_pays_correct_amount() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"WAL Rebate Happy Path Test");

        let note_id = create_test_note_with_wal_payment(&mut scenario, &mut notebook, &mut reserve);
        assert!(notebook::get_reserve_balance(&reserve) == REQUIRED_FEE, 0);

        claim_wal_storage_rebate(&mut notebook, &mut reserve, note_id, test_scenario::ctx(&mut scenario));

        // Reserve should be fully drained of the rebated amount.
        assert!(notebook::get_reserve_balance(&reserve) == 0, 1);

        // Note must now be marked as claimed.
        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::note_rebate_claimed(note), 2);

        // The owner must have actually received a Coin<WAL> for exactly REQUIRED_FEE.
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let rebate_coin = test_scenario::take_from_sender<sui::coin::Coin<WAL>>(&scenario);
        assert!(coin::value(&rebate_coin) == REQUIRED_FEE, 3);
        test_scenario::return_to_sender(&scenario, rebate_coin);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Double-claim rejected ==========

    #[test]
    #[expected_failure(abort_code = E_REBATE_ALREADY_CLAIMED)]
    public fun test_double_claim_rebate_rejected() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"WAL Double Rebate Test");

        let note_id = create_test_note_with_wal_payment(&mut scenario, &mut notebook, &mut reserve);

        claim_wal_storage_rebate(&mut notebook, &mut reserve, note_id, test_scenario::ctx(&mut scenario));
        // Second claim on the same note must abort - the rebate has already been paid out.
        claim_wal_storage_rebate(&mut notebook, &mut reserve, note_id, test_scenario::ctx(&mut scenario));

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Reserve underflow safely rejected ==========

    // ========== Re-claimable after a fresh post-claim payment ==========

    #[test]
    public fun test_rebate_claimable_again_after_fresh_payment() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"WAL Re-claim Test");

        let note_id = create_test_note_with_wal_payment(&mut scenario, &mut notebook, &mut reserve);
        claim_wal_storage_rebate(&mut notebook, &mut reserve, note_id, test_scenario::ctx(&mut scenario));

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::note_rebate_claimed(note), 0);

        // Re-edit the note with a fresh real WAL payment - this must reset rebate_claimed,
        // otherwise the newly-deposited fee would be permanently stuck in the reserve
        // (see the code comment in update_note for why).
        let ctx = test_scenario::ctx(&mut scenario);
        let wal_coin = coin::mint_for_testing<WAL>(REQUIRED_FEE, ctx);
        update_note(
            &mut notebook,
            &mut reserve,
            note_id,
            string::utf8(b"blob_id_v2"),
            string::utf8(b"blob_object_id_v2"),
            string::utf8(b"encrypted_title"),
            option::none(),
            option::none(),
            option::none(),
            option::some(BLOB_SIZE_MB),
            option::some(wal_coin),
            ctx
        );

        // wal_paid was zeroed out by the first claim, so it now reflects only the fresh
        // payment (not the lifetime cumulative total) - this is what makes the second claim
        // below withdraw the correct amount instead of over-claiming into the reserve.
        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(!notebook::note_rebate_claimed(note), 1);
        assert!(notebook::get_note_wal_paid(note) == REQUIRED_FEE, 2);
        assert!(notebook::get_reserve_balance(&reserve) == REQUIRED_FEE, 3);

        // The fresh deposit must be claimable.
        claim_wal_storage_rebate(&mut notebook, &mut reserve, note_id, test_scenario::ctx(&mut scenario));
        assert!(notebook::get_reserve_balance(&reserve) == 0, 4);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Cross-notebook reserve isolation ==========

    #[test]
    #[expected_failure(abort_code = E_WRONG_RESERVE)]
    public fun test_reserve_rejected_for_wrong_notebook() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook_a, mut reserve_a) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Notebook A");

        // A second, unrelated notebook (and its own reserve, which this test deliberately
        // never takes/uses - only notebook_b's identity matters here).
        notebook::create_notebook(string::utf8(b"Notebook B"), test_scenario::ctx(&mut scenario));
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let mut notebook_b = test_scenario::take_shared<Notebook>(&scenario);

        // Attempt to pay notebook B's storage fee using notebook A's reserve - must be
        // rejected, otherwise one notebook's payments could be deposited into (and later
        // rebated from) a completely unrelated notebook's escrow.
        let ctx = test_scenario::ctx(&mut scenario);
        let note_id = create_test_id_from_address(test_utils::owner(), ctx);
        let wal_coin = coin::mint_for_testing<WAL>(REQUIRED_FEE, ctx);

        update_note(
            &mut notebook_b,
            &mut reserve_a,
            note_id,
            string::utf8(b"blob_id"),
            string::utf8(b"blob_object_id"),
            string::utf8(b"encrypted_title"),
            option::none(),
            option::none(),
            option::none(),
            option::some(BLOB_SIZE_MB),
            option::some(wal_coin),
            ctx
        );

        test_scenario::return_shared(notebook_a);
        test_scenario::return_shared(notebook_b);
        test_scenario::return_shared(reserve_a);
        test_scenario::end(scenario);
    }

    // ========== Reserve underflow safely rejected ==========

    #[test]
    #[expected_failure(abort_code = E_RESERVE_INSUFFICIENT_BALANCE)]
    public fun test_rebate_larger_than_reserve_balance_rejected() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"WAL Reserve Underflow Test");

        // Reserve starts empty (balance == 0). Requesting any positive rebate amount must
        // be safely rejected via the explicit balance check rather than underflowing
        // inside balance::split (which would otherwise panic-abort ungracefully, or -
        // worse - silently succeed and drain unrelated funds).
        assert!(notebook::get_reserve_balance(&reserve) == 0, 0);

        let notebook_id = notebook::get_notebook_id(&notebook);
        let bogus_note_id = create_test_id_from_address(
            test_utils::owner(),
            test_scenario::ctx(&mut scenario)
        );

        process_wal_storage_rebate(
            &mut reserve,
            notebook_id,
            bogus_note_id,
            string::utf8(b"blob_id"),
            REQUIRED_FEE, // requesting more than the reserve's zero balance
            test_utils::owner(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_RESERVE_INSUFFICIENT_BALANCE)]
    public fun test_rebate_exceeding_nonzero_reserve_balance_rejected() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"WAL Reserve Partial Underflow Test");

        // Fund the reserve with exactly REQUIRED_FEE via a real note payment.
        let _note_id = create_test_note_with_wal_payment(&mut scenario, &mut notebook, &mut reserve);
        assert!(notebook::get_reserve_balance(&reserve) == REQUIRED_FEE, 0);

        let notebook_id = notebook::get_notebook_id(&notebook);
        let bogus_note_id = create_test_id_from_address(
            test_utils::owner(),
            test_scenario::ctx(&mut scenario)
        );

        // Requesting one frost more than what's actually in the reserve must abort safely.
        process_wal_storage_rebate(
            &mut reserve,
            notebook_id,
            bogus_note_id,
            string::utf8(b"blob_id"),
            REQUIRED_FEE + 1,
            test_utils::owner(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }
}
