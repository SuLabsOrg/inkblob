#[test_only]
module inkblob::simple_tests {
    use std::string;
    use sui::test_scenario::{Self, Scenario};
    use inkblob::notebook::{
        Notebook,
        NotebookRegistry,
        create_notebook,
        get_notebook_id,
        get_registry_id,
    };

    #[test]
    fun test_simple_notebook_creation() {
        let mut scenario = test_scenario::begin(@0x42);
        let sender = test_scenario::sender(&scenario);

        test_scenario::next_tx(&mut scenario, sender);

        let notebook_name = string::utf8(b"Simple Test");
        create_notebook(notebook_name, test_scenario::ctx(&mut scenario));

        test_scenario::next_tx(&mut scenario, sender);
        let registry = test_scenario::take_from_sender<NotebookRegistry>(&scenario);
        let notebook = test_scenario::take_shared<Notebook>(&scenario);

        // Basic checks
        let notebook_id = get_notebook_id(&notebook);
        let registry_id = get_registry_id(&registry);

        // Just verify the IDs are different (basic sanity check)
        assert!(notebook_id != registry_id);

        test_scenario::return_shared(notebook);
        test_scenario::return_to_sender(&scenario, registry);
        test_scenario::end(scenario);
    }
}