#[test_only]
module inkblob::conflict_detection_tests {
    use std::string;
    use std::option;
    use sui::test_scenario::{Self, Scenario};
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Notebook,
        WalFeeReserve,
        SessionCap,
        update_note,
        update_note_with_session,
        authorize_session_and_fund,
        create_test_id_from_address,
        E_VERSION_MISMATCH,
    };

    /// Creates a note in `notebook` and returns its freshly-generated ID.
    /// Uses `option::none()` for expected_updated_at since this is always the
    /// create-new-note path (the note does not exist yet).
    fun create_test_note(scenario: &mut Scenario, notebook: &mut Notebook, reserve: &mut WalFeeReserve): sui::object::ID {
        let ctx = test_scenario::ctx(scenario);
        let note_id = create_test_id_from_address(test_utils::owner(), ctx);
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
            option::none(),
            option::none(),
            ctx
        );
        note_id
    }

    // ========== update_note ==========

    #[test]
    public fun test_update_note_matching_expected_updated_at_succeeds() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"CAS Match Test");

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        let current_updated_at = {
            let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
            notebook::note_updated_at(note)
        };

        update_note(
            &mut notebook,
            &mut reserve,
            note_id,
            string::utf8(b"blob_id_v2"),
            string::utf8(b"blob_object_id_v2"),
            string::utf8(b"encrypted_title_v2"),
            option::none(),
            option::none(),
            option::some(current_updated_at),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::get_note_blob_id(note) == &string::utf8(b"blob_id_v2"), 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_VERSION_MISMATCH)]
    public fun test_update_note_stale_expected_updated_at_aborts() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"CAS Stale Test");

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        let current_updated_at = {
            let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
            notebook::note_updated_at(note)
        };
        // A bogus/stale value guaranteed not to equal the note's real updated_at.
        let stale_updated_at = current_updated_at + 999999;

        update_note(
            &mut notebook,
            &mut reserve,
            note_id,
            string::utf8(b"blob_id_v2"),
            string::utf8(b"blob_object_id_v2"),
            string::utf8(b"encrypted_title_v2"),
            option::none(),
            option::none(),
            option::some(stale_updated_at),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_update_note_none_expected_updated_at_always_succeeds() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"CAS Backward Compat Test");

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        // option::none() must skip the version check entirely, regardless of
        // the note's actual updated_at value. This is the path every existing
        // caller uses today and it must keep working unchanged.
        update_note(
            &mut notebook,
            &mut reserve,
            note_id,
            string::utf8(b"blob_id_v2"),
            string::utf8(b"blob_object_id_v2"),
            string::utf8(b"encrypted_title_v2"),
            option::none(),
            option::none(),
            option::none(),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        update_note(
            &mut notebook,
            &mut reserve,
            note_id,
            string::utf8(b"blob_id_v3"),
            string::utf8(b"blob_object_id_v3"),
            string::utf8(b"encrypted_title_v3"),
            option::none(),
            option::none(),
            option::none(),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::get_note_blob_id(note) == &string::utf8(b"blob_id_v3"), 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_update_note_create_new_ignores_expected_updated_at() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"CAS Create Path Test");

        let ctx = test_scenario::ctx(&mut scenario);
        let note_id = create_test_id_from_address(test_utils::owner(), ctx);

        // The note does not exist yet (table::contains is false), so even a
        // bogus Some(...) expected_updated_at must NOT be rejected - the
        // version check only applies to the update-existing branch.
        update_note(
            &mut notebook,
            &mut reserve,
            note_id,
            string::utf8(b"blob_id"),
            string::utf8(b"blob_object_id"),
            string::utf8(b"encrypted_title"),
            option::none(),
            option::none(),
            option::some(123456789),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::get_note_blob_id(note) == &string::utf8(b"blob_id"), 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== update_note_with_session ==========

    /// Sets up a notebook plus a funded SessionCap held by the hot wallet device,
    /// mirroring the flow in session_authorization_tests.move.
    fun create_test_notebook_with_session(scenario: &mut Scenario): (Notebook, WalFeeReserve, address) {
        let (notebook, reserve) = test_utils::create_test_notebook_with_reserve(scenario, b"CAS Session Test");

        let (mut sui_coin, mut wal_coin) = test_utils::create_test_coins(
            scenario,
            1000000000, // 1 SUI
            2000000000  // 2 WAL
        );

        let hot_wallet = test_utils::device_1();
        let device_fingerprint = string::utf8(b"device_fingerprint_conflict_test");
        let expires_at = test_utils::future();

        test_utils::switch_to_user(scenario, test_utils::owner());
        let ctx = test_scenario::ctx(scenario);

        authorize_session_and_fund(
            &notebook,
            &mut sui_coin,
            &mut wal_coin,
            device_fingerprint,
            hot_wallet,
            expires_at,
            option::none(),
            option::none(),
            ctx
        );

        test_scenario::next_tx(scenario, test_utils::owner());
        sui::transfer::public_transfer(sui_coin, test_utils::owner());
        sui::transfer::public_transfer(wal_coin, test_utils::owner());

        (notebook, reserve, hot_wallet)
    }

    #[test]
    public fun test_update_note_with_session_matching_expected_updated_at_succeeds() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve, hot_wallet) = create_test_notebook_with_session(&mut scenario);

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        let current_updated_at = {
            let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
            notebook::note_updated_at(note)
        };

        test_utils::switch_to_user(&mut scenario, hot_wallet);
        let session_cap = test_scenario::take_from_sender<SessionCap>(&scenario);

        update_note_with_session(
            &mut notebook,
            &mut reserve,
            session_cap,
            note_id,
            string::utf8(b"blob_id_v2"),
            string::utf8(b"blob_object_id_v2"),
            string::utf8(b"encrypted_title_v2"),
            option::none(),
            option::none(),
            option::some(current_updated_at),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::get_note_blob_id(note) == &string::utf8(b"blob_id_v2"), 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_VERSION_MISMATCH)]
    public fun test_update_note_with_session_stale_expected_updated_at_aborts() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve, hot_wallet) = create_test_notebook_with_session(&mut scenario);

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        let current_updated_at = {
            let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
            notebook::note_updated_at(note)
        };
        let stale_updated_at = current_updated_at + 999999;

        test_utils::switch_to_user(&mut scenario, hot_wallet);
        let session_cap = test_scenario::take_from_sender<SessionCap>(&scenario);

        update_note_with_session(
            &mut notebook,
            &mut reserve,
            session_cap,
            note_id,
            string::utf8(b"blob_id_v2"),
            string::utf8(b"blob_object_id_v2"),
            string::utf8(b"encrypted_title_v2"),
            option::none(),
            option::none(),
            option::some(stale_updated_at),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }
}
