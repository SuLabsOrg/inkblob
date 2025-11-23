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
                    // Extract common fields outside try-catch to avoid scope issues
                    const noteId = rawNote.id?.id || 'unknown';
                    const updatedAt = new Date(parseInt(rawNote.updated_at) || Date.now());
                    const blobId = rawNote.blob_id || '';

                    // Handle folderId (Option<address>) - Move Option representation
                    let folderId = 'notes'; // Default folder
                    if (rawNote.folder_id && rawNote.folder_id.fields && rawNote.folder_id.fields.vec && rawNote.folder_id.fields.vec.length > 0) {
                        folderId = rawNote.folder_id.fields.vec[0];
                    }

                    try {
                        // Debug: Log raw note structure for investigation
                        console.debug('[useNotes] Processing note:', {
                            noteId,
                            hasTitle: !!rawNote.title,
                            titleLength: rawNote.title?.length || 0,
                            titleType: typeof rawNote.title,
                            rawNoteStructure: Object.keys(rawNote)
                        });

                        // Check if title exists and is valid
                        if (!rawNote.title || typeof rawNote.title !== 'string' || rawNote.title.trim() === '') {
                            console.warn('[useNotes] Note has invalid or empty title:', {
                                noteId,
                                title: rawNote.title,
                                titleType: typeof rawNote.title
                            });

                            // Return note with default title instead of throwing error
                            return {
                                id: noteId,
                                title: '[No Title]',
                                content: '', // Content is in Walrus, not here
                                folderId: folderId,
                                updatedAt: updatedAt,
                                blobId: blobId,
                            } as Note;
                        }

                        // Decrypt title - now we know title is a valid string
                        const title = await decryptText(rawNote.title, encryptionKey);

                        return {
                            id: noteId,
                            title: title,
                            content: '', // Content is in Walrus, not here. We fetch on demand.
                            folderId: folderId,
                            updatedAt: updatedAt,
                            blobId: blobId,
                        } as Note;
                    } catch (e) {
                        // Enhanced error handling for decryption failures
                        const titlePreview = rawNote.title ?
                            (rawNote.title.substring(0, 20) + (rawNote.title.length > 20 ? '...' : '')) :
                            'null';

                        console.error('Failed to decrypt note:', {
                            noteId,
                            titlePreview,
                            titleLength: rawNote.title?.length || 0,
                            error: e.message,
                            errorType: e.constructor.name
                        });

                        // For development, you might want to see the raw data
                        if (import.meta.env.DEV) {
                            console.debug('Raw note data for debugging:', rawNote);
                        }

                        // Return a placeholder note instead of null to maintain UI consistency
                        return {
                            id: noteId,
                            title: '[Decryption Failed]',
                            content: '',
                            folderId: folderId,
                            updatedAt: updatedAt,
                            blobId: blobId,
                        } as Note;
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
