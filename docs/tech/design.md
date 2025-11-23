# InkBlob - Technical Design Document

**Version:** 1.2
**Date:** 2025-11-23
**Status:** Reviewed & Updated
**Based on:** Requirements Specification v1.3 + User Feedback Modifications + Review Comments

---

## 1. Technical Overview

### 1.1 Architecture Approach

InkBlob follows a **three-layer decentralized architecture** with clear separation of concerns:

1. **Control Layer (Sui Blockchain)**: Manages metadata, access control, and state coordination
2. **Storage Layer (Walrus Protocol)**: Handles encrypted content storage with redundancy
3. **Client Layer (React Browser App)**: Provides UI, encryption, and orchestration

**Key Architectural Decisions:**

- **Metadata on-chain, Content off-chain**: Sui stores lightweight metadata (titles, timestamps, folder structure) while Walrus stores encrypted note content blobs
- **Client-side Encryption**: Zero-knowledge architecture with AES-256-GCM encryption performed entirely in the browser
- **Shared + Owned Object Pattern**: Notebook as shared object for multi-device access, NotebookRegistry as owned object for discovery
- **SessionCap Authorization**: Ephemeral session keys eliminate repeated wallet prompts while maintaining security
- **Event-driven Sync**: Blockchain events enable real-time multi-device synchronization

### 1.2 Technology Stack Justification

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Smart Contracts** | Sui Move | Native Sui blockchain language; Table data structure for O(1) access; shared/owned object model |
| **Storage** | Walrus Protocol | Decentralized blob storage; epoch-based lifecycle; native Sui integration |
| **Frontend Framework** | React 19.2 + TypeScript | Modern React with concurrent features; type safety; extensive ecosystem |
| **Build Tool** | Vite 6.0 | Fast HMR; optimized production builds; native ESM support |
| **Wallet Integration** | @mysten/dapp-kit | Official Sui wallet adapter; multi-wallet support; React hooks |
| **Blockchain SDK** | @mysten/sui/client | Official Sui TypeScript SDK; transaction building; RPC operations |
| **Storage SDK** | @mysten/walrus | Official Walrus SDK; upload/download operations; browser compatibility |
| **Encryption** | Web Crypto API | Native browser cryptography; AES-256-GCM; HKDF support |
| **Rich Text Editor** | Lexical | Meta's framework; extensible; JSON serialization; React integration |
| **State Management** | @tanstack/react-query | Server state caching; automatic refetching; optimistic updates |
| **UI Components** | Custom + Tailwind CSS | Lightweight; customizable; no heavy component library dependencies |
| **Development** | Sui CLI (sui move) | Native tooling; integrated testing; deployment scripts |

**Development Tooling:**
- **Move Development**: Sui CLI native (sui move build/test) with VS Code Move Analyzer extension
- **Network Target**: Walrus Testnet only for MVP
- **State Management**: React Query for server state + React hooks for local state

### 1.3 Key Design Decisions

**Decision 1: Table-Based Storage for Notes and Folders**
- **Rationale**: O(1) lookup, insertion, deletion vs O(n) for vector-based approaches
- **Trade-off**: Slightly more complex smart contract code vs significant performance gains at scale (10K+ notes)

**Decision 2: IV Prepending to Ciphertext**
- **Rationale**: Self-contained encrypted blobs; no need to store IV separately in metadata
- **Format**: `[12-byte IV || Ciphertext || 16-byte Auth Tag]`
- **Benefit**: Simplifies Walrus storage; reduces on-chain data; ensures IV/ciphertext atomicity

**Decision 3: SessionCap Pattern with Device-Specific Persistent Hot Wallet**
- **Rationale**: Balance user experience (no repeated prompts) with gas efficiency while preventing multi-device conflicts
- **Implementation**: Generate deterministic Ed25519 hot wallet per main wallet + device fingerprint using HKDF derivation
- **Benefits**:
  - Persistent address allows balance accumulation per device
  - No gas loss from temporary keypair generation
  - Device-specific isolation prevents cross-device conflicts
  - Deterministic recovery per device across sessions
  - Clean separation from main wallet security
- **Device Differentiation**: Each device gets unique hot wallet derived from device fingerprint
- **Trade-off**: One-time wallet approval per device vs seamless session management
- **Future**: Can add zklogin as alternative authentication in Phase 2

**Decision 4: Hybrid Sorting Strategy**
- **Rationale**: Optimize user experience while maintaining on-chain efficiency
- **Implementation**:
  - **Folders**: Support user-defined custom ordering with `sort_order` field
  - **Notes**: Sort by `updated_at` timestamp within folders
  - **Root Level**: Custom folder ordering, notes by update time
- **Benefits**:
  - Users can organize folders as needed
  - Notes always show most recent first (intuitive)
  - Minimal on-chain overhead (single sort_order field)
- **Trade-off**: Slightly more complex frontend sorting logic vs pure timestamp approach

**Decision 5: Soft Deletion with Flags**
- **Rationale**: Enables future "trash/recovery" feature; preserves data integrity
- **Trade-off**: Deleted items consume storage vs ability to implement undo/recovery

**Decision 6: Lexical Editor for Rich Text**
- **Rationale**: Modern architecture; extensible plugin system; JSON state serialization
- **Alternative Considered**: ProseMirror (more complex), Slate (deprecated), TipTap (less flexible)

---

## 2. System Architecture

### 2.1 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Layer (Browser)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │   UI Components │  │  Crypto Service  │  │ Wallet Manager│ │
│  │   - NoteEditor  │  │  - AES-GCM       │  │ - Connection  │ │
│  │   - FolderTree  │  │  - HKDF          │  │ - Signing     │ │
│  │   - NoteList    │  │  - IV Generation │  │ - SessionCap  │ │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬───────┘ │
│           │                    │                     │         │
│  ┌────────┴────────────────────┴─────────────────────┴───────┐ │
│  │              Application State Layer                      │ │
│  │  - React Query (server state cache)                       │ │
│  │  - React Context (encryption key, session)                │ │
│  │  - Local State (UI state, editor state)                   │ │
│  └────────┬──────────────────────────────────────────────────┘ │
│           │                                                     │
│  ┌────────┴────────────────────────────────────────────────┐   │
│  │              Service Layer                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ Sui Service  │  │Walrus Service│  │ Sync Service │  │   │
│  │  │ - Queries    │  │ - Upload     │  │ - Events     │  │   │
│  │  │ - Mutations  │  │ - Download   │  │ - Polling    │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │   │
│  └─────────┼──────────────────┼──────────────────┼─────────┘   │
│            │                  │                  │             │
└────────────┼──────────────────┼──────────────────┼─────────────┘
             │                  │                  │
             ▼                  ▼                  ▼
┌─────────────────────┐  ┌─────────────────────┐
│  Control Layer      │  │  Storage Layer      │
│  (Sui Blockchain)   │  │  (Walrus Protocol)  │
├─────────────────────┤  ├─────────────────────┤
│                     │  │                     │
│ ┌─────────────────┐ │  │ ┌─────────────────┐ │
│ │ Notebook Module │ │  │ │  Blob Storage   │ │
│ │  (Sui Move)     │ │  │ │  - Encrypted    │ │
│ │                 │ │  │ │    Content      │ │
│ │ Structs:        │ │  │ │  - Redundant    │ │
│ │ - Notebook      │ │  │ │    Distribution │ │
│ │ - Note          │ │  │ │  - Epoch-based  │ │
│ │ - Folder        │ │  │ │    Lifecycle    │ │
│ │ - SessionCap    │ │  │ └─────────────────┘ │
│ │ - Registry      │ │  │                     │
│ │                 │ │  │ Network:            │
│ │ Functions:      │ │  │ - Testnet           │
│ │ - create_*      │ │  │ - Upload Relay      │
│ │ - update_*      │ │  │ - Aggregator        │
│ │ - delete_*      │ │  │                     │
│ │ - authorize_*   │ │  │                     │
│ └─────────────────┘ │  └─────────────────────┘
│                     │
│ Storage:            │
│ - Table<ID, Note>   │
│ - Table<ID, Folder> │
│                     │
└─────────────────────┘
```

### 2.2 Data Flow and Component Interactions

#### 2.2.1 Initial Connection Flow

```
User → Wallet Connection → Key Derivation → Notebook Discovery
  1. User clicks "Connect Wallet"
  2. Wallet extension prompts approval
  3. Wallet connection established
  4. App prompts signature for key derivation
     Message: "Sign this message to derive encryption key for InkBlob"
  5. Derive AES-256 key using HKDF(signature)
  6. Query owned objects of type NotebookRegistry
  7. If registry found:
     - Extract notebook_id
     - Fetch shared Notebook object
     - Load notes and folders metadata
  8. If no registry:
     - Show "Create Notebook" option
     - On create: call create_notebook() entry function
```

#### 2.2.2 Session Authorization Flow with Device-Specific Hot Wallet

```
Device Setup → Generate Device Fingerprint → Derive Hot Wallet → Authorize & Fund
  1. Generate unique device fingerprint (browser + user agent + random device ID)
  2. Derive deterministic Ed25519 hot wallet using HKDF(wallet_signature + device_fingerprint, "hot-wallet-v1")
  3. Request main wallet signature for SessionCap creation with auto-funding
  4. Call authorize_session_and_fund(hot_wallet_address, expires_at) - CONTRACT HANDLES FUNDING
     - Contract automatically transfers 0.1 SUI + 0.5 WAL to hot wallet
     - Creates SessionCap linked to hot wallet
  5. Store device fingerprint and encrypted hot wallet key in localStorage
  6. All subsequent operations use device-specific hot wallet key

Subsequent Sessions (Same Device):
  1. Retrieve device fingerprint and encrypted hot wallet key from localStorage
  2. Request wallet signature for decryption (same message each time)
  3. Derive same hot wallet using wallet_signature + device_fingerprint
  4. Decrypt and verify matches stored hot wallet address
  5. Verify SessionCap not expired, check hot wallet balance
  6. If expired or low balance: trigger re-authorization flow with auto-funding
  7. Continue using same device-specific hot wallet address

Multi-Device Support:
  - Each device generates unique fingerprint → unique hot wallet
  - No conflicts between devices (different hot wallet addresses)
  - Shared Notebook object works across all devices via SessionCap
  - Device isolation prevents balance conflicts

Auto-Funding Mechanism:
  - authorize_session_and_fund() automatically ensures hot wallet has:
    * 0.1 SUI for transaction fees
    * 0.5 WAL for Walrus storage operations
  - Contract handles the transfer atomically with SessionCap creation
  - Users don't need to manually manage hot wallet balances
```

#### 2.2.3 Note Creation Flow

```
User Input → Encryption → Walrus Upload → Sui Transaction
  1. User types in Lexical editor
  2. User clicks "Save"
  3. Serialize Lexical state to JSON
  4. Generate random 12-byte IV
  5. Encrypt JSON with AES-256-GCM
     - Input: plaintext JSON
     - Key: derived AES key
     - IV: random 12 bytes
     - Output: ciphertext + 16-byte auth tag
  6. Prepend IV: [IV || ciphertext || auth tag]
  7. Upload blob to Walrus
     - Use upload relay
     - Specify epoch duration
     - Receive blob_id and blob_object_id
  8. Encrypt note title separately
  9. Build Sui transaction:
     - Function: update_note
     - Args: notebook, session_cap, note_id, blob_id, blob_object_id, encrypted_title, folder_id
  10. Sign with ephemeral key
  11. Execute transaction
  12. Emit NoteUpdated event
  13. Update local React Query cache
```

#### 2.2.4 Note Retrieval Flow

```
Load List → Select Note → Fetch Blob → Decrypt → Render
  1. Fetch Notebook object from Sui
  2. Extract notes Table
  3. Decrypt all titles for list display
  4. User clicks note
  5. Retrieve blob_id from metadata
  6. Fetch encrypted blob from Walrus aggregator
  7. Extract first 12 bytes as IV
  8. Extract remaining bytes as ciphertext with auth tag
  9. Decrypt using AES-256-GCM
     - Key: derived AES key
     - IV: extracted IV
     - Ciphertext: extracted bytes
     - Verify auth tag
  10. If decryption fails: show error (do NOT render corrupted data)
  11. Parse JSON to Lexical state
  12. Load state into editor
  13. Render formatted content
```

#### 2.2.5 Multi-Device Sync Flow

```
Device A Change → Blockchain Event → Device B Refresh
  1. Device A saves note (follows Note Creation Flow)
  2. Sui emits NoteUpdated event
  3. Device B sync service:
     - Option A: Poll Notebook object every 30s
     - Option B: Subscribe to Sui events (WebSocket)
  4. Detect change (compare updated_at timestamp)
  5. Invalidate React Query cache
  6. Refetch Notebook object
  7. Update UI with new data
  8. Apply Last-Write-Wins if conflict
```

### 2.3 Integration Points and Dependencies

**External Dependencies:**

1. **Sui RPC Node**
   - Endpoint: Testnet RPC (https://fullnode.testnet.sui.io:443)
   - Purpose: Query objects, execute transactions, subscribe to events
   - Fallback: Multiple RPC endpoints for reliability

2. **Walrus Network**
   - Upload Relay: Testnet relay endpoint
   - Aggregator: Testnet aggregator endpoint
   - Purpose: Store/retrieve encrypted blobs
   - Configuration: SDK configuration object

3. **Wallet Extensions**
   - Supported: Suiet, Martian, Sui Wallet
   - Integration: @mysten/dapp-kit hooks
   - Required Capabilities: signPersonalMessage, signAndExecuteTransaction

**Internal Service Contracts:**

1. **Crypto Service ↔ UI Components**
   - Interface: `encrypt(plaintext, key)`, `decrypt(ciphertext, key, iv)`
   - Data Format: Uint8Array for binary data, string for text

2. **Sui Service ↔ Crypto Service**
   - Flow: UI → Encrypt → Sui Service → Blockchain
   - Contract: Sui Service receives pre-encrypted data

3. **Walrus Service ↔ Crypto Service**
   - Flow: Encrypt → Walrus Upload → Return blob_id
   - Contract: Walrus Service handles binary blobs only

---

## 3. Smart Contract Design (Sui Move)

### 3.1 Module Structure

```move
module InkBlob::notebook {
    use sui::object::{Self, ID, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::table::{Self, Table};
    use sui::event;
    use std::string::String;
    use std::option::{Self, Option};

    // ========== Structs ==========

    /// Shared object - the main notebook containing all notes and folders
    struct Notebook has key {
        id: UID,
        owner: address,
        notes: Table<ID, Note>,
        folders: Table<ID, Folder>,
    }

    /// Owned object - registry for cross-device discovery with multi-notebook support
    struct NotebookRegistry has key {
        id: UID,
        owner: address,
        notebooks: Table<String, ID>,  // name -> notebook_id mapping for multi-notebook support
        active_notebook: String,  // Currently active notebook name
        created_at: u64,
    }

    /// Owned object - device-specific session capability with auto-funding
    struct SessionCap has key {
        id: UID,
        notebook_id: ID,
        device_fingerprint: String,  // Device identifier for multi-device support
        hot_wallet_address: address,  // Device-specific hot wallet
        expires_at: u64,
        created_at: u64,
        auto_funded: bool,  // Whether auto-funding was applied
    }

    /// Note metadata stored in Table with Walrus blob object support
    struct Note has store, drop {
        id: ID,
        blob_id: String,           // Walrus blob ID for content retrieval
        blob_object_id: String,    // Sui object ID for blob renewal/management
        encrypted_title: String,
        folder_id: Option<ID>,
        created_at: u64,
        updated_at: u64,
        is_deleted: bool,
        ar_backup_id: Option<String>,
        ar_backup_version: Option<u64>,
    }

    /// Folder metadata stored in Table with custom ordering support
    struct Folder has store, drop {
        id: ID,
        encrypted_name: String,
        parent_id: Option<ID>,
        sort_order: u64,  // User-defined custom ordering (0 for auto-assigned)
        created_at: u64,
        updated_at: u64,
        is_deleted: bool,
    }

    // ========== Events ==========

    struct NotebookCreated has copy, drop {
        notebook_id: ID,
        owner: address,
        registry_id: ID,
    }

    struct NoteUpdated has copy, drop {
        notebook_id: ID,
        note_id: ID,
        blob_id: String,
        folder_id: Option<ID>,
        operator: address,
    }

    struct FolderCreated has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        parent_id: Option<ID>,
        operator: address,
    }

    struct FolderUpdated has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        operator: address,
    }

    struct FolderDeleted has copy, drop {
        notebook_id: ID,
        folder_id: ID,
        operator: address,
    }

    struct NoteMoved has copy, drop {
        notebook_id: ID,
        note_id: ID,
        old_folder_id: Option<ID>,
        new_folder_id: Option<ID>,
        operator: address,
    }

    struct SessionAuthorized has copy, drop {
        notebook_id: ID,
        session_cap_id: ID,
        hot_wallet_address: address,
        device_fingerprint: String,
        expires_at: u64,
        owner: address,
        sui_funded: u64,
        wal_funded: u64,
    }

    struct SessionRevoked has copy, drop {
        notebook_id: ID,
        session_cap_id: ID,
        owner: address,
    }

    struct ArweaveBackupRecorded has copy, drop {
        notebook_id: ID,
        note_id: ID,
        ar_tx_id: String,
        backup_timestamp: u64,
        operator: address,
    }

    // ========== Entry Functions ==========

    // (Detailed function implementations in Section 3.2)
}
```

### 3.2 Core Functions

#### 3.2.1 Notebook Creation

```move
/// Create a new notebook with registry for cross-device discovery
public entry fun create_notebook(
    notebook_name: String,
    ctx: &mut TxContext
) {
    let sender = tx_context::sender(ctx);

    // Check if registry exists
    // If no registry, create one; if exists, add to existing

    // Create shared Notebook object
    let notebook_id = object::new(ctx);
    let notebook = Notebook {
        id: notebook_id,
        owner: sender,
        notes: table::new<ID, Note>(ctx),
        folders: table::new<ID, Folder>(ctx),
    };
    let notebook_id_value = object::uid_to_inner(&notebook.id);

    // Share the notebook for multi-device access
    transfer::share_object(notebook);

    // Create or update registry
    let registry_id = object::new(ctx);
    let registry = NotebookRegistry {
        id: registry_id,
        owner: sender,
        notebooks: table::new<String, ID>(ctx),
        active_notebook: notebook_name,
        created_at: tx_context::epoch_timestamp_ms(ctx),
    };

    // Add notebook to registry
    table::add(&mut registry.notebooks, notebook_name, notebook_id_value);

    let registry_id_value = object::uid_to_inner(&registry.id);

    // Transfer registry to owner
    transfer::transfer(registry, sender);

    // Emit event
    event::emit(NotebookCreated {
        notebook_id: notebook_id_value,
        owner: sender,
        registry_id: registry_id_value,
    });
}

/// Create additional notebook in existing registry
public entry fun create_additional_notebook(
    registry: &mut NotebookRegistry,
    notebook_name: String,
    ctx: &mut TxContext
) {
    let sender = tx_context::sender(ctx);

    // Verify ownership
    assert!(registry.owner == sender, E_NOT_OWNER);

    // Check if notebook name already exists
    assert!(!table::contains(&registry.notebooks, notebook_name), E_NOTEBOOK_EXISTS);

    // Create shared Notebook object
    let notebook_id = object::new(ctx);
    let notebook = Notebook {
        id: notebook_id,
        owner: sender,
        notes: table::new<ID, Note>(ctx),
        folders: table::new<ID, Folder>(ctx),
    };
    let notebook_id_value = object::uid_to_inner(&notebook.id);

    // Share the notebook
    transfer::share_object(notebook);

    // Add to registry
    table::add(&mut registry.notebooks, notebook_name, notebook_id_value);

    // Emit event
    event::emit(NotebookCreated {
        notebook_id: notebook_id_value,
        owner: sender,
        registry_id: object::uid_to_inner(&registry.id),
    });
}

/// Switch active notebook
public entry fun switch_active_notebook(
    registry: &mut NotebookRegistry,
    notebook_name: String,
    ctx: &TxContext
) {
    let sender = tx_context::sender(ctx);

    // Verify ownership
    assert!(registry.owner == sender, E_NOT_OWNER);

    // Check if notebook exists
    assert!(table::contains(&registry.notebooks, notebook_name), E_NOTEBOOK_NOT_FOUND);

    // Update active notebook
    registry.active_notebook = notebook_name;
}
```

#### 3.2.2 Session Authorization

```move
/// Authorize device-specific hot wallet with automatic funding
public entry fun authorize_session_and_fund(
    notebook: &Notebook,
    device_fingerprint: String,
    hot_wallet_address: address,
    expires_at: u64,
    sui_amount: Option<u64>,
    wal_amount: Option<u64>,
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
    let default_wal = 500000000; // 0.5 WAL in MIST (adjust based on WAL decimals)

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

    // Create SessionCap with device info
    let session_cap_id = object::new(ctx);
    let session_cap = SessionCap {
        id: session_cap_id,
        notebook_id: object::uid_to_inner(&notebook.id),
        device_fingerprint,
        hot_wallet_address,
        expires_at,
        created_at: now,
        auto_funded: true,
    };
    let session_cap_id_value = object::uid_to_inner(&session_cap.id);

    // Transfer SessionCap to hot wallet
    transfer::transfer(session_cap, hot_wallet_address);

    // Note: The actual token transfers need to be handled via coin objects
    // This is a simplified version - in practice, you'd need to:
    // 1. Accept Coin<SUI> and Coin<WAL> objects as parameters
    // 2. Split and transfer portions to hot_wallet_address
    // 3. Handle the case where sender doesn't have enough balance

    // Emit event
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

/// Legacy authorize_session for backward compatibility (deprecated)
public entry fun authorize_session(
    notebook: &Notebook,
    ephemeral_address: address,
    expires_at: u64,
    ctx: &mut TxContext
) {
    // Forward to new function with empty device fingerprint and no funding
    authorize_session_and_fund(
        notebook,
        b"legacy-device".to_string(),
        ephemeral_address,
        expires_at,
        option::none<u64>(),
        option::none<u64>(),
        ctx
    );
}
```

#### 3.2.3 Note Update

```move
/// Update or create a note (handles both new notes and edits)
public entry fun update_note(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    note_id: ID,
    blob_id: String,
    blob_object_id: String,
    encrypted_title: String,
    folder_id: Option<ID>,
    ctx: &mut TxContext
) {
    // Verify authorization
    let sender = verify_authorization(notebook, &session_cap, ctx);

    // Return SessionCap if provided
    if (option::is_some(&session_cap)) {
        let cap = option::destroy_some(session_cap);
        transfer::transfer(cap, sender);
    } else {
        option::destroy_none(session_cap);
    };

    let now = tx_context::epoch_timestamp_ms(ctx);

    // Check if note exists
    if (table::contains(&notebook.notes, note_id)) {
        // Update existing note
        let note = table::borrow_mut(&mut notebook.notes, note_id);
        note.blob_id = blob_id;
        note.blob_object_id = blob_object_id;
        note.encrypted_title = encrypted_title;
        note.folder_id = folder_id;
        note.updated_at = now;
        // Note: ar_backup fields NOT updated here - only via update_note_ar_backup
    } else {
        // Create new note
        let note = Note {
            id: note_id,
            blob_id,
            blob_object_id,
            encrypted_title,
            folder_id,
            created_at: now,
            updated_at: now,
            is_deleted: false,
            ar_backup_id: option::none(),
            ar_backup_version: option::none(),
        };
        table::add(&mut notebook.notes, note_id, note);
    };

    // Emit event
    event::emit(NoteUpdated {
        notebook_id: object::uid_to_inner(&notebook.id),
        note_id,
        blob_id,
        folder_id,
        operator: sender,
    });
}
```

#### 3.2.4 Folder Management

```move
/// Create a new folder
public entry fun create_folder(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    folder_id: ID,
    encrypted_name: String,
    parent_id: Option<ID>,
    ctx: &mut TxContext
) {
    let sender = verify_authorization(notebook, &session_cap, ctx);

    if (option::is_some(&session_cap)) {
        let cap = option::destroy_some(session_cap);
        transfer::transfer(cap, sender);
    } else {
        option::destroy_none(session_cap);
    };

    let now = tx_context::epoch_timestamp_ms(ctx);

    // Verify parent exists if specified
    if (option::is_some(&parent_id)) {
        let parent = option::borrow(&parent_id);
        assert!(table::contains(&notebook.folders, *parent), E_PARENT_NOT_FOUND);
    };

    let folder = Folder {
        id: folder_id,
        encrypted_name,
        parent_id,
        created_at: now,
        updated_at: now,
        is_deleted: false,
    };

    table::add(&mut notebook.folders, folder_id, folder);

    event::emit(FolderCreated {
        notebook_id: object::uid_to_inner(&notebook.id),
        folder_id,
        parent_id,
        operator: sender,
    });
}

/// Update folder (rename or move)
public entry fun update_folder(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    folder_id: ID,
    encrypted_name: String,
    parent_id: Option<ID>,
    ctx: &mut TxContext
) {
    let sender = verify_authorization(notebook, &session_cap, ctx);

    if (option::is_some(&session_cap)) {
        let cap = option::destroy_some(session_cap);
        transfer::transfer(cap, sender);
    } else {
        option::destroy_none(session_cap);
    };

    assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);

    let folder = table::borrow_mut(&mut notebook.folders, folder_id);
    folder.encrypted_name = encrypted_name;
    folder.parent_id = parent_id;
    folder.updated_at = tx_context::epoch_timestamp_ms(ctx);

    event::emit(FolderUpdated {
        notebook_id: object::uid_to_inner(&notebook.id),
        folder_id,
        operator: sender,
    });
}

/// Soft delete folder (set is_deleted flag)
public entry fun delete_folder(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    folder_id: ID,
    ctx: &mut TxContext
) {
    let sender = verify_authorization(notebook, &session_cap, ctx);

    if (option::is_some(&session_cap)) {
        let cap = option::destroy_some(session_cap);
        transfer::transfer(cap, sender);
    } else {
        option::destroy_none(session_cap);
    };

    assert!(table::contains(&notebook.folders, folder_id), E_FOLDER_NOT_FOUND);

    let folder = table::borrow_mut(&mut notebook.folders, folder_id);
    folder.is_deleted = true;
    folder.updated_at = tx_context::epoch_timestamp_ms(ctx);

    // Note: Orphaned notes handling done client-side or in separate migration function

    event::emit(FolderDeleted {
        notebook_id: object::uid_to_inner(&notebook.id),
        folder_id,
        operator: sender,
    });
}
```

#### 3.2.5 Note Movement

```move
/// Move note to different folder
public entry fun move_note(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    note_id: ID,
    new_folder_id: Option<ID>,
    ctx: &mut TxContext
) {
    let sender = verify_authorization(notebook, &session_cap, ctx);

    if (option::is_some(&session_cap)) {
        let cap = option::destroy_some(session_cap);
        transfer::transfer(cap, sender);
    } else {
        option::destroy_none(session_cap);
    };

    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

    // Verify new folder exists if specified
    if (option::is_some(&new_folder_id)) {
        let folder = option::borrow(&new_folder_id);
        assert!(table::contains(&notebook.folders, *folder), E_FOLDER_NOT_FOUND);
    };

    let note = table::borrow_mut(&mut notebook.notes, note_id);
    let old_folder_id = note.folder_id;
    note.folder_id = new_folder_id;
    note.updated_at = tx_context::epoch_timestamp_ms(ctx);

    event::emit(NoteMoved {
        notebook_id: object::uid_to_inner(&notebook.id),
        note_id,
        old_folder_id,
        new_folder_id,
        operator: sender,
    });
}
```

#### 3.2.6 Walrus Blob Renewal Support

```move
/// Update Walrus blob object ID after renewal
public entry fun update_note_blob_object(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    note_id: ID,
    new_blob_object_id: String,
    ctx: &mut TxContext
) {
    let sender = verify_authorization(notebook, &session_cap, ctx);

    if (option::is_some(&session_cap)) {
        let cap = option::destroy_some(session_cap);
        transfer::transfer(cap, sender);
    } else {
        option::destroy_none(session_cap);
    };

    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

    let note = table::borrow_mut(&mut notebook.notes, note_id);
    note.blob_object_id = new_blob_object_id;
    note.updated_at = tx_context::epoch_timestamp_ms(ctx);

    // Emit event for client sync
    event::emit(NoteUpdated {
        notebook_id: object::uid_to_inner(&notebook.id),
        note_id,
        blob_id: note.blob_id,
        folder_id: note.folder_id,
        operator: sender,
    });
}

/// Arweave Backup Metadata Update (Future Feature)
public entry fun update_note_ar_backup(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    note_id: ID,
    ar_tx_id: String,
    backup_timestamp: u64,
    ctx: &mut TxContext
) {
    let sender = verify_authorization(notebook, &session_cap, ctx);

    if (option::is_some(&session_cap)) {
        let cap = option::destroy_some(session_cap);
        transfer::transfer(cap, sender);
    } else {
        option::destroy_none(session_cap);
    };

    assert!(table::contains(&notebook.notes, note_id), E_NOTE_NOT_FOUND);

    // Validate Arweave transaction ID format (43 characters, base64url)
    assert!(string::length(&ar_tx_id) == 43, E_INVALID_AR_TX_ID);

    let note = table::borrow_mut(&mut notebook.notes, note_id);
    note.ar_backup_id = option::some(ar_tx_id);
    note.ar_backup_version = option::some(backup_timestamp);

    event::emit(ArweaveBackupRecorded {
        notebook_id: object::uid_to_inner(&notebook.id),
        note_id,
        ar_tx_id,
        backup_timestamp,
        operator: sender,
    });
}
```

#### 3.2.7 Session Revocation

```move
/// Revoke a session capability
public entry fun revoke_session(
    notebook: &Notebook,
    session_cap: SessionCap,
    ctx: &mut TxContext
) {
    let sender = tx_context::sender(ctx);

    // Verify caller is notebook owner
    assert!(notebook.owner == sender, E_NOT_OWNER);

    // Verify session cap belongs to this notebook
    assert!(session_cap.notebook_id == object::uid_to_inner(&notebook.id), E_WRONG_NOTEBOOK);

    let session_cap_id = object::uid_to_inner(&session_cap.id);

    // Emit event before deletion
    event::emit(SessionRevoked {
        notebook_id: object::uid_to_inner(&notebook.id),
        session_cap_id,
        owner: sender,
    });

    // Delete the SessionCap object
    let SessionCap { id, notebook_id: _, ephemeral_address: _, expires_at: _, created_at: _ } = session_cap;
    object::delete(id);
}
```

### 3.3 Authorization Helper Function

```move
/// Verify authorization via SessionCap or direct ownership with device support
fun verify_authorization(
    notebook: &Notebook,
    session_cap: &Option<SessionCap>,
    ctx: &TxContext
): address {
    let sender = tx_context::sender(ctx);

    if (option::is_some(session_cap)) {
        let cap = option::borrow(session_cap);

        // Verify session cap belongs to this notebook
        assert!(cap.notebook_id == object::uid_to_inner(&notebook.id), E_WRONG_NOTEBOOK);

        // Verify not expired
        let now = tx_context::epoch_timestamp_ms(ctx);
        assert!(cap.expires_at > now, E_SESSION_EXPIRED);

        // Verify sender is the hot wallet address (not ephemeral_address anymore)
        assert!(cap.hot_wallet_address == sender, E_WRONG_HOT_WALLET);

        sender
    } else {
        // Direct ownership verification
        assert!(notebook.owner == sender, E_NOT_OWNER);
        sender
    }
}
```

### 3.4 Error Constants

```move
// Error codes
const E_NOT_OWNER: u64 = 1;
const E_INVALID_EXPIRATION: u64 = 2;
const E_SESSION_EXPIRED: u64 = 3;
const E_WRONG_EPHEMERAL: u64 = 4;
const E_WRONG_HOT_WALLET: u64 = 5;  // Updated for hot wallet verification
const E_WRONG_NOTEBOOK: u64 = 6;
const E_NOTE_NOT_FOUND: u64 = 7;
const E_FOLDER_NOT_FOUND: u64 = 8;
const E_PARENT_NOT_FOUND: u64 = 9;
const E_INVALID_AR_TX_ID: u64 = 10;
const E_NOTEBOOK_EXISTS: u64 = 11;
const E_NOTEBOOK_ALREADY_EXISTS: u64 = 12;
const E_INSUFFICIENT_BALANCE: u64 = 13;
const E_DEVICE_CONFLICT: u64 = 14;
```

---

## 4. Cryptography Implementation

### 4.1 Key Derivation (HKDF)

**Purpose**: Derive deterministic AES-256 encryption key from wallet signature

**Algorithm**: HKDF-SHA-256

**Implementation**:

```typescript
// crypto/keyDerivation.ts

import { fromB64 } from '@mysten/sui/utils';

/**
 * Derive AES-256 encryption key from wallet signature
 * Uses HKDF (HMAC-based Key Derivation Function) with SHA-256
 */
export async function deriveEncryptionKey(
  walletSignature: string
): Promise<CryptoKey> {
  // 1. Decode base64 signature to raw bytes
  const signatureBytes = fromB64(walletSignature);

  // 2. Import signature as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    signatureBytes,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  // 3. Derive AES-256-GCM key
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('InkBlob-encryption-v1'), // Fixed salt for determinism
      info: new TextEncoder().encode('aes-256-gcm-key'),     // Context info
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // Not extractable (security)
    ['encrypt', 'decrypt']
  );

  return aesKey;
}

/**
 * Standard message for wallet signature (must be consistent)
 */
export const KEY_DERIVATION_MESSAGE =
  'Sign this message to derive your InkBlob encryption key.\n\n' +
  'This signature will be used to encrypt and decrypt your notes.\n' +
  'Only sign this message on the official InkBlob application.';
```

### 4.2 Encryption (AES-256-GCM)

**Purpose**: Encrypt note content before uploading to Walrus

**Format**: `[12-byte IV || Ciphertext || 16-byte Auth Tag]`

**Implementation**:

```typescript
// crypto/encryption.ts

/**
 * Encrypt plaintext using AES-256-GCM with random IV
 * Returns IV-prepended ciphertext: [IV || ciphertext || auth_tag]
 */
export async function encryptContent(
  plaintext: string,
  key: CryptoKey
): Promise<Uint8Array> {
  // 1. Generate random 12-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 2. Encode plaintext to bytes
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // 3. Encrypt with AES-256-GCM
  const ciphertextWithTag = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128, // 16-byte authentication tag
    },
    key,
    plaintextBytes
  );

  // 4. Prepend IV to ciphertext
  // Format: [12-byte IV || ciphertext || 16-byte tag]
  const encrypted = new Uint8Array(12 + ciphertextWithTag.byteLength);
  encrypted.set(iv, 0);
  encrypted.set(new Uint8Array(ciphertextWithTag), 12);

  return encrypted;
}

/**
 * Encrypt small text (e.g., note title, folder name)
 * Same algorithm, but for shorter content
 */
export async function encryptText(
  text: string,
  key: CryptoKey
): Promise<string> {
  const encrypted = await encryptContent(text, key);

  // Return as base64 for storage in blockchain strings
  return btoa(String.fromCharCode(...encrypted));
}
```

### 4.3 Decryption (AES-256-GCM)

**Purpose**: Decrypt note content fetched from Walrus

**Implementation**:

```typescript
// crypto/decryption.ts

/**
 * Decrypt IV-prepended ciphertext
 * Input format: [12-byte IV || ciphertext || 16-byte auth_tag]
 */
export async function decryptContent(
  encryptedBlob: Uint8Array,
  key: CryptoKey
): Promise<string> {
  // Validate minimum length (12 IV + 16 tag = 28 bytes minimum)
  if (encryptedBlob.length < 28) {
    throw new Error('Invalid encrypted blob: too short');
  }

  // 1. Extract IV (first 12 bytes)
  const iv = encryptedBlob.slice(0, 12);

  // 2. Extract ciphertext with tag (remaining bytes)
  const ciphertextWithTag = encryptedBlob.slice(12);

  // 3. Decrypt with AES-256-GCM
  try {
    const plaintextBytes = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      key,
      ciphertextWithTag
    );

    // 4. Decode bytes to string
    return new TextDecoder().decode(plaintextBytes);
  } catch (error) {
    // Authentication tag verification failed or decryption error
    throw new Error('Decryption failed: data may be corrupted or tampered with');
  }
}

/**
 * Decrypt base64-encoded text (for titles, folder names)
 */
export async function decryptText(
  encryptedText: string,
  key: CryptoKey
): Promise<string> {
  // Decode base64 to bytes
  const encryptedBytes = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));

  return await decryptContent(encryptedBytes, key);
}
```

### 4.4 Session Key Management

**Purpose**: Encrypt ephemeral private key for localStorage storage

**Implementation**:

```typescript
// crypto/sessionKey.ts

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64, toB64 } from '@mysten/sui/utils';

/**
 * Generate unique device fingerprint for multi-device support
 */
export function generateDeviceFingerprint(): string {
  // Get browser and system information
  const userAgent = navigator.userAgent;
  const language = navigator.language;
  const platform = navigator.platform;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Generate or retrieve persistent device ID
  let deviceId = localStorage.getItem('InkBlob_device_id');
  if (!deviceId) {
    // Generate random device ID
    deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    localStorage.setItem('InkBlob_device_id', deviceId);
  }

  // Combine all factors
  const deviceData = `${deviceId}|${userAgent}|${language}|${platform}|${timezone}`;

  // Create hash of device data
  const encoder = new TextEncoder();
  const data = encoder.encode(deviceData);

  // Simple hash (in production, use a proper hash function)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * Derive device-specific Ed25519 hot wallet from main wallet signature
 * Each device gets unique hot wallet to prevent multi-device conflicts
 */
export async function deriveHotWallet(
  walletSignature: string,
  deviceFingerprint?: string
): Promise<{ keypair: Ed25519Keypair; address: string; fingerprint: string }> {
  // Generate device fingerprint if not provided
  const fingerprint = deviceFingerprint || generateDeviceFingerprint();

  // Use separate HKDF context for hot wallet derivation with device fingerprint
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    fromB64(walletSignature),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  // Combine wallet signature with device fingerprint
  const combinedInput = new TextEncoder().encode(
    `${walletSignature}:${fingerprint}`
  );

  const combinedKeyMaterial = await crypto.subtle.importKey(
    'raw',
    combinedInput,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  // Derive hot wallet seed with device-specific context
  const hotWalletSeed = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('InkBlob-hot-wallet-device-v1'), // Device-specific salt
      info: new TextEncoder().encode(`ed25519-seed-${fingerprint}`),  // Device-specific info
    },
    combinedKeyMaterial,
    { name: 'HKDF' }, // Intermediate format
    false,
    ['deriveKey']
  );

  // Extract 32 bytes for Ed25519 seed
  const seedBytes = await crypto.subtle.exportKey('raw', hotWalletSeed);
  const seed = new Uint8Array(seedBytes).slice(0, 32);

  const keypair = Ed25519Keypair.fromSecretKey(seed);
  const address = keypair.getPublicKey().toSuiAddress();

  return {
    keypair,
    address,
    fingerprint
  };
}

/**
 * Encrypt hot wallet private key for storage with separate derivation context
 */
export async function encryptHotWalletKey(
  privateKey: Uint8Array,
  walletSignature: string
): Promise<string> {
  // Derive encryption key from wallet signature with key-specific context
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    fromB64(walletSignature),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const encKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('InkBlob-key-encryption-v1'), // Different salt from content encryption
      info: new TextEncoder().encode('hot-wallet-key'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Encrypt private key bytes
  const encrypted = await encryptContent(
    toB64(privateKey),
    encKey
  );

  return toB64(encrypted);
}

/**
 * Decrypt hot wallet private key from storage with separate derivation context
 */
export async function decryptHotWalletKey(
  encryptedKey: string,
  walletSignature: string
): Promise<Ed25519Keypair> {
  // Derive decryption key from wallet signature with key-specific context
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    fromB64(walletSignature),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const decKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('InkBlob-key-encryption-v1'),
      info: new TextEncoder().encode('hot-wallet-key'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Decrypt private key bytes
  const decrypted = await decryptContent(
    fromB64(encryptedKey),
    decKey
  );

  // Reconstruct keypair
  const privateKeyBytes = fromB64(decrypted);
  return Ed25519Keypair.fromSecretKey(privateKeyBytes);
}

/**
 * Store device-specific hot wallet key in localStorage
 */
export function storeHotWalletKey(
  encryptedKey: string,
  expiresAt: number,
  deviceFingerprint: string,
  hotWalletAddress: string
): void {
  localStorage.setItem('InkBlob_hot_wallet_key', encryptedKey);
  localStorage.setItem('InkBlob_session_expires', expiresAt.toString());
  localStorage.setItem('InkBlob_device_fingerprint', deviceFingerprint);
  localStorage.setItem('InkBlob_hot_wallet_address', hotWalletAddress);
}

/**
 * Retrieve device-specific hot wallet key from localStorage
 */
export function retrieveHotWalletKey(): {
  encryptedKey: string;
  expiresAt: number;
  deviceFingerprint: string;
  hotWalletAddress: string;
} | null {
  const encryptedKey = localStorage.getItem('InkBlob_hot_wallet_key');
  const expiresAt = localStorage.getItem('InkBlob_session_expires');
  const deviceFingerprint = localStorage.getItem('InkBlob_device_fingerprint');
  const hotWalletAddress = localStorage.getItem('InkBlob_hot_wallet_address');

  if (!encryptedKey || !expiresAt || !deviceFingerprint || !hotWalletAddress) {
    return null;
  }

  // Check if expired
  if (Date.now() > parseInt(expiresAt)) {
    clearHotWalletKey();
    return null;
  }

  return {
    encryptedKey,
    expiresAt: parseInt(expiresAt),
    deviceFingerprint,
    hotWalletAddress,
  };
}

/**
 * Clear hot wallet key from storage
 */
export function clearHotWalletKey(): void {
  localStorage.removeItem('InkBlob_hot_wallet_key');
  localStorage.removeItem('InkBlob_session_expires');
  localStorage.removeItem('InkBlob_device_fingerprint');
  localStorage.removeItem('InkBlob_hot_wallet_address');
}

/**
 * Get stored device information
 */
export function getStoredDeviceInfo(): {
  deviceFingerprint: string;
  hotWalletAddress: string;
} | null {
  const deviceFingerprint = localStorage.getItem('InkBlob_device_fingerprint');
  const hotWalletAddress = localStorage.getItem('InkBlob_hot_wallet_address');

  if (!deviceFingerprint || !hotWalletAddress) {
    return null;
  }

  return { deviceFingerprint, hotWalletAddress };
}

/**
 * Check if current device matches stored device (prevents device conflicts)
 */
export function isCurrentDevice(): boolean {
  const storedFingerprint = localStorage.getItem('InkBlob_device_fingerprint');
  const currentFingerprint = generateDeviceFingerprint();

  return storedFingerprint === currentFingerprint;
}
```

---

## 5. Walrus Integration

### 5.1 Configuration

```typescript
// walrus/config.ts

import { WalrusClient } from '@mysten/walrus';

export const WALRUS_CONFIG = {
  // Testnet configuration
  network: 'testnet' as const,

  // Upload relay for browser compatibility
  uploadRelay: 'https://publisher.walrus-testnet.walrus.space',

  // Aggregator for downloads
  aggregator: 'https://aggregator.walrus-testnet.walrus.space',

  // Default storage duration (epochs)
  // 1 epoch ≈ 24 hours on testnet
  defaultEpochs: 30, // ~30 days

  // Max blob size (100 MB)
  maxBlobSize: 100 * 1024 * 1024,
};

/**
 * Initialize Walrus client
 */
export function createWalrusClient(): WalrusClient {
  return new WalrusClient({
    publisher: WALRUS_CONFIG.uploadRelay,
    aggregator: WALRUS_CONFIG.aggregator,
  });
}
```

### 5.2 Upload Service

```typescript
// walrus/upload.ts

import { createWalrusClient, WALRUS_CONFIG } from './config';

export interface UploadResult {
  blobId: string;
  blobObject: string; // Sui object reference
  epochs: number;
}

/**
 * Upload encrypted content to Walrus
 */
export async function uploadBlob(
  encryptedContent: Uint8Array,
  epochs: number = WALRUS_CONFIG.defaultEpochs
): Promise<UploadResult> {
  // Validate size
  if (encryptedContent.length > WALRUS_CONFIG.maxBlobSize) {
    throw new Error(`Blob exceeds max size of ${WALRUS_CONFIG.maxBlobSize} bytes`);
  }

  const client = createWalrusClient();

  try {
    // Upload blob via relay
    const result = await client.store(encryptedContent, {
      epochs,
    });

    // Result contains:
    // - blobId: unique content identifier
    // - blobObject: Sui object reference for tracking
    return {
      blobId: result.blobId,
      blobObject: result.blobObject,
      epochs,
    };
  } catch (error) {
    console.error('Walrus upload failed:', error);
    throw new Error(`Failed to upload to Walrus: ${error.message}`);
  }
}

/**
 * Upload note content (encrypt + upload)
 */
export async function uploaInkBlobContent(
  plaintext: string,
  encryptionKey: CryptoKey,
  epochs?: number
): Promise<UploadResult> {
  // 1. Encrypt content
  const encrypted = await encryptContent(plaintext, encryptionKey);

  // 2. Upload to Walrus
  return await uploadBlob(encrypted, epochs);
}
```

### 5.3 Download Service

```typescript
// walrus/download.ts

import { createWalrusClient } from './config';

/**
 * Download blob from Walrus by blob ID
 */
export async function downloadBlob(blobId: string): Promise<Uint8Array> {
  const client = createWalrusClient();

  try {
    // Fetch from aggregator
    const blob = await client.read(blobId);

    return new Uint8Array(blob);
  } catch (error) {
    console.error('Walrus download failed:', error);
    throw new Error(`Failed to download from Walrus: ${error.message}`);
  }
}

/**
 * Download and decrypt note content
 */
export async function downloaInkBlobContent(
  blobId: string,
  decryptionKey: CryptoKey
): Promise<string> {
  // 1. Download encrypted blob
  const encryptedBlob = await downloadBlob(blobId);

  // 2. Decrypt content
  return await decryptContent(encryptedBlob, decryptionKey);
}
```

### 5.4 Error Handling

```typescript
// walrus/errors.ts

export class WalrusError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'WalrusError';
  }
}

export class UploadFailedError extends WalrusError {
  constructor(reason: string) {
    super(`Upload failed: ${reason}`, 'UPLOAD_FAILED');
  }
}

export class DownloadFailedError extends WalrusError {
  constructor(blobId: string, reason: string) {
    super(`Download failed for blob ${blobId}: ${reason}`, 'DOWNLOAD_FAILED');
  }
}

export class BlobNotFoundError extends WalrusError {
  constructor(blobId: string) {
    super(`Blob not found: ${blobId}`, 'BLOB_NOT_FOUND');
  }
}

/**
 * Handle Walrus errors with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on blob not found
      if (error instanceof BlobNotFoundError) {
        throw error;
      }

      // Wait before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}
```

---

## 6. Frontend Architecture

### 6.1 Component Hierarchy

```
App
├── Providers
│   ├── SuiClientProvider (Sui RPC)
│   ├── WalletProvider (@mysten/dapp-kit)
│   ├── QueryClientProvider (React Query)
│   └── EncryptionProvider (Custom - holds encryption key)
│
├── Layout
│   ├── Header
│   │   ├── WalletButton
│   │   └── SessionStatus
│   ├── Sidebar
│   │   ├── FolderTree
│   │   │   ├── FolderNode (recursive)
│   │   │   └── FolderActions
│   │   └── NewFolderButton
│   └── MainContent
│       ├── NoteList
│       │   ├── NoteListHeader
│       │   │   ├── SortDropdown
│       │   │   └── NewNoteButton
│       │   └── NoteListItem[]
│       │       ├── NoteTitle (encrypted → decrypted)
│       │       ├── NoteTimestamp
│       │       └── NoteActions
│       └── NoteEditor
│           ├── EditorToolbar
│           │   ├── FormatButtons
│           │   ├── HeadingButtons
│           │   └── ListButtons
│           ├── LexicalEditor
│           └── EditorFooter
│               ├── SaveButton
│               ├── LastSaved
│               └── ArweaveStatus (MVP: display only)
│
└── Modals
    ├── CreateNotebookModal
    ├── AuthorizeSessionModal
    ├── ErrorModal
    └── LoadingModal
```

### 6.2 State Management Architecture

```typescript
// State is divided into 3 categories:

// 1. SERVER STATE (React Query)
// - Cached, synchronized with blockchain
// - Automatic refetching and invalidation

// hooks/useNotebook.ts
export function useNotebook() {
  const { currentAccount } = useCurrentAccount();

  return useQuery({
    queryKey: ['notebook', currentAccount?.address],
    queryFn: async () => {
      // 1. Query owned NotebookRegistry
      const registry = await queryNotebookRegistry(currentAccount.address);

      // 2. Fetch shared Notebook object
      const notebook = await fetchNotebook(registry.notebook_id);

      return notebook;
    },
    enabled: !!currentAccount,
    staleTime: 30_000, // Refetch every 30s
  });
}

// hooks/useNotes.ts
export function useNotes() {
  const { data: notebook } = useNotebook();
  const { encryptionKey } = useEncryption();

  return useQuery({
    queryKey: ['notes', notebook?.id],
    queryFn: async () => {
      if (!notebook || !encryptionKey) return [];

      // Decrypt titles for display
      const notes = await Promise.all(
        Object.values(notebook.notes).map(async (note) => ({
          ...note,
          title: await decryptText(note.encrypted_title, encryptionKey),
        }))
      );

      return notes;
    },
    enabled: !!notebook && !!encryptionKey,
  });
}

// 2. GLOBAL STATE (React Context)
// - Encryption key (memory only)
// - Session state
// - Current user

// context/EncryptionContext.tsx
interface EncryptionContextValue {
  encryptionKey: CryptoKey | null;
  deriveKey: (signature: string) => Promise<void>;
  clearKey: () => void;
}

export const EncryptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

  const deriveKey = async (signature: string) => {
    const key = await deriveEncryptionKey(signature);
    setEncryptionKey(key);
  };

  const clearKey = () => {
    setEncryptionKey(null);
  };

  return (
    <EncryptionContext.Provider value={{ encryptionKey, deriveKey, clearKey }}>
      {children}
    </EncryptionContext.Provider>
  );
};

// context/SessionContext.tsx
interface SessionContextValue {
  sessionCap: SessionCapInfo | null;
  ephemeralKeypair: Ed25519Keypair | null;
  isSessionValid: boolean;
  authorizeSession: () => Promise<void>;
  revokeSession: () => Promise<void>;
}

// 3. LOCAL STATE (useState/useReducer)
// - UI state (modals, selections)
// - Editor state (Lexical)
// - Form state
```

### 6.3 Service Layer

```typescript
// services/suiService.ts

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

export class SuiService {
  constructor(private client: SuiClient) {}

  /**
   * Query owned NotebookRegistry
   */
  async queryNotebookRegistry(owner: string): Promise<NotebookRegistry | null> {
    const result = await this.client.getOwnedObjects({
      owner,
      filter: { StructType: `${PACKAGE_ID}::notebook::NotebookRegistry` },
      options: { showContent: true },
    });

    if (result.data.length === 0) return null;

    const registry = result.data[0];
    return parseNotebookRegistry(registry);
  }

  /**
   * Fetch shared Notebook object
   */
  async fetchNotebook(notebookId: string): Promise<Notebook> {
    const result = await this.client.getObject({
      id: notebookId,
      options: { showContent: true },
    });

    return parseNotebook(result);
  }

  /**
   * Create notebook transaction
   */
  createNotebookTx(): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${PACKAGE_ID}::notebook::create_notebook`,
      arguments: [],
    });

    return tx;
  }

  /**
   * Update note transaction
   */
  updateNoteTx(
    notebookId: string,
    sessionCap: string | null,
    noteId: string,
    blobId: string,
    encryptedTitle: string,
    folderId: string | null
  ): Transaction {
    const tx = new Transaction();

    const notebook = tx.object(notebookId);
    const session = sessionCap ? tx.object(sessionCap) : tx.pure.option('address', null);

    tx.moveCall({
      target: `${PACKAGE_ID}::notebook::update_note`,
      arguments: [
        notebook,
        session,
        tx.pure.id(noteId),
        tx.pure.string(blobId),
        tx.pure.string(encryptedTitle),
        folderId ? tx.pure.option('id', tx.pure.id(folderId)) : tx.pure.option('id', null),
      ],
    });

    return tx;
  }

  // Additional transaction builders...
}
```

### 6.4 Component Examples

#### 6.4.1 Note Editor Component

```typescript
// components/NoteEditor.tsx

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export const NoteEditor: React.FC<{ noteId: string | null }> = ({ noteId }) => {
  const { encryptionKey } = useEncryption();
  const { data: note } = useNote(noteId);
  const queryClient = useQueryClient();

  const [editorState, setEditorState] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!encryptionKey) throw new Error('No encryption key');

      // 1. Serialize editor state to JSON
      const jsonContent = content;

      // 2. Encrypt and upload to Walrus
      const { blobId } = await uploaInkBlobContent(jsonContent, encryptionKey);

      // 3. Encrypt title
      const title = extractTitle(jsonContent);
      const encryptedTitle = await encryptText(title, encryptionKey);

      // 4. Build and execute Sui transaction
      const tx = suiService.updateNoteTx(
        notebook.id,
        sessionCap?.id || null,
        noteId || generateNewId(),
        blobId,
        encryptedTitle,
        currentFolderId
      );

      await signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      // Invalidate notebook cache to refetch
      queryClient.invalidateQueries({ queryKey: ['notebook'] });
    },
  });

  const handleSave = async () => {
    if (!editorState) return;

    setIsSaving(true);
    try {
      await saveMutation.mutateAsync(editorState);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="note-editor">
      <LexicalComposer initialConfig={editorConfig}>
        <EditorToolbar />
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-content" />}
          placeholder={<div className="editor-placeholder">Start typing...</div>}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={(editorState) => {
          const json = JSON.stringify(editorState.toJSON());
          setEditorState(json);
        }} />
      </LexicalComposer>

      <div className="editor-footer">
        <button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {note?.updated_at && (
          <span>Last saved: {formatTimestamp(note.updated_at)}</span>
        )}
      </div>
    </div>
  );
};
```

#### 6.4.2 Folder Tree Component

```typescript
// components/FolderTree.tsx

export const FolderTree: React.FC = () => {
  const { data: folders } = useFolders();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Build folder hierarchy
  const folderTree = useMemo(() => {
    if (!folders) return [];

    return buildTree(folders.filter(f => !f.is_deleted));
  }, [folders]);

  return (
    <div className="folder-tree">
      {folderTree.map(folder => (
        <FolderNode
          key={folder.id}
          folder={folder}
          expanded={expandedFolders.has(folder.id)}
          onToggle={() => toggleFolder(folder.id)}
        />
      ))}
    </div>
  );
};

const FolderNode: React.FC<FolderNodeProps> = ({ folder, expanded, onToggle }) => {
  const { encryptionKey } = useEncryption();
  const [decryptedName, setDecryptedName] = useState<string>('...');

  useEffect(() => {
    if (encryptionKey) {
      decryptText(folder.encrypted_name, encryptionKey)
        .then(setDecryptedName)
        .catch(() => setDecryptedName('[Decryption Failed]'));
    }
  }, [folder.encrypted_name, encryptionKey]);

  return (
    <div className="folder-node">
      <div className="folder-header" onClick={onToggle}>
        <span className="folder-icon">{expanded ? '📂' : '📁'}</span>
        <span className="folder-name">{decryptedName}</span>
      </div>

      {expanded && folder.children && (
        <div className="folder-children">
          {folder.children.map(child => (
            <FolderNode key={child.id} folder={child} />
          ))}
        </div>
      )}
    </div>
  );
};
```

---

## 7. Data Flow Diagrams

### 7.1 Complete Note Save Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. User Input                                                       │
│    User types in Lexical editor → onChange → Update local state    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Save Trigger                                                     │
│    User clicks "Save" → handleSave() → Start save mutation         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Content Serialization                                            │
│    Lexical EditorState → JSON.stringify() → JSON string            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Encryption                                                       │
│    a. Generate random 12-byte IV                                    │
│    b. Encrypt JSON with AES-256-GCM(content, key, iv)              │
│    c. Prepend IV: [IV || ciphertext || auth_tag]                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Walrus Upload                                                    │
│    a. POST encrypted blob to upload relay                          │
│    b. Relay distributes to storage nodes                           │
│    c. Receive blob_id and blob_object                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Title Encryption                                                 │
│    a. Extract title from editor content                            │
│    b. Encrypt title separately (for list display)                  │
│    c. Base64 encode encrypted title                                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. Sui Transaction Building                                         │
│    a. Create Transaction object                                     │
│    b. Add moveCall to update_note                                   │
│    c. Arguments: notebook_id, session_cap, note_id, blob_id,       │
│       encrypted_title, folder_id                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 8. Transaction Signing                                              │
│    a. If SessionCap valid: sign with ephemeral key                 │
│    b. Else: prompt main wallet for signature                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 9. Transaction Execution                                            │
│    a. Submit to Sui RPC                                            │
│    b. Wait for finality (checkpoint)                               │
│    c. Verify success                                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 10. Blockchain State Update                                         │
│     a. Table::add or Table::borrow_mut executed                    │
│     b. Note metadata updated                                       │
│     c. NoteUpdated event emitted                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 11. UI Update                                                       │
│     a. Invalidate React Query cache                                │
│     b. Refetch notebook data                                       │
│     c. Update note list with new timestamp                         │
│     d. Show "Saved" confirmation                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Multi-Device Sync Flow

```
Device A                           Blockchain                      Device B
   │                                    │                             │
   │  1. Save Note                      │                             │
   ├──────────────────────────────────► │                             │
   │  (update_note transaction)         │                             │
   │                                    │                             │
   │  2. Transaction Executed           │                             │
   │ ◄──────────────────────────────────┤                             │
   │  (NoteUpdated event emitted)       │                             │
   │                                    │                             │
   │                                    │  3. Polling/Event Listen    │
   │                                    │ ◄───────────────────────────┤
   │                                    │  (every 30s or WebSocket)   │
   │                                    │                             │
   │                                    │  4. Fetch Notebook          │
   │                                    │ ◄───────────────────────────┤
   │                                    │                             │
   │                                    │  5. Return Updated Data     │
   │                                    ├─────────────────────────────►
   │                                    │  (new note metadata)        │
   │                                    │                             │
   │                                    │  6. Fetch Blob from Walrus  │
   │                                    │ ◄───────────────────────────┤
   │                                    │                             │
   │                                    │  7. Decrypt & Display       │
   │                                    ├─────────────────────────────►
   │                                    │  (updated content)          │
```

---

## 8. Security Considerations

### 8.1 Threat Model

**Assets to Protect:**
1. Note plaintext content
2. Encryption keys (AES-256 key, ephemeral private key)
3. Wallet access and authorization
4. Blockchain transactions and gas funds

**Threat Actors:**
1. Network eavesdroppers (MITM attacks)
2. Malicious Walrus/Sui nodes
3. Compromised browser extensions
4. XSS attacks on frontend
5. Malicious smart contract interactions

### 8.2 Security Controls

#### 8.2.1 Encryption Security

**Control**: Client-side AES-256-GCM encryption with IV prepending

**Implementation**:
- Random IV generation using `crypto.getRandomValues()`
- 256-bit key length (AES-256)
- GCM mode with 128-bit authentication tag
- IV never reused for the same key
- Deterministic key derivation using HKDF

**Mitigates**:
- Network eavesdropping (HTTPS + encryption)
- Malicious storage nodes (zero-knowledge architecture)
- Data tampering (GCM authentication tag verification)

**Residual Risks**:
- Key compromise if browser is compromised
- Side-channel attacks on Web Crypto API (out of scope for MVP)

#### 8.2.2 Key Management Security

**Control**: Encryption key stored in memory only, derived from wallet signature

**Implementation**:
```typescript
// Key lifecycle
1. User connects wallet
2. Prompt signature for key derivation
3. HKDF(signature) → AES-256 key
4. Store in React state (memory only)
5. On session end: clear key
6. Re-derive on next session
```

**Mitigates**:
- Persistent key storage attacks (no localStorage for main key)
- Key extraction from browser storage
- Cross-session key reuse vulnerabilities

**Residual Risks**:
- Memory dumping attacks (requires privileged access)
- Browser extension malware reading memory

#### 8.2.3 Session Key Security

**Control**: Ephemeral session keys encrypted before localStorage storage

**Implementation**:
```typescript
// Ephemeral key lifecycle
1. Generate Ed25519Keypair (in memory)
2. Encrypt private key with HKDF(wallet_signature)
3. Store encrypted key in localStorage
4. On session restore:
   a. Retrieve encrypted key
   b. Prompt wallet signature
   c. Decrypt and load keypair
   d. Verify SessionCap not expired
```

**Mitigates**:
- Plaintext private key storage
- Unauthorized session access
- Session hijacking

**Residual Risks**:
- Wallet signature phishing (user education required)
- SessionCap theft (limited by expiration)

#### 8.2.4 Smart Contract Security

**Control**: Access control via SessionCap verification and owner checks

**Implementation**:
```move
fun verify_authorization(
    notebook: &Notebook,
    session_cap: &Option<SessionCap>,
    ctx: &TxContext
): address {
    // Check SessionCap validity
    // - Correct notebook_id
    // - Not expired
    // - Sender matches ephemeral_address

    // Fallback to owner check
}
```

**Mitigates**:
- Unauthorized notebook modifications
- Session replay attacks (expiration)
- Cross-notebook attacks (notebook_id verification)

**Security Checklist**:
- [ ] Input validation for all entry functions
- [ ] Authorization checks before state modifications
- [ ] Proper object ownership verification
- [ ] Event emission for audit trail
- [ ] Gas limit considerations (DoS prevention)

#### 8.2.5 Frontend Security

**Controls**:
1. **Content Security Policy (CSP)**
   ```html
   <meta http-equiv="Content-Security-Policy"
         content="default-src 'self';
                  script-src 'self';
                  connect-src 'self' https://*.sui.io https://*.walrus.space;
                  style-src 'self' 'unsafe-inline';">
   ```

2. **Input Sanitization**
   - Lexical editor handles HTML sanitization
   - No direct `dangerouslySetInnerHTML` usage
   - Validate all user inputs before encryption

3. **Wallet Interaction Security**
   - Use official @mysten/dapp-kit hooks
   - Never request private keys directly
   - Verify transaction details before signing

4. **XSS Prevention**
   - React auto-escaping for rendered content
   - Sanitize Lexical output before rendering
   - Validate decrypted content structure

### 8.3 Data Protection

**Data Classification**:

| Data Type | Sensitivity | Storage | Encryption |
|-----------|-------------|---------|------------|
| Note content | High | Walrus | AES-256-GCM |
| Note titles | High | Sui blockchain | AES-256-GCM |
| Folder names | Medium | Sui blockchain | AES-256-GCM |
| Wallet addresses | Public | Sui blockchain | None |
| Timestamps | Public | Sui blockchain | None |
| Blob IDs | Public | Sui blockchain | None |
| Encryption key | Critical | Browser memory | None (ephemeral) |
| Ephemeral private key | Critical | localStorage | AES-256-GCM |

**Data Retention**:
- Notes: Until user deletes (soft delete with is_deleted flag)
- Walrus blobs: Epoch-based lifecycle (30 days default on testnet)
- SessionCap: Until expiration or revocation
- Encryption key: Session-only (cleared on disconnect)

**Data Erasure**:
- Smart contract: Soft delete (set is_deleted flag)
- Walrus: Automatic after epoch expiration
- Frontend: Clear encryption key on logout

### 8.4 Authentication and Authorization

**Authentication Flow**:
```
1. Wallet Connection (proof of ownership)
   ↓
2. Signature Request (key derivation)
   ↓
3. Encryption Key Derivation (HKDF)
   ↓
4. Session Authorization (optional SessionCap)
   ↓
5. Ephemeral Key Generation & Storage
```

**Authorization Matrix**:

| Operation | Owner | SessionCap Holder | Other |
|-----------|-------|-------------------|-------|
| Create Notebook | ✅ | ❌ | ❌ |
| Authorize Session | ✅ | ❌ | ❌ |
| Revoke Session | ✅ | ❌ | ❌ |
| Update Note | ✅ | ✅ (if valid) | ❌ |
| Create Folder | ✅ | ✅ (if valid) | ❌ |
| Delete Folder | ✅ | ✅ (if valid) | ❌ |
| Move Note | ✅ | ✅ (if valid) | ❌ |
| Read Notebook | ✅ (with key) | ✅ (with key) | ❌ (no key) |

**SessionCap Validity Checks**:
1. `notebook_id` matches target Notebook
2. `expires_at > current_timestamp`
3. `tx_context::sender() == ephemeral_address`

---

## 9. Performance & Scalability

### 9.1 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Note list load | < 3s | Time to display decrypted titles |
| Note save | < 5s | Encrypt → Walrus → Sui → Confirmation |
| Note open | < 2s | Fetch → Decrypt → Render |
| Folder tree render | < 1s | Even with 1,000 folders |
| Table lookup | O(1) | Sui Table data structure |
| Encryption | < 100ms | AES-256-GCM for 100KB content |
| Decryption | < 100ms | AES-256-GCM with auth verification |

### 9.2 Scalability Considerations

#### 9.2.1 Blockchain Scalability

**Challenge**: Sui transaction size limits (128KB hard limit)

**Solution**:
- Use Table<ID, Note> for O(1) operations (no vector iteration)
- Only send modified data in transactions, not entire collections
- Separate transactions for note and folder operations

**Scale Targets**:
- 10,000 notes per notebook
- 1,000 folders per notebook
- 5 levels of folder nesting

**Gas Optimization**:
- Batch folder creation where possible
- Use SessionCap to avoid repeated wallet prompts (better UX, not gas savings)
- Optimize struct sizes (String vs vector<u8>)

#### 9.2.2 Storage Scalability

**Walrus Blob Size**:
- Max blob size: 100MB (Walrus limit)
- Typical note size: 10KB - 100KB
- Overhead: 12-byte IV + 16-byte auth tag = 28 bytes

**Epoch Management**:
- Default storage: 30 epochs (~30 days on testnet)
- MVP: No automatic renewal (user must re-save)
- Post-MVP: Implement storage renewal monitoring

#### 9.2.3 Frontend Performance

**Optimization Strategies**:

1. **React Query Caching**
   ```typescript
   // Cache decrypted notes to avoid re-decryption
   const { data: notes } = useQuery({
     queryKey: ['notes', notebookId],
     queryFn: fetchAndDecryptNotes,
     staleTime: 30_000, // Cache for 30s
     cacheTime: 5 * 60_000, // Keep in cache for 5 minutes
   });
   ```

2. **Virtual Scrolling** (if > 1000 notes)
   ```typescript
   import { useVirtualizer } from '@tanstack/react-virtual';

   // Render only visible notes in viewport
   const rowVirtualizer = useVirtualizer({
     count: notes.length,
     getScrollElement: () => parentRef.current,
     estimateSize: () => 60, // Note item height
   });
   ```

3. **Lazy Decryption**
   ```typescript
   // Only decrypt titles on initial load
   // Decrypt content when note is opened
   const openNote = async (noteId: string) => {
     const note = notes.find(n => n.id === noteId);
     const blob = await downloadBlob(note.blob_id);
     const content = await decryptContent(blob, encryptionKey);
     setActiveNoteContent(content);
   };
   ```

4. **Debounced Auto-save**
   ```typescript
   const debouncedSave = useDebouncedCallback(
     (content: string) => saveMutation.mutate(content),
     2000 // Save 2 seconds after user stops typing
   );
   ```

### 9.3 Caching Strategy

**Multi-Layer Cache**:

```
┌─────────────────────────────────────────────┐
│ Layer 1: React Query Cache (5 min)         │
│ - Decrypted notes with titles              │
│ - Folder structure                         │
│ - Notebook metadata                        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ Layer 2: Browser Memory (session)          │
│ - Encryption key (CryptoKey object)        │
│ - Ephemeral keypair (Ed25519Keypair)       │
│ - Active note content (Lexical state)      │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ Layer 3: localStorage (persistent)         │
│ - Encrypted ephemeral private key          │
│ - Session expiration timestamp             │
│ - UI preferences (sort order, etc.)        │
└─────────────────────────────────────────────┘
```

**Cache Invalidation**:
- On note save: Invalidate `['notes', notebookId]`
- On folder create/update: Invalidate `['folders', notebookId]`
- On multi-device sync: Invalidate all queries on timestamp change
- On logout: Clear all caches

---

## 10. Testing Strategy

### 10.1 Smart Contract Testing

**Framework**: Sui Move testing framework (`sui move test`)

**Test Categories**:

1. **Unit Tests** (in Move test modules)
   ```move
   #[test]
   fun test_create_notebook() {
       let ctx = tx_context::dummy();
       create_notebook(&mut ctx);
       // Verify Notebook and NotebookRegistry created
   }

   #[test]
   fun test_update_note_with_session_cap() {
       // Test SessionCap authorization
   }

   #[test]
   #[expected_failure(abort_code = E_SESSION_EXPIRED)]
   fun test_expired_session_cap() {
       // Test expiration validation
   }
   ```

2. **Integration Tests** (TypeScript with `@mysten/sui/test`)
   ```typescript
   describe('Notebook Module', () => {
     it('should create notebook and registry', async () => {
       const tx = new Transaction();
       tx.moveCall({
         target: `${packageId}::notebook::create_notebook`,
       });

       const result = await client.signAndExecuteTransaction({
         signer: keypair,
         transaction: tx,
       });

       expect(result.effects.status).toBe('success');
       // Verify registry transferred to sender
     });
   });
   ```

3. **Property-based Tests**
   - Invariant: `owner` field never changes after creation
   - Invariant: Table size matches actual note count
   - Invariant: Expired SessionCap always rejected

### 10.2 Cryptography Testing

**Test Vectors**:

```typescript
describe('Encryption', () => {
  it('should encrypt and decrypt correctly', async () => {
    const plaintext = 'Test note content';
    const key = await generateTestKey();

    const encrypted = await encryptContent(plaintext, key);
    const decrypted = await decryptContent(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it('should fail decryption with wrong key', async () => {
    const plaintext = 'Test note content';
    const key1 = await generateTestKey();
    const key2 = await generateTestKey();

    const encrypted = await encryptContent(plaintext, key1);

    await expect(
      decryptContent(encrypted, key2)
    ).rejects.toThrow('Decryption failed');
  });

  it('should detect tampering', async () => {
    const plaintext = 'Test note content';
    const key = await generateTestKey();

    const encrypted = await encryptContent(plaintext, key);

    // Tamper with ciphertext
    encrypted[20] = encrypted[20] ^ 0xFF;

    await expect(
      decryptContent(encrypted, key)
    ).rejects.toThrow('Decryption failed');
  });

  it('should never reuse IV', async () => {
    const plaintext = 'Test note content';
    const key = await generateTestKey();

    const encrypted1 = await encryptContent(plaintext, key);
    const encrypted2 = await encryptContent(plaintext, key);

    // Extract IVs
    const iv1 = encrypted1.slice(0, 12);
    const iv2 = encrypted2.slice(0, 12);

    expect(iv1).not.toEqual(iv2);
  });
});
```

### 10.3 Integration Testing

**Test Scenarios**:

1. **End-to-End Note Creation**
   ```typescript
   it('should create note end-to-end', async () => {
     // 1. Connect wallet
     // 2. Derive encryption key
     // 3. Create notebook
     // 4. Authorize session
     // 5. Create note
     // 6. Verify on blockchain
     // 7. Verify on Walrus
     // 8. Retrieve and decrypt
   });
   ```

2. **Multi-Device Sync**
   ```typescript
   it('should sync across devices', async () => {
     // Device A: Create note
     // Device B: Query notebook
     // Device B: Verify note appears
     // Device B: Decrypt successfully
   });
   ```

3. **Session Expiration Flow**
   ```typescript
   it('should handle session expiration', async () => {
     // Create SessionCap with short expiration
     // Wait for expiration
     // Attempt note update
     // Verify rejection
     // Re-authorize session
     // Retry note update
     // Verify success
   });
   ```

### 10.4 Frontend Testing

**Framework**: Vitest + React Testing Library

```typescript
// components/__tests__/NoteEditor.test.tsx

describe('NoteEditor', () => {
  it('should render editor', () => {
    render(<NoteEditor noteId={null} />);
    expect(screen.getByPlaceholderText('Start typing...')).toBeInTheDocument();
  });

  it('should save note on button click', async () => {
    const mockSave = vi.fn();
    render(<NoteEditor noteId={null} onSave={mockSave} />);

    // Type content
    const editor = screen.getByRole('textbox');
    await userEvent.type(editor, 'Test note content');

    // Click save
    const saveButton = screen.getByText('Save');
    await userEvent.click(saveButton);

    // Verify save called
    expect(mockSave).toHaveBeenCalledWith(
      expect.stringContaining('Test note content')
    );
  });
});
```

### 10.5 Performance Testing

**Load Tests**:

```typescript
describe('Performance', () => {
  it('should handle 10,000 notes', async () => {
    // Create notebook with 10,000 notes
    const notebook = await createLargeNotebook(10000);

    // Measure list render time
    const start = performance.now();
    render(<NoteList notebook={notebook} />);
    const renderTime = performance.now() - start;

    expect(renderTime).toBeLessThan(3000); // < 3s target
  });

  it('should encrypt 100KB in < 100ms', async () => {
    const content = generateRandomContent(100 * 1024); // 100KB
    const key = await generateTestKey();

    const start = performance.now();
    await encryptContent(content, key);
    const encryptTime = performance.now() - start;

    expect(encryptTime).toBeLessThan(100);
  });
});
```

---

## 11. Deployment Strategy

### 11.1 Development Environment

**Prerequisites**:
- Sui CLI (`sui --version >= 1.20.0`)
- Node.js (`node --version >= 20.0.0`)
- pnpm (`pnpm --version >= 8.0.0`)

**Setup Steps**:

```bash
# 1. Install Sui CLI
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch testnet sui

# 2. Configure Sui client for testnet
sui client new-env --alias testnet \
  --rpc https://fullnode.testnet.sui.io:443

sui client switch --env testnet

# 3. Create test wallet (or import existing)
sui client new-address ed25519 test-wallet

# 4. Request testnet tokens
curl --location --request POST 'https://faucet.testnet.sui.io/gas' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "FixedAmountRequest": {
      "recipient": "<WALLET_ADDRESS>"
    }
  }'

# 5. Clone and setup project
git clone <repo-url>
cd InkBlob
pnpm install

# 6. Build smart contracts
cd contracts
sui move build

# 7. Run tests
sui move test

# 8. Deploy to testnet
sui client publish --gas-budget 100000000
# Save package ID and object IDs

# 9. Configure frontend environment
cd ../frontend
cp .env.example .env
# Edit .env with package ID and network config

# 10. Start dev server
pnpm dev
```

### 11.2 Smart Contract Deployment

**Deployment Script**:

```bash
#!/bin/bash
# scripts/deploy-contracts.sh

set -e

echo "Building Move contracts..."
cd contracts
sui move build

echo "Running tests..."
sui move test

echo "Deploying to testnet..."
DEPLOY_OUTPUT=$(sui client publish --gas-budget 100000000 --json)

# Extract package ID
PACKAGE_ID=$(echo $DEPLOY_OUTPUT | jq -r '.objectChanges[] | select(.type == "published") | .packageId')

echo "Package deployed at: $PACKAGE_ID"
echo "VITE_PACKAGE_ID=$PACKAGE_ID" > ../frontend/.env.local

echo "Deployment complete!"
```

**Post-Deployment Verification**:

```typescript
// scripts/verify-deployment.ts

import { SuiClient } from '@mysten/sui/client';

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });

async function verifyDeployment(packageId: string) {
  // 1. Verify package exists
  const pkg = await client.getObject({ id: packageId });
  console.log('Package verified:', pkg);

  // 2. Test create_notebook function
  // 3. Verify module structs
  // 4. Check event schemas
}
```

### 11.3 Frontend Deployment

**Build Configuration**:

```typescript
// vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'sui': ['@mysten/sui', '@mysten/dapp-kit'],
          'editor': ['lexical', '@lexical/react'],
        },
      },
    },
  },
  define: {
    'process.env': {},
  },
});
```

**Deployment Targets**:

1. **Vercel** (Recommended for MVP)
   ```bash
   # Install Vercel CLI
   pnpm add -g vercel

   # Deploy
   cd frontend
   vercel --prod
   ```

2. **Netlify**
   ```toml
   # netlify.toml
   [build]
     command = "pnpm build"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

3. **IPFS** (Decentralized hosting)
   ```bash
   pnpm build
   ipfs add -r dist/
   # Pin to Pinata or similar service
   ```

### 11.4 Environment Configuration

```bash
# frontend/.env.production

# Network
VITE_SUI_NETWORK=testnet
VITE_SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# Walrus
VITE_WALRUS_UPLOAD_RELAY=https://publisher.walrus-testnet.walrus.space
VITE_WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space

# Smart Contract
VITE_PACKAGE_ID=<DEPLOYED_PACKAGE_ID>

# Session
VITE_SESSION_DEFAULT_DURATION=604800000  # 7 days in ms
VITE_SESSION_GAS_AMOUNT=100000000        # 0.1 SUI in MIST

# Walrus Storage
VITE_WALRUS_DEFAULT_EPOCHS=30
```

### 11.5 Monitoring and Observability

**Frontend Monitoring**:

```typescript
// utils/analytics.ts

// Simple error tracking
export function trackError(error: Error, context: Record<string, any>) {
  console.error('Error:', error, context);

  // Send to monitoring service (e.g., Sentry)
  // Sentry.captureException(error, { extra: context });
}

// Performance monitoring
export function trackPerformance(metric: string, duration: number) {
  console.log(`Performance: ${metric} took ${duration}ms`);

  // Send to analytics (e.g., Google Analytics)
  // gtag('event', 'timing_complete', {
  //   name: metric,
  //   value: duration,
  // });
}
```

**Blockchain Monitoring**:

```typescript
// Monitor transaction success rate
async function monitorTransactions() {
  const events = await client.queryEvents({
    query: { MoveEventType: `${packageId}::notebook::NoteUpdated` },
    limit: 100,
  });

  console.log(`Recent note updates: ${events.data.length}`);
}

// Monitor gas costs
async function trackGasCosts(txDigest: string) {
  const tx = await client.getTransactionBlock({
    digest: txDigest,
    options: { showEffects: true },
  });

  const gasUsed = tx.effects.gasUsed.computationCost;
  console.log(`Gas used: ${gasUsed} MIST`);
}
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Smart Contracts**:
- [ ] Set up Sui Move project structure
- [ ] Implement Notebook, Note, Folder structs
- [ ] Implement create_notebook entry function
- [ ] Implement update_note entry function
- [ ] Write unit tests for core functions
- [ ] Deploy to testnet

**Cryptography**:
- [ ] Implement HKDF key derivation
- [ ] Implement AES-256-GCM encryption/decryption
- [ ] Implement IV prepending/extraction
- [ ] Write test vectors

**Frontend Skeleton**:
- [ ] Set up React + Vite project
- [ ] Configure @mysten/dapp-kit
- [ ] Implement wallet connection
- [ ] Create basic layout (header, sidebar, main)

### Phase 2: Core Features (Week 3-4)

**Smart Contracts**:
- [ ] Implement SessionCap authorization
- [ ] Implement folder management functions
- [ ] Implement move_note function
- [ ] Add comprehensive error handling
- [ ] Integration tests

**Walrus Integration**:
- [ ] Configure Walrus client
- [ ] Implement upload service
- [ ] Implement download service
- [ ] Error handling and retry logic

**Frontend**:
- [ ] Implement encryption key derivation flow
- [ ] Implement notebook creation
- [ ] Implement note list display
- [ ] Implement basic note editor (plain text)
- [ ] Implement folder tree UI

### Phase 3: Rich Text & UX (Week 5-6)

**Frontend**:
- [ ] Integrate Lexical editor
- [ ] Implement rich text toolbar
- [ ] Implement note save/load with encryption
- [ ] Implement folder creation/rename/delete
- [ ] Implement note movement between folders
- [ ] Add loading states and error messages

**Session Management**:
- [ ] Implement SessionCap creation flow
- [ ] Implement ephemeral key encryption
- [ ] Implement session expiration handling
- [ ] Implement session revocation

### Phase 4: Polish & Testing (Week 7-8)

**Testing**:
- [ ] End-to-end tests for all user flows
- [ ] Performance testing with 10K notes
- [ ] Multi-device sync testing
- [ ] Security audit of cryptography
- [ ] Gas optimization

**UI/UX**:
- [ ] Responsive design
- [ ] Sort functionality
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements
- [ ] Error recovery flows

**Documentation**:
- [ ] User guide
- [ ] Developer documentation
- [ ] API documentation
- [ ] Deployment guide

### Phase 5: MVP Launch (Week 9)

**Pre-Launch**:
- [ ] Security review
- [ ] Performance benchmarking
- [ ] User acceptance testing
- [ ] Bug fixes and polish

**Launch**:
- [ ] Deploy smart contracts to testnet
- [ ] Deploy frontend to production
- [ ] Monitor initial usage
- [ ] Gather user feedback

---

## 13. Appendices

### A. EARS Requirements Mapping

This design addresses all EARS requirements from the specification:

| Requirement ID | Design Section | Implementation Details |
|---------------|----------------|------------------------|
| REQ-AUTH-001 | 6.2, 6.3 | @mysten/dapp-kit wallet integration |
| REQ-AUTH-002 | 4.1 | HKDF key derivation from signature |
| REQ-NOTEBOOK-001 | 3.2.1 | create_notebook entry function |
| REQ-NOTEBOOK-007 | 6.3 | NotebookRegistry query in SuiService |
| REQ-FOLDER-001-010 | 3.2.4 | Folder management functions |
| REQ-NOTE-001-010 | 3.2.3, 3.2.5 | Note CRUD operations |
| REQ-RETRIEVE-001-006 | 5.3, 4.3 | Download and decryption flow |
| REQ-SYNC-001-005 | 2.2.5 | Multi-device sync via polling |
| REQ-SECURITY-001-006 | 4.0, 8.0 | Client-side encryption architecture |
| REQ-CRYPTO-006-010 | 4.2, 4.3 | IV prepending implementation |
| REQ-SESSION-001-009 | 3.2.2, 4.4 | SessionCap system |
| REQ-RICHTEXT-001-007 | 6.4.1 | Lexical editor integration |
| REQ-AR-001-011 | 3.2.6 | Arweave backup metadata (MVP) |

### B. Technology Versions

| Technology | Version | Notes |
|-----------|---------|-------|
| Sui | Testnet | Updated monthly |
| Sui Move | 2024.beta | Language version |
| Node.js | >= 20.0.0 | LTS required |
| React | 19.2 | Latest stable |
| TypeScript | 5.7 | Latest |
| Vite | 6.0 | Latest |
| @mysten/sui | Latest | Official SDK |
| @mysten/dapp-kit | Latest | Official wallet kit |
| @mysten/walrus | Latest | Official Walrus SDK |
| Lexical | Latest | Meta's editor |
| @tanstack/react-query | 5.x | State management |

### C. Gas Cost Estimates (Testnet)

| Operation | Estimated Gas (MIST) | USD Equivalent (testnet) |
|-----------|---------------------|-------------------------|
| Create Notebook | ~5,000,000 | ~$0.005 |
| Authorize Session | ~3,000,000 | ~$0.003 |
| Update Note | ~2,000,000 | ~$0.002 |
| Create Folder | ~1,500,000 | ~$0.0015 |
| Move Note | ~1,000,000 | ~$0.001 |
| Delete Folder | ~1,000,000 | ~$0.001 |

Note: Actual costs vary based on network load and object sizes.

### D. Glossary

- **EARS**: Easy Approach to Requirements Syntax
- **HKDF**: HMAC-based Key Derivation Function
- **AES-GCM**: Advanced Encryption Standard - Galois/Counter Mode
- **IV**: Initialization Vector (12 bytes for AES-GCM)
- **SessionCap**: Session Capability object for ephemeral authorization
- **Blob ID**: Walrus content identifier (hash-based addressing)
- **Epoch**: Sui blockchain time unit (~24 hours on testnet)
- **Table**: Sui Move data structure for O(1) key-value storage
- **Move**: Sui's smart contract programming language

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2 | 2025-11-23 | Claude Code | Device-specific hot wallet + auto-funding based on review |
| 1.1 | 2025-11-23 | Claude Code | Updated design with user feedback modifications |
| 1.0 | 2025-11-23 | Claude Code | Initial technical design based on requirements v1.3 |

### Version 1.2 Changes (Review Comments Implementation)

**Device-Specific Hot Wallet:**
- Added device fingerprint generation using browser + system information + persistent device ID
- Implemented device-specific HKDF derivation to prevent multi-device conflicts
- Each device gets unique hot wallet address while maintaining deterministic recovery
- Updated SessionCap struct to include device_fingerprint and hot_wallet_address

**Auto-Funding Authorization:**
- Implemented authorize_session_and_fund() contract method for automatic balance management
- Contract automatically ensures hot wallet has 0.1 SUI + 0.5 WAL on authorization
- Atomic operation combining SessionCap creation with token transfers
- Added funding amounts as parameters with sensible defaults

**Enhanced Session Management:**
- Updated verify_authorization() to check hot_wallet_address instead of ephemeral_address
- Added device conflict detection and prevention mechanisms
- Improved localStorage functions to store device-specific information
- Added isCurrentDevice() function for device validation

**Improved Frontend Integration:**
- Enhanced deriveHotWallet() to return keypair, address, and fingerprint
- Updated encryption context separation for device-specific keys
- Added device information storage and retrieval functions
- Improved error handling with new error codes for device conflicts

**Security & UX Enhancements:**
- Device isolation prevents cross-device balance conflicts
- Auto-funding eliminates manual balance management for users
- Simplified user experience with one-time authorization per device
- Enhanced session recovery with device fingerprint validation

### Version 1.1 Changes

**Session Authorization Flow:**
- Changed from temporary Ed25519 keypairs to deterministic hot wallet derivation
- Implemented HKDF-based deterministic hot wallet generation using wallet signature
- Added balance persistence across sessions to prevent gas loss
- Updated key encryption with separate derivation contexts

**Multi-Notebook Support:**
- Enhanced NotebookRegistry to support multiple notebooks with Table<String, ID>
- Added active_notebook field for current notebook tracking
- Implemented create_additional_notebook() and switch_active_notebook() functions
- Added notebook name conflict prevention

**Hybrid Sorting Strategy:**
- Added sort_order field to Folder struct for user-defined custom ordering
- Maintained timestamp-based sorting for Notes within folders
- Clear separation between folder organization and note chronology

**Walrus Blob Object Support:**
- Added blob_object_id field to Note struct for Sui object reference
- Updated update_note() function to handle both blob_id and blob_object_id
- Implemented update_note_blob_object() for blob renewal support
- Enhanced Walrus upload service documentation

**Security & UX Improvements:**
- Separated encryption contexts for content vs hot wallet keys
- Added hot wallet address storage for balance checking
- Enhanced error handling with new error codes for multi-notebook scenarios
- Improved session flow with balance management

---

**End of Technical Design Document**
