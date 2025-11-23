#[test_only]
module inkblob::notebook_lifecycle_tests {
    use std::string;
    use sui::test_scenario;
    use inkblob::test_utils;
    use inkblob::notebook::{
        Notebook,
        NotebookRegistry,
        create_notebook,
        create_additional_notebook,
        switch_active_notebook,
        get_registry_owner,
        get_registry_active_notebook,
        get_notebook_owner,
    };

    // ========== Core Test Cases ==========

    /// Test 1: Create initial notebook
    #[test]
    public fun test_create_notebook() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Create notebook
        create_notebook(string::utf8(b"My Notebook"), ctx);

        // Verify creation
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let registry = test_scenario::take_from_sender<NotebookRegistry>(&scenario);
        let notebook = test_scenario::take_shared<Notebook>(&scenario);

        // Basic assertions
        assert!(get_notebook_owner(&notebook) == test_utils::owner(), 1);
        assert!(get_registry_owner(&registry) == test_utils::owner(), 1);
        assert!(get_registry_active_notebook(&registry) == string::utf8(b"My Notebook"), 0);

        test_scenario::return_shared(notebook);
        test_scenario::return_to_sender(&scenario, registry);
        test_scenario::end(scenario);
    }

    /// Test 2: Create additional notebook
    #[test]
    public fun test_create_additional_notebook() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Create first notebook
        create_notebook(string::utf8(b"Primary"), ctx);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let mut registry = test_scenario::take_from_sender<NotebookRegistry>(&scenario);
        let notebook1 = test_scenario::take_shared<Notebook>(&scenario);

        // Create second notebook
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx2 = test_scenario::ctx(&mut scenario);
        create_additional_notebook(string::utf8(b"Secondary"), &mut registry, ctx2);

        // Verify active notebook switched
        assert!(get_registry_active_notebook(&registry) == string::utf8(b"Secondary"), 0);

        test_scenario::return_shared(notebook1);
        test_scenario::return_to_sender(&scenario, registry);
        test_scenario::end(scenario);
    }

    /// Test 3: Switch active notebook
    #[test]
    public fun test_switch_active_notebook() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Create first notebook
        create_notebook(string::utf8(b"Notebook1"), ctx);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let mut registry = test_scenario::take_from_sender<NotebookRegistry>(&scenario);
        let notebook1 = test_scenario::take_shared<Notebook>(&scenario);

        // Create second notebook
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx2 = test_scenario::ctx(&mut scenario);
        create_additional_notebook(string::utf8(b"Notebook2"), &mut registry, ctx2);

        // Switch back to first notebook
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx3 = test_scenario::ctx(&mut scenario);
        switch_active_notebook(&mut registry, string::utf8(b"Notebook1"), ctx3);

        // Verify switch
        assert!(get_registry_active_notebook(&registry) == string::utf8(b"Notebook1"), 0);

        test_scenario::return_shared(notebook1);
        test_scenario::return_to_sender(&scenario, registry);
        test_scenario::end(scenario);
    }

    /// Test 4: Multiple notebooks with basic operations
    #[test]
    public fun test_multiple_notebooks() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Create initial notebook
        create_notebook(string::utf8(b"Initial"), ctx);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let mut registry = test_scenario::take_from_sender<NotebookRegistry>(&scenario);
        let notebook1 = test_scenario::take_shared<Notebook>(&scenario);

        // Create 2 more notebooks
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx1 = test_scenario::ctx(&mut scenario);
        create_additional_notebook(string::utf8(b"Notebook_1"), &mut registry, ctx1);

        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx2 = test_scenario::ctx(&mut scenario);
        create_additional_notebook(string::utf8(b"Notebook_2"), &mut registry, ctx2);

        // Verify active notebook is last created
        assert!(get_registry_active_notebook(&registry) == string::utf8(b"Notebook_2"), 0);

        // Switch back to initial
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx_switch = test_scenario::ctx(&mut scenario);
        switch_active_notebook(&mut registry, string::utf8(b"Initial"), ctx_switch);
        assert!(get_registry_active_notebook(&registry) == string::utf8(b"Initial"), 0);

        test_scenario::return_shared(notebook1);
        test_scenario::return_to_sender(&scenario, registry);
        test_scenario::end(scenario);
    }

    // ========== Negative Test Cases ==========

    /// Test 5: Switch to non-existent notebook
    #[test]
    #[expected_failure(abort_code = 20)]  // E_NOTEBOOK_NOT_FOUND
    public fun test_switch_nonexistent_notebook() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Create notebook
        create_notebook(string::utf8(b"Existing"), ctx);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let mut registry = test_scenario::take_from_sender<NotebookRegistry>(&scenario);
        let notebook = test_scenario::take_shared<Notebook>(&scenario);

        // Try to switch to non-existent notebook
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx_fail = test_scenario::ctx(&mut scenario);
        switch_active_notebook(&mut registry, string::utf8(b"Nonexistent"), ctx_fail);

        test_scenario::return_shared(notebook);
        test_scenario::return_to_sender(&scenario, registry);
        test_scenario::end(scenario);
    }

    /// Test 6: Duplicate notebook name
    #[test]
    #[expected_failure(abort_code = 11)]  // E_NOTEBOOK_EXISTS
    public fun test_duplicate_notebook_name() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let ctx = test_scenario::ctx(&mut scenario);

        // Create first notebook
        create_notebook(string::utf8(b"Duplicate"), ctx);
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let mut registry = test_scenario::take_from_sender<NotebookRegistry>(&scenario);
        let notebook1 = test_scenario::take_shared<Notebook>(&scenario);

        // Try to create duplicate
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let ctx_fail = test_scenario::ctx(&mut scenario);
        create_additional_notebook(string::utf8(b"Duplicate"), &mut registry, ctx_fail);

        test_scenario::return_shared(notebook1);
        test_scenario::return_to_sender(&scenario, registry);
        test_scenario::end(scenario);
    }
}