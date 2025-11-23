#[test_only]
module inkblob::basic_tests {
    use std::string;
    use inkblob::notebook::{
        calculate_folder_depth,
        would_create_cycle,
        is_valid_arweave_tx_id,
        create_test_folder_with_id,
        Folder,
    };
    use sui::table::{Self, Table};
    use sui::tx_context;
    use sui::test_utils;

    #[test]
    fun test_folder_depth_calculation() {
        let mut scenario = test_utils::begin(@0x1);
        let ctx = test_utils::create_ctx(&mut scenario);

        // Create folders table
        let mut folders = table::new<u64, Folder>(&ctx);

        // Create root folder (depth 0)
        let root_folder = create_test_folder_with_id(
            @0x100,
            string::utf8(b"Root"),
            option::none(),
            0
        );
        table::add(&mut folders, @0x100, root_folder);

        // Create level 1 folder (depth 1)
        let level1_folder = create_test_folder_with_id(
            @0x101,
            string::utf8(b"Level1"),
            option::some(@0x100),
            1
        );
        table::add(&mut folders, @0x101, level1_folder);

        // Create level 2 folder (depth 2)
        let level2_folder = create_test_folder_with_id(
            @0x102,
            string::utf8(b"Level2"),
            option::some(@0x101),
            2
        );
        table::add(&mut folders, @0x102, level2_folder);

        // Test depth calculations
        assert!(calculate_folder_depth(&folders, @0x100) == 0);
        assert!(calculate_folder_depth(&folders, @0x101) == 1);
        assert!(calculate_folder_depth(&folders, @0x102) == 2);

        // Clean up
        table::destroy_empty(folders);
        test_utils::end(scenario);
    }

    #[test]
    fun test_circular_reference_detection() {
        let mut scenario = test_utils::begin(@0x1);
        let ctx = test_utils::create_ctx(&mut scenario);

        // Create folders table
        let mut folders = table::new<u64, Folder>(&ctx);

        // Create folders A -> B -> C
        let folder_a = create_test_folder_with_id(@0x200, string::utf8(b"A"), option::none(), 0);
        let folder_b = create_test_folder_with_id(@0x201, string::utf8(b"B"), option::some(@0x200), 1);
        let folder_c = create_test_folder_with_id(@0x202, string::utf8(b"C"), option::some(@0x201), 2);

        table::add(&mut folders, @0x200, folder_a);
        table::add(&mut folders, @0x201, folder_b);
        table::add(&mut folders, @0x202, folder_c);

        // Test various circular reference scenarios
        // Direct cycle: A -> A
        assert!(would_create_cycle(&folders, @0x200, @0x200) == true);

        // Indirect cycle: A -> B -> C -> A
        assert!(would_create_cycle(&folders, @0x200, @0x202) == true);
        assert!(would_create_cycle(&folders, @0x201, @0x200) == true);
        assert!(would_create_cycle(&folders, @0x202, @0x201) == true);

        // Valid moves
        assert!(would_create_cycle(&folders, @0x200, @0x201) == false);

        // Clean up
        table::destroy_empty(folders);
        test_utils::end(scenario);
    }

    #[test]
    fun test_arweave_transaction_id_validation() {
        // Valid Arweave TX IDs (43 chars, base64url)
        let valid_id = string::utf8(b"abcdefghijk123456789012345678901234567890123");
        assert!(is_valid_arweave_tx_id(&valid_id) == true);

        let valid_id_with_dash = string::utf8(b"abcdefghijk-23456789012345678901234567890123");
        assert!(is_valid_arweave_tx_id(&valid_id_with_dash) == true);

        let valid_id_with_underscore = string::utf8(b"abcdefghijk_23456789012345678901234567890123");
        assert!(is_valid_arweave_tx_id(&valid_id_with_underscore) == true);

        // Invalid Arweave TX IDs
        let too_short = string::utf8(b"short");
        assert!(is_valid_arweave_tx_id(&too_short) == false);

        let too_long = string::utf8(b"abcdefghijk1234567890123456789012345678901234567890");
        assert!(is_valid_arweave_tx_id(&too_long) == false);

        let invalid_chars = string::utf8(b"abcdefg!@#$%^&*()1234567890123456789012345678901");
        assert!(is_valid_arweave_tx_id(&invalid_chars) == false);

        let with_plus = string::utf8(b"abcdefghijk+23456789012345678901234567890123");
        assert!(is_valid_arweave_tx_id(&with_plus) == false);

        let with_slash = string::utf8(b"abcdefghijk/23456789012345678901234567890123");
        assert!(is_valid_arweave_tx_id(&with_slash) == false);
    }

    #[test]
    fun test_folder_depth_limit() {
        let mut scenario = test_utils::begin(@0x1);
        let ctx = test_utils::create_ctx(&mut scenario);

        // Create folders table
        let mut folders = table::new<u64, Folder>(&ctx);

        // Create folders up to depth 5
        let root_id = @0x100;
        let level1_id = @0x101;
        let level2_id = @0x102;
        let level3_id = @0x103;
        let level4_id = @0x104;
        let level5_id = @0x105;

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
        assert!(calculate_folder_depth(&folders, root_id) == 0);
        assert!(calculate_folder_depth(&folders, level1_id) == 1);
        assert!(calculate_folder_depth(&folders, level2_id) == 2);
        assert!(calculate_folder_depth(&folders, level3_id) == 3);
        assert!(calculate_folder_depth(&folders, level4_id) == 4);
        assert!(calculate_folder_depth(&folders, level5_id) == 5);

        // Clean up
        table::destroy_empty(folders);
        test_utils::end(scenario);
    }
}