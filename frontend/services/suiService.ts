import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Package ID from environment variable (deployed contract address)
export const PACKAGE_ID = import.meta.env.VITE_SUI_PACKAGE_ID || '0x0';

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
    createNoteTx(
        notebookId: string,
        encryptedTitle: string,
        folderId: string | null,
        noteId?: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        // Generate a unique note ID if not provided
        const newNoteId = noteId || this.generateUniqueId();

        // For new notes, we'll use empty blob_id and blob_object_id initially
        // These will be populated when content is saved to Walrus
        const blobId = "temp_blob_id";
        const blobObjectId = "temp_blob_object_id";

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note`,
            arguments: [
                notebook,
                tx.pure.address(newNoteId),
                tx.pure.string(blobId),
                tx.pure.string(blobObjectId),
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }

    /**
     * Create note transaction with session capability
     */
    createNoteTxWithSession(
        notebookId: string,
        sessionCapId: string,
        encryptedTitle: string,
        folderId: string | null,
        noteId?: string
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const sessionCap = tx.object(sessionCapId);

        // Generate a unique note ID if not provided
        const newNoteId = noteId || this.generateUniqueId();

        // For new notes, we'll use empty blob_id and blob_object_id initially
        const blobId = "temp_blob_id";
        const blobObjectId = "temp_blob_object_id";

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note_with_session`,
            arguments: [
                notebook,
                sessionCap,
                tx.pure.address(newNoteId),
                tx.pure.string(blobId),
                tx.pure.string(blobObjectId),
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }

    /**
     * Generate a unique ID for new notes (proper SUI address format: 64 hex chars)
     */
    private generateUniqueId(): string {
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
        noteId: string,
        blobId: string,
        encryptedTitle: string,
        folderId: string | null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note`,
            arguments: [
                notebook,
                tx.pure.address(noteId),
                tx.pure.string(blobId),
                tx.pure.string("temp_blob_object_id"), // Will be populated with actual blob object ID
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }

    /**
     * Update note transaction with session capability
     */
    updateNoteTxWithSession(
        notebookId: string,
        sessionCapId: string,
        noteId: string,
        blobId: string,
        encryptedTitle: string,
        folderId: string | null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);
        const sessionCap = tx.object(sessionCapId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note_with_session`,
            arguments: [
                notebook,
                sessionCap,
                tx.pure.address(noteId),
                tx.pure.string(blobId),
                tx.pure.string("temp_blob_object_id"), // Will be populated with actual blob object ID
                tx.pure.string(encryptedTitle),
                folderId && this.isValidAddress(folderId) ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
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
        parentId: string | null
    ): Transaction {
        const tx = new Transaction();
        const notebook = tx.object(notebookId);

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::create_folder`,
            arguments: [
                notebook,
                tx.pure.string(encryptedName),
                parentId ? tx.pure.option('address', parentId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }
    /**
     * Delete note transaction
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
                tx.pure.id(noteId),
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
