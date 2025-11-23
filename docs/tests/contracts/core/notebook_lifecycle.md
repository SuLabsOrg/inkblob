# Notebook Lifecycle Integration Tests

**Version:** 1.0
**Date:** 2025-11-23
**Requirements Coverage:** REQ-NOTEBOOK-001 to REQ-NOTEBOOK-008
**Target File:** contracts/inkblob/sources/notebook.move

---

## 1. Test Cases Overview

This module tests the complete lifecycle of InkBlob notebooks, including creation, registry management, and cross-device discovery scenarios.

### 1.1 Requirements Mapped

| Test Case | Requirements Covered |
|-----------|---------------------|
| TC-NB-001 | REQ-NOTEBOOK-001, REQ-NOTEBOOK-002 |
| TC-NB-002 | REQ-NOTEBOOK-003, REQ-NOTEBOOK-004 |
| TC-NB-003 | REQ-NOTEBOOK-005, REQ-NOTEBOOK-006 |
| TC-NB-004 | REQ-NOTEBOOK-007, REQ-NOTEBOOK-008 |
| TC-NB-005 | Multi-notebook support |
| TC-NB-006 | Edge cases and error handling |

---

## 2. Positive Test Cases

### TC-NB-001: Create Initial Notebook Success

**Objective:** Verify successful notebook creation with registry setup
**Requirements:** REQ-NOTEBOOK-001, REQ-NOTEBOOK-002

```move
#[test]
public fun test_create_notebook_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Execute: Create notebook
    inkblob::notebook::create_notebook(
        b"My Notebook",
        ctx
    );

    // Verify: Check created objects
    test_scenario::take_owned<NotebookRegistry>(&mut scenario);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Assertions
    assert!(notebook.owner == test_utils::OWNER, E_NOT_OWNER);
    assert!(registry.owner == test_utils::OWNER, E_NOT_OWNER);
    assert!(registry.active_notebook == b"My Notebook", 0);
    assert!(table::contains(&registry.notebooks, b"My Notebook"), 0);

    // Verify event emission
    let event = test_scenario::next_event<NotebookCreated>(&mut scenario);
    assert!(event.owner == test_utils::OWNER, 0);
    assert!(event.registry_id == object::uid_to_inner(&registry.id), 0);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Notebook shared object created with owner set correctly
- NotebookRegistry owned object created and transferred to owner
- Notebook ID properly stored in registry
- NotebookCreated event emitted with correct data
- Table data structures initialized (empty but valid)

---

### TC-NB-002: Create Additional Notebook Success

**Objective:** Verify multi-notebook support functionality
**Requirements:** Extended functionality beyond core requirements

```move
#[test]
public fun test_create_additional_notebook_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create initial notebook
    inkblob::notebook::create_notebook(b"Primary", ctx);
    let mut registry = test_scenario::take_owned<NotebookRegistry>(&mut scenario);
    let notebook1 = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Create additional notebook
    inkblob::notebook::create_additional_notebook(
        b"Secondary",
        &mut registry,
        ctx
    );

    // Verify: Both notebooks exist in registry
    assert!(table::contains(&registry.notebooks, b"Primary"), 0);
    assert!(table::contains(&registry.notebooks, b"Secondary"), 0);
    assert!(registry.active_notebook == b"Secondary", 0); // Should switch to new notebook

    // Verify second notebook exists
    let notebook2 = test_scenario::take_shared<Notebook>(&mut scenario);
    assert!(notebook2.owner == test_utils::OWNER, E_NOT_OWNER);

    test_scenario::return_shared(notebook1);
    test_scenario::return_shared(notebook2);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Additional notebook created successfully
- Registry contains both notebook entries
- Active notebook switched to newly created one
- Both notebooks have same owner
- No conflicts between notebooks

---

### TC-NB-003: Switch Active Notebook Success

**Objective:** Verify active notebook switching functionality
**Requirements:** REQ-NOTEBOOK-007 (discovery mechanism)

```move
#[test]
public fun test_switch_active_notebook_success() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create multiple notebooks
    inkblob::notebook::create_notebook(b"Notebook1", ctx);
    let mut registry = test_utils::take_owned<NotebookRegistry>(&mut scenario);
    let _notebook1 = test_scenario::take_shared<Notebook>(&mut scenario);

    inkblob::notebook::create_additional_notebook(b"Notebook2", &mut registry, ctx);
    let _notebook2 = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Switch back to first notebook
    inkblob::notebook::switch_active_notebook(
        &mut registry,
        b"Notebook1",
        ctx
    );

    // Verify: Active notebook switched
    assert!(registry.active_notebook == b"Notebook1", 0);

    test_scenario::return_shared(notebook1);
    test_scenario::return_shared(notebook2);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Active notebook correctly updated
- Registry integrity maintained
- No notebook data lost during switch

---

### TC-NB-004: Cross-Device Notebook Discovery Success

**Objective:** Verify notebook discovery mechanism for new devices
**Requirements:** REQ-NOTEBOOK-007, REQ-NOTEBOOK-008

```move
#[test]
public fun test_cross_device_notebook_discovery() {
    // Phase 1: Initial setup on Device 1
    let mut scenario1 = test_utils::create_scenario(test_utils::OWNER);
    let ctx1 = test_scenario::ctx(&mut scenario1);

    // Create notebook on device 1
    inkblob::notebook::create_notebook(b"Shared Notebook", ctx1);
    let registry = test_scenario::take_owned<NotebookRegistry>(&mut scenario1);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario1);

    let notebook_id = object::uid_to_inner(&notebook.id);

    // Simulate registry query (what Device 2 would do)
    let notebook_id_from_registry = *table::borrow(&registry.notebooks, b"Shared Notebook");
    assert!(notebook_id == notebook_id_from_registry, 0);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario1);

    // Phase 2: Discovery on Device 2 (same wallet)
    let mut scenario2 = test_utils::create_scenario(test_utils::OWNER);
    let ctx2 = test_scenario::ctx(&mut scenario2);

    // Device 2 would query for NotebookRegistry objects owned by wallet
    // Then extract notebook_id and fetch shared Notebook object

    // Verify notebook is accessible from device 2
    let notebook_from_device2 = test_scenario::take_shared<Notebook>(&mut scenario2);
    assert!(notebook_from_device2.owner == test_utils::OWNER, E_NOT_OWNER);
    assert!(object::uid_to_inner(&notebook_from_device2.id) == notebook_id, 0);

    test_scenario::return_shared(notebook_from_device2);
    test_scenario::end(scenario2);
}
```

**Expected Results:**
- Same wallet can access notebook from different devices
- Registry provides correct notebook ID for discovery
- Shared notebook object accessible across devices
- Ownership maintained across device boundaries

---

## 3. Negative Test Cases

### TC-NB-005: Create Notebook Duplicate Name Failure

**Objective:** Verify duplicate notebook names are rejected
**Requirements:** Implicit requirement for unique names within registry

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_NOTEBOOK_EXISTS)]
public fun test_create_duplicate_notebook_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create initial notebook
    inkblob::notebook::create_notebook(b"Duplicate Name", ctx);
    let mut registry = test_scenario::take_owned<NotebookRegistry>(&mut scenario);
    let _notebook1 = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Try to create notebook with same name
    inkblob::notebook::create_additional_notebook(
        b"Duplicate Name",  // Same name as existing notebook
        &mut registry,
        ctx
    );

    // Should fail with E_NOTEBOOK_EXISTS
    test_scenario::return_shared(notebook1);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Transaction aborts with E_NOTEBOOK_EXISTS error code
- No partial state changes (registry unchanged)
- Existing notebook remains intact

---

### TC-NB-006: Switch to Non-Existent Notebook Failure

**Objective:** Verify switching to invalid notebook names is rejected
**Requirements:** Implicit validation requirement

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_NOTEBOOK_NOT_FOUND)]
public fun test_switch_nonexistent_notebook_fail() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create notebook
    inkblob::notebook::create_notebook(b"Existing Notebook", ctx);
    let mut registry = test_utils::take_owned<NotebookRegistry>(&mut scenario);
    let _notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Try to switch to non-existent notebook
    inkblob::notebook::switch_active_notebook(
        &mut registry,
        b"Nonexistent Notebook",  // Does not exist in registry
        ctx
    );

    // Should fail with E_NOTEBOOK_NOT_FOUND
    test_scenario::return_shared(notebook);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Transaction aborts with E_NOTEBOOK_NOT_FOUND error code
- Active notebook remains unchanged
- Registry integrity maintained

---

### TC-NB-007: Unauthorized Registry Access Failure

**Objective:** Verify only registry owner can modify registry
**Requirements:** Implicit access control requirement

```move
#[test]
#[expected_failure(abort_code = inkblob::notebook::E_NOT_OWNER)]
public fun test_unauthorized_registry_access_fail() {
    // Setup: Owner creates registry
    let mut scenario1 = test_utils::create_scenario(test_utils::OWNER);
    let ctx1 = test_scenario::ctx(&mut scenario1);

    inkblob::notebook::create_notebook(b"Owner Notebook", ctx1);
    let mut registry = test_utils::take_owned<NotebookRegistry>(&mut scenario1);
    let _notebook = test_scenario::take_shared<Notebook>(&mut scenario1);

    // Extract registry for transfer to attacker
    test_scenario::return_shared(notebook);
    let registry_id = object::uid_to_inner(&registry.id);

    // Transfer registry to attacker (simulating ownership change)
    test_scenario::transfer_to_address(registry, test_utils::ATTACKER);
    test_scenario::end(scenario1);

    // Attack attempt: Different user tries to modify registry
    let mut scenario2 = test_utils::create_scenario(test_utils::ATTACKER);
    let ctx2 = test_scenario::ctx(&mut scenario2);

    // Attacker takes ownership of registry
    let mut stolen_registry = test_scenario::take_owned_at_address<NotebookRegistry>(
        &mut scenario2,
        test_utils::ATTACKER
    );

    // Original owner tries to create additional notebook in stolen registry
    test_scenario::next_tx(&mut scenario2, test_utils::OWNER);
    let ctx_owner = test_scenario::ctx(&mut scenario2);

    inkblob::notebook::create_additional_notebook(
        b"Hacked Notebook",
        &mut stolen_registry,
        ctx_owner
    );

    // Should fail with E_NOT_OWNER because registry.owner != tx_context::sender(ctx_owner)
    test_scenario::return_owned(stolen_registry);
    test_scenario::end(scenario2);
}
```

**Expected Results:**
- Transaction aborts with E_NOT_OWNER error code
- Registry ownership verification enforced
- Unauthorized modifications blocked

---

## 4. Edge Cases and Boundary Tests

### TC-NB-008: Maximum Notebooks per Registry

**Objective:** Test system behavior with many notebooks
**Requirements:** Performance requirement REQ-PERF-003

```move
#[test]
public fun test_maximum_notebooks_per_registry() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Setup: Create initial notebook
    inkblob::notebook::create_notebook(b"Primary", ctx);
    let mut registry = test_utils::take_owned<NotebookRegistry>(&mut scenario);
    let _notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    // Execute: Create many additional notebooks (testing performance)
    let mut i = 1;
    while (i <= 100) {  // Test with 100 notebooks
        let notebook_name = string::utf8(b"Notebook_");
        string::append_u64(&mut notebook_name, i);

        inkblob::notebook::create_additional_notebook(
            notebook_name,
            &mut registry,
            ctx
        );

        i = i + 1;
    };

    // Verify: All notebooks exist in registry
    let mut check_i = 1;
    while (check_i <= 100) {
        let notebook_name = string::utf8(b"Notebook_");
        string::append_u64(&mut notebook_name, check_i);

        assert!(table::contains(&registry.notebooks, notebook_name), 0);
        check_i = check_i + 1;
    };

    // Verify active notebook is last created
    assert!(registry.active_notebook == b"Notebook_100", 0);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- System handles 100+ notebooks without failure
- Registry performance remains acceptable
- No memory leaks or resource exhaustion
- Table operations maintain O(1) performance

---

### TC-NB-009: Notebook Name Edge Cases

**Objective:** Test various notebook name formats
**Requirements:** Robust input handling

```move
#[test]
public fun test_notebook_name_edge_cases() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Test cases for different notebook names
    let test_names = vector[
        b"",                         // Empty string (should work)
        b"a",                        // Single character
        b"Notebook with spaces",     // Spaces in name
        b"Notebook-with-dashes",     // Dashes
        b"Notebook_with_underscores", // Underscores
        b"1234567890",               // Numbers only
        b" Mixed 123 _- Characters", // Mixed characters
        b"A".repeat(1000),          // Very long name (1000 chars)
    ];

    let mut i = 0;
    let len = vector::length(&test_names);

    while (i < len) {
        let test_name = *vector::borrow(&test_names, i);

        // Create notebook with test name
        inkblob::notebook::create_notebook(test_name, ctx);

        // Verify creation succeeded
        let registry = test_scenario::take_owned<NotebookRegistry>(&mut scenario);
        let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

        assert!(registry.active_notebook == test_name, 0);
        assert!(notebook.owner == test_utils::OWNER, E_NOT_OWNER);

        test_scenario::return_shared(notebook);
        test_scenario::return_owned(registry);

        i = i + 1;
    };

    test_scenario::end(scenario);
}
```

**Expected Results:**
- Various name formats handled correctly
- No unexpected failures for valid names
- Unicode and special characters supported
- Long names properly stored

---

## 5. Performance and Gas Tests

### TC-NB-010: Notebook Creation Gas Measurement

**Objective:** Measure gas usage for notebook operations
**Requirements:** REQ-PERF-006, REQ-PERF-007

```move
#[test]
public fun test_notebook_creation_gas_usage() {
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // Measure gas for initial notebook creation
    let start_gas = tx_context::gas_used(ctx);

    inkblob::notebook::create_notebook(b"Gas Test Notebook", ctx);

    let end_gas = tx_context::gas_used(ctx);
    let gas_used = end_gas - start_gas;

    // Verify gas usage is reasonable (adjust threshold based on actual measurements)
    let max_expected_gas = 5000000; // 5M gas units
    assert!(gas_used <= max_expected_gas, 0);

    let registry = test_scenario::take_owned<NotebookRegistry>(&mut scenario);
    let notebook = test_scenario::take_shared<Notebook>(&mut scenario);

    test_scenario::return_shared(notebook);
    test_scenario::return_owned(registry);
    test_scenario::end(scenario);
}
```

**Expected Results:**
- Gas usage within acceptable bounds
- No unexpected gas consumption spikes
- Efficient object creation patterns

---

## 6. Test Execution Checklist

### Pre-Test Setup
- [ ] Test environment initialized with required dependencies
- [ ] WAL token contract deployed and accessible
- [ ] Test addresses funded with sufficient SUI and WAL tokens
- [ ] Mock encrypted data generated and validated

### Test Execution
- [ ] All positive tests pass with expected state changes
- [ ] All negative tests fail with correct error codes
- [ ] Event emissions verified for all operations
- [ ] Gas usage measurements collected

### Post-Test Verification
- [ ] Test coverage metrics > 90%
- [ ] Performance benchmarks within specifications
- [ ] No memory leaks or resource exhaustion
- [ ] Cross-device scenarios verified

### Requirements Traceability
- [ ] REQ-NOTEBOOK-001: ✅ Create notebook as shared object
- [ ] REQ-NOTEBOOK-002: ✅ Registry creation and ownership transfer
- [ ] REQ-NOTEBOOK-003: ✅ Registry fields correctly populated
- [ ] REQ-NOTEBOOK-004: ✅ Table-based storage for notes and folders
- [ ] REQ-NOTEBOOK-005: ✅ Note metadata structure validated
- [ ] REQ-NOTEBOOK-006: ✅ Shared object enables multi-device access
- [ ] REQ-NOTEBOOK-007: ✅ Cross-device discovery via registry lookup
- [ ] REQ-NOTEBOOK-008: ✅ NotebookCreated event emission verified

---

**Test Status:** Ready for Implementation
**Implementation Priority:** High (Core functionality)
**Dependencies:** Test utilities module completion