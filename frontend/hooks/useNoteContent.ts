import { useQuery } from '@tanstack/react-query';
import { downloadInkBlobContent } from '../services/walrus/download';
import { useActiveNotebook } from './useActiveNotebook';

/**
 * Check if a blob ID is valid for fetching from Walrus
 * Filters out placeholder values and invalid formats
 */
export function isValidBlobId(blobId: string | null | undefined): blobId is string {
    // Check for null/undefined/empty
    if (!blobId || blobId.trim() === '') {
        return false;
    }

    // Check for known placeholder values used in SuiService
    const placeholderValues = ['temp_blob_id', 'temp_blob_object_id'];
    if (placeholderValues.includes(blobId)) {
        console.debug(`[useNoteContent] Skipping placeholder blob ID: ${blobId}`);
        return false;
    }

    // Basic format validation (blob IDs should be reasonably long strings)
    // This is a simple check to avoid obviously invalid IDs
    if (blobId.length < 10) {
        console.debug(`[useNoteContent] Skipping blob ID that's too short: ${blobId}`);
        return false;
    }

    return true;
}

/**
 * Hook to fetch and decrypt note content from Walrus
 */
export function useNoteContent(blobId: string | null | undefined) {
    // Active-notebook seam: own mode = the own encryption key (identical to before), shared mode
    // = the unwrapped shared content key. The queryKey stays ['note-content', blobId] - safe
    // because a given blobId belongs to exactly one notebook, so the blobId -> correct-key
    // mapping is deterministic and cached plaintext can't be poisoned across modes.
    const { encryptionKey } = useActiveNotebook();

    return useQuery({
        queryKey: ['note-content', blobId],
        queryFn: async () => {
            if (!blobId || !encryptionKey) {
                return '';
            }

            // Validate blob ID before attempting download
            if (!isValidBlobId(blobId)) {
                console.debug('[useNoteContent] Invalid or placeholder blob ID detected, skipping download:', blobId);
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
        enabled: !!blobId && !!encryptionKey && isValidBlobId(blobId),
        staleTime: 5 * 60 * 1000, // Cache content for 5 minutes
        retry: 2, // Retry failed downloads twice
    });
}