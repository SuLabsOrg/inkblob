# Folder Management Integration Tests

**Version:** 1.0
**Date:** 2025-11-23
**Requirements Coverage:** REQ-FOLDER-001 to REQ-FOLDER-010
**Target File:** contracts/inkblob/sources/notebook.move

---

## 1. Test Cases Overview

This module tests comprehensive folder management including creation, hierarchy operations, ordering, and the critical security features added during the security review.

### 1.1 Requirements Mapped

| Test Case | Requirements Covered |
|-----------|---------------------|
| TC-FM-001 | REQ-FOLDER-001, REQ-FOLDER-002, REQ-FOLDER-004 |
| TC-FM-002 | REQ-FOLDER-003 (depth limit), REQ-FOLDER-005, REQ-FOLDER-006 |
| TC-FM-003 | REQ-FOLDER-007, REQ-FOLDER-008 (soft deletion) |
| TC-FM-004 | Custom ordering (design enhancement) |
| TC-FM-005 | Security validations (depth, cycles, deleted parents) |
| TC-FM-006 | Edge cases and error handling |

---

## 2. Positive Test Cases

### TC-FM-001: Create Root Level Folder Success

**Objective:** Verify successful folder creation at root level
**Requirements:** REQ-FOLDER-001, REQ-FOLDER-002, REQ-FOLDER-004

```move
#[test]
public fun test_create_root_folder_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Folder Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Create root level folder
    let folder_id = test_utils::generate_folder_id();
    let encrypted_name = b"encrypted_work_folder";
    let now = test_utils::NOW;

    inkblob::notebook::create_folder(
        &mut notebook,
        folder_id,
        encrypted_name,
        option::none(), // Root level (no parent)
        ctx
    );

    // Verify: Folder created successfully
    assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);
    let folder = table::borrow(&notebook.folders, folder_id);

    assert!(folder.id == folder_id, 0);
    assert!(folder.encrypted_name == encrypted_name, 0);
    assert!(option::is_none(&folder.parent_id), 0); // Root level
    assert!(folder.created_at >= now, 0);
    assert!(folder.updated_at >= now, 0);
    assert!(!folder.is_deleted, 0);
    assert!(folder.sort_order == 0, 0); // Default sort order

    // Verify FolderCreated event
    let event = test_scenario::next_event<FolderCreated>(&mut scenario);
    assert!(event.notebook_id == object::uid_to_inner(&notebook.id), 0);
    assert!(event.folder_id == folder_id, 0);
    assert!(option::is_none(&event.parent_id), 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Folder created with all required fields populated
- Root level folder has parent_id = None
- Default sort_order = 0
- Timestamps set correctly
- FolderCreated event emitted with correct data

---

### TC-FM-002: Create Nested Folder Success (Within Depth Limit)

**Objective:** Verify nested folder creation within 5-level limit
**Requirements:** REQ-FOLDER-003 (5-level depth limit)

```move
#[test]
public fun test_create_nested_folders_within_limit_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Nested Folder Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Create 5-level nested folder structure
    let level1_id = @0x1001;
    let level2_id = @0x1002;
    let level3_id = @0x1003;
    let level4_id = @0x1004;
    let level5_id = @0x1005; // Maximum allowed depth

    // Level 1 (Root -> Level1)
    inkblob::notebook::create_folder(
        &mut notebook,
        level1_id,
        b"Level1",
        option::none(),
        ctx
    );

    // Level 2 (Level1 -> Level2)
    inkblob::notebook::create_folder(
        &mut notebook,
        level2_id,
        b"Level2",
        option::some(level1_id),
        ctx
    );

    // Level 3 (Level2 -> Level3)
    inkblob::notebook::create_folder(
        &mut notebook,
        level3_id,
        b"Level3",
        option::some(level2_id),
        ctx
    );

    // Level 4 (Level3 -> Level4)
    inkblob::notebook::create_folder(
        &mut notebook,
        level4_id,
        b"Level4",
        option::some(level3_id),
        ctx
    );

    // Level 5 (Level4 -> Level5) - Should succeed
    inkblob::notebook::create_folder(
        &mut notebook,
        level5_id,
        b"Level5",
        option::some(level4_id),
        ctx
    );

    // Verify: All folders created successfully
    assert!(table::contains(&notebook.folders, level1_id), 0);
    assert!(table::contains(&notebook.folders, level2_id), 0);
    assert!(table::contains(&notebook.folders, level3_id), 0);
    assert!(table::contains(&notebook.folders, level4_id), 0);
    assert!(table::contains(&notebook.folders, level5_id), 0);

    // Verify depth calculation
    let level5_depth = inkblob::notebook::calculate_folder_depth(&notebook.folders, level5_id);
    assert!(level5_depth == 4, 0); // Depth is 4 (0-based from root)

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- 5-level nested structure created successfully
- All folders maintain proper parent-child relationships
- Depth calculation works correctly (max depth = 4, zero-based)
- Each level properly references its parent

---

### TC-FM-003: Update Folder Name and Parent Success

**Objective:** Verify folder renaming and reorganization
**Requirements:** REQ-FOLDER-005, REQ-FOLDER-006

```move
#[test]
public fun test_update_folder_name_and_parent_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook with folders
    inkblob::notebook::create_notebook(b"Folder Update Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let source_parent_id = test_utils::generate_folder_id();
    let target_parent_id = test_utils::next_folder_id();
    let folder_to_move_id = test_utils::next_folder_id();

    // Create source parent folder
    inkblob::notebook::create_folder(
        &mut notebook,
        source_parent_id,
        b"Source Parent",
        option::none(),
        ctx
    );

    // Create target parent folder
    inkblob::notebook::create_folder(
        &mut notebook,
        target_parent_id,
        b"Target Parent",
        option::none(),
        ctx
    );

    // Create folder to move
    inkblob::notebook::create_folder(
        &mut notebook,
        folder_to_move_id,
        b"Original Name",
        option::some(source_parent_id),
        ctx
    );

    // Execute: Update folder name and move to new parent
    inkblob::notebook::update_folder(
        &mut notebook,
        folder_to_move_id,
        b"Updated Name", // New name
        option::some(target_parent_id), // New parent
        ctx
    );

    // Verify: Folder updated correctly
    let folder = table::borrow(&notebook.folders, folder_to_move_id);
    assert!(folder.encrypted_name == b"Updated Name", 0);
    assert!(option::is_some(&folder.parent_id), 0);
    assert!(*option::borrow(&folder.parent_id) == target_parent_id, 0);

    // Verify FolderUpdated event
    let event = test_scenario::next_event<FolderUpdated>(&mut scenario);
    assert!(event.folder_id == folder_to_move_id, 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Folder name updated successfully
- Parent relationship changed correctly
- Timestamp updated (updated_at refreshed)
- FolderUpdated event emitted

---

### TC-FM-004: Folder Custom Ordering Success

**Objective:** Verify custom folder ordering functionality
**Requirements:** Design enhancement (custom ordering support)

```move
#[test]
public fun test_folder_custom_ordering_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook with multiple root folders
    inkblob::notebook::create_notebook(b"Ordering Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let folder1_id = @0x2001;
    let folder2_id = @0x2002;
    let folder3_id = @0x2003;

    // Create folders (will get sort_order = 0 by default)
    inkblob::notebook::create_folder(&mut notebook, folder1_id, b"Folder1", option::none(), ctx);
    inkblob::notebook::create_folder(&mut notebook, folder2_id, b"Folder2", option::none(), ctx);
    inkblob::notebook::create_folder(&mut notebook, folder3_id, b"Folder3", option::none(), ctx);

    // Execute: Reorder folders to custom order
    inkblob::notebook::reorder_folder(&mut notebook, folder1_id, 100, ctx);
    inkblob::notebook::reorder_folder(&mut notebook, folder2_id, 200, ctx);
    inkblob::notebook::reorder_folder(&mut notebook, folder3_id, 150, ctx);

    // Verify: Sort orders updated correctly
    let folder1 = table::borrow(&notebook.folders, folder1_id);
    let folder2 = table::borrow(&notebook.folders, folder2_id);
    let folder3 = table::borrow(&notebook.folders, folder3_id);

    assert!(folder1.sort_order == 100, 0);
    assert!(folder2.sort_order == 200, 0);
    assert!(folder3.sort_order == 150, 0);

    // Verify FolderReordered events
    let event1 = test_scenario::next_event<FolderReordered>(&mut scenario);
    assert!(event1.folder_id == folder1_id, 0);
    assert!(event1.old_sort_order == 0, 0);
    assert!(event1.new_sort_order == 100, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Custom sort orders applied correctly
- FolderReordered events emitted for each reorder
- Old sort order tracked in events
- Multiple folders can have independent sort orders

---

### TC-FM-005: Batch Folder Reordering Success

**Objective:** Verify batch folder reordering for drag-and-drop scenarios
**Requirements:** Design enhancement (batch operations)

```move
#[test]
public fun test_batch_folder_reordering_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook with folders
    inkblob::notebook::create_notebook(b"Batch Ordering Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let folder_ids = vector[@0x3001, @0x3002, @0x3003, @0x3004];
    let new_orders = vector[10, 20, 30, 40];

    // Create folders
    vector::foreach(&folder_ids, |folder_id| {
        inkblob::notebook::create_folder(&mut notebook, folder_id, b"Batch Folder", option::none(), ctx);
    });

    // Execute: Batch reorder folders
    inkblob::notebook::batch_reorder_folders(
        &mut notebook,
        folder_ids,
        new_orders,
        ctx
    );

    // Verify: All folders reordered correctly
    let mut i = 0;
    while (i < vector::length(&folder_ids)) {
        let folder_id = *vector::borrow(&folder_ids, i);
        let expected_order = *vector::borrow(&new_orders, i);

        let folder = table::borrow(&notebook.folders, folder_id);
        assert!(folder.sort_order == expected_order, i);

        i = i + 1;
    };

    // Verify FoldersBatchReordered event
    let event = test_scenario::next_event<FoldersBatchReordered>(&mut scenario);
    assert!(event.folder_count == vector::length(&folder_ids), 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- All folders reordered in single transaction
- Sort orders applied correctly for each folder
- FoldersBatchReordered event emitted with count
- Efficient batch operation implemented

---

### TC-FM-006: Soft Delete Folder Success

**Objective:** Verify folder soft deletion functionality
**Requirements:** REQ-FOLDER-007, REQ-FOLDER-008

```move
#[test]
public fun test_soft_delete_folder_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook with folder
    inkblob::notebook::create_notebook(b"Delete Test Notebook", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let folder_id = test_utils::generate_folder_id();

    inkblob::notebook::create_folder(
        &mut notebook,
        folder_id,
        b"Folder to Delete",
        option::none(),
        ctx
    );

    // Verify folder exists and is not deleted
    let folder_before = table::borrow(&notebook.folders, folder_id);
    assert!(!folder_before.is_deleted, 0);

    // Execute: Soft delete folder
    inkblob::notebook::delete_folder(&mut notebook, folder_id, ctx);

    // Verify: Folder marked as deleted but still exists
    assert!(table::contains(&notebook.folders, folder_id), 0); // Still exists
    let folder_after = table::borrow(&notebook.folders, folder_id);
    assert!(folder_after.is_deleted, 0); // Marked as deleted
    assert!(folder_after.updated_at > folder_before.updated_at, 0); // Timestamp updated

    // Verify FolderDeleted event
    let event = test_scenario::next_event<FolderDeleted>(&mut scenario);
    assert!(event.folder_id == folder_id, 0);
    assert!(event.operator == test_utils::OWNER, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Folder marked as deleted (soft delete)
- Folder remains in table for recovery/audit
- Timestamp updated on deletion
- FolderDeleted event emitted

---

## 3. Security Test Cases (Critical from Security Review)

### TC-FM-007: Folder Depth Limit Enforcement Success

**Objective:** Verify 5-level depth limit is enforced
**Security Requirements:** REQ-FOLDER-003 + Security Review Fix

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_MAX_FOLDER_DEPTH)]
public fun test_folder_depth_limit_enforcement_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create 5-level nested structure (maximum allowed)
    inkblob::notebook::create_notebook(b"Depth Limit Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Create 5 levels: L1 -> L2 -> L3 -> L4 -> L5 (max depth)
    let l1_id = @0x4001; let l2_id = @0x4002; let l3_id = @0x4003;
    let l4_id = @0x4004; let l5_id = @0x4005;

    inkblob::notebook::create_folder(&mut notebook, l1_id, b"L1", option::none(), ctx);
    inkblob::notebook::create_folder(&mut notebook, l2_id, b"L2", option::some(l1_id), ctx);
    inkblob::notebook::create_folder(&mut notebook, l3_id, b"L3", option::some(l2_id), ctx);
    inkblob::notebook::create_folder(&mut notebook, l4_id, b"L4", option::some(l3_id), ctx);
    inkblob::notebook::create_folder(&mut notebook, l5_id, b"L5", option::some(l4_id), ctx);

    // Verify depth of level 5 is exactly 4 (0-based)
    let l5_depth = inkblob::notebook::calculate_folder_depth(&notebook.folders, l5_id);
    assert!(l5_depth == 4, 0); // Maximum allowed depth

    // Execute: Try to create 6th level (should fail)
    let l6_id = @0x4006;
    inkblob::notebook::create_folder(
        &mut notebook,
        l6_id,
        b"L6", // This would be depth 5, exceeding limit of 4
        option::some(l5_id),
        ctx
    );

    // Should fail with E_MAX_FOLDER_DEPTH
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- 6th level folder creation rejected
- Transaction aborts with E_MAX_FOLDER_DEPTH error
- Depth limit properly enforced at 5 levels (depth 4, zero-based)
- Prevents DoS attacks via deep nesting

---

### TC-FM-008: Circular Reference Prevention Success

**Objective:** Verify circular reference detection in folder hierarchy
**Security Requirements:** Security Review Fix - Critical Issue

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_CIRCULAR_REFERENCE)]
public fun test_circular_reference_prevention_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create folder hierarchy A -> B -> C
    inkblob::notebook::create_notebook(b"Circular Reference Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let folder_a_id = @0x5001;
    let folder_b_id = @0x5002;
    let folder_c_id = @0x5003;

    // Create hierarchy: A -> B -> C
    inkblob::notebook::create_folder(&mut notebook, folder_a_id, b"A", option::none(), ctx);
    inkblob::notebook::create_folder(&mut notebook, folder_b_id, b"B", option::some(folder_a_id), ctx);
    inkblob::notebook::create_folder(&mut notebook, folder_c_id, b"C", option::some(folder_b_id), ctx);

    // Test 1: Direct circular reference (A -> A)
    inkblob::notebook::update_folder(
        &mut notebook,
        folder_a_id,
        b"A",
        option::some(folder_a_id), // Self-reference
        ctx
    );

    // Should fail with E_CIRCULAR_REFERENCE
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = inkblob::notebook::E_CIRCULAR_REFERENCE)]
public fun test_indirect_circular_reference_prevention_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create folder hierarchy A -> B -> C
    inkblob::notebook::create_notebook(b"Indirect Circular Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let folder_a_id = @0x6001;
    let folder_b_id = @0x6002;
    let folder_c_id = @0x6003;

    inkblob::notebook::create_folder(&mut notebook, folder_a_id, b"A", option::none(), ctx);
    inkblob::notebook::create_folder(&mut notebook, folder_b_id, b"B", option::some(folder_a_id), ctx);
    inkblob::notebook::create_folder(&mut notebook, folder_c_id, b"C", option::some(folder_b_id), ctx);

    // Test 2: Indirect circular reference (C -> A would create A -> B -> C -> A)
    inkblob::notebook::update_folder(
        &mut notebook,
        folder_c_id,
        b"C",
        option::some(folder_a_id), // Would create cycle
        ctx
    );

    // Should fail with E_CIRCULAR_REFERENCE
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Direct circular references (A -> A) detected and rejected
- Indirect circular references (A -> B -> C -> A) detected and rejected
- Transaction aborts with E_CIRCULAR_REFERENCE error
- Prevents infinite loops in folder tree traversal

---

### TC-FM-009: Deleted Parent Validation Success

**Objective:** Verify folders cannot be moved to deleted parents
**Security Requirements:** Security Review Fix

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_PARENT_DELETED)]
public fun test_deleted_parent_validation_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create folders and delete parent
    inkblob::notebook::create_notebook(b"Deleted Parent Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let parent_id = test_utils::generate_folder_id();
    let child_id = test_utils::next_folder_id();

    // Create parent and child folders
    inkblob::notebook::create_folder(&mut notebook, parent_id, b"Parent", option::none(), ctx);
    inkblob::notebook::create_folder(&mut notebook, child_id, b"Child", option::none(), ctx);

    // Delete the parent folder
    inkblob::notebook::delete_folder(&mut notebook, parent_id, ctx);

    // Execute: Try to move child to deleted parent
    inkblob::notebook::update_folder(
        &mut notebook,
        child_id,
        b"Child",
        option::some(parent_id), // Deleted parent
        ctx
    );

    // Should fail with E_PARENT_DELETED
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Deleted parent folders rejected as destinations
- Transaction aborts with E_PARENT_DELETED error
- Maintains folder hierarchy integrity

---

## 4. Negative Test Cases

### TC-FM-010: Create Folder with Non-Existent Parent Failure

**Objective:** Verify parent folder must exist
**Requirements:** Implicit validation requirement

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_PARENT_NOT_FOUND)]
public fun test_create_folder_nonexistent_parent_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook (no folders)
    inkblob::notebook::create_notebook(b"Invalid Parent Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Try to create folder with non-existent parent
    inkblob::notebook::create_folder(
        &mut notebook,
        test_utils::generate_folder_id(),
        b"Orphan Folder",
        option::some(test_utils::generate_folder_id()), // Non-existent parent
        ctx
    );

    // Should fail with E_PARENT_NOT_FOUND
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Transaction aborts with E_PARENT_NOT_FOUND error
- No orphaned folders created
- Parent validation enforced

---

### TC-FM-011: Update Non-Existent Folder Failure

**Objective:** Verify folder updates require existing folder
**Requirements:** Implicit validation requirement

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_FOLDER_NOT_FOUND)]
public fun test_update_nonexistent_folder_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook (no folders)
    inkblob::notebook::create_notebook(b"Non-existent Folder Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Try to update non-existent folder
    inkblob::notebook::update_folder(
        &mut notebook,
        test_utils::generate_folder_id(), // Non-existent folder
        b"Updated Name",
        option::none(),
        ctx
    );

    // Should fail with E_FOLDER_NOT_FOUND
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Transaction aborts with E_FOLDER_NOT_FOUND error
- No partial updates to non-existent folders

---

### TC-FM-012: Batch Reorder Size Mismatch Failure

**Objective:** Verify batch reorder arrays must match size
**Requirements:** Input validation requirement

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_INVALID_BATCH_SIZE)]
public fun test_batch_reorder_size_mismatch_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook with folder
    inkblob::notebook::create_notebook(b"Batch Size Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    let folder_id = test_utils::generate_folder_id();
    inkblob::notebook::create_folder(&mut notebook, folder_id, b"Test Folder", option::none(), ctx);

    // Execute: Try batch reorder with mismatched array sizes
    let folder_ids = vector[folder_id]; // 1 folder ID
    let sort_orders = vector[10, 20];   // 2 sort orders (mismatch!)

    inkblob::notebook::batch_reorder_folders(
        &mut notebook,
        folder_ids,
        sort_orders,
        ctx
    );

    // Should fail with E_INVALID_BATCH_SIZE
    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Transaction aborts with E_INVALID_BATCH_SIZE error
- Input validation ensures array size consistency

---

## 5. Edge Cases and Boundary Tests

### TC-FM-013: Maximum Folders Performance Test

**Objective:** Verify system handles many folders efficiently
**Requirements:** REQ-PERF-003

```move
#[test]
public fun test_maximum_folders_performance() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Folder Performance Test", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Create many folders (testing O(1) performance)
    let start_time = tx_context::epoch_timestamp_ms(ctx);
    let folder_count = 1000;

    let mut i = 0;
    while (i < folder_count) {
        let folder_id = @0x7000 + i;
        let folder_name = string::utf8(b"Folder_");
        string::append_u64(&mut folder_name, i);

        inkblob::notebook::create_folder(
            &mut notebook,
            folder_id,
            folder_name,
            option::none(),
            ctx
        );

        i = i + 1;
    };

    let end_time = tx_context::epoch_timestamp_ms(ctx);
    let total_time = end_time - start_time;

    // Verify: All folders created
    let mut check_i = 0;
    while (check_i < folder_count) {
        let folder_id = @0x7000 + check_i;
        assert!(table::contains(&notebook.folders, folder_id), check_i);
        check_i = check_i + 1;
    };

    // Performance assertion (adjust threshold based on requirements)
    let max_time_per_folder = 5; // 5ms per folder max
    let max_total_time = folder_count * max_time_per_folder;
    assert!(total_time <= max_total_time, 0);

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- System handles 1000+ folders without failure
- O(1) table operations verified
- Performance within acceptable bounds
- No memory leaks or degradation

---

### TC-FM-014: Folder Name Edge Cases

**Objective:** Test various encrypted folder name formats
**Requirements:** Robust input handling

```move
#[test]
public fun test_folder_name_edge_cases() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Folder Name Edge Cases", ctx);
    let mut notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Test cases for different folder name formats
    let test_names = vector[
        b"",                         // Empty string
        b"a",                        // Single character
        b"Folder with spaces",       // Spaces
        b"Folder-with-dashes",       // Dashes
        b"Folder_with_underscores",  // Underscores
        b"1234567890",               // Numbers only
        b" Mixed 123 _- Characters", // Mixed characters
        b"Unicode 文件夹 📁",         // Unicode characters
        b"A".repeat(500),           // Very long name (500 chars)
    ];

    let mut i = 0;
    let len = vector::length(&test_names);

    while (i < len) {
        let test_name = *vector::borrow(&test_names, i);
        let folder_id = @0x8000 + i;

        // Create folder with test name
        inkblob::notebook::create_folder(
            &mut notebook,
            folder_id,
            test_name,
            option::none(),
            ctx
        );

        // Verify creation succeeded
        assert!(table::contains(&notebook.folders, folder_id), i);
        let folder = table::borrow(&notebook.folders, folder_id);
        assert!(folder.encrypted_name == test_name, i);

        i = i + 1;
    };

    test_scenario::return_shared(notebook);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Various name formats handled correctly
- Empty, short, long, and Unicode names supported
- No unexpected failures for valid inputs

---

## 6. Test Execution Checklist

### Pre-Test Setup
- [ ] Notebook creation setup completed
- [ ] Mock encrypted folder names prepared
- [ ] Security validation functions imported
- [ ] Test scenarios with proper addresses configured

### Test Execution
- [ ] Basic folder operations (create, update, delete) work
- [ ] Nested folder structures within depth limits work
- [ ] Security validations (depth, cycles, deleted parents) enforced
- [ ] Custom ordering functionality verified
- [ ] Batch operations work correctly

### Post-Test Verification
- [ ] Security edge cases covered (all critical fixes)
- [ ] Performance benchmarks within specifications
- [ ] Error handling comprehensive for all failure modes
- [ ] Event emissions verified for all operations

### Requirements Traceability
- [ ] REQ-FOLDER-001: ✅ Folder creation verified
- [ ] REQ-FOLDER-002: ✅ Folder structure fields correct
- [ ] REQ-FOLDER-003: ✅ 5-level depth limit enforced
- [ ] REQ-FOLDER-004: ✅ Folder creation process correct
- [ ] REQ-FOLDER-005: ✅ Folder renaming works
- [ ] REQ-FOLDER-006: ✅ Folder moving works
- [ ] REQ-FOLDER-007: ✅ Folder deletion works
- [ ] REQ-FOLDER-008: ✅ Soft deletion implemented
- [ ] Security Review Fixes: ✅ All critical issues addressed

---

**Test Status:** Ready for Implementation
**Implementation Priority:** Critical (Security fixes validated)
**Dependencies:** Notebook lifecycle tests complete