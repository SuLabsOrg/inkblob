#[test_only]
module inkblob::sharing_tests {
    use std::string;
    use std::option;
    use std::vector;
    use sui::test_scenario::{Self, Scenario};
    use inkblob::test_utils;
    use inkblob::notebook::{
        Self,
        Notebook,
        SharedAccess,
        grant_access,
        revoke_access,
        create_folder,
        create_test_id_from_address,
        E_NOT_OWNER,
    };

    /// Permission levels mirrored from notebook::PERMISSION_READ / PERMISSION_WRITE.
    /// Those constants are module-private, so tests use their well-known raw values
    /// directly (0 = read, 1 = write), same pattern wal_rebate_tests.move uses for
    /// WAL_STORAGE_FEE_PER_MB-derived amounts rather than importing private constants.
    const PERMISSION_READ: u8 = 0;
    const PERMISSION_WRITE: u8 = 1;

    /// Creates a folder in `notebook` and returns its freshly-generated ID. Used as the
    /// stand-in "write-gated function" a grantee should/shouldn't be able to call.
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

    // ========== (a) Owner grants write access; grantee can then write ==========

    #[test]
    public fun test_write_grantee_can_create_folder() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Sharing Grant Write Test");

        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_WRITE,
            option::none(),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        // The grantee (a genuinely different person/address, not the owner) can now call a
        // write-gated function that would previously have aborted with E_NOT_OWNER.
        test_scenario::next_tx(&mut scenario, test_utils::device_1());
        let folder_id = create_test_folder(&mut scenario, &mut notebook);

        let folder = notebook::borrow_folder(notebook::get_notebook_folders(&notebook), folder_id);
        assert!(!notebook::folder_is_deleted(folder), 0);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    // ========== (b) Write-grantee cannot call grant_access or revoke_access ==========

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_write_grantee_cannot_grant_access() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Sharing Grantee Cannot Grant Test");

        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_WRITE,
            option::none(),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        // The write-grantee must NOT be able to grant access to anyone else (including
        // themselves granting a third party) - only the true owner may call grant_access.
        test_scenario::next_tx(&mut scenario, test_utils::device_1());
        grant_access(
            &mut notebook,
            test_utils::device_2(),
            PERMISSION_WRITE,
            option::none(),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_write_grantee_cannot_revoke_access() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Sharing Grantee Cannot Revoke Test");

        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_WRITE,
            option::none(),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, test_utils::device_1());
        let shared_access = test_scenario::take_from_sender<SharedAccess>(&scenario);

        // The grantee attempting revoke_access (the OWNER-ONLY path) on their own
        // capability must fail - self-revoke is only possible via leave_shared_notebook,
        // a deliberately separate function.
        revoke_access(&mut notebook, shared_access, test_scenario::ctx(&mut scenario));

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    // ========== (c) Read-only grantee cannot call a write-gated function ==========

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_read_only_grantee_cannot_create_folder() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Sharing Read Only Test");

        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_READ,
            option::none(),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        test_scenario::next_tx(&mut scenario, test_utils::device_1());
        let _folder_id = create_test_folder(&mut scenario, &mut notebook);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    // ========== (d) revoke_access removes access; subsequent write attempt fails ==========

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_revoked_grantee_cannot_write_afterwards() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Sharing Revoke Test");

        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_WRITE,
            option::none(),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        // Confirm access actually works before revocation (sanity check for the test itself).
        test_scenario::next_tx(&mut scenario, test_utils::device_1());
        let _folder_id = create_test_folder(&mut scenario, &mut notebook);

        // Owner revokes the grantee's access. The SharedAccess object was transferred to
        // the grantee (device_1), not the owner, so it must be fetched from that address
        // even though the owner is the one submitting this transaction.
        test_scenario::next_tx(&mut scenario, test_utils::owner());
        let shared_access = test_scenario::take_from_address<SharedAccess>(&scenario, test_utils::device_1());
        revoke_access(&mut notebook, shared_access, test_scenario::ctx(&mut scenario));

        // The former grantee's subsequent write attempt must now fail exactly as if they
        // had never been granted access at all.
        test_scenario::next_tx(&mut scenario, test_utils::device_1());
        let _second_folder_id = create_test_folder(&mut scenario, &mut notebook);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    // ========== (e) Regression: an unrelated third party is still rejected as before ==========

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_unrelated_stranger_still_rejected() {
        // Plain regression test with no SharedAccess involved at all - proves the widened
        // assert (notebook.owner == sender || has_write_access(...)) did not accidentally
        // become more permissive than intended for a true stranger who was never granted
        // anything.
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Sharing Stranger Test");

        test_scenario::next_tx(&mut scenario, test_utils::attacker());
        let _folder_id = create_test_folder(&mut scenario, &mut notebook);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }

    // ========== (f) Expired access is rejected as if no access existed ==========

    #[test]
    #[expected_failure(abort_code = E_NOT_OWNER)]
    public fun test_expired_write_access_rejected() {
        let mut scenario = test_utils::create_scenario(test_utils::owner());
        let mut notebook = test_utils::create_test_notebook(&mut scenario, b"Sharing Expiry Test");

        // A fresh test_scenario starts at epoch_timestamp_ms == 0. Grant with a small
        // positive expiry (1ms), then advance the scenario's clock past it via
        // later_epoch - at that point the grant must be treated as if it never existed.
        grant_access(
            &mut notebook,
            test_utils::device_1(),
            PERMISSION_WRITE,
            option::some(1),
            vector::empty<u8>(),
            test_scenario::ctx(&mut scenario)
        );

        // Advance the scenario clock well past the grant's 1ms expiry.
        test_scenario::later_epoch(&mut scenario, 1000, test_utils::device_1());

        let _folder_id = create_test_folder(&mut scenario, &mut notebook);

        test_scenario::return_shared(notebook);
        test_scenario::end(scenario);
    }
}
