import { useQuery } from '@tanstack/react-query';
import { useEncryption } from '../context/EncryptionContext';
import { downloadInkBlobContent } from '../services/walrus/download';

/**
 * Hook to fetch and decrypt note content from Walrus
 */
export function useNoteContent(blobId: string | null | undefined) {
    const { encryptionKey } = useEncryption();

    return useQuery({
        queryKey: ['note-content', blobId],
        queryFn: async () => {
            if (!blobId || !encryptionKey) {
                return '';
            }

            try {
                console.debug('[useNoteContent] Loading content for blob:', blobId);
                const content = await downloadInkBlobContent(blobId, encryptionKey);
                console.debug('[useNoteContent] Content loaded successfully:', {
                    blobId,
                    contentLength: content.length,
                    contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
                });
                return content;
            } catch (error) {
                console.error('[useNoteContent] Failed to load note content:', {
                    blobId,
                    error: error.message,
                    errorType: error.constructor.name
                });

                // Return empty string as fallback to maintain UI functionality
                return '';
            }
        },
        enabled: !!blobId && !!encryptionKey,
        staleTime: 5 * 60 * 1000, // Cache content for 5 minutes
        retry: 2, // Retry failed downloads twice
    });
}