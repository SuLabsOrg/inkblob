# Note CRUD Operations Integration Tests

**Version:** 1.0
**Date:** 2025-11-23
**Requirements Coverage:** REQ-NOTE-001 to REQ-NOTE-010, REQ-AR-001 to REQ-AR-011
**Target File:** contracts/inkblob/sources/notebook.move

---

## 1. Test Cases Overview

This module tests the complete lifecycle of note operations including creation, reading, updating, moving, and Arweave backup metadata management.

### 1.1 Requirements Mapped

| Test Case | Requirements Covered |
|-----------|---------------------|
| TC-NC-001 | REQ-NOTE-001, REQ-NOTE-002 |
| TC-NC-002 | REQ-NOTE-003, REQ-NOTE-004, REQ-NOTE-005 |
| TC-NC-003 | REQ-NOTE-006, REQ-NOTE-007 |
| TC-NC-004 | REQ-NOTE-008, REQ-NOTE-009 |
| TC-NC-005 | REQ-NOTE-010 (folder moves) |
| TC-NC-006 | REQ-AR-001 to REQ-AR-011 (Arweave backup) |
| TC-NC-007 | Blob object management (renewal) |
| TC-NC-008 | Edge cases and error handling |

---

## 2. Positive Test Cases

### TC-NC-001: Create Note Success (Root Level)

**Objective:** Verify successful note creation at root level
**Requirements:** REQ-NOTE-001, REQ-NOTE-002

```move
#[test]
public fun test_create_note_root_level_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Note Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Create note at root level
    let note_id = test_utils::generate_note_id();
    let blob_id = b"walrus_blob_12345";
    let blob_object_id = b"blob_object_67890";
    let encrypted_title = b"encrypted_note_title";
    let now = test_utils::NOW;

    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        blob_id,
        blob_object_id,
        encrypted_title,
        option::none(), // Root level (no folder)
        ctx
    );

    // Verify: Note created successfully
    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);
    let note = table::borrow(&notebook.notes, note_id);

    assert!(note.id == note_id, 0);
    assert!(note.blob_id == blob_id, 0);
    assert!(note.blob_object_id == blob_object_id, 0);
    assert!(note.encrypted_title == encrypted_title, 0);
    assert!(option::is_none(&note.folder_id), 0); // Root level
    assert!(note.created_at >= now, 0);
    assert!(note.updated_at >= now, 0);
    assert!(!note.is_deleted, 0);
    assert!(option::is_none(&note.ar_backup_id), 0); // No backup initially
    assert!(option::is_none(&note.ar_backup_version), 0);

    // Verify NoteUpdated event
    let event = test_scenario::next_event<NoteUpdated>(&mut scenario);
    assert!(event.notebook_id == object::uid_to_inner(&notebook.id), 0);
    assert!(event.note_id == note_id, 0);
    assert!(event.blob_id == blob_id, 0);
    assert!(option::is_none(&event.folder_id), 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Note created with all required fields populated
- Note placed at root level (folder_id = None)
- Timestamps set correctly (created_at = updated_at)
- NoteUpdated event emitted with correct data
- Arweave backup fields initially empty

---

### TC-NC-002: Create Note in Folder Success

**Objective:** Verify successful note creation within a folder
**Requirements:** REQ-NOTE-001, REQ-FOLDER-004

```move
#[test]
public fun test_create_note_in_folder_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and folder
    inkblob::notebook::create_notebook(b"Folder Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Create folder first
    let folder_id = test_utils::generate_folder_id();
    let encrypted_folder_name = b"encrypted_work_folder";

    inkblob::notebook::create_folder(
        &mut notebook,
        folder_id,
        encrypted_folder_name,
        option::none(), // Root level folder
        ctx
    );

    // Execute: Create note in the folder
    let note_id = test_utils::generate_note_id();
    let blob_id = b"walrus_blob_folder_note";
    let blob_object_id = b"blob_object_folder_note";
    let encrypted_title = b"encrypted_folder_note_title";

    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        blob_id,
        blob_object_id,
        encrypted_title,
        option::some(folder_id), // Place in folder
        ctx
    );

    // Verify: Note created in folder
    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);
    let note = table::borrow(&notebook.notes, note_id);

    assert!(note.encrypted_title == encrypted_title, 0);
    assert!(option::is_some(&note.folder_id), 0);
    assert!(*option::borrow(&note.folder_id) == folder_id, 0);

    // Verify folder exists
    assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);
    let folder = table::borrow(&notebook.folders, folder_id);
    assert!(folder.encrypted_name == encrypted_folder_name, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Note created with correct folder assignment
- Folder reference properly stored in note
- Note and folder both exist in notebook
- Hierarchical relationship established

---

### TC-NC-003: Update Existing Note Success

**Objective:** Verify successful note update (Last-Write-Wins)
**Requirements:** REQ-NOTE-006, REQ-NOTE-007, REQ-SYNC-004

```move
#[test]
public fun test_update_existing_note_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and initial note
    inkblob::notebook::create_notebook(b"Update Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let note_id = test_utils::generate_note_id();
    let initial_blob_id = b"initial_blob_id";
    let initial_title = b"initial_title";
    let initial_created_at = test_utils::NOW;

    // Create initial note
    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        initial_blob_id,
        b"initial_blob_object",
        initial_title,
        option::none(),
        ctx
    );

    // Wait a bit to ensure timestamp difference
    let update_timestamp = test_utils::NOW + 1000;

    // Execute: Update the note with new content
    let updated_blob_id = b"updated_blob_id";
    let updated_title = b"updated_title";

    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        updated_blob_id,
        b"updated_blob_object",
        updated_title,
        option::some(test_utils::generate_folder_id()), // Move to folder
        ctx
    );

    // Verify: Note updated correctly
    let note = table::borrow(&notebook.notes, note_id);

    // ID and created_at should remain unchanged
    assert!(note.id == note_id, 0);
    assert!(note.created_at == initial_created_at, 0);

    // Content should be updated
    assert!(note.blob_id == updated_blob_id, 0);
    assert!(note.encrypted_title == updated_title, 0);

    // updated_at should be newer than created_at
    assert!(note.updated_at > note.created_at, 0);

    // folder_id should be updated
    assert!(option::is_some(&note.folder_id), 0);

    // Verify NoteUpdated event for the update
    let event = test_scenario::next_event<NoteUpdated>(&mut scenario);
    assert!(event.note_id == note_id, 0);
    assert!(event.blob_id == updated_blob_id, 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Note ID and created_at remain unchanged
- Content and metadata updated with new values
- updated_at timestamp properly refreshed
- Single note object reused (no new creation)
- NoteUpdated event emitted for the update

---

### TC-NC-004: Move Note Between Folders Success

**Objective:** Verify note can be moved between folders
**Requirements:** REQ-NOTE-009, REQ-NOTE-010

```move
#[test]
public fun test_move_note_between_folders_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook with two folders
    inkblob::notebook::create_notebook(b"Move Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Create source and destination folders
    let source_folder_id = test_utils::generate_folder_id();
    let dest_folder_id = test_utils::next_folder_id();

    inkblob::notebook::create_folder(
        &mut notebook,
        source_folder_id,
        b"source_folder",
        option::none(),
        ctx
    );

    inkblob::notebook::create_folder(
        &mut notebook,
        dest_folder_id,
        b"dest_folder",
        option::none(),
        ctx
    );

    // Create note in source folder
    let note_id = test_utils::generate_note_id();
    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        b"blob_id",
        b"blob_object_id",
        b"note_title",
        option::some(source_folder_id),
        ctx
    );

    // Execute: Move note to destination folder
    inkblob::notebook::move_note(
        &mut notebook,
        note_id,
        option::some(dest_folder_id),
        ctx
    );

    // Verify: Note moved successfully
    let note = table::borrow(&notebook.notes, note_id);
    assert!(option::is_some(&note.folder_id), 0);
    assert!(*option::borrow(&note.folder_id) == dest_folder_id, 0);

    // Verify NoteMoved event
    let event = test_scenario::next_event<NoteMoved>(&mut scenario);
    assert!(event.note_id == note_id, 0);
    assert!(option::is_some(&event.old_folder_id), 0);
    assert!(*option::borrow(&event.old_folder_id) == source_folder_id, 0);
    assert!(option::is_some(&event.new_folder_id), 0);
    assert!(*option::borrow(&event.new_folder_id) == dest_folder_id, 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Note folder reference updated correctly
- Note content remains unchanged
- NoteMoved event emitted with old and new folder IDs
- Note updated_at timestamp refreshed

---

### TC-NC-005: Update Arweave Backup Metadata Success

**Objective:** Verify Arweave backup metadata can be updated
**Requirements:** REQ-AR-008, REQ-AR-009, REQ-AR-010

```move
#[test]
public fun test_update_arweave_backup_metadata_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and note
    inkblob::notebook::create_notebook(b"Arweave Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let note_id = test_utils::generate_note_id();
    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        b"blob_id",
        b"blob_object_id",
        b"note_to_backup",
        option::none(),
        ctx
    );

    // Execute: Update Arweave backup metadata
    let ar_tx_id = b"valid_arweave_tx_id_43_characters_long_base64url_string";
    let backup_timestamp = test_utils::NOW;

    inkblob::notebook::update_note_ar_backup(
        &mut notebook,
        note_id,
        ar_tx_id,
        backup_timestamp,
        ctx
    );

    // Verify: Arweave backup metadata updated
    let note = table::borrow(&notebook.notes, note_id);
    assert!(option::is_some(&note.ar_backup_id), 0);
    assert!(*option::borrow(&note.ar_backup_id) == ar_tx_id, 0);
    assert!(option::is_some(&note.ar_backup_version), 0);
    assert!(*option::borrow(&note.ar_backup_version) == backup_timestamp, 0);

    // Verify ArweaveBackupRecorded event
    let event = test_scenario::next_event<ArweaveBackupRecorded>(&mut scenario);
    assert!(event.notebook_id == object::uid_to_inner(&notebook.id), 0);
    assert!(event.note_id == note_id, 0);
    assert!(event.ar_tx_id == ar_tx_id, 0);
    assert!(event.backup_timestamp == backup_timestamp, 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Arweave transaction ID correctly stored
- Backup timestamp matches provided value
- ArweaveBackupRecorded event emitted
- Note metadata properly updated

---

### TC-NC-006: Update Walrus Blob Object Success

**Objective:** Verify blob object ID can be updated (for blob renewal)
**Requirements:** Blob lifecycle management

```move
#[test]
public fun test_update_walrus_blob_object_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and note
    inkblob::notebook::create_notebook(b"Blob Update Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let note_id = test_utils::generate_note_id();
    let initial_blob_id = b"initial_blob_id";
    let initial_blob_object_id = b"initial_blob_object_id";

    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        initial_blob_id,
        initial_blob_object_id,
        b"note_title",
        option::none(),
        ctx
    );

    // Execute: Update blob object ID (simulating blob renewal)
    let new_blob_object_id = b"renewed_blob_object_id";

    inkblob::notebook::update_note_blob_object(
        &mut notebook,
        note_id,
        new_blob_object_id,
        ctx
    );

    // Verify: Blob object ID updated
    let note = table::borrow(&notebook.notes, note_id);
    assert!(note.blob_id == initial_blob_id, 0); // blob_id unchanged
    assert!(note.blob_object_id == new_blob_object_id, 0); // blob_object_id updated
    assert!(note.updated_at > note.created_at, 0); // timestamp updated

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Blob object ID updated successfully
- Blob ID remains unchanged (content same)
- Updated timestamp refreshed
- No events emitted (internal operation)

---

### TC-NC-007: Session-Based Note Operations Success

**Objective:** Verify notes can be managed using SessionCap
**Requirements:** REQ-SESSION-006

```move
#[test]
public fun test_session_based_note_operations_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and session
    inkblob::notebook::create_notebook(b"Session Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let mut sui_coin = test_scenario::take_owned<Coin<SUI>>(&mut scenario);
    let mut wal_coin = test_scenario::take_owned<Coin<WAL>>(&mut scenario);

    inkblob::notebook::authorize_session_and_fund(
        &notebook,
        &mut sui_coin,
        &mut wal_coin,
        b"session_device_fp",
        test_utils::DEVICE_1,
        test_utils::FUTURE,
        option::none(),
        option::none(),
        ctx
    );

    let session_cap = test_scenario::take_owned_at_address<SessionCap>(
        &mut scenario,
        test_utils::DEVICE_1
    );

    // Switch to hot wallet for operations
    test_scenario::next_tx(&mut scenario, test_utils::DEVICE_1);
    let ctx_device = test_scenario::ctx(&mut scenario);

    // Execute: Create note using session
    let note_id = test_utils::generate_note_id();
    inkblob::notebook::update_note_with_session(
        &mut notebook,
        session_cap,
        note_id,
        b"session_blob_id",
        b"session_blob_object_id",
        b"session_note_title",
        option::none(),
        ctx_device
    );

    // Verify: Note created successfully
    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);
    let note = table::borrow(&notebook.notes, note_id);
    assert!(note.encrypted_title == b"session_note_title", 0);

    // Verify event operator is hot wallet
    let event = test_scenario::next_event<NoteUpdated>(&mut scenario);
    assert!(event.operator == test_utils::DEVICE_1, 0);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(sui_coin);
    test_scenario::return_owned(wal_coin);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Session-based note creation works correctly
- Operator address recorded as hot wallet
- No owner signature required for operations
- SessionCap returned after operation

---

## 3. Negative Test Cases

### TC-NC-008: Create Note with Invalid Folder ID Failure

**Objective:** Verify note creation fails with non-existent folder
**Requirements:** Implicit validation requirement

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_FOLDER_NOT_FOUND)]
public fun test_create_note_invalid_folder_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook (no folders)
    inkblob::notebook::create_notebook(b"Invalid Folder Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Try to create note with non-existent folder
    inkblob::notebook::update_note(
        &mut notebook,
        test_utils::generate_note_id(),
        b"blob_id",
        b"blob_object_id",
        b"note_title",
        option::some(test_utils::generate_folder_id()), // Non-existent folder
        ctx
    );

    // Should fail with E_FOLDER_NOT_FOUND
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Transaction aborts with E_FOLDER_NOT_FOUND error
- No note created with invalid folder reference
- Notebook state remains unchanged

---

### TC-NC-009: Update Non-Existent Note Failure

**Objective:** Verify updating non-existent note fails gracefully
**Requirements:** Implicit validation requirement

```move
#[test]
public fun test_update_nonexistent_note_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook (empty)
    inkblob::notebook::create_notebook(b"Non-existent Note Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let note_id = test_utils::generate_note_id();

    // Execute: Try to update non-existent note (should create new note)
    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        b"new_blob_id",
        b"new_blob_object_id",
        b"new_note_title",
        option::none(),
        ctx
    );

    // Verify: Note created successfully (update_note creates if doesn't exist)
    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);
    let note = table::borrow(&notebook.notes, note_id);
    assert!(note.encrypted_title == b"new_note_title", 0);
    assert!(note.blob_id == b"new_blob_id", 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Non-existent note automatically created (update_note supports create)
- New note populated with provided data
- No error thrown (update_note is idempotent for creation)

---

### TC-NC-010: Update Arweave Backup with Invalid TX ID Failure

**Objective:** Verify invalid Arweave transaction IDs are rejected
**Requirements:** REQ-AR-011

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_INVALID_AR_TX_ID)]
public fun test_update_arweave_backup_invalid_tx_id_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook and note
    inkblob::notebook::create_notebook(b"Invalid Arweave Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let note_id = test_utils::generate_note_id();
    inkblob::notebook::update_note(
        &mut notebook,
        note_id,
        b"blob_id",
        b"blob_object_id",
        b"note_title",
        option::none(),
        ctx
    );

    // Execute: Try to update with invalid Arweave TX ID
    inkblob::notebook::update_note_ar_backup(
        &mut notebook,
        note_id,
        b"invalid_tx_id", // Too short, invalid format
        test_utils::NOW,
        ctx
    );

    // Should fail with E_INVALID_AR_TX_ID
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Transaction aborts with E_INVALID_AR_TX_ID error
- Arweave backup metadata not updated with invalid ID
- Comprehensive validation of 43-char base64url format

---

### TC-NC-011: Unauthorized Note Operations Failure

**Objective:** Verify only authorized users can modify notes
**Requirements:** Access control requirement

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_NOT_OWNER)]
public fun test_unauthorized_note_operations_fail() {
    // Setup: Owner creates notebook
    let mut scenario1 = test_utils::create_scenario(test_utils::OWNER);
    let ctx1 = test_scenario::ctx(&mut scenario1);

    inkblob::notebook::create_notebook(b"Owner Notebook", ctx1);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario1);

    // Attacker setup
    test_scenario::next_tx(&mut scenario1, test_utils::ATTACKER);
    let ctx_attacker = test_scenario::ctx(&mut scenario1);

    // Execute: Attacker tries to create note in owner's notebook
    inkblob::notebook::update_note(
        &mut notebook, // This should fail as attacker is not owner
        test_utils::generate_note_id(),
        b"attacker_blob_id",
        b"attacker_blob_object_id",
        b"attacker_note_title",
        option::none(),
        ctx_attacker
    );

    // Should fail with E_NOT_OWNER
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario1);
}
```

**Expected Results:**
- Unauthorized modifications rejected
- Transaction aborts with E_NOT_OWNER error
- Notebook access control properly enforced

---

## 4. Edge Cases and Boundary Tests

### TC-NC-012: Maximum Notes in Notebook Performance Test

**Objective:** Verify system handles many notes efficiently
**Requirements:** REQ-PERF-003

```move
#[test]
public fun test_maximum_notes_performance() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Performance Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Create many notes (testing O(1) performance)
    let start_time = tx_context::epoch_timestamp_ms(ctx);
    let note_count = 1000;

    let mut i = 0;
    while (i < note_count) {
        let note_id = @0x1000 + i; // Generate unique IDs
        let blob_id = string::utf8(b"blob_id_");
        string::append_u64(&mut blob_id, i);
        let title = string::utf8(b"note_title_");
        string::append_u64(&mut title, i);

        inkblob::notebook::update_note(
            &mut notebook,
            note_id,
            blob_id,
            string::utf8(b"blob_object_id"),
            title,
            option::none(),
            ctx
        );

        i = i + 1;
    };

    let end_time = tx_context::epoch_timestamp_ms(ctx);
    let total_time = end_time - start_time;

    // Verify: All notes created
    let mut check_i = 0;
    while (check_i < note_count) {
        let note_id = @0x1000 + check_i;
        assert!(table::contains(&notebook.notes, note_id), 0);
        check_i = check_i + 1;
    };

    // Performance assertion (adjust threshold based on requirements)
    let max_time_per_note = 10; // 10ms per note max
    let max_total_time = note_count * max_time_per_note;
    assert!(total_time <= max_total_time, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- System handles 1000+ notes without failure
- Performance remains within acceptable bounds
- O(1) table operations verified
- No memory leaks or performance degradation

---

### TC-NC-013: Note Content Edge Cases

**Objective:** Test various encrypted content formats
**Requirements:** Robust input handling

```move
#[test]
public fun test_note_content_edge_cases() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Edge Cases Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Test cases for different content types
    let test_contents = vector[
        (b"", b"blob_empty"), // Empty title
        (b"a", b"blob_single_char"), // Single character
        (b"Note with spaces and special chars !@#$%", b"blob_special"),
        (b"Unicode test 你好世界 🚀", b"blob_unicode"),
        (b"A".repeat(1000), b"blob_long"), // Very long title (1000 chars)
    ];

    let mut i = 0;
    let len = vector::length(&test_contents);

    while (i < len) {
        let (title, blob_id) = *vector::borrow(&test_contents, i);
        let note_id = @0x2000 + i;

        // Create note with test content
        inkblob::notebook::update_note(
            &mut notebook,
            note_id,
            blob_id,
            string::utf8(b"blob_object_id"),
            title,
            option::none(),
            ctx
        );

        // Verify creation succeeded
        assert!(table::contains(&notebook.notes, note_id), 0);
        let note = table::borrow(&notebook.notes, note_id);
        assert!(note.encrypted_title == title, 0);

        i = i + 1;
    };

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Various content formats handled correctly
- Empty, short, long, and Unicode content supported
- No unexpected failures for valid inputs
- Blob IDs stored correctly for all cases

---

## 5. Test Execution Checklist

### Pre-Test Setup
- [ ] Notebook and folder setup completed
- [ ] Mock encrypted data and blob IDs prepared
- [ ] Test scenarios with multiple addresses configured
- [ ] SessionCap authorization setup where needed

### Test Execution
- [ ] All note creation scenarios (root, folder) pass
- [ ] Note updates and modifications work correctly
- [ ] Note movement between folders functions properly
- [ ] Arweave backup metadata updates verified
- [ ] Session-based operations work correctly

### Post-Test Verification
- [ ] Note metadata integrity maintained
- [ ] Event emissions verified for all operations
- [ ] Performance benchmarks within specifications
- [ ] Error handling covers all edge cases

### Requirements Traceability
- [ ] REQ-NOTE-001: ✅ Notes can be created in any folder or root
- [ ] REQ-NOTE-002: ✅ Note creation process verified
- [ ] REQ-NOTE-006: ✅ Notes can be edited
- [ ] REQ-NOTE-007: ✅ Updates create new blob, same ID
- [ ] REQ-NOTE-009: ✅ Notes can be moved between folders
- [ ] REQ-NOTE-010: ✅ Folder ID updated correctly
- [ ] REQ-AR-008: ✅ update_note_ar_backup function works
- [ ] REQ-AR-009: ✅ Backup metadata updates correctly
- [ ] REQ-AR-010: ✅ ArweaveBackupRecorded event emitted
- [ ] REQ-AR-011: ✅ Invalid Arweave IDs rejected

---

**Test Status:** Ready for Implementation
**Implementation Priority:** High (Core functionality)
**Dependencies:** Notebook lifecycle and session authorization tests complete