# InkBlob Smart Contract Integration Test Suite

**Version:** 1.0
**Date:** 2025-11-23
**Based on:** Requirements Specification v1.3
**Target:** contracts/inkblob/sources/notebook.move

---

## 1. Test Overview

### 1.1 Test Scope
This document defines comprehensive integration test cases for the InkBlob smart contract implementation, focusing on core business flows and edge cases. The tests verify:

- **Functional Requirements Compliance**: All EARS-format requirements from docs/tech/requirements.md
- **Security Validations**: Folder depth limits, circular reference prevention, Arweave ID validation
- **Cross-Device Functionality**: SessionCap authorization, multi-device synchronization
- **Error Handling**: Proper error codes and failure scenarios
- **Performance Requirements**: O(1) operations, transaction size limits

### 1.2 Test Environment
- **Network**: Sui Testnet
- **Dependencies**: WAL token contract, MoveStdlib, Sui Framework
- **Test Framework**: Sui Move Testing Framework
- **Test Data**: Encrypted content mock, Walrus blob IDs mock

### 1.3 Test Structure
```
tests/
├── core/
│   ├── notebook_lifecycle.md      # REQ-NOTEBOOK-001 to -008
│   ├── session_authorization.md   # REQ-SESSION-001 to -009
│   ├── note_crud_operations.md    # REQ-NOTE-001 to -010
│   └── folder_management.md       # REQ-FOLDER-001 to -010
├── security/
│   ├── folder_depth_validation.md # REQ-FOLDER-003 + Security Review
│   ├── circular_reference.md      # Cycle prevention
│   └── arweave_validation.md      # REQ-AR-001 to -011
├── integration/
│   ├── multi_device_sync.md       # REQ-SYNC-001 to -005
│   └── conflict_resolution.md     # Last-Write-Wins strategy
└── performance/
    ├── scalability_tests.md       # REQ-PERF-003 to -007
    └── gas_optimization.md        # Transaction efficiency
```

---

## 2. Test Framework Setup

### 2.1 Common Test Utilities

```move
module test_utils {
    use sui::test_scenario::{Self, Scenario};
    use sui::sui::SUI;
    use sui::coin;
    use wal::wal::WAL;
    use inkblob::notebook::{Self, Notebook, NotebookRegistry, SessionCap};

    // Test addresses
    const OWNER: address = @0x1;
    const DEVICE_1: address = @0x2;
    const DEVICE_2: address = @0x3;
    const ATTACKER: address = @0x4;

    // Test timestamps
    const NOW: u64 = 1000000;
    const FUTURE: u64 = NOW + 86400000; // +24 hours
    const PAST: u64 = NOW - 86400000;   // -24 hours

    // Mock encrypted data
    const ENCRYPTED_TITLE: &vector<u8> = b"encrypted_title_blob";
    const ENCRYPTED_FOLDER_NAME: &vector<u8> = b"encrypted_folder_name_blob";
    const BLOB_ID: &vector<u8> = b"walrus_blob_id_12345";
    const BLOB_OBJECT_ID: &vector<u8> = b"blob_object_id_67890";
    const AR_TX_ID: &vector<u8> = b"valid_arweave_tx_id_43_chars_long_base64url";

    // Create test scenario with wallet
    public fun create_scenario(user: address): Scenario {
        let mut scenario = test_scenario::begin(user);
        let ctx = test_scenario::ctx(&mut scenario);

        // Fund user wallet
        test_scenario::take_shared<SUI>(&mut scenario);
        test_scenario::take_shared<WAL>(&mut scenario);

        scenario
    }

    // Create authorized session
    public fun create_session(
        notebook: &Notebook,
        hot_wallet: address,
        expires_at: u64,
        scenario: &mut Scenario
    ): SessionCap {
        let ctx = test_scenario::ctx(scenario);

        // Mock SessionCap creation (in real tests, call authorize_session_and_fund)
        test_utils::create_test_session_cap(
            object::uid_to_inner(&notebook.id),
            hot_wallet,
            expires_at
        )
    }

    // Generate valid test object IDs
    public fun generate_note_id(): ID { @0x1000 }
    public fun generate_folder_id(): ID { @0x2000 }
    public fun next_note_id(): ID { @0x1001 }
    public fun next_folder_id(): ID { @0x2001 }
}
```

### 2.2 Test Data Factory

```move
module test_data {
    // Valid encrypted content for different scenarios
    public struct EncryptedContent {
        title: String,
        content: String,
        folder_name: String,
    }

    public fun valid_note_1(): EncryptedContent {
        EncryptedContent {
            title: b"enc_note_title_1",
            content: b"enc_note_content_1",
            folder_name: b"enc_folder_work",
        }
    }

    public fun valid_note_2(): EncryptedContent {
        EncryptedContent {
            title: b"enc_note_title_2",
            content: b"enc_note_content_2",
            folder_name: b"enc_folder_personal",
        }
    }

    // Edge case data
    public fun max_depth_folder_path(): vector<String> {
        vector[b"L1", b"L2", b"L3", b"L4", b"L5"] // 5 levels (max allowed)
    }

    public fun invalid_arweave_ids(): vector<String> {
        vector[
            b"too_short",                                    // Too short
            b"way_too_long_arweave_transaction_id_that_exceeds_43_chars_limit", // Too long
            b"contains$invalid*characters",                  // Invalid chars
            b"contains space chars",                        // Spaces
            b"UPPERCASE_NOT_VALID",                          // Uppercase only
        ]
    }
}
```

---

## 3. Test Execution Guidelines

### 3.1 Test Naming Convention
- **Positive Tests**: `test_[feature]_success_*`
- **Negative Tests**: `test_[feature]_fail_[error_condition]`
- **Edge Cases**: `test_[feature]_edge_[boundary_condition]`
- **Security Tests**: `test_security_[vulnerability_scenario]`

### 3.2 Test Structure Template

```move
#[test]
public fun test_[feature_name]_[scenario]() {
    // 1. Setup
    let mut scenario = test_utils::create_scenario(test_utils::OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    // 2. Execute
    // Call contract functions with test data

    // 3. Verify
    // Assert expected state changes
    // Verify event emissions
    // Check error conditions

    // 4. Cleanup
    test_scenario::end(scenario);
}
```

### 3.3 Assertion Guidelines

```move
// State assertions
assert!(notebook.owner == expected_owner, E_WRONG_OWNER);
assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

// Event assertions
test_scenario::next_event<NoteUpdated>(&mut scenario);
let event = test_scenario::next_event<NoteUpdated>(&mut scenario);
assert!(event.note_id == expected_note_id, 0);

// Error assertions
assert!(fails, expected_error_code);
```

### 3.4 Coverage Requirements

- **Function Coverage**: 100% of public entry functions
- **Branch Coverage**: 100% of all conditional branches
- **Error Path Coverage**: All error codes must be triggered in tests
- **Event Coverage**: All event types must be emitted and verified

---

## 4. Test Success Criteria

### 4.1 Functional Requirements
- ✅ All notebook lifecycle operations work correctly
- ✅ Session authorization and revocation function properly
- ✅ Note CRUD operations maintain data integrity
- ✅ Folder hierarchy management enforces constraints
- ✅ Arweave backup metadata updates correctly

### 4.2 Security Requirements
- ✅ Folder depth limit (5 levels) enforced
- ✅ Circular reference prevention works
- ✅ Arweave transaction ID validation comprehensive
- ✅ Access control enforced for all operations
- ✅ Session expiration prevents unauthorized access

### 4.3 Performance Requirements
- ✅ O(1) operations verified through large datasets
- ✅ Transaction size stays within Sui limits
- ✅ Gas costs within acceptable bounds
- ✅ No memory leaks or resource exhaustion

### 4.4 Integration Requirements
- ✅ Cross-device synchronization via SessionCap
- ✅ Multi-notebook support functional
- ✅ WAL token integration works correctly
- ✅ Event-driven updates propagate correctly

---

## 5. Test Implementation Priority

### Phase 1: Core Functionality (Week 1)
1. Notebook lifecycle (create, registry management)
2. Session authorization (create, validate, revoke)
3. Basic note CRUD (create, read, update, delete)
4. Basic folder operations (create, rename, delete)

### Phase 2: Security & Validation (Week 2)
1. Folder depth validation (5-level limit)
2. Circular reference prevention
3. Arweave transaction ID validation
4. Access control edge cases

### Phase 3: Integration & Performance (Week 3)
1. Multi-device synchronization scenarios
2. Conflict resolution (Last-Write-Wins)
3. Scalability tests (10K+ notes)
4. Gas optimization validation

---

## 6. Continuous Integration

### 6.1 Automated Test Pipeline
```yaml
# .github/workflows/contract-tests.yml
name: Contract Integration Tests
on: [push, pull_request]

jobs:
  test-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Sui CLI
        run: cargo install --locked --git https://github.com/MystenLabs/sui.git --branch testnet sui
      - name: Run contract tests
        run: |
          cd contracts/inkblob
          sui move test --gas-report
      - name: Verify coverage
        run: # Custom coverage verification script
```

### 6.2 Test Metrics
- **Pass Rate**: 100% required for merge
- **Coverage**: >90% for critical paths
- **Performance**: Gas usage regression detection
- **Security**: All security tests must pass

---

## 7. Test Documentation Standards

### 7.1 Test Case Documentation Template
```markdown
### Test Case: [TC-XXX] - [Brief Description]

**Requirements:** REQ-XXX, REQ-YYY
**Priority:** High/Medium/Low
**Type:** Positive/Negative/Edge

**Preconditions:**
- User has connected wallet
- Notebook exists
- Session is active

**Test Steps:**
1. Execute function X with parameters Y
2. Verify expected state Z
3. Check event emissions

**Expected Results:**
- Note created successfully
- Event NoteCreated emitted
- Gas usage within limits

**Postconditions:**
- Notebook state updated
- Database consistent
```

### 7.2 Traceability Matrix
- Map each test case to specific requirements
- Ensure all requirements have test coverage
- Identify requirement gaps early

---

**Document Status:** Ready for Implementation
**Next Steps:** Implement individual test modules as defined in Section 1.4