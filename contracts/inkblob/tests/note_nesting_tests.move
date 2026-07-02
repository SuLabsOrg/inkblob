#[test_only]
module inkblob::note_nesting_tests {
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
        create_folder,
        create_test_id_from_address,
        E_MAX_NOTE_DEPTH,
        E_NOTE_CIRCULAR_REFERENCE,
        E_PARENT_NOTE_NOT_FOUND,
        E_PARENT_NOTE_DELETED,
    };

    /// Creates a note in `notebook` with the given parent_note_id and folder_id,
    /// and returns its freshly-generated ID. Mirrors create_test_note from
    /// note_management_tests.move / conflict_detection_tests.move but exposes
    /// the nesting-relevant parameters.
    fun create_test_note_nested(
        scenario: &mut Scenario,
        notebook: &mut Notebook,
        reserve: &mut WalFeeReserve,
        folder_id: option::Option<sui::object::ID>,
        parent_note_id: option::Option<sui::object::ID>
    ): sui::object::ID {
        let ctx = test_scenario::ctx(scenario);
        let note_id = create_test_id_from_address(test_utils::owner(), ctx);
        update_note(
            notebook,
            reserve,
            note_id,
            string::utf8(b"blob_id"),
            string::utf8(b"blob_object_id"),
            string::utf8(b"encrypted_title"),
            folder_id,
            parent_note_id,
            option::none(),
            option::none(),
            option::none(),
            ctx
        );
        note_id
    }

    /// Creates a plain, unnested note (no folder, no parent).
    fun create_test_note(scenario: &mut Scenario, notebook: &mut Notebook, reserve: &mut WalFeeReserve): sui::object::ID {
        create_test_note_nested(scenario, notebook, reserve, option::none(), option::none())
    }

    // ========== Successful nesting ==========

    #[test]
    public fun test_nest_note_under_existing_parent_succeeds() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Note Nesting Success Test");

        let parent_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);
        let child_id = create_test_note_nested(
            &mut scenario,
            &mut notebook,
            &mut reserve,
            option::none(),
            option::some(parent_id)
        );

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), child_id);
        let stored_parent = notebook::get_note_parent_id(note);
        assert!(option::is_some(stored_parent), 0);
        assert!(*option::borrow(stored_parent) == parent_id, 1);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Parent not found ==========

    #[test]
    #[expected_failure(abort_code = E_PARENT_NOTE_NOT_FOUND)]
    public fun test_nest_note_parent_not_found_fails() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Note Nesting Parent Missing Test");

        let bogus_parent_id = create_test_id_from_address(
            test_utils::owner(),
            test_scenario::ctx(&mut scenario)
        );

        create_test_note_nested(
            &mut scenario,
            &mut notebook,
            &mut reserve,
            option::none(),
            option::some(bogus_parent_id)
        );

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Parent deleted ==========

    #[test]
    #[expected_failure(abort_code = E_PARENT_NOTE_DELETED)]
    public fun test_nest_note_under_deleted_parent_fails() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Note Nesting Parent Deleted Test");

        let parent_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);
        delete_note(&mut notebook, parent_id, test_scenario::ctx(&mut scenario));

        create_test_note_nested(
            &mut scenario,
            &mut notebook,
            &mut reserve,
            option::none(),
            option::some(parent_id)
        );

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Depth limit ==========

    #[test]
    #[expected_failure(abort_code = E_MAX_NOTE_DEPTH)]
    public fun test_nest_note_depth_limit_exceeded_fails() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Note Nesting Depth Limit Test");

        // Build a chain root -> level1 -> level2 -> level3 -> level4 -> level5
        // (depths 0..5), matching MAX_NESTING_DEPTH = 5 used by folders.
        let root_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);
        let level1_id = create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(root_id));
        let level2_id = create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(level1_id));
        let level3_id = create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(level2_id));
        let level4_id = create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(level3_id));
        let level5_id = create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(level4_id));

        // level5 is at depth 5. Nesting a 6th level under it must exceed the cap.
        create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(level5_id));

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== Circular reference ==========

    #[test]
    #[expected_failure(abort_code = E_NOTE_CIRCULAR_REFERENCE)]
    public fun test_nest_note_circular_reference_fails() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Note Nesting Cycle Test");

        // A -> B -> C
        let a_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);
        let b_id = create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(a_id));
        let c_id = create_test_note_nested(&mut scenario, &mut notebook, &mut reserve, option::none(), option::some(b_id));

        // Attempt to make A a child of its own descendant C: A -> C would create a cycle
        // (A already has C as a descendant via A -> B -> C).
        update_note(
            &mut notebook,
            &mut reserve,
            a_id,
            string::utf8(b"blob_id_updated"),
            string::utf8(b"blob_object_id_updated"),
            string::utf8(b"encrypted_title_updated"),
            option::none(),
            option::some(c_id),
            option::none(),
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }

    // ========== folder_id and parent_note_id can coexist ==========

    #[test]
    public fun test_note_can_have_folder_and_parent_note_simultaneously() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let (mut notebook, mut reserve) = test_utils::create_test_notebook_with_reserve(&mut scenario, b"Note Nesting Plus Folder Test");

        // Create a folder for the note to live in structurally.
        let folder_ctx = test_scenario::ctx(&mut scenario);
        let folder_id = create_test_id_from_address(test_utils::owner(), folder_ctx);
        create_folder(
            &mut notebook,
            folder_id,
            string::utf8(b"encrypted_name"),
            option::none(),
            folder_ctx
        );

        let parent_note_id = create_test_note(&mut scenario, &mut notebook, &mut reserve);

        // The sub-page has BOTH a folder_id and a parent_note_id set - these are
        // orthogonal per the product decision, not mutually exclusive.
        let child_id = create_test_note_nested(
            &mut scenario,
            &mut notebook,
            &mut reserve,
            option::some(folder_id),
            option::some(parent_note_id)
        );

        let note = notebook::borrow_note(notebook::get_notebook_notes(&notebook), child_id);
        let stored_parent = notebook::get_note_parent_id(note);
        assert!(option::is_some(stored_parent), 0);
        assert!(*option::borrow(stored_parent) == parent_note_id, 1);

        test_scenario::return_shared(notebook);
        test_scenario::return_shared(reserve);
        test_scenario::end(scenario);
    }
}
