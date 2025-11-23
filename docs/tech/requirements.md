# DNote - Requirements Specification
## Decentralized Note-Taking Application on Sui and Walrus

**Version:** 1.3
**Date:** 2025-11-23
**Status:** Draft - Arweave Backup Fields Added

---

## 1. Executive Summary

DNote is a decentralized note-taking application that leverages Sui blockchain for state management and access control, combined with Walrus protocol for encrypted content storage. This specification defines the core architecture and essential requirements for a simplified Minimum Viable Product (MVP).

### 1.1 Core Value Proposition
- **Data Sovereignty**: Users maintain full control of their encrypted notes
- **Decentralized Storage**: Content stored on Walrus, metadata on Sui blockchain
- **Multi-Device Sync**: Seamless synchronization across devices via blockchain state
- **Privacy-First**: Client-side encryption ensures zero-knowledge architecture

---

## 2. System Architecture Overview

### 2.1 Three-Layer Architecture

```
┌─────────────────────────────────────────┐
│      Client Layer (React/Browser)       │
│  • Wallet Integration                   │
│  • Client-Side Encryption (AES-GCM)     │
│  • Local State Management               │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│    Control Layer (Sui Blockchain)       │
│  • Notebook Smart Contract (Move)       │
│  • Metadata & Access Control            │
│  • Version History & Timestamps         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│   Storage Layer (Walrus Protocol)       │
│  • Encrypted Content Storage            │
│  • Blob ID Management                   │
│  • Redundant Data Distribution          │
└─────────────────────────────────────────┘
```

---

## 3. Functional Requirements (EARS Format)

### 3.1 User Authentication & Wallet Integration

**REQ-AUTH-001**: The system SHALL support connection to Sui-compatible wallets (Suiet, Martian, Sui Wallet).

**REQ-AUTH-002**: WHEN a user connects their wallet THEN the system SHALL derive a deterministic encryption key from the wallet signature.

**REQ-AUTH-003**: The system SHALL use HKDF (HMAC-based Key Derivation Function) to generate a 256-bit AES encryption key from wallet signatures.

**REQ-AUTH-004**: The system SHALL prompt users to sign a standardized message for key derivation on first access.

### 3.2 Notebook Management

**REQ-NOTEBOOK-001**: The system SHALL allow users to create a personal Notebook as a Sui shared object.

**REQ-NOTEBOOK-002**: WHEN a user creates a Notebook THEN the system SHALL:
1. Record the creator's address as the owner
2. Create a NotebookRegistry owned object
3. Transfer the NotebookRegistry to the creator's address

**REQ-NOTEBOOK-003**: The NotebookRegistry owned object SHALL contain:
- Owner address
- Notebook ID (reference to shared Notebook object)
- Creation timestamp

**REQ-NOTEBOOK-004**: The Notebook object SHALL store collections of Note and Folder metadata using Table data structures for efficient O(1) access.

**REQ-NOTEBOOK-005**: Each Note metadata entry SHALL contain:
- Unique Note ID
- Walrus Blob ID (reference to encrypted content)
- Encrypted title
- Last update timestamp
- Deletion flag (for soft deletes)
- Parent folder ID (optional, null for root level)

**REQ-NOTEBOOK-006**: The system SHALL implement the Notebook as a Sui shared object to enable multi-device concurrent access.

**REQ-NOTEBOOK-007**: WHEN a user connects on a new device THEN the system SHALL:
1. Query owned objects of type NotebookRegistry
2. Extract the notebook_id from the registry
3. Fetch the shared Notebook object using the ID
4. If no registry found, allow creating a new Notebook

**REQ-NOTEBOOK-008**: The system SHALL emit a NotebookCreated event containing the user address and notebook ID as a fallback discovery mechanism.

### 3.3 Folder Management

**REQ-FOLDER-001**: The system SHALL allow users to create folders to organize notes hierarchically.

**REQ-FOLDER-002**: Each Folder metadata entry SHALL contain:
- Unique Folder ID
- Encrypted folder name
- Parent folder ID (optional, for nested folders)
- Creation timestamp
- Last update timestamp
- Deletion flag (for soft deletes)

**REQ-FOLDER-003**: The system SHALL support nested folders up to 5 levels deep.

**REQ-FOLDER-004**: WHEN a user creates a folder THEN the system SHALL:
1. Generate a unique Folder ID
2. Encrypt the folder name using the user's encryption key
3. Store the folder metadata in the Notebook object
4. Record the creation timestamp

**REQ-FOLDER-005**: The system SHALL allow users to rename folders.

**REQ-FOLDER-006**: The system SHALL allow users to move folders to different parent folders.

**REQ-FOLDER-007**: The system SHALL allow users to delete folders.

**REQ-FOLDER-008**: WHEN a folder is deleted THEN the system SHALL:
- Set the deletion flag on the folder
- Move all child notes to the parent folder (or root if no parent)
- Recursively handle nested folders

**REQ-FOLDER-009**: The system SHALL display folders in alphabetical order within each hierarchy level.

**REQ-FOLDER-010**: The system SHALL allow users to expand/collapse folders in the UI to show/hide contained notes and subfolders.

### 3.4 Note Creation & Editing

**REQ-NOTE-001**: The system SHALL allow users to create new notes with text content in any folder or at root level.

**REQ-NOTE-002**: WHEN a user saves a note THEN the system SHALL:
1. Serialize the rich text editor state to JSON
2. Encrypt the content using AES-256-GCM with a random IV
3. Prepend the IV to the ciphertext
4. Upload the IV-prepended encrypted content to Walrus
5. Store the returned Blob ID in the Notebook object on Sui
6. Record the update timestamp

**REQ-NOTE-003**: The system SHALL generate a unique 12-byte initialization vector (IV) for each encryption operation.

**REQ-NOTE-004**: The system SHALL never reuse an IV for the same encryption key.

**REQ-NOTE-005**: The encrypted blob format SHALL be: IV (12 bytes) || Ciphertext || Auth Tag (16 bytes).

**REQ-NOTE-006**: The system SHALL allow users to edit existing notes.

**REQ-NOTE-007**: WHEN a note is updated THEN the system SHALL create a new encrypted blob and update the metadata while maintaining the same Note ID.

**REQ-NOTE-008**: The system SHALL support soft deletion of notes by setting the deletion flag.

**REQ-NOTE-009**: The system SHALL allow users to move notes between folders.

**REQ-NOTE-010**: WHEN a note is moved to a different folder THEN the system SHALL update the parent folder ID in the note metadata.

### 3.5 Note Retrieval & Decryption

**REQ-RETRIEVE-001**: The system SHALL fetch the Notebook object from Sui to display the list of notes.

**REQ-RETRIEVE-002**: WHEN displaying a note list THEN the system SHALL decrypt and display the encrypted titles.

**REQ-RETRIEVE-003**: WHEN a user opens a note THEN the system SHALL:
1. Retrieve the Blob ID from Sui metadata
2. Fetch the encrypted blob from Walrus
3. Extract the first 12 bytes as the IV
4. Extract the remaining bytes as ciphertext with auth tag
5. Decrypt the content using the derived AES key and extracted IV
6. Deserialize the JSON to rich text editor state
7. Display the formatted content

**REQ-RETRIEVE-004**: IF decryption fails (integrity check) THEN the system SHALL display an error message and NOT render corrupted data.

**REQ-RETRIEVE-005**: The system SHALL display notes grouped by their parent folder.

**REQ-RETRIEVE-006**: The system SHALL decrypt folder names for display in the folder tree.

### 3.6 Multi-Device Synchronization

**REQ-SYNC-001**: The system SHALL query the Sui blockchain for the latest Notebook state on application load.

**REQ-SYNC-002**: WHEN multiple devices modify the same Notebook THEN the system SHALL reflect all changes based on the blockchain's causal ordering.

**REQ-SYNC-003**: The system SHALL use the `updated_at` timestamp to determine the most recent version of a note.

**REQ-SYNC-004**: The system SHALL implement Last-Write-Wins (LWW) conflict resolution strategy for the MVP.

**REQ-SYNC-005**: WHEN synchronizing THEN the system SHALL fetch both note metadata and folder structure from the Notebook object.

### 3.7 Encryption & Security

**REQ-SECURITY-001**: The system SHALL encrypt all note content on the client side before transmission.

**REQ-SECURITY-002**: The system SHALL use AES-256-GCM authenticated encryption for all note content.

**REQ-SECURITY-003**: The system SHALL never transmit plaintext note content to Walrus or Sui nodes.

**REQ-SECURITY-004**: The system SHALL store the encryption key only in browser memory (not localStorage).

**REQ-SECURITY-005**: The system SHALL require wallet signature to re-derive the encryption key on each browser session.

**REQ-SECURITY-006**: The system SHALL encrypt folder names using the same encryption key as note content.

### 3.8 Cryptographic Implementation Details

**REQ-CRYPTO-006**: The system SHALL prepend the 12-byte IV to the ciphertext before uploading to Walrus.

**REQ-CRYPTO-007**: WHEN decrypting THEN the system SHALL:
1. Extract bytes 0-11 as the IV
2. Extract bytes 12-end as ciphertext with auth tag
3. Use the extracted IV for AES-GCM decryption

**REQ-CRYPTO-008**: The system SHALL NOT store the IV separately in Sui metadata or any external storage.

**REQ-CRYPTO-009**: The system SHALL use cryptographically secure random number generation (crypto.getRandomValues) for IV generation.

**REQ-CRYPTO-010**: The encrypted blob SHALL be self-contained with IV, ciphertext, and authentication tag in a single atomic unit.

### 3.9 Session Key Management

**REQ-SESSION-001**: The system SHALL support ephemeral session keys for frictionless operation without repeated wallet prompts.

**REQ-SESSION-002**: WHEN a user first connects THEN the system SHALL:
1. Generate an Ed25519Keypair in browser memory
2. Prompt main wallet to sign a SessionCap creation transaction
3. Transfer SessionCap to ephemeral address
4. Optionally transfer 0.1 SUI for gas fees

**REQ-SESSION-003**: The SessionCap object SHALL contain:
- Expiration timestamp (default: 7 days)
- Linked Notebook ID
- Creation timestamp
- Ephemeral address

**REQ-SESSION-004**: WHEN SessionCap expires THEN the system SHALL:
- Prompt user to re-authorize with main wallet
- Generate new ephemeral key
- Create new SessionCap

**REQ-SESSION-005**: The system SHALL store ephemeral private key encrypted in localStorage using a password derived from main wallet signature.

**REQ-SESSION-006**: All note and folder operations SHALL be signed by the ephemeral key when SessionCap is valid.

**REQ-SESSION-007**: The main wallet SHALL be able to revoke a SessionCap at any time through a revoke_session entry function.

**REQ-SESSION-008**: IF a SessionCap is revoked THEN the system SHALL:
1. Delete the SessionCap object
2. Clear ephemeral keys from browser storage
3. Prompt user to re-authorize

**REQ-SESSION-009**: The system SHALL verify SessionCap validity and expiration before allowing operations.

### 3.10 Rich Text Editing

**REQ-RICHTEXT-001**: The system SHALL support rich text editing with the following features:
- Text formatting (bold, italic, underline, strikethrough)
- Headings (H1, H2, H3)
- Lists (ordered and unordered)
- Code blocks with syntax highlighting
- Hyperlinks
- Basic tables

**REQ-RICHTEXT-002**: The system SHALL use Lexical editor framework for rich text editing.

**REQ-RICHTEXT-003**: The system SHALL serialize editor state to JSON before encryption.

**REQ-RICHTEXT-004**: The system SHALL support markdown shortcuts for common formatting (e.g., **bold**, ## heading).

**REQ-RICHTEXT-005**: The encrypted blob SHALL remain format-agnostic (JSON string encrypted with AES-GCM).

**REQ-RICHTEXT-006**: The system SHALL provide a toggle to view raw markdown/source representation.

**REQ-RICHTEXT-007**: The system SHALL gracefully handle backward compatibility if plain text notes exist.

### 3.11 Note and Folder Ordering

**REQ-ORDER-001**: The system SHALL use timestamp-based ordering for notes and folders.

**REQ-ORDER-002**: The system SHALL support the following sort modes for notes:
- Most recently updated first (default)
- Oldest updated first
- Most recently created first
- Oldest created first
- Alphabetical by title (after decryption)

**REQ-ORDER-003**: The frontend SHALL perform sorting operations client-side after fetching notes and folders from the blockchain.

**REQ-ORDER-004**: The system SHALL NOT store explicit ordering information in the smart contract for the MVP.

**REQ-ORDER-005**: WHERE manual drag-and-drop ordering is required in future versions THEN the system MAY add an optional `order_index: u64` field to Note and Folder structs.

**REQ-ORDER-006**: The system SHALL display folders in alphabetical order by encrypted name within each hierarchy level.

### 3.12 Arweave Permanent Backup (MVP: Reserved Fields Only)

**Background**: Walrus storage operates on an epoch-based model with temporary storage periods. To provide permanent, immutable backup capabilities, the system reserves fields for future Arweave network integration. Note that Folder and Notebook structures are permanently stored on the Sui blockchain itself, so only Note content (stored on Walrus) requires permanent backup.

#### 3.12.1 Backup Metadata (MVP - Contract Fields)

**REQ-AR-001**: The `Note` struct SHALL include optional fields for tracking Arweave backup status:
- `ar_backup_id: Option<String>` - Arweave transaction ID (43-character base64url string)
- `ar_backup_version: Option<u64>` - Snapshot of `updated_at` timestamp at time of backup

**REQ-AR-002**: IF a note has never been backed up to Arweave THEN both `ar_backup_id` and `ar_backup_version` SHALL be `None`.

**REQ-AR-003**: The `ar_backup_id` field SHALL store a valid Arweave transaction ID when a backup exists.

**REQ-AR-004**: The `ar_backup_version` field SHALL store the exact value of `updated_at` at the moment the backup was created.

#### 3.12.2 Backup Status Computation (MVP - Frontend Logic)

**REQ-AR-005**: The frontend SHALL compute backup status using the following logic:
- **Not Backed Up**: `ar_backup_id == None`
- **Up-to-Date**: `ar_backup_id != None AND updated_at == ar_backup_version`
- **Stale**: `ar_backup_id != None AND updated_at > ar_backup_version`

**REQ-AR-006**: WHEN displaying a note THEN the system SHALL indicate whether:
1. The note has no Arweave backup
2. The backup is current (matches latest version)
3. The backup is outdated (note modified since last backup)

**REQ-AR-007**: The system SHALL provide a method to determine backup staleness by comparing `updated_at` and `ar_backup_version` timestamps.

#### 3.12.3 Backup Update Function (MVP - Contract Entry Function)

**REQ-AR-008**: The smart contract SHALL provide an entry function to update note backup metadata:

```move
public entry fun update_note_ar_backup(
    notebook: &mut Notebook,
    session_cap: Option<SessionCap>,
    note_id: ID,
    ar_tx_id: String,
    backup_timestamp: u64,
    ctx: &mut TxContext
)
```

**REQ-AR-009**: WHEN `update_note_ar_backup` is called THEN the system SHALL:
1. Verify caller authorization (notebook owner or valid SessionCap)
2. Verify the note exists in the notebook
3. Update `note.ar_backup_id` to the provided Arweave transaction ID
4. Update `note.ar_backup_version` to the backup timestamp
5. Emit an `ArweaveBackupRecorded` event

**REQ-AR-010**: The smart contract SHALL define an `ArweaveBackupRecorded` event:

```move
struct ArweaveBackupRecorded has copy, drop {
    notebook_id: ID,
    note_id: ID,
    ar_tx_id: String,
    backup_timestamp: u64,
    operator: address,
}
```

**REQ-AR-011**: IF the provided `ar_tx_id` is not a valid Arweave transaction ID format THEN the system SHALL reject the transaction.

#### 3.12.4 Post-MVP: Full Backup Implementation (Future Enhancement)

**Note**: The following requirements are OUT OF SCOPE for MVP but documented for future reference.

**REQ-AR-FUTURE-001**: WHERE full backup functionality is implemented THEN users SHALL be able to manually trigger backups at three granularities:
1. **Single Note Backup**: Backup one note's encrypted content to Arweave
2. **Folder Backup**: Backup all notes within a folder (including nested subfolders) with a manifest
3. **Notebook Backup**: Backup entire notebook (all notes and folder structure) with a complete manifest

**REQ-AR-FUTURE-002**: WHEN a user triggers a single note backup THEN the system SHALL:
1. Retrieve the encrypted content blob from Walrus (using `blob_id`)
2. Upload the encrypted blob to Arweave (same encryption format: IV || Ciphertext || Auth Tag)
3. Receive Arweave transaction ID confirmation
4. Call `update_note_ar_backup` with the transaction ID and current timestamp
5. Display success confirmation to user

**REQ-AR-FUTURE-003**: WHEN backing up a folder THEN the system SHALL:
1. Identify all notes in the folder and subfolders
2. Upload each note's encrypted content to Arweave
3. Create a backup manifest JSON containing folder structure and note metadata
4. Upload the manifest to Arweave
5. Update all backed-up notes' metadata via blockchain transactions

**REQ-AR-FUTURE-004**: WHEN backing up a complete notebook THEN the system SHALL:
1. Collect all notes and folders in the notebook
2. Upload all note contents to Arweave
3. Create a comprehensive manifest with full notebook structure
4. Store the manifest on Arweave
5. Update all notes' backup metadata

**REQ-AR-FUTURE-005**: The backup manifest JSON SHALL include:
```json
{
  "version": "1.0",
  "backup_type": "note" | "folder" | "notebook",
  "timestamp": 1700000000000,
  "notes": [
    {
      "note_id": "0x...",
      "ar_tx_id": "...",
      "encrypted_title": "...",
      "folder_path": ["root", "work", "projects"],
      "created_at": 1700000000000,
      "updated_at": 1700000000000
    }
  ],
  "folders": [...]
}
```

**REQ-AR-FUTURE-006**: The system SHALL NOT decrypt content before uploading to Arweave (maintain zero-knowledge architecture).

**REQ-AR-FUTURE-007**: WHERE backup functionality is implemented THEN the system SHALL display:
- Visual backup status indicators (✅ up-to-date, ⚠️ stale, ❌ not backed up)
- Clickable Arweave transaction links to ViewBlock explorer
- "Re-backup" button for stale backups
- Estimated Arweave storage costs before backup

**REQ-AR-FUTURE-008**: WHERE restore functionality is implemented THEN the system SHALL allow users to:
1. Fetch backup manifests from Arweave
2. Download encrypted note contents
3. Preview restore contents (after decryption)
4. Selectively restore individual notes or perform full restoration

**REQ-AR-FUTURE-009**: The system SHALL handle backup failures gracefully:
- IF Arweave upload fails THEN do NOT update on-chain metadata
- Display clear error messages and retry options
- For partial folder/notebook backup failures, update only successful notes

**REQ-AR-FUTURE-010**: The system SHALL support parallel uploads to Arweave for efficiency (up to 10 concurrent uploads for folder/notebook backups).

---

## 4. Smart Contract Requirements (Sui Move)

### 4.1 Notebook Module

**REQ-CONTRACT-001**: The smart contract SHALL define a `NotebookRegistry` struct with the following fields:
- `id: UID` - Unique object identifier
- `owner: address` - Owner's wallet address
- `notebook_id: ID` - Reference to shared Notebook object
- `created_at: u64` - Creation timestamp

**REQ-CONTRACT-001A**: The smart contract SHALL define a `SessionCap` struct with the following fields:
- `id: UID` - Unique object identifier
- `notebook_id: ID` - Reference to authorized Notebook
- `ephemeral_address: address` - Address of ephemeral keypair
- `expires_at: u64` - Expiration timestamp
- `created_at: u64` - Creation timestamp

**REQ-CONTRACT-001B**: The smart contract SHALL define a `Notebook` struct with the following fields:
- `id: UID` - Unique object identifier
- `owner: address` - Original creator's wallet address
- `notes: Table<ID, Note>` - Table of note metadata for O(1) access
- `folders: Table<ID, Folder>` - Table of folder metadata for O(1) access

**REQ-CONTRACT-002**: The smart contract SHALL define a `Note` struct with the following fields:
- `id: ID` - Note identifier
- `blob_id: String` - Walrus Blob reference
- `encrypted_title: String` - Encrypted note title
- `folder_id: Option<ID>` - Parent folder ID (None for root level)
- `updated_at: u64` - Timestamp in milliseconds
- `is_deleted: bool` - Soft deletion flag
- `ar_backup_id: Option<String>` - Arweave transaction ID for permanent backup (MVP: reserved field)
- `ar_backup_version: Option<u64>` - Timestamp when backup was created (MVP: reserved field)

**REQ-CONTRACT-002A**: The smart contract SHALL define a `Folder` struct with the following fields:
- `id: ID` - Folder identifier
- `encrypted_name: String` - Encrypted folder name
- `parent_id: Option<ID>` - Parent folder ID (None for root level)
- `created_at: u64` - Creation timestamp in milliseconds
- `updated_at: u64` - Last update timestamp in milliseconds
- `is_deleted: bool` - Soft deletion flag

**REQ-CONTRACT-003**: The smart contract SHALL provide an entry function `create_notebook` that:
- Creates a new Notebook object with Table-based storage
- Sets the caller as the owner
- Shares the Notebook object for multi-device access
- Creates a NotebookRegistry owned object
- Transfers the NotebookRegistry to the caller
- Emits a `NotebookCreated` event

**REQ-CONTRACT-004**: The smart contract SHALL provide an entry function `update_note` that:
- Accepts a Notebook reference and optional SessionCap
- Verifies SessionCap authorization if provided
- Accepts note metadata (note_id, blob_id, encrypted_title, folder_id)
- Updates the note in the Table or adds if new
- Updates note_order vector if adding new note
- Emits a `NoteUpdated` event

**REQ-CONTRACT-005**: The smart contract SHALL emit events for all note modifications including:
- Notebook ID
- Blob ID
- Operator address

**REQ-CONTRACT-006**: The smart contract SHALL provide an entry function `create_folder` that:
- Accepts a Notebook reference
- Accepts folder metadata (encrypted_name, parent_id)
- Adds the folder to the collection
- Emits a `FolderCreated` event

**REQ-CONTRACT-007**: The smart contract SHALL provide an entry function `update_folder` that:
- Accepts a Notebook reference
- Accepts folder ID and updated metadata
- Updates the folder in the collection
- Emits a `FolderUpdated` event

**REQ-CONTRACT-008**: The smart contract SHALL provide an entry function `delete_folder` that:
- Accepts a Notebook reference
- Accepts folder ID
- Sets the deletion flag on the folder
- Handles orphaned notes according to REQ-FOLDER-008
- Emits a `FolderDeleted` event

**REQ-CONTRACT-009**: The smart contract SHALL provide an entry function `move_note` that:
- Accepts a Notebook reference and optional SessionCap
- Verifies SessionCap authorization if provided
- Accepts note ID and new folder ID
- Updates the note's parent folder ID in the Table
- Emits a `NoteMoved` event

**REQ-CONTRACT-010**: The smart contract SHALL provide an entry function `authorize_session` that:
- Accepts a Notebook reference
- Accepts ephemeral address and expiration timestamp
- Verifies caller is the Notebook owner
- Creates a SessionCap object
- Transfers SessionCap to the ephemeral address
- Emits a `SessionAuthorized` event

**REQ-CONTRACT-011**: The smart contract SHALL provide an entry function `revoke_session` that:
- Accepts a SessionCap object
- Verifies caller is the original Notebook owner
- Deletes the SessionCap object
- Emits a `SessionRevoked` event

**REQ-CONTRACT-012**: The smart contract SHALL provide an entry function `update_note_ar_backup` that:
- Accepts a Notebook reference and optional SessionCap
- Verifies SessionCap authorization if provided
- Accepts note ID, Arweave transaction ID, and backup timestamp
- Verifies the note exists in the notebook
- Updates the note's `ar_backup_id` and `ar_backup_version` fields
- Emits an `ArweaveBackupRecorded` event

**REQ-CONTRACT-013**: The smart contract SHALL use `Table<ID, Note>` and `Table<ID, Folder>` for O(1) lookup, insertion, and deletion operations.

### 4.2 Access Control

**REQ-ACCESS-001**: The system SHALL implement SessionCap-based authorization for secure, frictionless access.

**REQ-ACCESS-002**: The smart contract SHALL verify SessionCap validity by checking:
- SessionCap references the correct Notebook ID
- SessionCap has not expired (current timestamp < expires_at)
- Transaction sender matches ephemeral_address in SessionCap

**REQ-ACCESS-003**: The smart contract SHALL allow the Notebook owner to authorize session capabilities.

**REQ-ACCESS-004**: The smart contract SHALL allow the Notebook owner to revoke session capabilities at any time.

**REQ-ACCESS-005**: IF no SessionCap is provided THEN the smart contract SHALL verify the transaction sender is the Notebook owner.

---

## 5. Walrus Integration Requirements

**REQ-WALRUS-001**: The system SHALL use the Walrus SDK (@mysten/walrus) for storage operations.

**REQ-WALRUS-002**: The system SHALL configure a Walrus client pointing to the appropriate network (testnet/mainnet).

**REQ-WALRUS-003**: WHEN uploading content THEN the system SHALL use an upload relay for browser compatibility.

**REQ-WALRUS-004**: The system SHALL specify storage duration in epochs when uploading blobs.

**REQ-WALRUS-005**: The system SHALL handle Walrus upload responses containing:
- `blobId`: Unique content identifier
- `blobObject`: Sui object reference (for tracking)

**REQ-WALRUS-006**: The system SHALL retrieve blobs from Walrus using an aggregator endpoint for read operations.

**REQ-WALRUS-007**: The system SHALL handle network errors gracefully during Walrus upload/download operations.

---

## 6. Frontend Requirements (React)

### 6.1 User Interface

**REQ-UI-001**: The system SHALL provide a wallet connection button for user authentication.

**REQ-UI-002**: The system SHALL display a hierarchical folder tree in the sidebar showing all folders and their nesting structure.

**REQ-UI-003**: The system SHALL display notes grouped under their respective folders.

**REQ-UI-004**: The system SHALL provide expand/collapse controls for folders to show/hide their contents.

**REQ-UI-005**: The system SHALL provide a rich text note editor interface using Lexical framework for creating and editing notes.

**REQ-UI-006**: The system SHALL provide a formatting toolbar with controls for:
- Text formatting (bold, italic, underline, strikethrough)
- Headings (H1, H2, H3)
- Lists (ordered and unordered)
- Code blocks
- Links
- Tables

**REQ-UI-007**: The system SHALL provide UI controls to:
- Create new folders
- Rename folders
- Delete folders
- Move notes between folders
- Move folders between folders

**REQ-UI-008**: The system SHALL display the last update timestamp for each note.

**REQ-UI-009**: The system SHALL provide a visual indicator when notes or folders are being saved or synchronized.

**REQ-UI-010**: The system SHALL display session status including:
- Session expiration countdown
- Active session indicator
- Re-authorization prompt when needed

**REQ-UI-011**: The system SHALL display appropriate error messages for failed operations.

**REQ-UI-012**: The system SHALL support drag-and-drop for moving notes and folders (optional enhancement).

**REQ-UI-013**: The system SHALL provide a sort dropdown allowing users to choose:
- Sort by last updated (newest first) - default
- Sort by last updated (oldest first)
- Sort by created date (newest first)
- Sort by created date (oldest first)
- Sort by title (A-Z)

### 6.2 State Management

**REQ-STATE-001**: The system SHALL use React hooks for local state management.

**REQ-STATE-002**: The system SHALL integrate @mysten/dapp-kit for Sui wallet interactions.

**REQ-STATE-003**: The system SHALL maintain the encryption key in React state (memory only).

**REQ-STATE-004**: WHEN the browser session ends THEN the system SHALL clear all encryption keys from memory.

### 6.3 SDK Integration

**REQ-SDK-001**: The system SHALL use @mysten/sui/client for Sui RPC operations.

**REQ-SDK-002**: The system SHALL use @mysten/sui/transactions for building Move call transactions.

**REQ-SDK-003**: The system SHALL use @mysten/dapp-kit hooks for wallet operations:
- `useCurrentAccount` - Get connected wallet
- `useSignPersonalMessage` - Request signatures
- `useSignAndExecuteTransaction` - Execute transactions

---

## 7. Non-Functional Requirements

### 7.1 Performance

**REQ-PERF-001**: The system SHALL complete note save operations within 5 seconds under normal network conditions.

**REQ-PERF-002**: The system SHALL display the note list within 3 seconds of loading the application.

**REQ-PERF-003**: The system SHALL support notebooks with up to 10,000 notes and 1,000 folders without significant performance degradation.

**REQ-PERF-004**: The system SHALL render the folder tree within 1 second even with maximum supported folders.

**REQ-PERF-005**: The system SHALL achieve O(1) lookup time for individual note and folder operations using Table data structures.

**REQ-PERF-006**: The system SHALL optimize transaction size by only including modified data, not entire collections.

**REQ-PERF-007**: The system SHALL keep individual transactions under 100KB to avoid Sui transaction size limits.

### 7.2 Security

**REQ-SEC-001**: The system SHALL follow zero-knowledge architecture principles.

**REQ-SEC-002**: The system SHALL ensure that server nodes (Sui, Walrus, relays) cannot access plaintext note content.

**REQ-SEC-003**: The system SHALL use cryptographically secure random number generation for IVs.

**REQ-SEC-004**: The system SHALL validate all decrypted content using AES-GCM authentication tags.

### 7.3 Reliability

**REQ-REL-001**: The system SHALL handle temporary network failures gracefully with retry logic.

**REQ-REL-002**: IF Walrus storage fails THEN the system SHALL notify the user and NOT update Sui metadata.

**REQ-REL-003**: The system SHALL maintain data consistency between Sui metadata and Walrus content.

### 7.4 Usability

**REQ-USABILITY-001**: The system SHALL provide clear instructions during the initial wallet connection process.

**REQ-USABILITY-002**: The system SHALL minimize the number of wallet signature prompts to enhance user experience.

**REQ-USABILITY-003**: The system SHALL display loading states during all asynchronous operations.

---

## 8. Technical Constraints

**CONSTRAINT-001**: The system SHALL run in modern web browsers supporting Web Crypto API.

**CONSTRAINT-002**: The system SHALL operate on Sui testnet for MVP development.

**CONSTRAINT-003**: The system SHALL use Walrus testnet for storage during MVP phase.

**CONSTRAINT-004**: The system SHALL require users to have a Sui-compatible wallet extension installed.

**CONSTRAINT-005**: The system SHALL require users to have sufficient SUI tokens for gas fees.

---

## 9. Out of Scope (MVP)

The following features are explicitly excluded from the MVP but may be considered for future versions:

1. **Sponsored Transactions**: Users pay their own gas fees in MVP
2. **Advanced Conflict Resolution**: MVP uses simple Last-Write-Wins
3. **File Attachments**: MVP focuses on rich text content only
4. **Note Sharing**: No multi-user collaboration in MVP
5. **Version History UI**: Metadata supports versioning but no UI
6. **Search Functionality**: No full-text search in MVP
7. **Tags and Labels**: No tagging system in MVP (folders provide basic organization)
8. **Mobile Native Apps**: Web-only for MVP
9. **Folder Permissions**: No per-folder access control in MVP
10. **Folder Colors/Icons**: No visual customization in MVP
11. **Drag-and-Drop**: Optional enhancement, not required for MVP
12. **Offline Mode**: Requires complex conflict resolution and local storage
13. **Real-time Collaboration**: Multi-user simultaneous editing excluded
14. **Manual Drag-and-Drop Ordering**: MVP uses timestamp-based sorting only
15. **Arweave Backup Upload Functionality**: MVP only reserves contract fields (`ar_backup_id`, `ar_backup_version`) and provides metadata update function. Full backup upload/restore functionality deferred to post-MVP (see Section 3.12.4)

---

## 10. Success Criteria

The MVP shall be considered successful when:

1. ✅ Users can connect their Sui wallet to the application
2. ✅ Users can authorize ephemeral session keys for frictionless operation
3. ✅ Users can create a new notebook on-chain with NotebookRegistry
4. ✅ Users can create, rename, and delete folders
5. ✅ Users can organize notes into folders hierarchically
6. ✅ Users can create and edit rich text notes with formatting (bold, lists, headings, etc.)
7. ✅ Rich text notes are successfully encrypted and stored on Walrus with metadata on Sui
8. ✅ Users can retrieve and decrypt their notes with proper formatting on the same device
9. ✅ Users can access their notes and folder structure from a different device using the same wallet
10. ✅ Cross-device recovery works via NotebookRegistry owned object lookup
11. ✅ Users can move notes between folders
12. ✅ All encryption/decryption operations maintain data integrity with IV prepending
13. ✅ Session keys expire and prompt re-authorization after configured duration
14. ✅ The system scales to at least 10,000+ notes without performance issues
15. ✅ The system handles basic error cases gracefully
16. ✅ Arweave backup metadata fields (`ar_backup_id`, `ar_backup_version`) are present in Note struct
17. ✅ Frontend can compute and display backup status (not backed up / up-to-date / stale)
18. ✅ `update_note_ar_backup` entry function works correctly for updating backup metadata

---

## 11. Future Enhancements (Post-MVP)

### Phase 2: Enhanced User Experience
- Add sponsored transactions to eliminate user gas fees
- Implement offline mode with local-first architecture
- Add full-text search with encrypted indices
- Version history viewer UI

### Phase 3: Advanced Features
- Note sharing and collaboration with shared notebooks
- Real-time collaborative editing
- File attachments and media support (images, PDFs)
- Tags and labels (complementing folder organization)
- Folder color coding and custom icons
- Advanced folder features (favorites, pinning, sorting options)
- Import/export functionality (Markdown, HTML, PDF)

### Phase 4: Enterprise Features
- Team workspaces
- Role-based access control
- Audit logs
- Backup and export functionality

---

## 12. References

1. **Source Document**: `docs/resources/SUI Walrus DApp Development Guide.md`
2. **Technical Clarifications**: `docs/tech/technical-clarifications.md`
3. **Sui Documentation**: https://docs.sui.io
4. **Walrus Documentation**: https://docs.walrus.site
5. **Sui Move Language**: https://move-book.com
6. **Sui Table Module**: https://docs.sui.io/references/framework/sui-framework/table
7. **Web Crypto API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
8. **Lexical Editor Framework**: https://lexical.dev/
9. **Ordering Solutions Analysis**: `docs/tech/ordering-solutions-analysis.md`
10. **EARS Requirements Syntax**: Industry standard for requirements engineering
11. **Arweave Documentation**: https://docs.arweave.org/
12. **Arweave HTTP API**: https://docs.arweave.org/developers/server/http-api

---

## Document Control

| Version | Date       | Author        | Changes                    |
|---------|------------|---------------|----------------------------|
| 1.0     | 2025-11-23 | Claude Code   | Initial MVP specification  |
| 1.1     | 2025-11-23 | Claude Code   | Enhanced MVP with technical clarifications: <br>• Added NotebookRegistry for cross-device discovery<br>• Added SessionCap-based authorization<br>• Updated to Table<ID, Note> data structure<br>• Added IV prepending to ciphertext<br>• Added Rich Text editing with Lexical<br>• Updated performance targets (10K+ notes)<br>• Added comprehensive session key management<br>• Updated access control from simplified to SessionCap-based |
| 1.2     | 2025-11-23 | Claude Code   | Simplified ordering: removed order vectors, adopted timestamp-based sorting: <br>• Removed note_order and folder_order vectors from Notebook struct<br>• Removed REQ-CONTRACT-013 about maintaining ordering vectors<br>• Added Section 3.11 with timestamp-based ordering requirements<br>• Added support for multiple sort modes (last updated, created date, title)<br>• Implemented client-side sorting after blockchain fetch<br>• Added REQ-UI-013 for sort dropdown UI control<br>• Updated out-of-scope to clarify manual drag-and-drop not in MVP |
| 1.3     | 2025-11-23 | Claude Code   | Added Arweave permanent backup support (MVP: reserved fields only): <br>• Added Section 3.12 "Arweave Permanent Backup" with complete requirements<br>• Added `ar_backup_id` and `ar_backup_version` fields to Note struct<br>• Added REQ-CONTRACT-012 for `update_note_ar_backup` entry function<br>• Added `ArweaveBackupRecorded` event definition<br>• Added backup status computation logic (not backed up / up-to-date / stale)<br>• Documented Post-MVP full backup implementation (upload/restore functionality)<br>• Updated success criteria to include Arweave field implementation<br>• Added Arweave to out-of-scope list (full functionality deferred to post-MVP)<br>• Added Arweave documentation references |

---

**End of Requirements Specification**
