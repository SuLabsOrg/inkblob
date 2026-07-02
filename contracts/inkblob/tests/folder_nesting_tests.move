#[test_only]
module inkblob::folder_nesting_tests {
    use std::string;
    use std::option;
    use sui::table;
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Folder,
        calculate_folder_depth,
        would_create_cycle,
        create_test_folder_with_id,
        create_test_id_from_address,
    };

    // Previously disabled due to an unspecified "memory management" issue in the
    // old test_scenario-based version (see git history / the removed commented-out
    // block in sources/notebook.move). Rewritten here using the proven
    // create_test_id_from_address(addr, ctx) pattern already used successfully by
    // note_management_tests.move, folder_management_tests.move, and
    // conflict_detection_tests.move.

    #[test]
    fun test_folder_depth_calculation() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = sui::test_scenario::ctx(&mut scenario);

        // Create folders table
        let mut folders = table::new<sui::object::ID, Folder>(ctx);

        // Create test IDs
        let root_id = create_test_id_from_address(test_utils::owner(), ctx);
        let level1_id = create_test_id_from_address(test_utils::owner(), ctx);
        let level2_id = create_test_id_from_address(test_utils::owner(), ctx);

        // Create root folder (depth 0)
        let root_folder = create_test_folder_with_id(
            root_id,
            string::utf8(b"Root"),
            option::none(),
            0
        );
        table::add(&mut folders, root_id, root_folder);

        // Create level 1 folder (depth 1)
        let level1_folder = create_test_folder_with_id(
            level1_id,
            string::utf8(b"Level1"),
            option::some(root_id),
            1
        );
        table::add(&mut folders, level1_id, level1_folder);

        // Create level 2 folder (depth 2)
        let level2_folder = create_test_folder_with_id(
            level2_id,
            string::utf8(b"Level2"),
            option::some(level1_id),
            2
        );
        table::add(&mut folders, level2_id, level2_folder);

        // Test depth calculations
        assert!(calculate_folder_depth(&folders, root_id) == 0, 0);
        assert!(calculate_folder_depth(&folders, level1_id) == 1, 1);
        assert!(calculate_folder_depth(&folders, level2_id) == 2, 2);

        // Clean up
        table::drop(folders);
        sui::test_scenario::end(scenario);
    }

    #[test]
    fun test_circular_reference_detection() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = sui::test_scenario::ctx(&mut scenario);

        // Create folders table
        let mut folders = table::new<sui::object::ID, Folder>(ctx);

        // Create test IDs
        let folder_a_id = create_test_id_from_address(test_utils::owner(), ctx);
        let folder_b_id = create_test_id_from_address(test_utils::owner(), ctx);
        let folder_c_id = create_test_id_from_address(test_utils::owner(), ctx);

        // Create folders A -> B -> C
        let folder_a = create_test_folder_with_id(folder_a_id, string::utf8(b"A"), option::none(), 0);
        let folder_b = create_test_folder_with_id(folder_b_id, string::utf8(b"B"), option::some(folder_a_id), 1);
        let folder_c = create_test_folder_with_id(folder_c_id, string::utf8(b"C"), option::some(folder_b_id), 2);

        table::add(&mut folders, folder_a_id, folder_a);
        table::add(&mut folders, folder_b_id, folder_b);
        table::add(&mut folders, folder_c_id, folder_c);

        // Tree is A (root) -> B (parent A) -> C (parent B).
        //
        // Test various circular reference scenarios
        // Direct cycle: A -> A
        assert!(would_create_cycle(&folders, folder_a_id, folder_a_id) == true, 0);

        // Indirect cycle: proposing C as A's parent would create A -> C -> B -> A,
        // since A is already an ancestor of C.
        assert!(would_create_cycle(&folders, folder_a_id, folder_c_id) == true, 1);

        // Indirect cycle: proposing B as A's parent would create A -> B -> A,
        // since B's current parent is already A.
        assert!(would_create_cycle(&folders, folder_a_id, folder_b_id) == true, 2);

        // No-op reassignments are NOT cycles: B's parent is already A, and
        // traversing up from A (the proposed parent) never reaches B (A is root).
        assert!(would_create_cycle(&folders, folder_b_id, folder_a_id) == false, 3);

        // Similarly, C's parent is already B; traversing up from B (A, then root)
        // never reaches C, so this is not a cycle either.
        assert!(would_create_cycle(&folders, folder_c_id, folder_b_id) == false, 4);

        // Valid move: C could be reparented under A directly (skipping B) -
        // traversing up from A (root) never reaches C.
        assert!(would_create_cycle(&folders, folder_c_id, folder_a_id) == false, 5);

        // Clean up
        table::drop(folders);
        sui::test_scenario::end(scenario);
    }

    #[test]
    fun test_folder_depth_limit() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = sui::test_scenario::ctx(&mut scenario);

        // Create folders table
        let mut folders = table::new<sui::object::ID, Folder>(ctx);

        // Create test IDs for folders up to depth 5
        let root_id = create_test_id_from_address(test_utils::owner(), ctx);
        let level1_id = create_test_id_from_address(test_utils::owner(), ctx);
        let level2_id = create_test_id_from_address(test_utils::owner(), ctx);
        let level3_id = create_test_id_from_address(test_utils::owner(), ctx);
        let level4_id = create_test_id_from_address(test_utils::owner(), ctx);
        let level5_id = create_test_id_from_address(test_utils::owner(), ctx);

        // Create root folder (depth 0)
        table::add(&mut folders, root_id, create_test_folder_with_id(root_id, string::utf8(b"Root"), option::none(), 0));

        // Create level 1 folder (depth 1)
        table::add(&mut folders, level1_id, create_test_folder_with_id(level1_id, string::utf8(b"Level1"), option::some(root_id), 1));

        // Create level 2 folder (depth 2)
        table::add(&mut folders, level2_id, create_test_folder_with_id(level2_id, string::utf8(b"Level2"), option::some(level1_id), 2));

        // Create level 3 folder (depth 3)
        table::add(&mut folders, level3_id, create_test_folder_with_id(level3_id, string::utf8(b"Level3"), option::some(level2_id), 3));

        // Create level 4 folder (depth 4)
        table::add(&mut folders, level4_id, create_test_folder_with_id(level4_id, string::utf8(b"Level4"), option::some(level3_id), 4));

        // Create level 5 folder (depth 5)
        table::add(&mut folders, level5_id, create_test_folder_with_id(level5_id, string::utf8(b"Level5"), option::some(level4_id), 5));

        // Test depth calculations
        assert!(calculate_folder_depth(&folders, root_id) == 0, 0);
        assert!(calculate_folder_depth(&folders, level1_id) == 1, 1);
        assert!(calculate_folder_depth(&folders, level2_id) == 2, 2);
        assert!(calculate_folder_depth(&folders, level3_id) == 3, 3);
        assert!(calculate_folder_depth(&folders, level4_id) == 4, 4);
        assert!(calculate_folder_depth(&folders, level5_id) == 5, 5);

        // Clean up
        table::drop(folders);
        sui::test_scenario::end(scenario);
    }
}
