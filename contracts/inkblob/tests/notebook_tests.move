#[test_only]
module inkblob::notebook_tests {
    use std::string;
    use std::option;
    use sui::test_scenario::{Self, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table;
    use wal::wal::WAL;
    use inkblob::notebook::{
        Notebook,
        NotebookRegistry,
        SessionCap,
        Note,
        Folder,
        create_notebook,
        create_additional_notebook,
        switch_active_notebook,
        authorize_session_and_fund,
        authorize_session_simple,
        revoke_session,
        update_note_direct,
        update_note_with_session,
        move_note_direct,
        update_note_blob_object_direct,
        update_note_ar_backup_direct,
        // TODO: These direct access functions don't exist - need to implement or use entry functions
        // create_folder_direct,
        // update_folder_direct,
        // reorder_folder_direct,
        // batch_reorder_folders_direct,
        // delete_folder_direct,
        verify_authorization,
        note_contains_id,
        borrow_note,
        get_note_blob_id,
        get_note_title,
        folder_contains_id,
        borrow_folder,
        get_notebook_notes,
        get_notebook_folders,
        create_test_id_from_address,
        E_NOT_OWNER,
        E_INVALID_EXPIRATION,
        E_SESSION_EXPIRED,
        E_WRONG_HOT_WALLET,
        E_WRONG_NOTEBOOK,
        E_NOTE_NOT_FOUND,
        E_FOLDER_NOT_FOUND,
        E_PARENT_NOT_FOUND,
        E_INVALID_AR_TX_ID,
        E_NOTEBOOK_EXISTS,
        E_INSUFFICIENT_BALANCE,
        E_MAX_FOLDER_DEPTH,
        E_CIRCULAR_REFERENCE,
        E_PARENT_DELETED,
        E_NOTEBOOK_NOT_FOUND,
        E_INVALID_BATCH_SIZE,
    };

    // Test helper functions
    fun create_test_user(): address {
        @0x42
    }

    fun create_test_hot_wallet(): address {
        @0x43
    }

    fun create_test_notebook(scenario: &mut Scenario): (ID, ID) {
        let user = create_test_user();
        let sender = test_scenario::sender(scenario);
        test_scenario::next_tx(&mut scenario, sender);

        let notebook_name = string::utf8(b"Test Notebook");
        create_notebook(notebook_name, test_scenario::ctx(&mut scenario));

        test_scenario::next_tx(&mut scenario, sender);
        let registry = test_scenario::take_owned<NotebookRegistry>(&mut scenario);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        let notebook_id = object::uid_to_inner(&notebook.id);
        let registry_id = object::uid_to_inner(&registry.id);

        test_scenario::return_shared(notebook);
        test_scenario::return_owned(registry, &sender);

        (notebook_id, registry_id)
    }

    fun create_test_coins(scenario: &mut Scenario, user_address: address): (Coin<SUI>, Coin<WAL>) {
        let sender = test_scenario::sender(scenario);
        test_scenario::next_tx(&mut scenario, sender);

        let sui_coin = coin::mint_for_testing<SUI>(1000000000, test_scenario::ctx(&mut scenario)); // 1 SUI
        let wal_coin = coin::mint_for_testing<WAL>(1000000000, test_scenario::ctx(&mut scenario)); // 1 WAL

        (sui_coin, wal_coin)
    }

    #[test]
    fun test_create_notebook_success() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();

        test_scenario::next_tx(&mut scenario, user);
        let notebook_name = string::utf8(b"Test Notebook");
        create_notebook(notebook_name, test_scenario::ctx(&mut scenario));

        test_scenario::next_tx(&mut scenario, user);
        let registry = test_scenario::take_owned<NotebookRegistry>(&mut scenario);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        // Verify registry properties
        assert!(registry.owner == @0x42);
        assert!(registry.active_notebook == string::utf8(b"Test Notebook"));
        assert!(table::contains(&registry.notebooks, string::utf8(b"Test Notebook")));

        // Verify notebook properties
        assert!(notebook.owner == @0x42);
        assert!(table::length(&notebook.notes) == 0);
        assert!(table::length(&notebook.folders) == 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_owned(registry, &user);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_authorize_session_simple_success() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();
        let hot_wallet = create_test_hot_wallet();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        let device_fingerprint = string::utf8(b"test_device_123");
        let hot_wallet_address = @0x43;
        let expires_at = 999999999999u64;

        authorize_session_simple(
            &notebook,
            device_fingerprint,
            hot_wallet_address,
            expires_at,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, hot_wallet);
        let session_cap = test_scenario::take_from_sender<SessionCap>(&mut scenario);

        // Verify session cap properties
        assert!(session_cap.notebook_id == notebook_id);
        assert!(session_cap.device_fingerprint == string::utf8(b"test_device_123"));
        assert!(session_cap.hot_wallet_address == @0x43);
        assert!(session_cap.expires_at == 999999999999u64);
        assert!(session_cap.auto_funded == false);

        test_scenario::return_shared(notebook);
        test_scenario::return_owned(session_cap, &hot_wallet);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_authorize_session_and_fund_success() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();
        let hot_wallet = create_test_hot_wallet();

        let (notebook_id, _) = create_test_notebook(&mut scenario);
        let (sui_coin, wal_coin) = create_test_coins(&mut scenario, &user);

        test_scenario::next_tx(&mut scenario, user);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);
        let mut sui_payment = test_scenario::take_from_sender<Coin<SUI>>(&mut scenario);
        let mut wal_payment = test_scenario::take_from_sender<Coin<WAL>>(&mut scenario);

        let device_fingerprint = string::utf8(b"test_device_123");
        let hot_wallet_address = @0x43;
        let expires_at = 999999999999u64;

        authorize_session_and_fund(
            &notebook,
            &mut sui_payment,
            &mut wal_payment,
            device_fingerprint,
            hot_wallet_address,
            expires_at,
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, hot_wallet);
        let session_cap = test_scenario::take_from_sender<SessionCap>(&mut scenario);
        let received_sui = test_scenario::take_from_sender<Coin<SUI>>(&mut scenario);
        let received_wal = test_scenario::take_from_sender<Coin<WAL>>(&mut scenario);

        // Verify session cap properties
        assert!(session_cap.notebook_id == notebook_id);
        assert!(session_cap.auto_funded == true);

        // Verify funding amounts (default values)
        assert!(coin::value(&received_sui) == 100000000); // 0.1 SUI
        assert!(coin::value(&received_wal) == 500000000); // 0.5 WAL

        test_scenario::return_shared(notebook);
        test_scenario::return_owned(session_cap, &hot_wallet);
        test_scenario::return_owned(sui_payment, &user);
        test_scenario::return_owned(wal_payment, &user);
        test_scenario::return_owned(received_sui, &hot_wallet);
        test_scenario::return_owned(received_wal, &hot_wallet);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_INSUFFICIENT_BALANCE)]
    fun test_authorize_session_and_fund_insufficient_balance() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();
        let hot_wallet = create_test_hot_wallet();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        // Create coins with insufficient balance
        test_scenario::next_tx(&mut scenario, user);
        let mut sui_payment = coin::mint<SUI>(50000000, test_scenario::ctx(&mut scenario)); // Only 0.05 SUI
        let mut wal_payment = coin::mint<WAL>(100000000, test_scenario::ctx(&mut scenario)); // Only 0.1 WAL

        test_scenario::next_tx(&mut scenario, user);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        let device_fingerprint = string::utf8(b"test_device_123");
        let hot_wallet_address = @0x43;
        let expires_at = 999999999999u64;

        // This should fail with E_INSUFFICIENT_BALANCE
        authorize_session_and_fund(
            &notebook,
            &mut sui_payment,
            &mut wal_payment,
            device_fingerprint,
            hot_wallet_address,
            expires_at,
            option::none(),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        abort 1 // Should not reach here
    }

  
    #[test]
    #[expected_failure(abort_code = E_MAX_FOLDER_DEPTH)]
    fun test_folder_depth_limit_exceeded() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        // Create folders up to depth 5
        let root_id = @0x100;
        let level1_id = @0x101;
        let level2_id = @0x102;
        let level3_id = @0x103;
        let level4_id = @0x104;
        let level5_id = @0x105;
        let level6_id = @0x106;

        // Create root to level 5 folders
        create_folder_direct(&mut notebook, root_id, string::utf8(b"Root"), option::none(), test_scenario::ctx(&mut scenario));
        create_folder_direct(&mut notebook, level1_id, string::utf8(b"Level1"), option::some(root_id), test_scenario::ctx(&mut scenario));
        create_folder_direct(&mut notebook, level2_id, string::utf8(b"Level2"), option::some(level1_id), ctx(scenario));
        create_folder_direct(&mut notebook, level3_id, string::utf8(b"Level3"), option::some(level2_id), ctx(scenario));
        create_folder_direct(&mut notebook, level4_id, string::utf8(b"Level4"), option::some(level3_id), ctx(scenario));
        create_folder_direct(&mut notebook, level5_id, string::utf8(b"Level5"), option::some(level4_id), ctx(scenario));

        // Try to create level 6 folder - should fail with E_MAX_FOLDER_DEPTH
        create_folder_direct(
            &mut notebook,
            level6_id,
            string::utf8(b"Level6"),
            option::some(level5_id),
            test_scenario::ctx(&mut scenario)
        );

        abort 1 // Should not reach here
    }

  
    
    #[test]
    #[expected_failure(abort_code = E_INVALID_AR_TX_ID)]
    fun test_update_note_ar_backup_invalid_id() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        let note_id = @0x300;
        let invalid_ar_tx_id = string::utf8(b"invalid@id");

        // Create a note first
        update_note_direct(
            &mut notebook,
            note_id,
            string::utf8(b"blob_id_123"),
            string::utf8(b"blob_object_123"),
            string::utf8(b"Test Note"),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        // Try to update with invalid Arweave ID - should fail
        update_note_ar_backup_direct(
            &mut notebook,
            note_id,
            invalid_ar_tx_id,
            1234567890u64,
            test_scenario::ctx(&mut scenario)
        );

        abort 1 // Should not reach here
    }

    #[test]
    fun test_note_crud_operations() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        // Create a note
        let note_id = @0x400;
        update_note_direct(
            &mut notebook,
            note_id,
            string::utf8(b"blob_id_123"),
            string::utf8(b"blob_object_123"),
            string::utf8(b"Test Note"),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        // Verify note was created
        assert!(note_contains_id(get_notebook_notes(&notebook), note_id));

        let note = borrow_note(get_notebook_notes(&notebook), note_id);
        assert!(get_note_blob_id(note) == string::utf8(b"blob_id_123"));
        assert!(get_note_title(note) == string::utf8(b"Test Note"));
        assert!(note.created_at == note.updated_at);

        // Update the note
        test_scenario::next_tx(&mut scenario, user);
        update_note_direct(
            &mut notebook,
            note_id,
            string::utf8(b"blob_id_456"),
            string::utf8(b"blob_object_456"),
            string::utf8(b"Updated Note"),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        let updated_note = borrow_note(get_notebook_notes(&notebook), note_id);
        assert!(get_note_blob_id(updated_note) == string::utf8(b"blob_id_456"));
        assert!(get_note_title(updated_note) == string::utf8(b"Updated Note"));
        assert!(updated_note.updated_at > updated_note.created_at);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_folder_operations() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        // Create folders
        let folder1_id = @0x500;
        let folder2_id = @0x501;
        let folder3_id = @0x502;

        create_folder_direct(
            &mut notebook,
            folder1_id,
            string::utf8(b"Folder1"),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        create_folder_direct(
            &mut notebook,
            folder2_id,
            string::utf8(b"Folder2"),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        create_folder_direct(
            &mut notebook,
            folder3_id,
            string::utf8(b"Folder3"),
            option::some(folder1_id),
            test_scenario::ctx(&mut scenario)
        );

        // Verify folders were created
        assert!(folder_contains_id(get_notebook_folders(&notebook), folder1_id));
        assert!(folder_contains_id(get_notebook_folders(&notebook), folder2_id));
        assert!(folder_contains_id(get_notebook_folders(&notebook), folder3_id));

        let folder1 = borrow_folder(get_notebook_folders(&notebook), folder1_id);
        let folder3 = borrow_folder(get_notebook_folders(&notebook), folder3_id);

        assert!(folder3.parent_id == option::some(folder1_id));

        // Test folder reordering
        test_scenario::next_tx(&mut scenario, user);
        reorder_folder_direct(&mut notebook, folder1_id, 100, ctx(scenario));
        reorder_folder_direct(&mut notebook, folder2_id, 200, ctx(scenario));

        let reordered_folder1 = borrow_folder(get_notebook_folders(&notebook), folder1_id);
        let reordered_folder2 = borrow_folder(get_notebook_folders(&notebook), folder2_id);

        assert!(reordered_folder1.sort_order == 100);
        assert!(reordered_folder2.sort_order == 200);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_session_authorization() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();
        let hot_wallet = create_test_hot_wallet();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        let device_fingerprint = string::utf8(b"test_device_123");
        let hot_wallet_address = @0x43;
        let expires_at = 999999999999u64;

        // Create session
        authorize_session_simple(
            &notebook,
            device_fingerprint,
            hot_wallet_address,
            expires_at,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, hot_wallet);
        let session_cap = test_scenario::take_from_sender<SessionCap>(&mut scenario);

        test_scenario::next_tx(&mut scenario, hot_wallet);
        let notebook_shared = test_scenario::take_shared<Notebook>(&mut scenario);

        // Test authorization with valid session
        let auth_address = verify_authorization(&notebook_shared, option::some(&session_cap), ctx(scenario));
        assert!(auth_address == @0x43);

        test_scenario::return_shared(notebook_shared);
        test_scenario::return_shared(notebook);
        test_scenario::return_owned(session_cap, &hot_wallet);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_batch_reorder_folders() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        // Create folders
        let folder1_id = @0x600;
        let folder2_id = @0x601;
        let folder3_id = @0x602;

        create_folder_direct(&mut notebook, folder1_id, string::utf8(b"Folder1"), option::none(), ctx(scenario));
        create_folder_direct(&mut notebook, folder2_id, string::utf8(b"Folder2"), option::none(), ctx(scenario));
        create_folder_direct(&mut notebook, folder3_id, string::utf8(b"Folder3"), option::none(), ctx(scenario));

        // Batch reorder
        test_scenario::next_tx(&mut scenario, user);
        let folder_ids = vector[folder1_id, folder2_id, folder3_id];
        let sort_orders = vector[300u64, 200u64, 100u64];

        batch_reorder_folders_direct(&mut notebook, folder_ids, sort_orders, ctx(scenario));

        // Verify reorder
        let reordered_folder1 = borrow_folder(get_notebook_folders(&notebook), folder1_id);
        let reordered_folder2 = borrow_folder(get_notebook_folders(&notebook), folder2_id);
        let reordered_folder3 = borrow_folder(get_notebook_folders(&notebook), folder3_id);

        assert!(reordered_folder1.sort_order == 300);
        assert!(reordered_folder2.sort_order == 200);
        assert!(reordered_folder3.sort_order == 100);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    // TODO: Fix this test - create_folder_direct and batch_reorder_folders_direct functions don't exist
    /*
    #[test]
    #[expected_failure(abort_code = E_INVALID_BATCH_SIZE)]
    fun test_batch_reorder_mismatched_arrays() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        // Create folders
        let folder1_id = @0x700;
        let folder2_id = @0x701;

        create_folder(&mut notebook, folder1_id, string::utf8(b"Folder1"), option::none(), test_scenario::ctx(&mut scenario));
        create_folder(&mut notebook, folder2_id, string::utf8(b"Folder2"), option::none(), test_scenario::ctx(&mut scenario));

        // Try batch reorder with mismatched array sizes
        test_scenario::next_tx(&mut scenario, user);
        let folder_ids = vector[folder1_id, folder2_id]; // 2 elements
        let sort_orders = vector[100u64]; // 1 element

        batch_reorder_folders(&mut notebook, folder_ids, sort_orders, test_scenario::ctx(&mut scenario));

        abort 1 // Should not reach here
    }
    */

    #[test]
    fun test_note_with_session_cap() {
        let mut scenario = test_scenario::begin(create_test_user());
        let user = create_test_user();
        let hot_wallet = create_test_hot_wallet();

        let (notebook_id, _) = create_test_notebook(&mut scenario);

        test_scenario::next_tx(&mut scenario, user);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        // Create session
        authorize_session_simple(
            &notebook,
            string::utf8(b"test_device"),
            @0x43,
            999999999999u64,
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, hot_wallet);
        let session_cap = test_scenario::take_from_sender<SessionCap>(&mut scenario);

        test_scenario::next_tx(&mut scenario, hot_wallet);
        let mut notebook_shared = test_scenario::take_shared<Notebook>(&mut scenario);

        // Create note using session cap

        let note_id = create_test_id_from_address(@0x800, test_scenario::ctx(&mut scenario));
        update_note_with_session(
            &mut notebook_shared,
            session_cap,
            note_id,
            string::utf8(b"blob_id_session"),
            string::utf8(b"blob_object_session"),
            string::utf8(b"Session Note"),
            option::none(),
            test_scenario::ctx(&mut scenario)
        );

        // Verify note was created
        assert!(note_contains_id(get_notebook_notes(&notebook_shared), note_id));

        let note = borrow_note(get_notebook_notes(&notebook_shared), note_id);
        assert!(get_note_title(note) == string::utf8(b"Session Note"));

        test_scenario::return_shared(notebook_shared);
        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }
}