import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Package ID from environment variable (deployed contract address)
export const PACKAGE_ID = (import.meta as any).env.VITE_SUI_PACKAGE_ID || '0x0';

// Object id of the single global EncryptionKeyRegistry shared object (see
// contracts/inkblob/sources/notebook.move's `init` - it is created and shared exactly once,
// automatically, at package publish time). There is no per-notebook variant; like PACKAGE_ID
// itself, this is a fixed deployment-time constant.
//
// Why an env var rather than a runtime lookup: the registry is created inside `init`, which
// runs as part of the publish transaction, not a separate entry function call - so unlike
// e.g. WalFeeReserveCreated (emitted by create_notebook, an entry function invoked once per
// notebook and therefore query-able via queryEvents), nothing in this module ever emits an
// event carrying the registry's object id, and there is exactly one instance system-wide, so
// `getOwnedObjects` (which only lists objects owned by an address, not shared objects) cannot
// find it either. Short of a dedicated indexer, the only genuinely reliable way to know a
// shared singleton's id is to record it once at publish time - exactly how PACKAGE_ID is
// already handled today. Set VITE_ENCRYPTION_KEY_REGISTRY_ID after publishing.
export const ENCRYPTION_KEY_REGISTRY_ID = (import.meta as any).env.VITE_ENCRYPTION_KEY_REGISTRY_ID || null;

// WAL package/coin type - reused here (in addition to SessionContext.tsx's existing usage) to
// construct an `option::Option<Coin<WAL>>` PTB argument for update_note/update_note_with_session
// when no real WAL payment is being made this call (see buildNoWalPaymentOption below).
const WAL_PACKAGE_ID = (import.meta as any).env.VITE_WAL_PACKAGE_ID || '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a';
const WAL_COIN_TYPE = `0x2::coin::Coin<${WAL_PACKAGE_ID}::wal::WAL>`;

// Mirrors contracts/inkblob/sources/notebook.move's WAL_STORAGE_FEE_PER_MB / WAL_MIN_PAYMENT
// constants (kept in sync manually, same approach as App.tsx's E_VERSION_MISMATCH - the frontend
// has no generated bindings for Move constants). Used to precompute the required fee client-side
// so the caller knows how much of the user's Coin<WAL> to split off BEFORE building the PTB.
export const WAL_STORAGE_FEE_PER_MB = 1000000;
export const WAL_MIN_PAYMENT = 100000;

/**
 * Mirrors calculate_wal_storage_fee(blob_size_mb: u64): u64 in notebook.move exactly (including
 * its rounding-up-to-whole-MB contract, since the Move side takes a u64 blob_size_mb - the
 * caller is expected to have already rounded up bytes to whole megabytes, e.g. via
 * bytesToBlobSizeMb below).
 */
export function calculateWalStorageFee(blobSizeMb: number): number {
    return blobSizeMb * WAL_STORAGE_FEE_PER_MB;
}

/**
 * Converts a raw byte count (e.g. encrypted blob length) into the whole-MB unit
 * calculate_wal_storage_fee expects, rounding up so a small note is never undercharged (and
 * still satisfies the Move-side `blob_size_mb > 0` assert in calculate_wal_storage_fee for any
 * non-empty content). Clamped to the contract's 1000 MB max.
 */
export function bytesToBlobSizeMb(byteLength: number): number {
    const mb = Math.ceil(byteLength / (1024 * 1024));
    return Math.min(Math.max(mb, 1), 1000);
}

// Log package ID for debugging
console.log('[SuiService] Using PACKAGE_ID:', PACKAGE_ID);

export class SuiService {
    constructor(private client: SuiClient) { }

    /**
     * Query owned NotebookRegistry
     */
    async queryNotebookRegistry(owner: string): Promise<any | null> {
        const result = await this.client.getOwnedObjects({
            owner,
            filter: { StructType: `${PACKAGE_ID}::notebook::NotebookRegistry` },
            options: { showContent: true },
        });

        if (result.data.length === 0) return null;

        const registry = result.data[0];
        return registry; // Parse this properly in a real app
    }

    /**
     * Fetch shared Notebook object
     */
    async fetchNotebook(notebookId: string): Promise<any> {
        const result = await this.client.getObject({
            id: notebookId,
            options: { showContent: true },
        });

        return result; // Parse this properly
    }

    /**
     * Query dynamic field from a Table
     * @param tableId - The ID of the Table object
     * @param key - The key to look up (for string keys)
     */
    async getDynamicFieldObject(tableId: string, key: string): Promise<any> {
        console.log('[SuiService] Querying dynamic field:', { tableId, key });

        try {
            const result = await this.client.getDynamicFieldObject({
                parentId: tableId,
                name: {
                    type: '0x1::string::String',  // Key type for string keys
                    value: key,
                },
            });

            console.log('[SuiService] Dynamic field query result:', result);
            return result;
        } catch (error) {
            console.error('[SuiService] Error querying dynamic field:', error);
            throw error;
        }
    }

    /**
     * Create notebook transaction
     * @param notebookName - Name for the new notebook (will be visible on-chain)
     */
    createNotebookTx(notebookName: string = 'My Notebook'): Transaction {
        console.log('[SuiService] Creating notebook transaction:', {
            notebookName,
            target: `${PACKAGE_ID}::notebook::create_notebook`,
        });

        const tx = new Transaction();

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::create_notebook`,
            arguments: [
                tx.pure.string(notebookName), // string::String parameter
            ],
        });

        return tx;
    }

    /**
     * Create note transaction
     * Note: The deployed contract uses update_note for both creation and updates
     */
    /**
     * Constructs a PTB argument for an empty `option::Option<Coin<WAL>>` - unlike a pure/
     * primitive Option (tx.pure.option), an object-typed Option can't be built with a plain
     * value; it needs an actual Move call to the framework's generic option::none<T>(),
     * whose result is then usable as a moveCall argument elsewhere in the same PTB.
     * Used whenever a note create/update isn't paying a real WAL storage fee this call - real
     * WAL payment plumbing (fetching/splitting the user's own Coin<WAL>) is intentionally not
     * wired up in the UI yet; every current call site skips WAL accounting via this helper.
     */
    private buildNoWalPaymentOption(tx: Transaction) {
        return tx.moveCall({
            target: '0x1::option::none',
            typeArguments: [WAL_COIN_TYPE],
        });
    }

    /**
     * Constructs a PTB argument for a populated `option::Option<Coin<WAL>>` containing a real
     * split-off Coin<WAL> - the counterpart to buildNoWalPaymentOption above. Same reasoning
     * applies: an object-typed Option can't be built with tx.pure.option, so a real value needs
     * an actual moveCall to the framework's generic option::some<T>(), using the identical
     * WAL_COIN_TYPE type argument as the none-case helper so both branches produce a PTB result
     * of the same static type.
     *
     * `walCoinId` is expected to be a Coin<WAL> object (or gas-merged coin) owned by whichever
     * address is signing this PTB (the user's wallet for the non-session methods, or the hot
     * wallet for the *_with_session methods) with at least `requiredFeeInFrost` balance - splits
     * off exactly that amount via tx.splitCoins (mirrors authorizeSessionTx's existing
     * tx.splitCoins(tx.object(walCoinId), [...]) pattern) and wraps the split coin in Some(..).
     * The original coin (now holding the remainder) is left untouched in the PTB - the caller
     * does not need to explicitly return it, since it's simply not consumed by this call.
     */
    private buildSomeWalPaymentOption(tx: Transaction, walCoinId: string, requiredFeeInFrost: number) {
        const [feeCoin] = tx.splitCoins(tx.object(walCoinId), [tx.pure.u64(requiredFeeInFrost)]);
        return tx.moveCall({
            target: '0x1::option::some',
            typeArguments: [WAL_COIN_TYPE],
            arguments: [feeCoin],
        });
    }

    /**
     * Builds the (blob_size_mb, wal_payment) argument pair shared by all four create/update note
     * methods below. Passing `walCoinId`/`blobSizeMb` as null (both together - this is the only
     * combination the contract accepts, see update_note's doc comment) skips WAL accounting
     * exactly as before, for backward compatibility with any caller not ready to pay yet (e.g. a
     * brand-new empty note with no real content to size yet). When both are provided, splits the
     * exact required fee (calculateWalStorageFee) off the caller's Coin<WAL>.
     */
    private buildWalPaymentArgs(
        tx: Transaction,
        walCoinId: string | null,
        blobSizeMb: number | null
    ): [ReturnType<Transaction['pure']['option']>, ReturnType<Transaction['moveCall']>] {
        if (walCoinId === null || blobSizeMb === null) {
            return [tx.pure.option('u64', null), this.buildNoWalPaymentOption(tx)];
        }

        const requiredFee = calculateWalStorageFee(blobSizeMb);
        return [
            tx.pure.option('u64', blobSizeMb),
            this.buildSomeWalPaymentOption(tx, walCoinId, requiredFee),
        ];
    }

    createNoteTx(
        notebookId: string,
        reserveId: string,
        encryptedTitle: string,
        folderId: string | null,
        noteId?: string,
        parentNoteId: string | null = null,
        walCoinId: string | null = null,
        blobSizeMb: number | null = null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const reserve = tx.object(reserveId);

        // Generate a unique note ID if not provided
        const newNoteId = noteId || this.generateUniqueId();

        // For new notes, we'll use empty blob_id and blob_object_id initially
        // These will be populated when content is saved to Walrus
        const blobId = "temp_blob_id";
        const blobObjectId = "temp_blob_object_id";

        const [blobSizeMbArg, walPaymentArg] = this.buildWalPaymentArgs(tx, walCoinId, blobSizeMb);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note`,
            arguments: [
                notebook,
                reserve,
                tx.pure.address(newNoteId),
                tx.pure.string(blobId),
                tx.pure.string(blobObjectId),
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
                parentNoteId && this.isValidAddress(parentNoteId) ? tx.pure.option('address', parentNoteId) : tx.pure.option('address', null),
                // A brand-new note id is guaranteed not to exist on-chain yet, so the CAS guard
                // (which only applies to the update-existing branch) never checks this value -
                // option::none() is always correct here, unlike updateNoteTx which must pass the
                // real current updated_at.
                tx.pure.option('u64', null),
                blobSizeMbArg,
                walPaymentArg,
            ],
        });

        return tx;
    }

    /**
     * Create note transaction with session capability
     */
    createNoteTxWithSession(
        notebookId: string,
        reserveId: string,
        sessionCapId: string,
        encryptedTitle: string,
        folderId: string | null,
        noteId?: string,
        parentNoteId: string | null = null,
        walCoinId: string | null = null,
        blobSizeMb: number | null = null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const reserve = tx.object(reserveId);
        const sessionCap = tx.object(sessionCapId);

        // Generate a unique note ID if not provided
        const newNoteId = noteId || this.generateUniqueId();

        // For new notes, we'll use empty blob_id and blob_object_id initially
        const blobId = "temp_blob_id";
        const blobObjectId = "temp_blob_object_id";

        const [blobSizeMbArg, walPaymentArg] = this.buildWalPaymentArgs(tx, walCoinId, blobSizeMb);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note_with_session`,
            arguments: [
                notebook,
                reserve,
                sessionCap,
                tx.pure.address(newNoteId),
                tx.pure.string(blobId),
                tx.pure.string(blobObjectId),
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
                parentNoteId && this.isValidAddress(parentNoteId) ? tx.pure.option('address', parentNoteId) : tx.pure.option('address', null),
                // See createNoteTx's comment - a brand-new note id never hits the CAS-guarded
                // update-existing branch, so option::none() is always correct here.
                tx.pure.option('u64', null),
                blobSizeMbArg,
                walPaymentArg,
            ],
        });

        return tx;
    }

    /**
     * Generate a unique ID for new notes/folders (proper SUI address format: 64 hex chars)
     */
    generateUniqueId(): string {
        // Generate 64 random hex characters
        const array = new Uint8Array(32); // 32 bytes = 64 hex chars
        crypto.getRandomValues(array);
        const hexArray = Array.from(array, byte => byte.toString(16).padStart(2, '0'));
        const hex64 = hexArray.join('');
        return `0x${hex64}`;
    }

    /**
     * Check if a string is a valid SUI address format
     */
    private isValidAddress(address: string): boolean {
        return /^0x[0-9a-fA-F]{64}$/.test(address);
    }

    /**
     * Update note transaction (without session)
     */
    updateNoteTx(
        notebookId: string,
        reserveId: string,
        noteId: string,
        blobId: string,
        encryptedTitle: string,
        folderId: string | null,
        parentNoteId: string | null,
        expectedUpdatedAt: number | null,
        walCoinId: string | null = null,
        blobSizeMb: number | null = null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const reserve = tx.object(reserveId);

        const [blobSizeMbArg, walPaymentArg] = this.buildWalPaymentArgs(tx, walCoinId, blobSizeMb);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note`,
            arguments: [
                notebook,
                reserve,
                tx.pure.address(noteId),
                tx.pure.string(blobId),
                tx.pure.string("temp_blob_object_id"), // Will be populated with actual blob object ID
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
                parentNoteId && this.isValidAddress(parentNoteId) ? tx.pure.option('address', parentNoteId) : tx.pure.option('address', null),
                tx.pure.option('u64', expectedUpdatedAt === null ? null : expectedUpdatedAt),
                // walCoinId/blobSizeMb both null (the default) preserves the previous
                // option::none()/option::none() behavior - skips WAL accounting entirely for
                // this save, which the contract treats as valid (e.g. a metadata-only edit).
                blobSizeMbArg,
                walPaymentArg,
            ],
        });

        return tx;
    }

    /**
     * Update note transaction with session capability
     */
    updateNoteTxWithSession(
        notebookId: string,
        reserveId: string,
        sessionCapId: string,
        noteId: string,
        blobId: string,
        encryptedTitle: string,
        folderId: string | null,
        parentNoteId: string | null,
        expectedUpdatedAt: number | null,
        walCoinId: string | null = null,
        blobSizeMb: number | null = null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const reserve = tx.object(reserveId);
        const sessionCap = tx.object(sessionCapId);

        const [blobSizeMbArg, walPaymentArg] = this.buildWalPaymentArgs(tx, walCoinId, blobSizeMb);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note_with_session`,
            arguments: [
                notebook,
                reserve,
                sessionCap,
                tx.pure.address(noteId),
                tx.pure.string(blobId),
                tx.pure.string("temp_blob_object_id"), // Will be populated with actual blob object ID
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
                parentNoteId && this.isValidAddress(parentNoteId) ? tx.pure.option('address', parentNoteId) : tx.pure.option('address', null),
                tx.pure.option('u64', expectedUpdatedAt === null ? null : expectedUpdatedAt),
                // See updateNoteTx's comment - null/null preserves the previous no-payment behavior.
                blobSizeMbArg,
                walPaymentArg,
            ],
        });

        return tx;
    }
    /**
     * Authorize session and fund hot wallet
     */
    authorizeSessionTx(
        notebookId: string,
        deviceFingerprint: string,
        hotWalletAddress: string,
        expiresAt: number,
        senderAddress: string, // Sender's wallet address to return remaining coins
        suiAmount: number = 100000000, // 0.1 SUI
        walAmount: number = 200000000, // 0.2 WAL
        walCoinId: string // User must provide a WAL coin ID
    ): Transaction {
        console.log('[SuiService] Starting authorizeSessionTx with:', {
            notebookId,
            deviceFingerprint: deviceFingerprint.substring(0, 16) + '...',
            hotWalletAddress,
            senderAddress,
            expiresAt,
            suiAmount,
            walAmount,
            walCoinId,
            PACKAGE_ID
        });

        const tx = new Transaction();

        // Split SUI from gas for funding
        const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmount)]);

        // Handle WAL coin
        // In a real app, we might need to merge coins or pick one with enough balance.
        // For now, we assume the passed walCoinId has enough.
        // We also need to split it if we don't want to pass the whole coin, 
        // but the contract takes `Coin<WAL>` and returns remainder, so passing the whole coin is fine 
        // IF the contract logic returns the remainder.
        // The design doc says: "Return remainder coins to sender". So passing the full coin is safe.
        const [walCoin] = tx.splitCoins(tx.object(walCoinId), [tx.pure.u64(walAmount)]);

        // Call authorize_session_and_fund - this function likely returns multiple values
        console.log('[SuiService] Building moveCall with target:', `${PACKAGE_ID}::notebook::authorize_session_and_fund`);
        console.log('[SuiService] MoveCall arguments:', {
            notebookId: tx.object(notebookId),
            suiCoin: 'Coin<SUI> object',
            walCoin: 'Coin<WAL> object',
            deviceFingerprint: deviceFingerprint.substring(0, 16) + '...',
            hotWalletAddress,
            expiresAt,
            suiAmount,
            walAmount
        });

        // FIXED: Call authorize_session_and_fund with updated contract signature
        // The contract now uses &mut Coin parameters and handles remaining balances properly
        const moveCallResult = tx.moveCall({
            target: `${PACKAGE_ID}::notebook::authorize_session_and_fund`,
            arguments: [
                tx.object(notebookId),           // &Notebook
                suiCoin,                          // &mut Coin<SUI>
                walCoin,                          // &mut Coin<WAL>
                tx.pure.string(deviceFingerprint), // string::String
                tx.pure.address(hotWalletAddress), // address
                tx.pure.u64(expiresAt),           // u64
                tx.pure.option('u64', suiAmount), // option::Option<u64>
                tx.pure.option('u64', walAmount), // option::Option<u64>
            ],
        });

        console.log('[SuiService] MoveCall completed - contract handles balances correctly:', moveCallResult);

        // CRITICAL FIX: Transfer remaining coin balances back to sender
        // After the contract splits and transfers payments to hot wallet,
        // the remaining balances in suiCoin and walCoin must be handled.
        // We transfer them back to the transaction sender (user's wallet).
        tx.transferObjects([suiCoin, walCoin], tx.pure.address(senderAddress));

        console.log('[SuiService] Transaction built successfully - remaining coins returned to sender');
        return tx;
    }

    /**
     * Execute transaction with Session Key (Hot Wallet)
     */
    async executeWithSession(
        tx: Transaction,
        keypair: any // Ed25519Keypair
    ): Promise<any> {
        if (!keypair) {
            throw new Error('executeWithSession: keypair is null or undefined. Cannot execute transaction without valid keypair.');
        }

        tx.setSender(keypair.toSuiAddress());

        const { bytes, signature } = await tx.sign({
            client: this.client,
            signer: keypair
        });

        return this.client.executeTransactionBlock({
            transactionBlock: bytes,
            signature,
            options: {
                showEffects: true,
                showEvents: true,
            },
        });
    }
    /**
     * Fetch all notes from the Notebook
     * Uses Dynamic Fields API to iterate through the 'notes' Table
     */
    async fetchNotes(notebookId: string): Promise<any[]> {
        // 1. Fetch Notebook to get Table ID
        const notebook = await this.fetchNotebook(notebookId);
        if (!notebook || !notebook.data || !notebook.data.content) {
            console.error('Notebook not found or invalid');
            return [];
        }

        const fields = notebook.data.content.fields;
        // Assuming 'notes' is a Table<ID, Note>, it will be represented as an object with an 'id' field
        // The 'id' field inside 'notes' is the Table ID (UID)
        const tableId = fields.notes?.fields?.id?.id;

        if (!tableId) {
            console.error('Notes table ID not found in notebook');
            return [];
        }

        // 2. Get all Dynamic Fields (keys) from the Table
        // For production, handle pagination (cursor)
        let allFields: any[] = [];
        let cursor = null;
        let hasNextPage = true;

        while (hasNextPage) {
            const result = await this.client.getDynamicFields({
                parentId: tableId,
                cursor,
            });
            allFields = [...allFields, ...result.data];
            cursor = result.nextCursor;
            hasNextPage = result.hasNextPage;
        }

        if (allFields.length === 0) return [];

        // 3. Fetch the actual Note objects
        // The 'objectId' in dynamic field result is the ID of the Field wrapper
        const objectIds = allFields.map(f => f.objectId);

        // Batch fetch (max 50 per call usually, but client handles chunking often or we should)
        // For MVP, assuming < 50 notes for now or client handles it.
        // If strict, we should chunk.
        const notesData = await this.client.multiGetObjects({
            ids: objectIds,
            options: { showContent: true },
        });

        // 4. Extract Note data from Field wrappers
        return notesData.map(item => {
            const content = item.data?.content as any;
            // Field<ID, Note> -> value is the Note
            const note = content?.fields?.value?.fields;

            // Debug: Log note structure for investigation
            console.debug('[SuiService] Fetched note:', {
                objectId: item.data?.objectId,
                hasContent: !!content,
                hasFields: !!content?.fields,
                hasValue: !!content?.fields?.value,
                hasValueFields: !!content?.fields?.value?.fields,
                noteKeys: note ? Object.keys(note) : [],
                encryptedTitle: note?.encrypted_title,
                encryptedTitleType: typeof note?.encrypted_title,
                encryptedTitleLength: note?.encrypted_title?.length || 0
            });

            return note;
        }).filter(note => !!note);
    }
    /**
     * Fetch all folders from the Notebook
     */
    async fetchFolders(notebookId: string): Promise<any[]> {
        const notebook = await this.fetchNotebook(notebookId);
        if (!notebook || !notebook.data || !notebook.data.content) return [];

        const fields = notebook.data.content.fields;
        const tableId = fields.folders?.fields?.id?.id;

        if (!tableId) return [];

        let allFields: any[] = [];
        let cursor = null;
        let hasNextPage = true;

        while (hasNextPage) {
            const result = await this.client.getDynamicFields({
                parentId: tableId,
                cursor,
            });
            allFields = [...allFields, ...result.data];
            cursor = result.nextCursor;
            hasNextPage = result.hasNextPage;
        }

        if (allFields.length === 0) return [];

        const objectIds = allFields.map(f => f.objectId);
        const foldersData = await this.client.multiGetObjects({
            ids: objectIds,
            options: { showContent: true },
        });

        return foldersData.map(item => {
            const content = item.data?.content as any;
            return content?.fields?.value?.fields;
        }).filter(folder => !!folder);
    }

    /**
     * Create folder transaction
     */
    createFolderTx(
        notebookId: string,
        encryptedName: string,
        parentId: string | null,
        folderId?: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        // create_folder requires the caller to supply the folder's ID, same as createNoteTx does for notes
        const newFolderId = folderId || this.generateUniqueId();

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::create_folder`,
            arguments: [
                notebook,
                tx.pure.address(newFolderId),
                tx.pure.string(encryptedName),
                parentId && this.isValidAddress(parentId) ? tx.pure.option('address', parentId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }

    /**
     * Update folder transaction (rename and/or reparent)
     */
    updateFolderTx(
        notebookId: string,
        folderId: string,
        encryptedName: string,
        parentId: string | null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_folder`,
            arguments: [
                notebook,
                tx.pure.address(folderId),
                tx.pure.string(encryptedName),
                parentId && this.isValidAddress(parentId) ? tx.pure.option('address', parentId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }

    /**
     * Reorder a single folder within its parent level
     */
    reorderFolderTx(
        notebookId: string,
        folderId: string,
        newSortOrder: number
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::reorder_folder`,
            arguments: [
                notebook,
                tx.pure.address(folderId),
                tx.pure.u64(newSortOrder),
            ],
        });

        return tx;
    }

    /**
     * Batch reorder multiple folders (for drag-and-drop operations)
     */
    batchReorderFoldersTx(
        notebookId: string,
        folderIds: string[],
        sortOrders: number[]
    ): Transaction {
        if (folderIds.length !== sortOrders.length) {
            throw new Error('batchReorderFoldersTx: folderIds and sortOrders must have the same length');
        }

        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::batch_reorder_folders`,
            arguments: [
                notebook,
                tx.pure.vector('address', folderIds),
                tx.pure.vector('u64', sortOrders),
            ],
        });

        return tx;
    }

    /**
     * Soft-delete a folder
     */
    deleteFolderTx(
        notebookId: string,
        folderId: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::delete_folder`,
            arguments: [
                notebook,
                tx.pure.address(folderId),
            ],
        });

        return tx;
    }

    /**
     * Restore a soft-deleted folder out of Trash
     */
    restoreFolderTx(
        notebookId: string,
        folderId: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::restore_folder`,
            arguments: [
                notebook,
                tx.pure.address(folderId),
            ],
        });

        return tx;
    }

    /**
     * Move a note to a different folder (or to no folder)
     */
    moveNoteTx(
        notebookId: string,
        noteId: string,
        newFolderId: string | null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::move_note`,
            arguments: [
                notebook,
                tx.pure.address(noteId),
                newFolderId && this.isValidAddress(newFolderId) ? tx.pure.option('address', newFolderId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }
    /**
     * Soft-delete a note (moves it to Trash - recoverable via restoreNoteTx)
     */
    deleteNoteTx(
        notebookId: string,
        noteId: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::delete_note`,
            arguments: [
                notebook,
                tx.pure.address(noteId),
            ],
        });

        return tx;
    }

    /**
     * Restore a soft-deleted note out of Trash
     */
    restoreNoteTx(
        notebookId: string,
        noteId: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::restore_note`,
            arguments: [
                notebook,
                tx.pure.address(noteId),
            ],
        });

        return tx;
    }

    /**
     * Claim the escrowed WAL storage-fee rebate for a note (Move: claim_wal_storage_rebate).
     * Pays out to the notebook OWNER's wallet regardless of who submits this transaction (see
     * the Move function's doc comment) - reads the real on-chain wal_paid amount, so there is
     * no amount parameter here for the caller to (mis)supply. Aborts on-chain (E_NO_WAL_PAID /
     * E_REBATE_ALREADY_CLAIMED) if the note never had a real WAL payment recorded, or if its
     * rebate was already claimed since the last payment.
     */
    claimWalRebateTx(
        notebookId: string,
        reserveId: string,
        noteId: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const reserve = tx.object(reserveId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::claim_wal_storage_rebate`,
            arguments: [
                notebook,
                reserve,
                tx.pure.address(noteId),
            ],
        });

        return tx;
    }

    /**
     * List every currently-granted address on this notebook, by reading the Notebook's
     * `permissions: Table<address, AccessGrant>` field directly (via the same Dynamic Fields
     * API pattern used by fetchNotes/fetchFolders for their Table<ID, T> fields, just keyed by
     * `address` instead of `ID`/`string::String`).
     *
     * This is the ONLY viable way to list "who has access" from the owner's side: the
     * SharedAccess capability objects grant_access creates are transferred to and owned by
     * the GRANTEE, not the owner, so the owner can never `getOwnedObjects` for them - the
     * owner has no wallet-owned object referencing any of their grants. The permissions Table
     * lives on the shared Notebook object itself, which the owner (or anyone) can always read
     * via getObject/getDynamicFields regardless of who owns the corresponding SharedAccess.
     *
     * Does NOT return each grant's SharedAccess object id (the permissions table doesn't store
     * it - only permission level + expiry), so this cannot by itself drive an owner-initiated
     * revoke_access call, which requires passing the actual SharedAccess object. See
     * ShareModal's revoke UX note for how that's handled.
     */
    async fetchNotebookPermissions(notebookId: string): Promise<Array<{ address: string; permission: number; expiresAt: string }>> {
        const notebook = await this.fetchNotebook(notebookId);
        if (!notebook || !notebook.data || !notebook.data.content) return [];

        const fields = notebook.data.content.fields as any;
        const tableId = fields.permissions?.fields?.id?.id;
        if (!tableId) return [];

        let allFields: any[] = [];
        let cursor = null;
        let hasNextPage = true;

        while (hasNextPage) {
            const result = await this.client.getDynamicFields({
                parentId: tableId,
                cursor,
            });
            allFields = [...allFields, ...result.data];
            cursor = result.nextCursor;
            hasNextPage = result.hasNextPage;
        }

        if (allFields.length === 0) return [];

        const objectIds = allFields.map(f => f.objectId);
        const grantsData = await this.client.multiGetObjects({
            ids: objectIds,
            options: { showContent: true },
        });

        return grantsData
            .map(item => {
                const content = item.data?.content as any;
                // Field<address, AccessGrant> -> name is the grantee address, value is the AccessGrant
                const grantee = content?.fields?.name;
                const grant = content?.fields?.value?.fields;
                if (!grantee || !grant) return null;
                return {
                    address: grantee as string,
                    permission: parseInt(grant.permission, 10) || 0,
                    expiresAt: grant.expires_at,
                };
            })
            .filter((g): g is { address: string; permission: number; expiresAt: string } => !!g);
    }

    /**
     * Recover the SharedAccess object id for each address currently listed in the notebook's
     * permissions Table, by querying past `AccessGranted` events for this notebook (the event
     * carries `shared_access_id`, which the permissions Table itself does not store).
     *
     * Why this is needed: revoke_access requires presenting the actual SharedAccess object,
     * but that object is owned by the GRANTEE, not the notebook owner - the owner has no
     * owned-object query that finds it. Cross-referencing the live permissions Table (source
     * of truth for "is this grant still active") against the most recent AccessGranted event
     * for each grantee address (source of the object id to revoke) is the only way to build a
     * working owner-side revoke button without an on-chain index the contract doesn't provide.
     *
     * Best-effort: if event history has been pruned by the fullnode (unlikely for a fresh
     * devnet/testnet deployment, but possible against an old/pruned node), an address present
     * in permissions may have no matching event and will be omitted from the result - callers
     * should treat a missing shared_access_id as "not revocable from this UI" rather than an error.
     */
    async fetchAccessGrantedEvents(notebookId: string): Promise<Map<string, string>> {
        // grantee address (lowercased) -> most recent shared_access_id granted to them
        const granteeToSharedAccessId = new Map<string, string>();

        try {
            let cursor: any = null;
            let hasNextPage = true;

            while (hasNextPage) {
                const result = await this.client.queryEvents({
                    query: { MoveEventType: `${PACKAGE_ID}::notebook::AccessGranted` },
                    cursor,
                    order: 'ascending', // oldest first, so a later re-grant to the same address overwrites the earlier event's id
                });

                for (const event of result.data) {
                    const parsed = event.parsedJson as any;
                    if (!parsed) continue;
                    if (parsed.notebook_id !== notebookId) continue;
                    granteeToSharedAccessId.set(String(parsed.grantee).toLowerCase(), parsed.shared_access_id);
                }

                cursor = result.nextCursor;
                hasNextPage = result.hasNextPage;
            }
        } catch (error) {
            console.error('[SuiService] Error querying AccessGranted events:', error);
            // Best-effort: return whatever was gathered before the failure rather than throwing,
            // so the grants list can still render (just without revoke capability for some rows).
        }

        return granteeToSharedAccessId;
    }

    /**
     * Discover every notebook that has ever granted the given address access - the inverse of
     * fetchAccessGrantedEvents (which starts from a KNOWN notebook_id and lists its grantees;
     * this starts from a KNOWN grantee address and finds their notebook_ids). There is no
     * on-chain index for "notebooks shared with address X" - a grantee owns a SharedAccess
     * object per grant, but object ownership alone can't be turned into a query for "which
     * notebooks", so the only way to discover this is to scan global `AccessGranted` event
     * history and filter client-side by grantee.
     *
     * For each distinct notebook_id found, the event history alone is NOT sufficient proof of
     * current access - it includes grants that have since been revoked (AccessRevoked) or that
     * carried an expires_at that has since passed. The live `Notebook.permissions` Table (see
     * fetchNotebookPermissions) is the actual source of truth, so every candidate notebook is
     * cross-checked against it before being included in the result.
     *
     * Naming limitation (deliberate, do not "fix" by inventing a name): a Notebook object does
     * not store its own human-readable name - that mapping (`notebooks: Table<String, ID>`)
     * lives only in the OWNER's NotebookRegistry, which a grantee has no access to (they don't
     * own it, and nothing on Notebook itself points back to it). `notebookName` is therefore
     * always null here; callers must render the notebook_id itself (e.g. truncated) as the
     * display label instead of a real name.
     */
    async fetchNotebooksSharedWithMe(granteeAddress: string): Promise<Array<{
        notebookId: string;
        notebookName: string | null;
        permission: number;
        expiresAt: string | null;
    }>> {
        const normalizedGrantee = granteeAddress.toLowerCase();
        // Distinct notebook_ids that have ever emitted an AccessGranted event naming this
        // grantee - just the candidate set. Per-grant permission/expiry is deliberately NOT
        // taken from the event here; it's re-derived from the live permissions Table below,
        // which is the actual source of truth (event history includes grants later revoked).
        const candidateNotebookIds = new Set<string>();

        try {
            let cursor: any = null;
            let hasNextPage = true;

            while (hasNextPage) {
                const result = await this.client.queryEvents({
                    query: { MoveEventType: `${PACKAGE_ID}::notebook::AccessGranted` },
                    cursor,
                    order: 'ascending',
                });

                for (const event of result.data) {
                    const parsed = event.parsedJson as any;
                    if (!parsed) continue;
                    if (String(parsed.grantee).toLowerCase() !== normalizedGrantee) continue;

                    candidateNotebookIds.add(parsed.notebook_id);
                }

                cursor = result.nextCursor;
                hasNextPage = result.hasNextPage;
            }
        } catch (error) {
            console.error('[SuiService] Error querying AccessGranted events for grantee:', error);
            return [];
        }

        if (candidateNotebookIds.size === 0) return [];

        // Cross-check each candidate against the notebook's LIVE permissions Table - event
        // history alone can't distinguish a still-active grant from one that was later revoked
        // or has since expired.
        const now = Date.now();
        const results = await Promise.all(
            Array.from(candidateNotebookIds).map(async (notebookId) => {
                try {
                    const livePermissions = await this.fetchNotebookPermissions(notebookId);
                    const liveGrant = livePermissions.find(
                        (g) => g.address.toLowerCase() === normalizedGrantee
                    );
                    if (!liveGrant) return null; // revoked, or notebook fetch found no matching entry

                    const NO_EXPIRY_SENTINEL = '18446744073709551615';
                    const isNoExpiry = !liveGrant.expiresAt || liveGrant.expiresAt === NO_EXPIRY_SENTINEL;
                    if (!isNoExpiry) {
                        const expiresAtMs = Number(liveGrant.expiresAt);
                        if (expiresAtMs <= now) return null; // expired - inert even though the table entry lingers
                    }

                    return {
                        notebookId,
                        notebookName: null, // see doc comment: not fetchable from the grantee's side
                        permission: liveGrant.permission,
                        expiresAt: isNoExpiry ? null : liveGrant.expiresAt,
                    };
                } catch (error) {
                    console.error('[SuiService] Error verifying live permissions for notebook:', notebookId, error);
                    return null;
                }
            })
        );

        return results.filter((r): r is { notebookId: string; notebookName: string | null; permission: number; expiresAt: string | null } => r !== null);
    }

    /**
     * Look up the shared WalFeeReserve object id for a notebook, by querying the
     * WalFeeReserveCreated event emitted once at notebook-creation time (create_notebook/
     * create_additional_notebook both call create_and_share_wal_fee_reserve internally) -
     * the reserve isn't otherwise reachable from the Notebook object itself, since it's a
     * separate shared object, not a field on Notebook. update_note/update_note_with_session
     * both require a live &mut WalFeeReserve argument, so every note create/update call needs
     * this id first.
     */
    async fetchWalFeeReserveId(notebookId: string): Promise<string | null> {
        try {
            let cursor: any = null;
            let hasNextPage = true;

            while (hasNextPage) {
                const result = await this.client.queryEvents({
                    query: { MoveEventType: `${PACKAGE_ID}::notebook::WalFeeReserveCreated` },
                    cursor,
                });

                for (const event of result.data) {
                    const parsed = event.parsedJson as any;
                    if (parsed && parsed.notebook_id === notebookId) {
                        return parsed.reserve_id;
                    }
                }

                cursor = result.nextCursor;
                hasNextPage = result.hasNextPage;
            }
        } catch (error) {
            console.error('[SuiService] Error querying WalFeeReserveCreated events:', error);
        }

        return null;
    }

    /**
     * Grant another address read or write access to this notebook (Move: grant_access).
     * IMPORTANT (see notebook.move's grant_access doc comment): this only grants ON-CHAIN
     * write/read authorization to mutate/read notebook state. Whether the grantee can also
     * actually DECRYPT existing note/folder content depends on `wrappedKey`: if the grantee
     * has registered an encryption public key (see fetchEncryptionPublicKey /
     * register_encryption_key) and the caller has wrapped a copy of the content-encryption
     * key for them (see frontend/crypto/keySharing.ts wrapContentKeyForGrantee), passing that
     * blob here lets the grantee recover the real content key. Pass an empty Uint8Array if no
     * wrapped key is available yet (e.g. the grantee hasn't registered a public key) - this is
     * a valid, non-aborting value on the Move side (grant_access treats it as "no wrapped key
     * yet"), not an error condition. Callers (ShareModal) must make the decryption caveat
     * explicit to the user whenever wrappedKey ends up empty.
     * @param permission - 0 (PERMISSION_READ) or 1 (PERMISSION_WRITE), matching the Move constants.
     * @param expiresAt - epoch ms the grant should stop being honored, or null for no expiry.
     * @param wrappedKey - the notebook's content-encryption key, wrapped for the grantee's
     *   X25519 public key (see keySharing.ts), or an empty Uint8Array if unavailable.
     */
    grantAccessTx(
        notebookId: string,
        granteeAddress: string,
        permission: 0 | 1,
        expiresAt: number | null,
        wrappedKey: Uint8Array = new Uint8Array(0)
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::grant_access`,
            arguments: [
                notebook,
                tx.pure.address(granteeAddress),
                tx.pure.u8(permission),
                tx.pure.option('u64', expiresAt === null ? null : expiresAt),
                tx.pure.vector('u8', Array.from(wrappedKey)),
            ],
        });

        return tx;
    }

    /**
     * Build the transaction to publish (or idempotently replace) the CURRENT wallet's
     * envelope-encryption public key in the global EncryptionKeyRegistry (Move:
     * register_encryption_key). Intended to be signed+submitted fire-and-forget, once per
     * session right after unlock (see App.tsx) - see that call site for why failures here are
     * caught/logged rather than surfaced to the user.
     * @param registryId - the EncryptionKeyRegistry shared object id (see
     *   fetchEncryptionKeyRegistryId / ENCRYPTION_KEY_REGISTRY_ID).
     * @param publicKeyRaw - the caller's raw 32-byte X25519 public key
     *   (frontend/crypto/keySharing.ts deriveX25519KeyPair(...).publicKeyRaw).
     */
    registerEncryptionKeyTx(registryId: string, publicKeyRaw: Uint8Array): Transaction {
        const tx = new Transaction();
        const registry = tx.object(registryId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::register_encryption_key`,
            arguments: [
                registry,
                tx.pure.vector('u8', Array.from(publicKeyRaw)),
            ],
        });

        return tx;
    }

    /**
     * Resolve the object id of the single global EncryptionKeyRegistry shared object.
     *
     * There is exactly one instance system-wide, created and shared automatically inside
     * this module's `init` function at publish time (see contracts/inkblob/sources/
     * notebook.move) - not created by any callable entry function, so no event exists that
     * carries its id (unlike e.g. WalFeeReserveCreated, emitted by the entry function
     * create_notebook), and it is a SHARED object, so `getOwnedObjects` (owner-indexed) can
     * never find it either. Short of a dedicated chain indexer, there is no generic query
     * that answers "find the one shared object of type X across all of history" - so this
     * falls back to a fixed, deployment-time constant (ENCRYPTION_KEY_REGISTRY_ID, an env
     * var), exactly the same pattern already used for PACKAGE_ID itself. Returns null if
     * that env var isn't set (e.g. local dev against an as-yet-unpublished contract).
     */
    async fetchEncryptionKeyRegistryId(): Promise<string | null> {
        if (!ENCRYPTION_KEY_REGISTRY_ID) {
            console.warn(
                '[SuiService] VITE_ENCRYPTION_KEY_REGISTRY_ID is not set - encryption key ' +
                'registration/lookup will be skipped. Set it after publishing the contract ' +
                '(the registry id is printed in the publish transaction\'s object changes).'
            );
            return null;
        }

        // Sanity-check that the configured id still resolves to a live object of the
        // expected type, so a stale/misconfigured id fails loudly in the console (as a
        // best-effort, non-throwing check) rather than silently causing every downstream
        // registry read/write to fail with a confusing "object not found" abort.
        try {
            const result = await this.client.getObject({
                id: ENCRYPTION_KEY_REGISTRY_ID,
                options: { showType: true },
            });
            const expectedType = `${PACKAGE_ID}::notebook::EncryptionKeyRegistry`;
            if (result.data?.type && result.data.type !== expectedType) {
                console.error(
                    '[SuiService] VITE_ENCRYPTION_KEY_REGISTRY_ID does not resolve to an ' +
                    `EncryptionKeyRegistry (found type "${result.data.type}", expected ` +
                    `"${expectedType}"). Encryption key registration/lookup will likely fail.`
                );
            }
        } catch (error) {
            console.error('[SuiService] Failed to verify ENCRYPTION_KEY_REGISTRY_ID object:', error);
        }

        return ENCRYPTION_KEY_REGISTRY_ID;
    }

    /**
     * Look up `addr`'s registered raw X25519 public key from the EncryptionKeyRegistry's
     * `keys: Table<address, vector<u8>>`, mirroring fetchNotebookPermissions's
     * dynamic-fields-table-read pattern (Table<K, V> is represented on-chain as a set of
     * dynamic fields keyed by K, each holding a Field<K, V> object with `.name`/`.value`).
     * Returns null if `addr` has never called register_encryption_key.
     */
    async fetchEncryptionPublicKey(registryId: string, addr: string): Promise<Uint8Array | null> {
        try {
            const result = await this.client.getDynamicFieldObject({
                parentId: registryId,
                name: {
                    type: 'address',
                    value: addr,
                },
            });
            // Note: getDynamicFieldObject (unlike getObject) always returns content when the
            // field exists - no separate showContent option to request.

            const content = result.data?.content as any;
            // Field<address, vector<u8>>: `.fields.value` is the raw vector<u8>, represented
            // in Sui's JSON-ish object output as a plain array of byte numbers (unlike a
            // struct value, e.g. AccessGrant, which would need an additional `.fields`).
            const rawValue = content?.fields?.value;
            if (!rawValue || !Array.isArray(rawValue)) return null;

            return new Uint8Array(rawValue.map((b: string | number) => Number(b)));
        } catch (error) {
            // getDynamicFieldObject throws if no such dynamic field exists (addr hasn't
            // registered a key yet) - treat that as "not found", not an error to propagate.
            console.warn('[SuiService] No registered encryption key found for address:', addr, error);
            return null;
        }
    }

    /**
     * Look up the wrapped_content_key stored for `myAddress` on a specific notebook's
     * `wrapped_content_keys: Table<address, vector<u8>>` (populated by grant_access - see
     * notebook.move). Mirrors fetchEncryptionPublicKey's dynamic-field-by-address-key read,
     * just against the per-notebook table instead of the global registry. Returns null if
     * there is no entry (no grant to this address yet) OR if the stored entry is an empty
     * vector (grant_access was called with no wrapped key available at the time) - both
     * cases mean "no usable wrapped key right now", which callers should treat identically.
     */
    async fetchWrappedContentKey(notebookId: string, myAddress: string): Promise<Uint8Array | null> {
        const notebook = await this.fetchNotebook(notebookId);
        if (!notebook || !notebook.data || !notebook.data.content) return null;

        const fields = notebook.data.content.fields as any;
        const tableId = fields.wrapped_content_keys?.fields?.id?.id;
        if (!tableId) return null;

        try {
            const result = await this.client.getDynamicFieldObject({
                parentId: tableId,
                name: {
                    type: 'address',
                    value: myAddress,
                },
            });

            const content = result.data?.content as any;
            const rawValue = content?.fields?.value;
            if (!rawValue || !Array.isArray(rawValue) || rawValue.length === 0) return null;

            return new Uint8Array(rawValue.map((b: string | number) => Number(b)));
        } catch (error) {
            console.warn('[SuiService] No wrapped content key found for address on notebook:', myAddress, notebookId, error);
            return null;
        }
    }

    /**
     * Revoke a previously granted SharedAccess object (Move: revoke_access). Owner-only on
     * the contract side - must be signed by the notebook owner's wallet, not the grantee's.
     * @param sharedAccessObjectId - the object id of the grantee's owned SharedAccess capability
     *   (transferred to them by grant_access), consumed/deleted by this call.
     */
    revokeAccessTx(
        notebookId: string,
        sharedAccessObjectId: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const sharedAccess = tx.object(sharedAccessObjectId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::revoke_access`,
            arguments: [
                notebook,
                sharedAccess,
            ],
        });

        return tx;
    }

    /**
     * Subscribe to Notebook events
     */
    async subscribeToEvents(
        onMessage: (event: any) => void
    ): Promise<() => void> {
        const unsubscribe = await this.client.subscribeEvent({
            filter: { Package: PACKAGE_ID } as any, // Cast to any to bypass strict type check if SDK version mismatch
            onMessage: (event) => {
                onMessage(event);
            },
        });

        return unsubscribe;
    }
}
