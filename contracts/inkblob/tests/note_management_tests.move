#[test_only]
module inkblob::note_management_tests {
    use std::string;
    use std::option;
    use sui::test_scenario::{Self, Scenario};
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Notebook,
        WalFeeReserve,
        update_note,
        delete_note,
        restore_note,
        create_test_id_from_address,
        E_NOT_OWNER,
        E_NOTE_NOT_FOUND,
    };

    /// Creates a note in `notebook` and returns its freshly-generated ID.
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

    #[test]
    public fun test_delete_note_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Delete Note Test");

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        delete_note(&mut notebook, note_id, test_scenario::ctx(&mut scenario));

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(notebook::note_is_deleted(note), 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_restore_note_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Restore Note Test");

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);
        delete_note(&mut notebook, note_id, test_scenario::ctx(&mut scenario));
        restore_note(&mut notebook, note_id, test_scenario::ctx(&mut scenario));

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), note_id);
        assert!(!notebook::note_is_deleted(note), 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_NOTE_NOT_FOUND)]
    public fun test_delete_note_not_found_fail() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Missing Note Test");

        let bogus_id = create_test_id_from_address(test_utils::owner(), test_scenario::ctx(&mut scenario));
        delete_note(&mut notebook, bogus_id, test_scenario::ctx(&mut scenario));

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_delete_note_unauthorized_fail() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Unauthorized Delete Test");

        let note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        test_scenario::next_tx(&mut scenario, test_utils::attacker());
        delete_note(&mut notebook, note_id, test_scenario::ctx(&mut scenario));

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }
}
