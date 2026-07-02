#[allow(unused_field, unused_use, unused_const, duplicate_alias, lint(public_entry))]
module inkblob::notebook {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::table::{Self, Table};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use std::string;
    use std::option::{Self, Option};
    use std::vector;
    use wal::wal::WAL;

    
    // ========== Error Constants ==========

    const E_NOT_OWNER: u64 = 1;
    const E_INVALID_EXPIRATION: u64 = 2;
    const E_SESSION_EXPIRED: u64 = 3;
    const E_WRONG_EPHEMERAL: u64 = 4;  // Deprecated, kept for compatibility
    const E_WRONG_HOT_WALLET: u64 = 5;
    const E_WRONG_NOTEBOOK: u64 = 6;
    const E_NOTE_NOT_FOUND: u64 = 7;
    const E_FOLDER_NOT_FOUND: u64 = 8;
    const E_PARENT_NOT_FOUND: u64 = 9;
    const E_INVALID_AR_TX_ID: u64 = 10;
    const E_NOTEBOOK_EXISTS: u64 = 11;
    const E_NOTEBOOK_ALREADY_EXISTS: u64 = 12;  // Duplicate, can be removed
    const E_INSUFFICIENT_BALANCE: u64 = 13;
    const E_DEVICE_CONFLICT: u64 = 14;
    const E_INVALID_BATCH_SIZE: u64 = 15;
    const E_SORT_ORDER_CONFLICT: u64 = 16;

    // SECURITY FIX: Added new error codes
    const E_MAX_FOLDER_DEPTH: u64 = 17;      // Folder depth exceeds 5 levels
    const E_CIRCULAR_REFERENCE: u64 = 18;    // Circular folder reference detected
    const E_PARENT_DELETED: u64 = 19;        // Parent folder is deleted
    const E_NOTEBOOK_NOT_FOUND: u64 = 20;    // Notebook does not exist in registry

    // WAL token related errors
    const E_INSUFFICIENT_WAL_BALANCE: u64 = 21;  // Insufficient WAL token balance for storage
    const E_INVALID_WAL_PAYMENT: u64 = 22;       // Invalid WAL token payment
    const E_WAL_TREASURY_NOT_FOUND: u64 = 23;   // WAL treasury not found

    // Concurrency control errors
    const E_VERSION_MISMATCH: u64 = 24;  // expected_updated_at did not match the note's current updated_at (concurrent edit conflict)

    // Note nesting (page-in-page) errors
    const E_MAX_NOTE_DEPTH: u64 = 25;          // Note depth exceeds max nesting level
    const E_NOTE_CIRCULAR_REFERENCE: u64 = 26; // Circular note parent reference detected
    const E_PARENT_NOTE_NOT_FOUND: u64 = 27;   // Parent note does not exist
    const E_PARENT_NOTE_DELETED: u64 = 28;     // Parent note is deleted

    // WAL storage rebate escrow errors
    const E_WRONG_RESERVE: u64 = 29;           // WalFeeReserve does not belong to this notebook
    const E_REBATE_ALREADY_CLAIMED: u64 = 30;  // Rebate for this note has already been claimed
    const E_RESERVE_INSUFFICIENT_BALANCE: u64 = 31; // Reserve balance too low to pay out rebate (underflow guard)
    const E_NO_WAL_PAID: u64 = 32;             // Note has no recorded WAL payment to rebate

    // Notebook sharing / collaboration errors
    const E_INVALID_PERMISSION: u64 = 33;      // permission must be PERMISSION_READ (0) or PERMISSION_WRITE (1)

    // Envelope encryption / key-sharing errors
    const E_INVALID_PUBLIC_KEY: u64 = 34;      // registered public key must be exactly 32 raw bytes (X25519)

    // WAL storage fee constants
    const WAL_STORAGE_FEE_PER_MB: u64 = 1000000;  // 1 WAL token per MB per month
    const WAL_MIN_PAYMENT: u64 = 100000;          // Minimum 0.1 WAL payment
    const WAL_FROST_DIVISOR: u64 = 1000000000;    // 9 decimals for WAL token

    // Maximum nesting depth shared by folders and notes (REQ-FOLDER-003 parity)
    const MAX_NESTING_DEPTH: u64 = 5;

    // Notebook sharing / collaboration permission levels (stored in Notebook.permissions
    // and on the SharedAccess capability object issued to the grantee).
    const PERMISSION_READ: u8 = 0;
    const PERMISSION_WRITE: u8 = 1;

    // Sentinel used in the Notebook.permissions table value to mean "no expiry" (grant
    // never expires until explicitly revoked), avoiding a separate Option in the table
    // value struct. Deliberately u64::MAX rather than 0: epoch_timestamp_ms is 0 at the
    // very start of a chain/test scenario, so 0 is a real, reachable timestamp value and
    // cannot safely double as the "never expires" sentinel (a caller passing
    // expires_at = option::some(0), i.e. "already expired", must not be silently
    // reinterpreted as "never expires"). u64::MAX is never a real wall-clock timestamp.
    const NO_EXPIRY: u64 = 18446744073709551615;

    // ========== Structs ==========

    /// Shared object - the main notebook containing all notes and folders
    public struct Notebook has key {
        id: UID,
        owner: address,
        notes: Table<ID, Note>,
        folders: Table<ID, Folder>,
        // Collaboration: address -> AccessGrant, kept in lockstep with the SharedAccess
        // capability objects issued by grant_access / revoked by revoke_access. Lets every
        // mutation function do an O(1) has_write_access/has_read_access lookup without
        // requiring the caller to present the SharedAccess object itself.
        permissions: Table<address, AccessGrant>,
        // Envelope encryption: address -> the notebook's content-encryption key, wrapped
        // (encrypted) to that grantee's registered public key (see EncryptionKeyRegistry /
        // register_encryption_key). Kept in lockstep with `permissions` by grant_access /
        // revoke_access / leave_shared_notebook, exactly like that table. An empty
        // vector<u8> is a valid value meaning "no wrapped key available yet" (e.g. a
        // read-only grant, or a grant made before the owner computed the wrap) - this
        // table stores ONLY ciphertext produced client-side; the contract never sees, and
        // has no way to derive, any actual content-encryption key material.
        wrapped_content_keys: Table<address, vector<u8>>,
    }

    /// Table value paired with each granted address: the permission level and an optional
    /// expiry (expires_at == NO_EXPIRY sentinel means the grant does not expire on its own
    /// and lasts until an explicit revoke_access / leave_shared_notebook call).
    public struct AccessGrant has store, drop {
        permission: u8,
        expires_at: u64,
    }

    /// Owned object - registry for cross-device discovery with multi-notebook support
    public struct NotebookRegistry has key {
        id: UID,
        owner: address,
        notebooks: Table<string::String, ID>,  // name -> notebook_id mapping for multi-notebook support
        active_notebook: string::String,  // Currently active notebook name
        created_at: u64,
    }

    /// Owned object - device-specific session capability with auto-funding.
    ///
    /// SessionCap vs SharedAccess (do not conflate these - they answer different questions):
    /// SessionCap proves "this is the SAME owner, authenticating from a different DEVICE"
    /// (a hot wallet the owner themselves funded and controls). SharedAccess proves "this is
    /// a genuinely DIFFERENT PERSON the owner has deliberately delegated some access to".
    /// A SessionCap's hot_wallet_address is expected to act with full owner-equivalent
    /// authority (see update_note_with_session); a SharedAccess grantee's authority is
    /// capped at whatever permission the owner chose (read or write) and can be revoked by
    /// the owner at any time. Never write a helper that treats "holds some object whose
    /// notebook_id matches" as sufficient proof on its own without also checking WHICH kind
    /// of object it is and what authority that specific kind is meant to carry.
    public struct SessionCap has key {
        id: UID,
        notebook_id: ID,
        device_fingerprint: string::String,  // Device identifier for multi-device support
        hot_wallet_address: address,  // Device-specific hot wallet
        expires_at: u64,
        created_at: u64,
        auto_funded: bool,  // Whether auto-funding was applied
    }

    /// Owned object - proof of delegated access to a notebook, granted by the owner to a
    /// different person (the grantee). Transferred to `grantee` by grant_access, and
    /// consumed/deleted by revoke_access (owner-initiated) or leave_shared_notebook
    /// (grantee-initiated self-revoke). The actual authorization check performed by every
    /// mutation function does NOT require presenting this object back on-chain - it consults
    /// the Notebook.permissions table (kept in lockstep with this object's lifecycle) via
    /// has_write_access / has_read_access instead. This object exists primarily so the
    /// grantee has visible, ownable, revokable proof of what they were granted (permission
    /// level, who granted it, and any expiry), and as the vehicle grant_access/revoke_access
    /// use to create/destroy the corresponding permissions-table entry.
    public struct SharedAccess has key {
        id: UID,
        notebook_id: ID,
        grantee: address,
        permission: u8,
        granted_by: address,
        expires_at: option::Option<u64>,
    }

    /// Note metadata stored in Table with Walrus blob object support
    public struct Note has store, drop {
        id: ID,
        blob_id: string::String,           // Walrus blob ID for content retrieval
        blob_object_id: string::String,    // Sui object ID for blob renewal/management
        encrypted_title: string::String,
        folder_id: option::Option<ID>,
        parent_note_id: option::Option<ID>,
        created_at: u64,
        updated_at: u64,
        is_deleted: bool,
        ar_backup_id: option::Option<string::String>,
        ar_backup_version: option::Option<u64>,
        wal_paid: u64,          // Cumulative real WAL (frost) deposited into the WalFeeReserve for this note's storage
        rebate_claimed: bool,   // Guards against claiming the WAL storage rebate more than once
    }

    /// Folder metadata stored in Table with custom ordering support
    public struct Folder has store, drop {
        id: ID,
        encrypted_name: string::String,
        parent_id: option::Option<ID>,
        sort_order: u64,  // User-defined custom ordering (0 for auto-assigned)
        created_at: u64,
        updated_at: u64,
        is_deleted: bool,
    }

    /// Shared object - escrow/reserve for WAL storage fees paid against a single notebook.
    /// The WAL token (see wal::wal) has a sealed TreasuryCap and no public mint function,
    /// so a real rebate cannot be minted on demand - instead, WAL storage fees are deposited
    /// here (rather than burned) when a note's content is saved, and later paid back out of
    /// this same balance when the corresponding rebate is claimed. One reserve is created and
    /// shared per-notebook (created alongside the Notebook itself in create_notebook /
    /// create_additional_notebook) so every notebook has a reserve to deposit into and
    /// withdraw from.
    public struct WalFeeReserve has key {
        id: UID,
        notebook_id: ID,
        balance: Balance<WAL>,
    }

    /// Shared object - a single global registry mapping each address to the raw public key
    /// (e.g. a 32-byte X25519 public key) it has published for envelope-encryption purposes.
    /// A notebook owner looks up a grantee's entry here to encrypt ("wrap") a copy of the
    /// notebook's content-encryption key specifically for that grantee (see
    /// register_encryption_key / grant_access's wrapped_key parameter /
    /// Notebook.wrapped_content_keys). This registry only ever stores PUBLIC key material -
    /// it has no bearing whatsoever on, and cannot affect, the existing owner-side
    /// deriveEncryptionKey flow or any non-extractable AES-GCM CryptoKey already in use.
    /// Created once automatically at publish time by this module's `init` function.
    public struct EncryptionKeyRegistry has key {
        id: UID,
        keys: Table<address, vector<u8>>,
    }

    // ========== Events ==========

    public struct NotebookCreated has copy, drop {
        notebook_id: ID,
        owner: address,
        registry_id: ID,
    }

    public struct NoteUpdated has copy, drop {
        notebook_id: ID,
        note_id: ID,
        blob_id: string::String,
        folder_id: option::Option<ID>,
        operator: address,
    }

    public struct FolderCreated has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        parent_id: option::Option<ID>,
        operator: address,
    }

    public struct FolderUpdated has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        operator: address,
    }

    public struct FolderDeleted has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        operator: address,
    }

    public struct FolderRestored has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        operator: address,
    }

    public struct NoteDeleted has copy, drop {
        notebook_id: ID,
        note_id: ID,
        operator: address,
    }

    public struct NoteRestored has copy, drop {
        notebook_id: ID,
        note_id: ID,
        operator: address,
    }

    public struct FolderReordered has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        old_sort_order: u64,
        new_sort_order: u64,
        operator: address,
    }

    public struct FoldersBatchReordered has copy, drop {
        notebook_id: ID,
        folder_count: u64,
        operator: address,
    }

    public struct NoteMoved has copy, drop {
        notebook_id: ID,
        note_id: ID,
        old_folder_id: option::Option<ID>,
        new_folder_id: option::Option<ID>,
        operator: address,
    }

    public struct SessionAuthorized has copy, drop {
        notebook_id: ID,
        session_cap_id: ID,
        hot_wallet_address: address,
        device_fingerprint: string::String,
        expires_at: u64,
        owner: address,
        sui_funded: u64,
        wal_funded: u64,
    }

    public struct SessionRevoked has copy, drop {
        notebook_id: ID,
        session_cap_id: ID,
        owner: address,
    }

    public struct ArweaveBackupRecorded has copy, drop {
        notebook_id: ID,
        note_id: ID,
        ar_tx_id: string::String,
        backup_timestamp: u64,
        operator: address,
    }

    /// WAL token payment event for blob storage
    public struct WalStoragePayment has copy, drop {
        notebook_id: ID,
        note_id: ID,
        blob_id: string::String,
        payment_amount: u64,
        transaction_timestamp: u64,
        operator: address,
    }

    /// WAL token storage fee rebate event
    public struct WalStorageRebate has copy, drop {
        notebook_id: ID,
        note_id: ID,
        blob_id: string::String,
        rebate_amount: u64,
        rebate_timestamp: u64,
        operator: address,
    }

    /// Emitted once per notebook when its WalFeeReserve escrow is created
    public struct WalFeeReserveCreated has copy, drop {
        notebook_id: ID,
        reserve_id: ID,
    }

    /// Emitted when the owner grants a SharedAccess capability to another address.
    public struct AccessGranted has copy, drop {
        notebook_id: ID,
        shared_access_id: ID,
        grantee: address,
        permission: u8,
        granted_by: address,
        expires_at: option::Option<u64>,
    }

    /// Emitted when access is revoked, either by the owner (revoke_access) or by the
    /// grantee themselves (leave_shared_notebook).
    public struct AccessRevoked has copy, drop {
        notebook_id: ID,
        shared_access_id: ID,
        grantee: address,
        revoked_by: address,
    }

    // ========== Helper Functions ==========

    // Helper functions will be implemented using TDD methodology
    // verify_authorization()

    /// Calculate folder depth to enforce maximum nesting limit (REQ-FOLDER-003)
    /// SECURITY: Prevents DoS attacks via deeply nested folder structures
    public fun calculate_folder_depth(
        folders: &Table<ID, Folder>,
        folder_id: ID
    ): u64 {
        let mut depth = 0u64;
        let mut current_id = folder_id;

        // Traverse up to parent until root or max depth reached
        // Safety limit: 10 to prevent infinite loops in case of circular refs
        while (depth < 10) {
            if (!table::contains(folders, current_id)) {
                break // Parent not found, treat as root
            };

            let current_folder = table::borrow(folders, current_id);

            if (option::is_none(&current_folder.parent_id)) {
                break // Reached root
            };

            current_id = *option::borrow(&current_folder.parent_id);
            depth = depth + 1;
        };

        depth
    }

    /// Check if setting parent_id would create a circular reference
    /// SECURITY: Prevents infinite loops in folder tree traversal
    public fun would_create_cycle(
        folders: &Table<ID, Folder>,
        folder_id: ID,
        proposed_parent_id: ID
    ): bool {
        // If proposed parent is the folder itself, that's a direct cycle
        if (folder_id == proposed_parent_id) {
            return true
        };

        // Traverse up from proposed parent to check if we reach folder_id
        let mut current_id = proposed_parent_id;
        let mut depth = 0u64;

        while (depth < 10) { // Safety limit to prevent infinite loops
            if (!table::contains(folders, current_id)) {
                break // Parent not found, no cycle possible
            };

            let current_folder = table::borrow(folders, current_id);

            if (option::is_none(&current_folder.parent_id)) {
                break // Reached root without finding cycle
            };

            current_id = *option::borrow(&current_folder.parent_id);

            // If we reached the original folder, we found a cycle
            if (current_id == folder_id) {
                return true
            };

            depth = depth + 1;
        };

        false
    }

    /// Calculate note depth to enforce maximum nesting limit (mirrors calculate_folder_depth)
    /// SECURITY: Prevents DoS attacks via deeply nested note (page-in-page) structures
    public fun calculate_note_depth(
        notes: &Table<ID, Note>,
        note_id: ID
    ): u64 {
        let mut depth = 0u64;
        let mut current_id = note_id;

        // Traverse up to parent until root or max depth reached
        // Safety limit: 10 to prevent infinite loops in case of circular refs
        while (depth < 10) {
            if (!table::contains(notes, current_id)) {
                break // Parent not found, treat as root
            };

            let current_note = table::borrow(notes, current_id);

            if (option::is_none(&current_note.parent_note_id)) {
                break // Reached root
            };

            current_id = *option::borrow(&current_note.parent_note_id);
            depth = depth + 1;
        };

        depth
    }

    /// Check if setting parent_note_id would create a circular reference
    /// SECURITY: Prevents infinite loops in note tree traversal (mirrors would_create_cycle)
    public fun would_create_note_cycle(
        notes: &Table<ID, Note>,
        note_id: ID,
        proposed_parent_id: ID
    ): bool {
        // If proposed parent is the note itself, that's a direct cycle
        if (note_id == proposed_parent_id) {
            return true
        };

        // Traverse up from proposed parent to check if we reach note_id
        let mut current_id = proposed_parent_id;
        let mut depth = 0u64;

        while (depth < 10) { // Safety limit to prevent infinite loops
            if (!table::contains(notes, current_id)) {
                break // Parent not found, no cycle possible
            };

            let current_note = table::borrow(notes, current_id);

            if (option::is_none(&current_note.parent_note_id)) {
                break // Reached root without finding cycle
            };

            current_id = *option::borrow(&current_note.parent_note_id);

            // If we reached the original note, we found a cycle
            if (current_id == note_id) {
                return true
            };

            depth = depth + 1;
        };

        false
    }

    /// Validate Arweave transaction ID format
    /// SECURITY: Prevents storing invalid Arweave IDs that would break restore functionality
    /// Format: 43 characters, base64url alphabet [A-Za-z0-9\-_]
    public fun is_valid_arweave_tx_id(tx_id: &string::String): bool {
        let bytes = string::as_bytes(tx_id);
        let len = vector::length(bytes);

        // Must be exactly 43 characters
        if (len != 43) {
            return false
        };

        // Check each character is in base64url alphabet
        let mut i = 0;
        while (i < len) {
            let char = *vector::borrow(bytes, i);

            // Allow: A-Z (65-90), a-z (97-122), 0-9 (48-57), hyphen (45), underscore (95)
            if (!(char >= 65 && char <= 90) && // A-Z
                !(char >= 97 && char <= 122) && // a-z
                !(char >= 48 && char <= 57) && // 0-9
                char != 45 && // -
                char != 95) { // _
                return false
            };

            i = i + 1;
        };

        true
    }

    /// Verify authorization via SessionCap or direct ownership with device support
    public fun verify_authorization(
        notebook: &Notebook,
        session_cap: &option::Option<SessionCap>,
        ctx: &TxContext
    ): address {
        let sender = tx_context::sender(ctx);

        if (option::is_some(session_cap)) {
            let cap = option::borrow(session_cap);

            // Verify session cap belongs to this notebook
            assert!(cap.notebook_id == object::uid_to_inner(&notebook.id), E_WRONG_NOTEBOOK);

            // Verify session cap is not expired
            let now = tx_context::epoch_timestamp_ms(ctx);
            assert!(cap.expires_at > now, E_SESSION_EXPIRED);

            // Verify sender is the hot wallet address
            assert!(cap.hot_wallet_address == sender, E_WRONG_HOT_WALLET);

            sender
        } else {
            // Direct ownership check
            assert!(notebook.owner == sender, E_NOT_OWNER);
            sender
        }
    }

    // ========== Notebook Sharing / Collaboration Helper Functions ==========

    /// True if `addr` currently has an unexpired grant in `notebook.permissions` whose
    /// permission level is at least `min_permission` (PERMISSION_WRITE implies read too,
    /// so a write grant satisfies a read check). `now` is the caller's current epoch
    /// timestamp (tx_context::epoch_timestamp_ms) - not threaded through as a bare `ctx`
    /// param here so this stays a pure, easily-testable function of its inputs.
    fun has_access_at_least(notebook: &Notebook, addr: address, min_permission: u8, now: u64): bool {
        if (!table::contains(&notebook.permissions, addr)) {
            return false
        };
        let grant = table::borrow(&notebook.permissions, addr);
        if (grant.expires_at != NO_EXPIRY && grant.expires_at <= now) {
            // Expired grant: treated exactly as if no access existed at all.
            return false
        };
        grant.permission >= min_permission
    }

    /// True if `addr` holds a current, unexpired WRITE grant on `notebook`. Used to widen
    /// the existing owner-only asserts across mutation functions so a write-grantee can
    /// perform the same content mutations the owner can - see grant_access/revoke_access
    /// for how entries are added/removed from notebook.permissions.
    public fun has_write_access(notebook: &Notebook, addr: address, ctx: &TxContext): bool {
        has_access_at_least(notebook, addr, PERMISSION_WRITE, tx_context::epoch_timestamp_ms(ctx))
    }

    /// True if `addr` holds a current, unexpired READ (or WRITE, which implies read) grant
    /// on `notebook`. Read-only access intentionally is NOT sufficient for any of the
    /// content-mutation asserts (those all check has_write_access) - this helper exists for
    /// completeness / future read-gated endpoints and for tests asserting a read grant does
    /// NOT unlock write-gated functions.
    public fun has_read_access(notebook: &Notebook, addr: address, ctx: &TxContext): bool {
        has_access_at_least(notebook, addr, PERMISSION_READ, tx_context::epoch_timestamp_ms(ctx))
    }

    // ========== WAL Token Helper Functions ==========

    /// Calculate WAL storage fee based on blob size
    /// SECURITY: Validates blob size and calculates appropriate fee
    public fun calculate_wal_storage_fee(blob_size_mb: u64): u64 {
        // Validate blob size (max 1000MB per note)
        assert!(blob_size_mb > 0 && blob_size_mb <= 1000, E_INVALID_WAL_PAYMENT);

        blob_size_mb * WAL_STORAGE_FEE_PER_MB
    }

    /// Process WAL token payment for blob storage.
    ///
    /// ESCROW MODEL: the WAL token (wal::wal) has a sealed TreasuryCap and no public mint
    /// function, so there is no way to mint WAL back out for a rebate later. Instead of
    /// burning the fee (which would make a real rebate impossible), the required fee is
    /// deposited into the notebook's WalFeeReserve escrow, where it sits until either
    /// rebated back to the note owner (process_wal_storage_rebate) or effectively retained
    /// by the reserve.
    ///
    /// `payment` is consumed by value (mirrors authorize_session_and_fund's coin-handling
    /// pattern of taking ownership of exactly what's needed): the required fee is deposited
    /// into the reserve and any excess above the fee is returned to the caller as a new coin.
    /// Returns the amount actually deposited into the reserve (this is the non-forgeable,
    /// on-chain-sourced "wal_paid" amount that gets stored on the Note).
    ///
    /// `public(package)`, not `public` - only called from update_note/update_note_with_session
    /// in this same module; no external caller needs direct access, so keep the surface area
    /// minimal (matches the same reasoning applied to process_wal_storage_rebate).
    public(package) fun process_wal_storage_payment(
        payment: Coin<WAL>,
        blob_size_mb: u64,
        reserve: &mut WalFeeReserve,
        notebook_id: ID,
        note_id: ID,
        blob_id: string::String,
        ctx: &mut TxContext
    ): (Coin<WAL>, u64) {
        assert!(reserve.notebook_id == notebook_id, E_WRONG_RESERVE);

        let required_fee = calculate_wal_storage_fee(blob_size_mb);
        let payment_amount = coin::value(&payment);

        // Validate payment amount
        assert!(payment_amount >= required_fee, E_INSUFFICIENT_WAL_BALANCE);
        assert!(payment_amount >= WAL_MIN_PAYMENT, E_INVALID_WAL_PAYMENT);

        // Split payment: fee goes into the escrow reserve, remainder returned to caller
        let mut payment_mut = payment;
        let fee_coin = coin::split(&mut payment_mut, required_fee, ctx);

        // Deposit fee into the reserve balance instead of burning it, so it can be
        // paid back out later as a rebate.
        balance::join(&mut reserve.balance, coin::into_balance(fee_coin));

        // Emit payment event
        event::emit(WalStoragePayment {
            notebook_id,
            note_id,
            blob_id,
            payment_amount: required_fee,
            transaction_timestamp: tx_context::epoch_timestamp_ms(ctx),
            operator: tx_context::sender(ctx),
        });

        (payment_mut, required_fee)
    }

    /// Process WAL storage fee rebate for blob deletion.
    ///
    /// ESCROW MODEL: reads the ACTUAL wal_paid amount stored on the Note (never a
    /// caller-supplied blob_size_mb/storage_months - those cannot be trusted, since any
    /// caller could claim an arbitrary rebate amount by lying about them). Withdraws the
    /// rebate from the notebook's WalFeeReserve balance and transfers it to `recipient`.
    ///
    /// Guards:
    /// - rebate_claimed on the Note must not already be true (checked by the caller before
    ///   invoking this, since this function only has access to the raw wal_paid amount -
    ///   see claim_wal_storage_rebate for the actual Note-level guard).
    /// - the reserve must actually hold at least `rebate_amount`, otherwise this aborts
    ///   with E_RESERVE_INSUFFICIENT_BALANCE rather than underflowing inside balance::split.
    ///
    /// SECURITY: deliberately `public(package)`, not `public` - this function trusts its
    /// caller completely (rebate_amount/recipient/note_id/blob_id are taken as given, with
    /// no ownership check of its own). It must never be reachable directly from a PTB or an
    /// external module, only from claim_wal_storage_rebate (which derives rebate_amount from
    /// the real on-chain Note.wal_paid and enforces the rebate_claimed guard) and from this
    /// package's own tests (which exercise its underflow guard in isolation).
    public(package) fun process_wal_storage_rebate(
        reserve: &mut WalFeeReserve,
        notebook_id: ID,
        note_id: ID,
        blob_id: string::String,
        rebate_amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(reserve.notebook_id == notebook_id, E_WRONG_RESERVE);
        assert!(rebate_amount > 0, E_NO_WAL_PAID);

        // SECURITY: protect against underflow - never let balance::split panic-abort
        // ungracefully (or, worse, succeed by drawing down unrelated notebook funds).
        assert!(balance::value(&reserve.balance) >= rebate_amount, E_RESERVE_INSUFFICIENT_BALANCE);

        let rebate_balance = balance::split(&mut reserve.balance, rebate_amount);
        let rebate_coin = coin::from_balance(rebate_balance, ctx);
        transfer::public_transfer(rebate_coin, recipient);

        event::emit(WalStorageRebate {
            notebook_id,
            note_id,
            blob_id,
            rebate_amount,
            rebate_timestamp: tx_context::epoch_timestamp_ms(ctx),
            operator: tx_context::sender(ctx),
        });
    }

    // ========== Test Utilities ==========
    #[test_only]
    public fun create_test_folder_with_id(
        id: ID,
        name: string::String,
        parent_id: option::Option<ID>,
        sort_order: u64
    ): Folder {
        Folder {
            id,
            encrypted_name: name,
            parent_id,
            sort_order,
            created_at: 1000000,
            updated_at: 1000000,
            is_deleted: false,
        }
    }

    /// Create a test Note directly with a given id/parent_note_id, mirroring
    /// create_test_folder_with_id, for use in note-nesting depth/cycle tests.
    #[test_only]
    public fun create_test_note_with_id(
        id: ID,
        parent_note_id: option::Option<ID>
    ): Note {
        Note {
            id,
            blob_id: string::utf8(b"blob_id"),
            blob_object_id: string::utf8(b"blob_object_id"),
            encrypted_title: string::utf8(b"encrypted_title"),
            folder_id: option::none(),
            parent_note_id,
            created_at: 1000000,
            updated_at: 1000000,
            is_deleted: false,
            ar_backup_id: option::none(),
            ar_backup_version: option::none(),
            wal_paid: 0,
            rebate_claimed: false,
        }
    }

    // ========== Unit Tests ==========
    #[test_only]
    public fun create_test_notebook_direct(
        notebook_name: string::String,
        ctx: &mut TxContext
    ): (Notebook, NotebookRegistry) {
        let sender = tx_context::sender(ctx);
        let now = tx_context::epoch_timestamp_ms(ctx);

        // Create shared Notebook object
        let notebook = Notebook {
            id: object::new(ctx),
            owner: sender,
            notes: table::new(ctx),
            folders: table::new(ctx),
            permissions: table::new(ctx),
            wrapped_content_keys: table::new(ctx),
        };

        // Create registry
        let registry = NotebookRegistry {
            id: object::new(ctx),
            owner: sender,
            notebooks: table::new(ctx),
            active_notebook: notebook_name,
            created_at: now,
        };

        (notebook, registry)
    }

    #[test_only]
    public fun note_contains_id(notes: &Table<ID, Note>, note_id: ID): bool {
        table::contains(notes, note_id)
    }

    #[test_only]
    public fun borrow_note(notes: &Table<ID, Note>, note_id: ID): &Note {
        table::borrow(notes, note_id)
    }

    #[test_only]
    public fun get_note_blob_id(note: &Note): &string::String {
        &note.blob_id
    }

    #[test_only]
    public fun get_note_title(note: &Note): &string::String {
        &note.encrypted_title
    }

    #[test_only]
    public fun note_is_deleted(note: &Note): bool {
        note.is_deleted
    }

    #[test_only]
    public fun note_updated_at(note: &Note): u64 {
        note.updated_at
    }

    #[test_only]
    public fun get_note_parent_id(note: &Note): &option::Option<ID> {
        &note.parent_note_id
    }

    #[test_only]
    public fun get_note_wal_paid(note: &Note): u64 {
        note.wal_paid
    }

    #[test_only]
    public fun note_rebate_claimed(note: &Note): bool {
        note.rebate_claimed
    }

    #[test_only]
    public fun get_reserve_balance(reserve: &WalFeeReserve): u64 {
        balance::value(&reserve.balance)
    }

    #[test_only]
    public fun get_reserve_notebook_id(reserve: &WalFeeReserve): ID {
        reserve.notebook_id
    }

    #[test_only]
    public fun folder_is_deleted(folder: &Folder): bool {
        folder.is_deleted
    }

    #[test_only]
    public fun folder_contains_id(folders: &Table<ID, Folder>, folder_id: ID): bool {
        table::contains(folders, folder_id)
    }

    #[test_only]
    public fun borrow_folder(folders: &Table<ID, Folder>, folder_id: ID): &Folder {
        table::borrow(folders, folder_id)
    }

    #[test_only]
    public fun get_notebook_notes(notebook: &Notebook): &Table<ID, Note> {
        &notebook.notes
    }

    #[test_only]
    public fun get_notebook_folders(notebook: &Notebook): &Table<ID, Folder> {
        &notebook.folders
    }

    /// Test-only read accessor mirroring get_registered_key: returns
    /// option::some(wrapped_key_bytes) if `addr` currently has a wrapped content key stored
    /// on this notebook, option::none() otherwise (never registered, or removed by
    /// revoke_access/leave_shared_notebook).
    #[test_only]
    public fun get_wrapped_content_key(notebook: &Notebook, addr: address): option::Option<vector<u8>> {
        if (table::contains(&notebook.wrapped_content_keys, addr)) {
            option::some(*table::borrow(&notebook.wrapped_content_keys, addr))
        } else {
            option::none()
        }
    }

    // Test helper functions
    public fun get_notebook_id(notebook: &Notebook): ID {
        object::uid_to_inner(&notebook.id)
    }

    public fun get_registry_id(registry: &NotebookRegistry): ID {
        object::uid_to_inner(&registry.id)
    }

    public fun get_folder_sort_order(folder: &Folder): u64 {
        folder.sort_order
    }

    // Additional test helper functions for accessing private fields
    public fun get_registry_owner(registry: &NotebookRegistry): address {
        registry.owner
    }

    public fun get_registry_active_notebook(registry: &NotebookRegistry): &string::String {
        &registry.active_notebook
    }

    public fun get_registry_notebooks(registry: &NotebookRegistry): &Table<string::String, ID> {
        &registry.notebooks
    }

    public fun get_notebook_owner(notebook: &Notebook): address {
        notebook.owner
    }

    /// `sui move test` does not simulate a publish transaction, so this module's `init`
    /// (which normally creates+shares the single EncryptionKeyRegistry automatically) never
    /// runs in tests. This constructs an equivalent registry directly, mirroring how
    /// create_test_notebook_direct stands in for create_notebook's shared-object side
    /// effects. The returned value is a bare (non-shared) object the test owns directly and
    /// must dispose of via destroy_test_registry before test_scenario::end.
    #[test_only]
    public fun create_test_registry(ctx: &mut TxContext): EncryptionKeyRegistry {
        EncryptionKeyRegistry {
            id: object::new(ctx),
            keys: table::new(ctx),
        }
    }

    /// Tear down a registry created via create_test_registry. Table<K, V> has no `drop`
    /// ability, so the registry cannot simply go out of scope - its UID and Table must be
    /// unpacked and explicitly destroyed.
    #[test_only]
    public fun destroy_test_registry(registry: EncryptionKeyRegistry) {
        let EncryptionKeyRegistry { id, keys } = registry;
        object::delete(id);
        table::drop(keys);
    }

    #[test_only]
    public fun create_test_id_from_address(addr: address, ctx: &mut TxContext): ID {
        let obj = object::new(ctx);
        let id = object::uid_to_inner(&obj);
        // Clean up the object
        object::delete(obj);
        id
          }

    // Enable the working arweave test
    #[test_only]
    #[test]
    fun test_arweave_transaction_id_validation() {
        // Valid Arweave TX IDs (43 chars, base64url)
        let valid_id = string::utf8(b"123456789abcdefghijklmnopqrstuvwxyzABCDEFGH");
        assert!(is_valid_arweave_tx_id(&valid_id) == true);

        let valid_id_with_dash = string::utf8(b"abcdefghijklmnopqrstuvwxyzABCDEFG-123456789");
        assert!(is_valid_arweave_tx_id(&valid_id_with_dash) == true);

        let valid_id_with_underscore = string::utf8(b"1234567890_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
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


    // ========== Module Initializer ==========

    /// Runs exactly once, automatically, at module publish time (Move only permits a single
    /// `init` per module). Creates and shares the single global EncryptionKeyRegistry so it
    /// exists with no separate setup call required from any user. Safe to add now since
    /// there is no live deployment yet (Move.toml is still the 0x0 placeholder).
    fun init(ctx: &mut TxContext) {
        let registry = EncryptionKeyRegistry {
            id: object::new(ctx),
            keys: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    // ========== Entry Functions ==========

    /// Create and share the per-notebook WAL fee escrow reserve. Called once from
    /// create_notebook / create_additional_notebook so that every notebook has exactly
    /// one WalFeeReserve to deposit storage-fee payments into and withdraw rebates from.
    fun create_and_share_wal_fee_reserve(notebook_id: ID, ctx: &mut TxContext) {
        let reserve = WalFeeReserve {
            id: object::new(ctx),
            notebook_id,
            balance: balance::zero<WAL>(),
        };
        let reserve_id_value = object::uid_to_inner(&reserve.id);

        transfer::share_object(reserve);

        event::emit(WalFeeReserveCreated {
            notebook_id,
            reserve_id: reserve_id_value,
        });
    }

    /// Create a new notebook with registry for cross-device discovery
    public entry fun create_notebook(
        notebook_name: string::String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = tx_context::epoch_timestamp_ms(ctx);

        // Create shared Notebook object
        let notebook = Notebook {
            id: object::new(ctx),
            owner: sender,
            notes: table::new(ctx),
            folders: table::new(ctx),
            permissions: table::new(ctx),
            wrapped_content_keys: table::new(ctx),
        };
        let notebook_id_value = object::uid_to_inner(&notebook.id);

        // Share the notebook for multi-device access
        transfer::share_object(notebook);

        // Create and share this notebook's WAL fee escrow reserve
        create_and_share_wal_fee_reserve(notebook_id_value, ctx);

        // Create registry
        let registry = NotebookRegistry {
            id: object::new(ctx),
            owner: sender,
            notebooks: table::new(ctx),
            active_notebook: notebook_name,
            created_at: now,
        };
        let registry_id_value = object::uid_to_inner(&registry.id);

        // Add notebook to registry
        let mut registry_mut = registry;
        table::add(&mut registry_mut.notebooks, notebook_name, notebook_id_value);

        // Transfer registry to owner
        transfer::transfer(registry_mut, sender);

        // Emit event
        event::emit(NotebookCreated {
            notebook_id: notebook_id_value,
            owner: sender,
            registry_id: registry_id_value,
        });
    }

    /// Create an additional notebook for existing registry owner
    public entry fun create_additional_notebook(
        notebook_name: string::String,
        registry: &mut NotebookRegistry,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Verify caller owns the registry
        assert!(registry.owner == sender, E_NOT_OWNER);

        // Check if notebook name already exists
        assert!(!table::contains(&registry.notebooks, notebook_name), E_NOTEBOOK_EXISTS);

        // Create shared Notebook object
        let notebook = Notebook {
            id: object::new(ctx),
            owner: sender,
            notes: table::new(ctx),
            folders: table::new(ctx),
            permissions: table::new(ctx),
            wrapped_content_keys: table::new(ctx),
        };
        let notebook_id_value = object::uid_to_inner(&notebook.id);

        // Share the notebook for multi-device access
        transfer::share_object(notebook);

        // Create and share this notebook's WAL fee escrow reserve
        create_and_share_wal_fee_reserve(notebook_id_value, ctx);

        // Add to registry
        table::add(&mut registry.notebooks, notebook_name, notebook_id_value);

        // Set as active notebook
        registry.active_notebook = notebook_name;
    }

    /// Switch active notebook in registry
    public entry fun switch_active_notebook(
        registry: &mut NotebookRegistry,
        notebook_name: string::String,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Verify caller owns the registry
        assert!(registry.owner == sender, E_NOT_OWNER);

        // Verify notebook exists
        assert!(table::contains(&registry.notebooks, notebook_name), E_NOTEBOOK_NOT_FOUND);

        // Switch active notebook
        registry.active_notebook = notebook_name;
    }

    
    /// Authorize device-specific hot wallet with automatic funding
    /// SECURITY: Properly handles coin objects and validates balances before transfer
    /// Returns remaining coin balances to the caller
    public entry fun authorize_session_and_fund(
        notebook: &Notebook,
        sui_coin: &mut Coin<SUI>,
        wal_coin: &mut Coin<WAL>,
        device_fingerprint: string::String,
        hot_wallet_address: address,
        expires_at: u64,
        sui_amount: option::Option<u64>,
        wal_amount: option::Option<u64>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Verify caller is notebook owner
        assert!(notebook.owner == sender, E_NOT_OWNER);

        // Verify expiration is in the future
        let now = tx_context::epoch_timestamp_ms(ctx);
        assert!(expires_at > now, E_INVALID_EXPIRATION);

        // Default funding amounts if not specified
        let default_sui = 100000000; // 0.1 SUI in MIST
        let default_wal = 500000000; // 0.5 WAL (adjust based on WAL decimals)

        let sui_to_transfer = if (option::is_some(&sui_amount)) {
            *option::borrow(&sui_amount)
        } else {
            default_sui
        };

        let wal_to_transfer = if (option::is_some(&wal_amount)) {
            *option::borrow(&wal_amount)
        } else {
            default_wal
        };

        // SECURITY FIX: Verify sufficient balance before proceeding
        let sui_balance = coin::value(sui_coin);
        let wal_balance = coin::value(wal_coin);

        assert!(sui_balance >= sui_to_transfer, E_INSUFFICIENT_BALANCE);
        assert!(wal_balance >= wal_to_transfer, E_INSUFFICIENT_WAL_BALANCE);

        // Create SessionCap with device info and auto-funding flag
        let session_cap = SessionCap {
            id: object::new(ctx),
            notebook_id: object::uid_to_inner(&notebook.id),
            device_fingerprint,
            hot_wallet_address,
            expires_at,
            created_at: now,
            auto_funded: true,
        };
        let session_cap_id_value = object::uid_to_inner(&session_cap.id);

        // SECURITY FIX: Extract payments using coin::split
        // The remaining balances in sui_coin and wal_coin stay with the caller
        let sui_payment = coin::split(sui_coin, sui_to_transfer, ctx);
        let wal_payment = coin::split(wal_coin, wal_to_transfer, ctx);

        // Transfer payments to hot wallet address
        transfer::public_transfer(sui_payment, hot_wallet_address);
        transfer::public_transfer(wal_payment, hot_wallet_address);

        // SECURITY FIX: The remaining coin balances (sui_coin and wal_coin)
        // automatically stay with the caller since we used &mut parameters
        // and only split out the amounts we needed.

        // Transfer SessionCap to hot wallet
        transfer::transfer(session_cap, hot_wallet_address);

        // Emit event with funding amounts
        event::emit(SessionAuthorized {
            notebook_id: object::uid_to_inner(&notebook.id),
            session_cap_id: session_cap_id_value,
            hot_wallet_address,
            device_fingerprint,
            expires_at,
            owner: sender,
            sui_funded: sui_to_transfer,
            wal_funded: wal_to_transfer,
        });
    }

    /// Revoke a session capability
    public entry fun revoke_session(
        notebook: &Notebook,
        session_cap: SessionCap,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Verify caller owns the notebook
        assert!(notebook.owner == sender, E_NOT_OWNER);

        // Verify session cap belongs to this notebook
        assert!(session_cap.notebook_id == object::uid_to_inner(&notebook.id), E_WRONG_NOTEBOOK);

        let session_cap_id_value = object::uid_to_inner(&session_cap.id);

        // Delete the session capability using the correct field
        transfer::transfer(session_cap, tx_context::sender(ctx));

        // Emit event
        event::emit(SessionRevoked {
            notebook_id: object::uid_to_inner(&notebook.id),
            session_cap_id: session_cap_id_value,
            owner: sender,
        });
    }

    // ========== Envelope Encryption Key Registry ==========

    /// Publish (or replace) the raw public key `sender` wants others to use when wrapping a
    /// content-encryption key for them (see grant_access's wrapped_key parameter). Intended
    /// to be called once per unlock by the frontend, so re-registering must be idempotent -
    /// this simply overwrites any prior entry rather than aborting on a second call.
    ///
    /// Only ever stores PUBLIC key material supplied by the caller; has no interaction with,
    /// and no ability to derive, any actual AES content-encryption key.
    public entry fun register_encryption_key(
        registry: &mut EncryptionKeyRegistry,
        pubkey: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Sane length check for a raw X25519 public key (32 bytes).
        assert!(vector::length(&pubkey) == 32, E_INVALID_PUBLIC_KEY);

        let sender = tx_context::sender(ctx);

        // Idempotent re-registration: replace any existing entry rather than aborting.
        if (table::contains(&registry.keys, sender)) {
            table::remove(&mut registry.keys, sender);
        };
        table::add(&mut registry.keys, sender, pubkey);
    }

    /// Test-only read accessor: returns option::some(pubkey) if `addr` has registered a key,
    /// option::none() otherwise. Mirrors the existing test-utility accessor style in this
    /// file (e.g. get_note_parent_id).
    #[test_only]
    public fun get_registered_key(registry: &EncryptionKeyRegistry, addr: address): option::Option<vector<u8>> {
        if (table::contains(&registry.keys, addr)) {
            option::some(*table::borrow(&registry.keys, addr))
        } else {
            option::none()
        }
    }

    // ========== Notebook Sharing / Collaboration ==========

    /// Grant another address read or write access to this notebook. OWNER-ONLY - this is
    /// the single most security-critical assertion in the sharing feature: if this ever
    /// became satisfiable by anyone other than the true owner (e.g. by a write-grantee, or
    /// by has_write_access being consulted here), a grantee could escalate themselves (or an
    /// accomplice) into a de-facto co-owner without the real owner's consent. Do NOT widen
    /// this assert the way the plain content-mutation functions' asserts were widened.
    ///
    /// Creates a SharedAccess capability object (visible, revocable proof for the grantee)
    /// and transfers it to `grantee`, AND adds/overwrites the corresponding entry in
    /// notebook.permissions (the actual source of truth consulted by has_write_access /
    /// has_read_access) so every mutation function's widened assert can look the grantee up
    /// in O(1) without requiring them to present the capability object on-chain.
    ///
    /// `wrapped_key`: the notebook's content-encryption key, encrypted ("wrapped") to
    /// `grantee`'s registered public key (see register_encryption_key /
    /// EncryptionKeyRegistry), so the grantee can actually decrypt shared content rather
    /// than merely holding on-chain write/read authorization. Pass `vector::empty<u8>()` if
    /// no wrapped key is available yet (e.g. a read-only grant that doesn't need one, or the
    /// caller isn't ready to compute the wrap) - an empty vector is a valid, non-aborting
    /// value here, not an error condition.
    public entry fun grant_access(
        notebook: &mut Notebook,
        grantee: address,
        permission: u8,
        expires_at: option::Option<u64>,
        wrapped_key: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // OWNER-ONLY. See doc comment above - never widen this to has_write_access.
        assert!(notebook.owner == sender, E_NOT_OWNER);

        assert!(permission == PERMISSION_READ || permission == PERMISSION_WRITE, E_INVALID_PERMISSION);

        let notebook_id = object::uid_to_inner(&notebook.id);

        let expires_at_value = if (option::is_some(&expires_at)) {
            *option::borrow(&expires_at)
        } else {
            NO_EXPIRY
        };

        // Keep notebook.permissions in lockstep with the SharedAccess object: re-granting
        // an address that already has an entry simply overwrites it (e.g. upgrading a
        // read grant to write, or changing the expiry) rather than requiring a separate
        // revoke first.
        if (table::contains(&notebook.permissions, grantee)) {
            table::remove(&mut notebook.permissions, grantee);
        };
        table::add(&mut notebook.permissions, grantee, AccessGrant {
            permission,
            expires_at: expires_at_value,
        });

        // Keep wrapped_content_keys in lockstep the same way - overwrite whatever was
        // previously stored (including an empty placeholder) with whatever was given now.
        if (table::contains(&notebook.wrapped_content_keys, grantee)) {
            table::remove(&mut notebook.wrapped_content_keys, grantee);
        };
        table::add(&mut notebook.wrapped_content_keys, grantee, wrapped_key);

        let shared_access = SharedAccess {
            id: object::new(ctx),
            notebook_id,
            grantee,
            permission,
            granted_by: sender,
            expires_at,
        };
        let shared_access_id_value = object::uid_to_inner(&shared_access.id);

        transfer::transfer(shared_access, grantee);

        event::emit(AccessGranted {
            notebook_id,
            shared_access_id: shared_access_id_value,
            grantee,
            permission,
            granted_by: sender,
            expires_at,
        });
    }

    /// Revoke a previously granted SharedAccess. OWNER-ONLY, by design: only the notebook
    /// owner may revoke someone else's access - the grantee calling this on their own
    /// SharedAccess object does NOT succeed (see leave_shared_notebook for the deliberately
    /// separate grantee-initiated self-revoke path, so the two authorization models are
    /// never conflated in one function).
    public entry fun revoke_access(
        notebook: &mut Notebook,
        shared_access: SharedAccess,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // OWNER-ONLY. See doc comment above - never widen this to has_write_access.
        assert!(notebook.owner == sender, E_NOT_OWNER);

        assert!(shared_access.notebook_id == object::uid_to_inner(&notebook.id), E_WRONG_NOTEBOOK);

        remove_access_grant_and_emit(notebook, shared_access, sender);
    }

    /// Grantee-initiated self-revoke: lets a grantee voluntarily give up access to a
    /// notebook that was shared with them. Deliberately a SEPARATE entry fun from
    /// revoke_access (rather than an alternate authorization branch inside it) precisely so
    /// the owner-only revoke path and this self-revoke path can never accidentally merge
    /// into a single, more-permissive check.
    public entry fun leave_shared_notebook(
        notebook: &mut Notebook,
        shared_access: SharedAccess,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Only the grantee themselves may use this path to drop their own access.
        assert!(shared_access.grantee == sender, E_NOT_OWNER);
        assert!(shared_access.notebook_id == object::uid_to_inner(&notebook.id), E_WRONG_NOTEBOOK);

        remove_access_grant_and_emit(notebook, shared_access, sender);
    }

    /// Shared teardown for revoke_access / leave_shared_notebook: removes the
    /// notebook.permissions entry (if still present - a grant may have already expired or
    /// been overwritten) and destroys the SharedAccess object, then emits AccessRevoked.
    /// Callers are responsible for their own authorization asserts before calling this.
    fun remove_access_grant_and_emit(notebook: &mut Notebook, shared_access: SharedAccess, revoked_by: address) {
        let SharedAccess { id, notebook_id, grantee, permission: _, granted_by: _, expires_at: _ } = shared_access;
        let shared_access_id_value = object::uid_to_inner(&id);
        object::delete(id);

        if (table::contains(&notebook.permissions, grantee)) {
            table::remove(&mut notebook.permissions, grantee);
        };

        // Cleanup: also drop the wrapped content key stored for this grantee, if any -
        // kept in lockstep with notebook.permissions the same way grant_access adds it.
        if (table::contains(&notebook.wrapped_content_keys, grantee)) {
            table::remove(&mut notebook.wrapped_content_keys, grantee);
        };

        event::emit(AccessRevoked {
            notebook_id,
            shared_access_id: shared_access_id_value,
            grantee,
            revoked_by,
        });
    }

    /// Update or create a note (handles both new notes and edits).
    ///
    /// WAL storage payment (escrow model): when the caller is saving new/changed blob
    /// content to Walrus, it passes `wal_payment = option::some(coin)` together with
    /// `blob_size_mb = option::some(size)`. The required fee (calculate_wal_storage_fee)
    /// is deposited into the notebook's WalFeeReserve via process_wal_storage_payment, any
    /// change is returned to the sender, and the cumulative amount actually deposited is
    /// added to `note.wal_paid` - a real, non-forgeable on-chain record sourced from an
    /// actual Coin<WAL> the caller handed over (never a caller-supplied plain u64). Passing
    /// `option::none()` for both skips WAL accounting entirely (e.g. metadata-only edits
    /// such as a rename/move that don't re-upload blob content).
    public entry fun update_note(
        notebook: &mut Notebook,
        reserve: &mut WalFeeReserve,
        note_id: ID,
        blob_id: string::String,
        blob_object_id: string::String,
        encrypted_title: string::String,
        folder_id: option::Option<ID>,
        parent_note_id: option::Option<ID>,
        expected_updated_at: option::Option<u64>,
        blob_size_mb: option::Option<u64>,
        wal_payment: option::Option<Coin<WAL>>,
        ctx: &mut TxContext
    ) {
        // Direct owner authorization (SessionCap version can be added as public function).
        // Widened to also allow a write-grantee (see grant_access/has_write_access) - the
        // owner-only check for granting/revoking access itself lives solely in
        // grant_access/revoke_access, never here.
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        let now = tx_context::epoch_timestamp_ms(ctx);
        let notebook_id = object::uid_to_inner(&notebook.id);

        // SECURITY FIX: Validate parent_note_id if specified. Applies to both the
        // create-new-note and update-existing-note branches (unlike expected_updated_at,
        // which only guards updates), mirroring create_folder/update_folder's checks.
        if (option::is_some(&parent_note_id)) {
            let parent = *option::borrow(&parent_note_id);
            assert!(table::contains(&notebook.notes, parent), E_PARENT_NOTE_NOT_FOUND);

            // Verify parent is not deleted
            let parent_note = table::borrow(&notebook.notes, parent);
            assert!(!parent_note.is_deleted, E_PARENT_NOTE_DELETED);

            // Calculate depth from parent - must be < MAX_NESTING_DEPTH (REQ-FOLDER-003 parity)
            let parent_depth = calculate_note_depth(&notebook.notes, parent);
            assert!(parent_depth < MAX_NESTING_DEPTH, E_MAX_NOTE_DEPTH);

            // Check for circular reference
            assert!(!would_create_note_cycle(&notebook.notes, note_id, parent), E_NOTE_CIRCULAR_REFERENCE);
        };

        // Process WAL storage payment (escrow deposit) if the caller is paying for
        // newly-uploaded blob content this call.
        let wal_paid_this_call = if (option::is_some(&blob_size_mb)) {
            let size_mb = option::destroy_some(blob_size_mb);
            assert!(option::is_some(&wal_payment), E_INVALID_WAL_PAYMENT);
            let payment_coin = option::destroy_some(wal_payment);
            let (change_coin, deposited) = process_wal_storage_payment(
                payment_coin,
                size_mb,
                reserve,
                notebook_id,
                note_id,
                blob_id,
                ctx
            );
            if (coin::value(&change_coin) > 0) {
                transfer::public_transfer(change_coin, sender);
            } else {
                coin::destroy_zero(change_coin);
            };
            deposited
        } else {
            option::destroy_none(blob_size_mb);
            // No payment expected this call; any accidentally-supplied coin is simply
            // returned untouched to the sender rather than silently dropped.
            if (option::is_some(&wal_payment)) {
                transfer::public_transfer(option::destroy_some(wal_payment), sender);
            } else {
                option::destroy_none(wal_payment);
            };
            0
        };

        if (table::contains(&notebook.notes, note_id)) {
            // Update existing note
            let note = table::borrow_mut(&mut notebook.notes, note_id);
            // Optimistic concurrency check: if the caller supplied an expected
            // version, it must match the note's current updated_at or we abort.
            // A None expected_updated_at skips the check entirely (backward compatible).
            assert!(
                option::is_none(&expected_updated_at) || *option::borrow(&expected_updated_at) == note.updated_at,
                E_VERSION_MISMATCH
            );
            note.blob_id = blob_id;
            note.blob_object_id = blob_object_id;
            note.encrypted_title = encrypted_title;
            note.folder_id = folder_id;
            note.parent_note_id = parent_note_id;
            note.updated_at = now;
            note.wal_paid = note.wal_paid + wal_paid_this_call;
            // A genuine new deposit means there's fresh, unclaimed wal_paid again - without
            // this, a note that already had its rebate claimed once could never have a later
            // re-edit's payment refunded, permanently stranding it in the reserve.
            if (wal_paid_this_call > 0) {
                note.rebate_claimed = false;
            };
        } else {
            // Create new note
            let note = Note {
                id: note_id,
                blob_id,
                blob_object_id,
                encrypted_title,
                folder_id,
                parent_note_id,
                created_at: now,
                updated_at: now,
                is_deleted: false,
                ar_backup_id: option::none(),
                ar_backup_version: option::none(),
                wal_paid: wal_paid_this_call,
                rebate_claimed: false,
            };
            table::add(&mut notebook.notes, note_id, note);
        };

        // Emit event
        event::emit(NoteUpdated {
            notebook_id,
            note_id,
            blob_id,
            folder_id,
            operator: sender,
        });
    }

    /// Public function for session-cap based note updates.
    /// WAL storage payment handling mirrors update_note (see its doc comment).
    public fun update_note_with_session(
        notebook: &mut Notebook,
        reserve: &mut WalFeeReserve,
        session_cap: SessionCap,
        note_id: ID,
        blob_id: string::String,
        blob_object_id: string::String,
        encrypted_title: string::String,
        folder_id: option::Option<ID>,
        parent_note_id: option::Option<ID>,
        expected_updated_at: option::Option<u64>,
        blob_size_mb: option::Option<u64>,
        wal_payment: option::Option<Coin<WAL>>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Verify session cap belongs to this notebook
        assert!(session_cap.notebook_id == object::uid_to_inner(&notebook.id), E_NOT_OWNER);
        assert!(session_cap.hot_wallet_address == sender, E_NOT_OWNER);

        let now = tx_context::epoch_timestamp_ms(ctx);
        let notebook_id = object::uid_to_inner(&notebook.id);

        // SECURITY FIX: Validate parent_note_id if specified. Applies to both the
        // create-new-note and update-existing-note branches (unlike expected_updated_at,
        // which only guards updates), mirroring create_folder/update_folder's checks.
        if (option::is_some(&parent_note_id)) {
            let parent = *option::borrow(&parent_note_id);
            assert!(table::contains(&notebook.notes, parent), E_PARENT_NOTE_NOT_FOUND);

            // Verify parent is not deleted
            let parent_note = table::borrow(&notebook.notes, parent);
            assert!(!parent_note.is_deleted, E_PARENT_NOTE_DELETED);

            // Calculate depth from parent - must be < MAX_NESTING_DEPTH (REQ-FOLDER-003 parity)
            let parent_depth = calculate_note_depth(&notebook.notes, parent);
            assert!(parent_depth < MAX_NESTING_DEPTH, E_MAX_NOTE_DEPTH);

            // Check for circular reference
            assert!(!would_create_note_cycle(&notebook.notes, note_id, parent), E_NOTE_CIRCULAR_REFERENCE);
        };

        // Process WAL storage payment (escrow deposit) if the caller is paying for
        // newly-uploaded blob content this call.
        let wal_paid_this_call = if (option::is_some(&blob_size_mb)) {
            let size_mb = option::destroy_some(blob_size_mb);
            assert!(option::is_some(&wal_payment), E_INVALID_WAL_PAYMENT);
            let payment_coin = option::destroy_some(wal_payment);
            let (change_coin, deposited) = process_wal_storage_payment(
                payment_coin,
                size_mb,
                reserve,
                notebook_id,
                note_id,
                blob_id,
                ctx
            );
            if (coin::value(&change_coin) > 0) {
                transfer::public_transfer(change_coin, sender);
            } else {
                coin::destroy_zero(change_coin);
            };
            deposited
        } else {
            option::destroy_none(blob_size_mb);
            if (option::is_some(&wal_payment)) {
                transfer::public_transfer(option::destroy_some(wal_payment), sender);
            } else {
                option::destroy_none(wal_payment);
            };
            0
        };

        if (table::contains(&notebook.notes, note_id)) {
            // Update existing note
            let note = table::borrow_mut(&mut notebook.notes, note_id);
            // Optimistic concurrency check: if the caller supplied an expected
            // version, it must match the note's current updated_at or we abort.
            // A None expected_updated_at skips the check entirely (backward compatible).
            assert!(
                option::is_none(&expected_updated_at) || *option::borrow(&expected_updated_at) == note.updated_at,
                E_VERSION_MISMATCH
            );
            note.blob_id = blob_id;
            note.blob_object_id = blob_object_id;
            note.encrypted_title = encrypted_title;
            note.folder_id = folder_id;
            note.parent_note_id = parent_note_id;
            note.updated_at = now;
            note.wal_paid = note.wal_paid + wal_paid_this_call;
            // See update_note's identical comment: a fresh deposit means fresh unclaimed
            // wal_paid, so a prior claim must not permanently block future rebates.
            if (wal_paid_this_call > 0) {
                note.rebate_claimed = false;
            };
        } else {
            // Create new note
            let note = Note {
                id: note_id,
                blob_id,
                blob_object_id,
                encrypted_title,
                folder_id,
                parent_note_id,
                created_at: now,
                updated_at: now,
                is_deleted: false,
                ar_backup_id: option::none(),
                ar_backup_version: option::none(),
                wal_paid: wal_paid_this_call,
                rebate_claimed: false,
            };
            table::add(&mut notebook.notes, note_id, note);
        };

        // Return SessionCap to sender
        transfer::transfer(session_cap, sender);

        // Emit event
        event::emit(NoteUpdated {
            notebook_id,
            note_id,
            blob_id,
            folder_id,
            operator: sender,
        });
      }

    /// Move note to different folder (direct access)
    public entry fun move_note(
        notebook: &mut Notebook,
        note_id: ID,
        new_folder_id: option::Option<ID>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);
        assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

        let note = table::borrow_mut(&mut notebook.notes, note_id);
        let old_folder_id = note.folder_id;
        note.folder_id = new_folder_id;
        note.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(NoteMoved {
            notebook_id: object::uid_to_inner(&notebook.id),
            note_id,
            old_folder_id,
            new_folder_id,
            operator: sender,
        });
    }

    /// Update Walrus blob object ID after renewal (direct access)
    public entry fun update_note_blob_object(
        notebook: &mut Notebook,
        note_id: ID,
        new_blob_object_id: string::String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);
        assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

        let note = table::borrow_mut(&mut notebook.notes, note_id);
        note.blob_object_id = new_blob_object_id;
        note.updated_at = tx_context::epoch_timestamp_ms(ctx);
    }

    /// Arweave Backup Metadata Update (direct access, MVP Feature)
    public entry fun update_note_ar_backup(
        notebook: &mut Notebook,
        note_id: ID,
        ar_tx_id: string::String,
        backup_timestamp: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);
        assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

        // SECURITY FIX: Validate Arweave transaction ID format comprehensively
        assert!(is_valid_arweave_tx_id(&ar_tx_id), E_INVALID_AR_TX_ID);

        let note = table::borrow_mut(&mut notebook.notes, note_id);
        note.ar_backup_id = option::some(ar_tx_id);
        note.ar_backup_version = option::some(backup_timestamp);
        note.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(ArweaveBackupRecorded {
            notebook_id: object::uid_to_inner(&notebook.id),
            note_id,
            ar_tx_id,
            backup_timestamp,
            operator: sender,
        });
    }

    /// Create a new folder (direct access)
    public entry fun create_folder(
        notebook: &mut Notebook,
        folder_id: ID,
        encrypted_name: string::String,
        parent_id: option::Option<ID>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        let now = tx_context::epoch_timestamp_ms(ctx);

        // SECURITY FIX: Verify parent exists and validate depth if specified
        if (option::is_some(&parent_id)) {
            let parent = *option::borrow(&parent_id);
            assert!(table::contains(&notebook.folders, parent), E_PARENT_NOT_FOUND);

            // Calculate depth from parent - must be < MAX_NESTING_DEPTH (REQ-FOLDER-003)
            let parent_depth = calculate_folder_depth(&notebook.folders, parent);
            assert!(parent_depth < MAX_NESTING_DEPTH, E_MAX_FOLDER_DEPTH);

            // Verify parent is not deleted
            let parent_folder = table::borrow(&notebook.folders, parent);
            assert!(!parent_folder.is_deleted, E_PARENT_DELETED);
        };

        let folder = Folder {
            id: folder_id,
            encrypted_name,
            parent_id,
            sort_order: 0, // Default sort order
            created_at: now,
            updated_at: now,
            is_deleted: false,
        };

        table::add(&mut notebook.folders, folder_id, folder);

        // Emit event
        event::emit(FolderCreated {
            notebook_id: object::uid_to_inner(&notebook.id),
            folder_id,
            parent_id,
            operator: sender,
        });
    }

    /// Update folder (rename or move) - direct access
    public entry fun update_folder(
        notebook: &mut Notebook,
        folder_id: ID,
        encrypted_name: string::String,
        parent_id: option::Option<ID>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);

        // SECURITY FIX: Validate parent_id if being changed
        if (option::is_some(&parent_id)) {
            let new_parent = *option::borrow(&parent_id);

            // Verify parent exists
            assert!(table::contains(&notebook.folders, new_parent), E_PARENT_NOT_FOUND);

            // Check for circular reference
            assert!(!would_create_cycle(&notebook.folders, folder_id, new_parent), E_CIRCULAR_REFERENCE);

            // Verify depth limit
            let parent_depth = calculate_folder_depth(&notebook.folders, new_parent);
            assert!(parent_depth < MAX_NESTING_DEPTH, E_MAX_FOLDER_DEPTH);

            // Verify parent is not deleted
            let parent_folder = table::borrow(&notebook.folders, new_parent);
            assert!(!parent_folder.is_deleted, E_PARENT_DELETED);
        };

        let folder = table::borrow_mut(&mut notebook.folders, folder_id);
        folder.encrypted_name = encrypted_name;
        folder.parent_id = parent_id;
        folder.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(FolderUpdated {
            notebook_id: object::uid_to_inner(&notebook.id),
            folder_id,
            operator: sender,
        });
    }

    /// Reorder folder within its parent level - direct access
    public entry fun reorder_folder(
        notebook: &mut Notebook,
        folder_id: ID,
        new_sort_order: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);

        let folder = table::borrow_mut(&mut notebook.folders, folder_id);
        let old_sort_order = folder.sort_order;
        folder.sort_order = new_sort_order;
        folder.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(FolderReordered {
            notebook_id: object::uid_to_inner(&notebook.id),
            folder_id,
            old_sort_order,
            new_sort_order,
            operator: sender,
        });
    }

    /// Batch reorder multiple folders (for drag-and-drop operations) - direct access
    public entry fun batch_reorder_folders(
        notebook: &mut Notebook,
        folder_orders: vector<ID>,
        sort_orders: vector<u64>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        // Verify arrays have same length
        assert!(vector::length(&folder_orders) == vector::length(&sort_orders), E_INVALID_BATCH_SIZE);

        let len = vector::length(&folder_orders);
        let mut i = 0;

        while (i < len) {
            let folder_id = *vector::borrow(&folder_orders, i);
            let sort_order = *vector::borrow(&sort_orders, i);

            assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);

            let folder = table::borrow_mut(&mut notebook.folders, folder_id);
            folder.sort_order = sort_order;
            folder.updated_at = tx_context::epoch_timestamp_ms(ctx);

            i = i + 1;
        };

        // Emit event
        event::emit(FoldersBatchReordered {
            notebook_id: object::uid_to_inner(&notebook.id),
            folder_count: len,
            operator: sender,
        });
    }

    /// Soft delete folder (set is_deleted flag) - direct access
    public entry fun delete_folder(
        notebook: &mut Notebook,
        folder_id: ID,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);

        let folder = table::borrow_mut(&mut notebook.folders, folder_id);
        folder.is_deleted = true;
        folder.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(FolderDeleted {
            notebook_id: object::uid_to_inner(&notebook.id),
            folder_id,
            operator: sender,
        });
    }

    /// Restore a soft-deleted folder (clear is_deleted flag) - the Trash counterpart to delete_folder.
    /// Mirrors restore_note exactly, but against notebook.folders instead of notebook.notes.
    /// Note: restoring a folder does NOT cascade-restore its notes or subfolders - each note/subfolder
    /// that was independently soft-deleted (or that simply still points at this folder_id) must be
    /// restored on its own. This mirrors delete_folder's existing non-cascading behavior (see its
    /// doc comment / handleDeleteFolder's frontend warning) and requires no new contract logic.
    public entry fun restore_folder(
        notebook: &mut Notebook,
        folder_id: ID,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);

        let folder = table::borrow_mut(&mut notebook.folders, folder_id);
        folder.is_deleted = false;
        folder.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(FolderRestored {
            notebook_id: object::uid_to_inner(&notebook.id),
            folder_id,
            operator: sender,
        });
    }

    /// Soft delete note (set is_deleted flag) - mirrors delete_folder. Recoverable via
    /// restore_note; a real permanent-delete/purge is not implemented.
    public entry fun delete_note(
        notebook: &mut Notebook,
        note_id: ID,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

        let note = table::borrow_mut(&mut notebook.notes, note_id);
        note.is_deleted = true;
        note.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(NoteDeleted {
            notebook_id: object::uid_to_inner(&notebook.id),
            note_id,
            operator: sender,
        });
    }

    /// Restore a soft-deleted note (clear is_deleted flag) - the Trash counterpart to delete_note.
    public entry fun restore_note(
        notebook: &mut Notebook,
        note_id: ID,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

        let note = table::borrow_mut(&mut notebook.notes, note_id);
        note.is_deleted = false;
        note.updated_at = tx_context::epoch_timestamp_ms(ctx);

        // Emit event
        event::emit(NoteRestored {
            notebook_id: object::uid_to_inner(&notebook.id),
            note_id,
            operator: sender,
        });
    }

    /// Claim the WAL storage fee rebate for a note.
    ///
    /// DESIGN CHOICE: this is a separate, opt-in entry function rather than something
    /// auto-triggered from delete_note. delete_note is a soft-delete (the note is
    /// recoverable via restore_note - see its doc comment), so eagerly draining the note's
    /// full wal_paid out of the shared WalFeeReserve at delete time would be wrong: the note
    /// might be restored afterwards and still be relying on that storage having been paid
    /// for. Making the rebate an explicit, separate claim keeps delete_note/restore_note's
    /// existing soft-delete semantics untouched and lets the owner decide when (if ever) to
    /// give up the storage and take the refund - e.g. after a permanent-delete decision.
    ///
    /// Reads the ACTUAL wal_paid stored on the Note (never a caller-supplied amount).
    /// Asserts rebate_claimed is not already true (the guard against double-claiming).
    /// Pays out to the notebook owner (notebook.owner, not tx_context::sender) since the
    /// owner is the economic beneficiary of the notebook regardless of which device/session
    /// happens to submit the claim transaction.
    public entry fun claim_wal_storage_rebate(
        notebook: &mut Notebook,
        reserve: &mut WalFeeReserve,
        note_id: ID,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        // Widened like the other content-mutation functions - a write-grantee may trigger
        // the claim, but the payout below is still made to notebook.owner (not `sender`),
        // so this cannot be used to redirect funds to the grantee.
        assert!(notebook.owner == sender || has_write_access(notebook, sender, ctx), E_NOT_OWNER);

        assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

        let notebook_id = object::uid_to_inner(&notebook.id);
        let note = table::borrow_mut(&mut notebook.notes, note_id);

        // Guard against claiming the rebate more than once.
        assert!(!note.rebate_claimed, E_REBATE_ALREADY_CLAIMED);

        let rebate_amount = note.wal_paid;
        assert!(rebate_amount > 0, E_NO_WAL_PAID);

        let blob_id = note.blob_id;

        // Mark claimed AND zero out wal_paid BEFORE the external call/transfer, both to
        // close the re-entrancy/double-spend window (checks-effects-interactions ordering)
        // and because wal_paid must represent "paid but not yet rebated" - if it stayed at
        // its cumulative lifetime value, a later re-edit's fresh payment (which resets
        // rebate_claimed back to false so the new amount can be claimed) would let this
        // function try to withdraw the FULL lifetime total again, not just the new deposit,
        // over-claiming into the reserve by whatever was already paid out on the first claim.
        note.rebate_claimed = true;
        note.wal_paid = 0;

        process_wal_storage_rebate(
            reserve,
            notebook_id,
            note_id,
            blob_id,
            rebate_amount,
            notebook.owner,
            ctx
        );
    }
}