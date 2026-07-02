import { useEffect, useRef, useState } from 'react';

// Retry cadence used when a save attempt was *skipped* (not failed) because another operation
// (e.g. the note's own on-chain creation transaction) was still holding the save lock - short
// enough to catch up quickly once the lock clears, without hammering it constantly.
const SKIP_RETRY_DELAY_MS = 1500;
const DEFAULT_DELAY_MS = 2000;

/**
 * Three-way outcome of a save attempt:
 * - 'saved': actually persisted on-chain - safe to clear the dirty flag.
 * - 'skipped': not persisted, but transient (e.g. save-lock held by another in-flight operation,
 *   or a generic/network failure) - retrying soon will likely succeed, so keep dirty and retry.
 * - 'conflict': not persisted, and retrying with the same expected_updated_at is guaranteed to
 *   keep failing (the on-chain note was changed elsewhere - CAS/version mismatch) - keep dirty
 *   (nothing was persisted) but do NOT keep auto-retrying against a doomed transaction.
 */
export type SaveResult = 'saved' | 'skipped' | 'conflict';

interface UseAutosaveOptions {
    noteId: string;
    content: string;
    title: string;
    /**
     * Must return the 3-way outcome of the save attempt - see `SaveResult`. Returning
     * `void`/always-true here would make a skipped or failed save indistinguishable from success,
     * incorrectly clearing the dirty flag; collapsing 'conflict' into the same falsy bucket as
     * 'skipped' would make the autosave loop retry a save that's guaranteed to keep failing.
     */
    onSave: (id: string, options?: { silent?: boolean }) => Promise<SaveResult>;
    /** Reported per noteId (not a bare boolean) so a stale in-flight save for a note the user has
     *  since switched away from can't clobber a different note's dirty status. */
    onDirtyChange?: (noteId: string, isDirty: boolean) => void;
    delayMs?: number;
    /**
     * Default true (all existing behavior). When false - shared-notebook mode, where every save
     * is plain-wallet-signed and a debounced autosave cycle would trigger 1-3 wallet popups -
     * the debounce effect still calls markDirty(true) (so the 'Unsaved changes' indicator,
     * per-id dirty tracking, and the beforeunload warning keep working) but never schedules an
     * automatic save, and the unmount-flush is skipped entirely (a post-navigation wallet popup
     * would be worse than the beforeunload warning we keep). saveNow (the manual Save button)
     * still works and is the only save path.
     */
    enabled?: boolean;
}

interface UseAutosaveResult {
    isSaving: boolean;
    isDirty: boolean;
    /** For the manual Save button - cancels any pending debounce timer and saves immediately
     *  (non-silent), routed through the same state so isDirty/isSaving stay in sync afterward. */
    saveNow: () => Promise<void>;
}

/**
 * Debounced autosave, one instance per open note (the caller unmounts/remounts this along with
 * the Editor itself via `key={note.id}`, so all refs here correctly reset per note).
 *
 * Skips the very first content/title value (the just-loaded state from Walrus, not a user edit),
 * debounces subsequent changes, retries if a save attempt was skipped rather than actually
 * persisted, and flushes an in-flight-dirty save on unmount (note switch) so edits made right
 * before switching away aren't silently lost.
 */
export function useAutosave({
    noteId,
    content,
    title,
    onSave,
    onDirtyChange,
    delayMs = DEFAULT_DELAY_MS,
    enabled = true,
}: UseAutosaveOptions): UseAutosaveResult {
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Refs so the debounce timer and unmount-flush always call the latest save fn/id, not a
    // stale closure captured whenever the timer was scheduled.
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;
    const onDirtyChangeRef = useRef(onDirtyChange);
    onDirtyChangeRef.current = onDirtyChange;
    const noteIdRef = useRef(noteId);
    noteIdRef.current = noteId;

    const isDirtyRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const isFirstChangeRef = useRef(true);
    // Ref mirror so the empty-deps unmount-flush effect and runSave's retry scheduling always
    // see the current enabled value, not the one captured at mount.
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    const markDirty = (value: boolean) => {
        isDirtyRef.current = value;
        setIsDirty(value);
        // Scoped to this hook instance's own noteId - safe even if this fires after a note switch,
        // since the caller tracks dirty state per-id rather than as one shared boolean.
        onDirtyChangeRef.current?.(noteIdRef.current, value);
    };

    const scheduleRetry = (delay: number) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = undefined;
            runSave(true);
        }, delay);
    };

    const runSave = async (silent: boolean) => {
        setIsSaving(true);
        try {
            const result = await onSaveRef.current(noteIdRef.current, { silent });
            if (result === 'saved') {
                markDirty(false);
            } else if (result === 'conflict') {
                // Guaranteed to keep failing with the same expected_updated_at (the on-chain note
                // was changed elsewhere) - do NOT scheduleRetry, that would hammer the same doomed
                // transaction indefinitely. Stay dirty (nothing persisted) but stop the automatic
                // timer-based retry; the user editing more content re-triggers the debounce effect
                // naturally, or they can retry manually via saveNow, once the underlying conflict
                // is resolved (e.g. by reloading the note).
                if (timerRef.current) {
                    clearTimeout(timerRef.current);
                    timerRef.current = undefined;
                }
            } else {
                // Skipped (lock held elsewhere) or a generic/transient failure (error already
                // toasted by onSave) - either way nothing persisted, so stay dirty and try again
                // shortly. Not when autosave is disabled, though: an automatic timer-based retry
                // after a skipped MANUAL save would be exactly the surprise wallet popup the
                // disabled mode exists to prevent - the user just clicks Save again instead.
                if (enabledRef.current) {
                    scheduleRetry(SKIP_RETRY_DELAY_MS);
                }
            }
        } finally {
            setIsSaving(false);
        }
    };

    const saveNow = async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = undefined;
        }
        await runSave(false);
    };

    // Debounce: any content/title change (after the first) schedules a save, cancelling any
    // previously-scheduled one.
    useEffect(() => {
        if (isFirstChangeRef.current) {
            isFirstChangeRef.current = false;
            return;
        }

        markDirty(true);
        // Disabled (shared-notebook) mode: keep the dirty tracking above (status text +
        // beforeunload warning) but never schedule an automatic save - manual saveNow only.
        if (enabled) {
            scheduleRetry(delayMs);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = undefined;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content, title, delayMs]);

    // A pending debounce timer scheduled while enabled must not survive `enabled` flipping to
    // false (entering shared mode): timers call runSave via the LATEST onSave closure, which by
    // that point already targets the shared notebook - letting the timer fire would attempt a
    // cross-notebook save (an on-chain abort + surprise wallet popup at best).
    useEffect(() => {
        if (!enabled && timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = undefined;
        }
    }, [enabled]);

    // Flush on unmount (note switch) - fire-and-forget; onSave is a plain async closure over
    // app-level state, unaffected by this hook's/Editor's unmount. Retries a few times if the
    // save keeps getting skipped (e.g. the note's own creation tx is still in flight), since
    // this is the last chance to persist an edit made right before switching away.
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = undefined;
            }
            // Disabled (shared-notebook) mode: no unmount flush - it would pop wallet approval
            // dialogs AFTER the user already navigated away. The beforeunload warning (driven by
            // the dirty tracking that stays active) is the data-loss guard instead.
            if (!enabledRef.current) return;
            if (!isDirtyRef.current) return;

            const id = noteIdRef.current;
            const save = onSaveRef.current;
            const onDirty = onDirtyChangeRef.current;
            (async () => {
                for (let attempt = 0; attempt < 5; attempt++) {
                    const result = await save(id, { silent: true }).catch<SaveResult>(() => 'skipped');
                    if (result === 'saved') {
                        // Safe post-unmount: this only touches the (still-mounted) parent's own
                        // ref/state via the onDirtyChange callback, not anything on this component.
                        onDirty?.(id, false);
                        return;
                    }
                    if (result === 'conflict') {
                        // Guaranteed to keep failing against the same expected_updated_at - looping
                        // through the remaining attempts would just hammer a doomed transaction.
                        // Leave dirty as-is (nothing persisted) and stop immediately.
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, SKIP_RETRY_DELAY_MS));
                }
            })();
        };
    }, []);

    return { isSaving, isDirty, saveNow };
}
