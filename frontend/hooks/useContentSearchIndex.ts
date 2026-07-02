import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { downloadInkBlobContent } from '../services/walrus/download';
import { Note } from '../types';
import { useActiveNotebook } from './useActiveNotebook';
import { isValidBlobId } from './useNoteContent';

// Body-content search requires decrypting each note's Walrus blob, a real network + crypto cost
// per note - so this only indexes a bounded, recent slice on explicit search intent (search box
// focus / command palette open), not eagerly on every app load.
const MAX_NOTES_TO_INDEX = 50;
const CONCURRENCY = 4;

/**
 * Lazily populates the same react-query cache useNoteContent reads from ('note-content', blobId),
 * so search (NoteList + CommandPalette) can match against real note bodies instead of only titles,
 * without every note needing to have been individually opened first.
 */
export function useContentSearchIndex() {
    const queryClient = useQueryClient();
    // Active-notebook seam: MUST be the same key useNoteContent uses (both read/write the same
    // ['note-content', blobId] cache entries), so shared-notebook blobs are indexed with the
    // shared key and own blobs with the own key. Own mode is identical to before.
    const { encryptionKey } = useActiveNotebook();
    const isIndexingRef = useRef(false);
    // Bumped once a prefetch batch settles, so consumers can force a re-render/re-filter -
    // reading the query cache via getQueryData is a one-time snapshot, not a subscription.
    const [version, setVersion] = useState(0);

    const ensureIndexed = useCallback((notes: Note[]) => {
        if (isIndexingRef.current || !encryptionKey) return;
        isIndexingRef.current = true;

        const candidates = [...notes]
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, MAX_NOTES_TO_INDEX)
            .filter(n => isValidBlobId(n.blobId));

        let cursor = 0;
        const worker = async () => {
            while (cursor < candidates.length) {
                const note = candidates[cursor++];
                await queryClient.prefetchQuery({
                    queryKey: ['note-content', note.blobId],
                    queryFn: () => downloadInkBlobContent(note.blobId, encryptionKey).catch(() => ''),
                    staleTime: 5 * 60 * 1000, // matches useNoteContent's staleTime so caches agree
                });
            }
        };

        Promise.all(Array.from({ length: CONCURRENCY }, worker)).finally(() => {
            isIndexingRef.current = false;
            setVersion(v => v + 1);
        });
    }, [queryClient, encryptionKey]);

    const getIndexedContent = useCallback((blobId: string | undefined | null): string => {
        if (!blobId) return '';
        return queryClient.getQueryData<string>(['note-content', blobId]) ?? '';
    }, [queryClient]);

    return { ensureIndexed, getIndexedContent, indexVersion: version };
}
