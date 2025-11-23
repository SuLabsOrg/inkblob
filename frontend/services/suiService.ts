import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

// Placeholder Package ID - Replace with actual deployed package ID
export const PACKAGE_ID = '0x0';

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

        // Handle Option<SessionCap> as vector of objects
        const sessionArg = sessionCap
            ? tx.makeMoveVec({ elements: [tx.object(sessionCap)] })
            : tx.makeMoveVec({ elements: [] });

        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note`,
            arguments: [
                notebook,
                sessionArg,
                tx.pure.id(noteId),
                tx.pure.string(blobId),
                tx.pure.string(encryptedTitle),
                // Use 'address' for ID option as ID is essentially an address in Move
                folderId ? tx.pure.option('address', folderId) : tx.pure.option('address', null),
            ],
        });

        return tx;
    }
}
