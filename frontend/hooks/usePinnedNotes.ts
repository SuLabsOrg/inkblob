import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inkblob_pinned_notes';

function loadPinned(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

/**
 * Note has no on-chain pin field (would need a contract change), so pinning is device-local only
 * - it does not sync across devices. Shaped as { pinnedIds, togglePin } so a future chain-backed
 * implementation could satisfy the same interface without changing call sites.
 */
export function usePinnedNotes() {
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(loadPinned);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(pinnedIds)));
    }, [pinnedIds]);

    const togglePin = useCallback((noteId: string) => {
        setPinnedIds(prev => {
            const next = new Set(prev);
            if (next.has(noteId)) next.delete(noteId);
            else next.add(noteId);
            return next;
        });
    }, []);

    return { pinnedIds, togglePin };
}
