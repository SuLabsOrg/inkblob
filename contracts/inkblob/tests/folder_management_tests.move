#[test_only]
module inkblob::folder_management_tests {
    use std::string;
    use std::option;
    use sui::test_scenario::{Self, Scenario};
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Notebook,
        create_folder,
        delete_folder,
        restore_folder,
        create_test_id_from_address,
        E_NOT_OWNER,
        E_FOLDER_NOT_FOUND,
    };

    /// Creates a folder in `notebook` and returns its freshly-generated ID.
    fun create_test_folder(scenario: &mut Scenario, notebook: &mut Notebook): sui::object::ID {
        let ctx = test_scenario::ctx(scenario);
        let folder_id = create_test_id_from_address(test_utils::owner(), ctx);
        create_folder(
            notebook,
            folder_id,
            string::utf8(b"encrypted_name"),
            option::none(),
            ctx
        );
        folder_id
    }

    #[test]
    public fun test_delete_folder_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Delete Folder Test");

        let folder_id = create_test_folder(&mut scenario, &mut notebook);

        delete_folder(&mut notebook, folder_id, test_scenario::ctx(&mut scenario));

        let folder = notebook::borrow_folder(notebook::get_notebook_folders(&notebook), folder_id);
        assert!(notebook::folder_is_deleted(folder), 0);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_restore_folder_success() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Restore Folder Test");

        let folder_id = create_test_folder(&mut scenario, &mut notebook);
        delete_folder(&mut notebook, folder_id, test_scenario::ctx(&mut scenario));
        restore_folder(&mut notebook, folder_id, test_scenario::ctx(&mut scenario));

        let folder = notebook::borrow_folder(notebook::get_notebook_folders(&notebook), folder_id);
        assert!(!notebook::folder_is_deleted(folder), 0);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_FOLDER_NOT_FOUND)]
    public fun test_restore_folder_not_found_fail() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Missing Folder Test");

        let bogus_id = create_test_id_from_address(test_utils::owner(), test_scenario::ctx(&mut scenario));
        restore_folder(&mut notebook, bogus_id, test_scenario::ctx(&mut scenario));

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_restore_folder_unauthorized_fail() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Unauthorized Restore Test");

        let folder_id = create_test_folder(&mut scenario, &mut notebook);
        delete_folder(&mut notebook, folder_id, test_scenario::ctx(&mut scenario));

        test_scenario::next_tx(&mut scenario, test_utils::attacker());
        restore_folder(&mut notebook, folder_id, test_scenario::ctx(&mut scenario));

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }
}
