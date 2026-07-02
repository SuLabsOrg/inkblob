#[test_only]
module inkblob::key_sharing_tests {
    use std::string;
    use std::option;
    use std::vector;
    use sui::test_scenario::{Self, Scenario};
    use sui::object;
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Notebook,
        SharedAccess,
        EncryptionKeyRegistry,
        grant_access,
        revoke_access,
        register_encryption_key,
        get_registered_key,
        get_wrapped_content_key,
        create_test_id_from_address,
        E_INVALID_PUBLIC_KEY,
    };

    /// Permission levels mirrored from notebook::PERMISSION_READ / PERMISSION_WRITE (same
    /// pattern as sharing_tests.move - those constants are module-private).
    const PERMISSION_READ: u8 = 0;
    const PERMISSION_WRITE: u8 = 1;

    /// Builds a 32-byte vector filled with `fill`, standing in for a raw X25519 public key.
    fun make_pubkey(fill: u8): vector<u8> {
        let mut key = vector::empty<u8>();
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut key, fill);
            i = i + 1;
        };
        key
    }

    /// The module `init` function (which shares the single global EncryptionKeyRegistry)
    /// only runs at publish time, which `sui move test` does not simulate for us the way a
    /// real publish transaction would. Tests that need a registry construct one directly via
    /// test_scenario, mirroring how test_utils::create_test_notebook stands in for
    /// create_notebook's shared-object side effects.
    fun create_test_registry(scenario: &mut Scenario): EncryptionKeyRegistry {
        let ctx = test_scenario::ctx(scenario);
        notebook::create_test_registry(ctx)
    }

    // ========== register_encryption_key ==========

    #[test]
    public fun test_register_encryption_key_succeeds() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut registry = create_test_registry(&mut scenario);

        let pubkey = make_pubkey(1);
        register_encryption_key(&mut registry, pubkey, test_scenario::ctx(&mut scenario));

        let stored = get_registered_key(&registry, test_utils::owner());
        assert!(option::is_some(&stored), 0);
        assert!(*option::borrow(&stored) == make_pubkey(1), 1);

        notebook::destroy_test_registry(registry);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_register_encryption_key_idempotent_second_call_wins() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut registry = create_test_registry(&mut scenario);

        register_encryption_key(&mut registry, make_pubkey(1), test_scenario::ctx(&mut scenario));
        // Re-registering with a different key must succeed (not abort) and overwrite.
        register_encryption_key(&mut registry, make_pubkey(2), test_scenario::ctx(&mut scenario));

        let stored = get_registered_key(&registry, test_utils::owner());
        assert!(option::is_some(&stored), 0);
        assert!(*option::borrow(&stored) == make_pubkey(2), 1);

        notebook::destroy_test_registry(registry);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_get_registered_key_none_for_unregistered_address() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let registry = create_test_registry(&mut scenario);

        let stored = get_registered_key(&registry, test_utils::device_1());
        assert!(option::is_none(&stored), 0);

        notebook::destroy_test_registry(registry);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_INVALID_PUBLIC_KEY)]
    public fun test_register_encryption_key_wrong_length_rejected() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut registry = create_test_registry(&mut scenario);

        let bad_key = vector::empty<u8>();
        register_encryption_key(&mut registry, bad_key, test_scenario::ctx(&mut scenario));

        notebook::destroy_test_registry(registry);
        test_scenario::end(scenario);
    }

    // ========== grant_access wrapped_key storage ==========

    #[test]
    public fun test_grant_access_stores_wrapped_key_retrievably() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Key Sharing Grant Test");

        let wrapped_key = make_pubkey(9);
        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_WRITE,
            option::none(),
            wrapped_key,
            test_scenario::ctx(&mut scenario)
        );

        let stored = get_wrapped_content_key(&notebook, test_utils::device_1());
        assert!(option::is_some(&stored), 0);
        assert!(*option::borrow(&stored) == make_pubkey(9), 1);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    public fun test_grant_access_with_empty_wrapped_key_is_valid() {
        // A read-only grant reasonably might not carry a wrapped key yet - an empty
        // vector<u8> must be accepted (not aborted on) as a valid "no key yet" value.
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Key Sharing Empty Key Test");

        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_READ,
            option::none(),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        let stored = get_wrapped_content_key(&notebook, test_utils::device_1());
        assert!(option::is_some(&stored), 0);
        assert!(vector::length(option::borrow(&stored)) == 0, 1);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    // ========== revoke_access cleanup ==========

    #[test]
    public fun test_revoke_access_removes_wrapped_key() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Key Sharing Revoke Test");

        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_WRITE,
            option::none(),
            make_pubkey(7),
            test_scenario::ctx(&mut scenario)
        );

        // Sanity check: the wrapped key is actually there before revoking.
        let before = get_wrapped_content_key(&notebook, test_utils::device_1());
        assert!(option::is_some(&before), 0);

        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let shared_access = test_scenario::take_from_address<SharedAccess>(&scenario, test_utils::device_1());
        revoke_access(&mut notebook, shared_access, test_scenario::ctx(&mut scenario));

        let after = get_wrapped_content_key(&notebook, test_utils::device_1());
        assert!(option::is_none(&after), 1);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }
}
