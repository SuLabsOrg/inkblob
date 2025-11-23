import { useQuery } from '@tanstack/react-query';
import { useNotebook } from './useNotebook';
import { useEncryption } from '../context/EncryptionContext';
import { decryptText } from '../crypto/decryption';
import { useSuiClient } from '@mysten/dapp-kit';
import { SuiService } from '../services/suiService';

export interface Note {
    id: string;
    title: string;
    content: string; // This might be empty if we don't fetch blob content immediately
    folderId: string;
    updatedAt: Date;
    blobId: string; // Store blobId for later content fetching
}

export function useNotes() {
    const { data: notebook } = useNotebook();
    const { encryptionKey } = useEncryption();
    const client = useSuiClient();
    const suiService = new SuiService(client);

    return useQuery({
        queryKey: ['notes', notebook?.data?.objectId],
        queryFn: async () => {
            if (!notebook || !encryptionKey || !notebook.data?.objectId) return [];

            try {
                // 1. Fetch raw encrypted notes from Sui
                const rawNotes = await suiService.fetchNotes(notebook.data.objectId);

                // 2. Decrypt and map to Note interface
                const decryptedNotes = await Promise.all(rawNotes.map(async (rawNote) => {
                    try {
                        // Decrypt title
                        // rawNote.title is base64 encoded encrypted string
                        const title = await decryptText(rawNote.title, encryptionKey);

                        // Handle folderId (Option<address>)
                        // Move Option is { type: ..., fields: { vec: [] } } or similar
                        // But here we accessed .fields so it might be direct value if unwrapped or struct
                        // Let's assume standard Option representation in JSON: { type: '0x1::option::Option<...>', fields: { vec: [...] } }
                        // Or if it's a simple field, it might be null if None.
                        // We need to check how Option is returned in JSON.
                        // Usually it's an array for 'vec'.
                        let folderId = 'notes'; // Default
                        if (rawNote.folder_id && rawNote.folder_id.fields && rawNote.folder_id.fields.vec && rawNote.folder_id.fields.vec.length > 0) {
                            folderId = rawNote.folder_id.fields.vec[0];
                        }

                        return {
                            id: rawNote.id.id, // UID struct
                            title: title,
                            content: '', // Content is in Walrus, not here. We fetch on demand.
                            folderId: folderId,
                            updatedAt: new Date(parseInt(rawNote.updated_at)), // Timestamp ms
                            blobId: rawNote.blob_id,
                        } as Note;
                    } catch (e) {
                        console.error('Failed to decrypt note:', rawNote.id, e);
                        return null;
                    }
                }));

                return decryptedNotes.filter((n): n is Note => n !== null);
            } catch (error) {
                console.error('Error fetching notes:', error);
                return [];
            }
        },
        enabled: !!notebook && !!encryptionKey && !!notebook.data?.objectId,
    });
}
