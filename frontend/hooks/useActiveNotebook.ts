import { useActiveNotebookContext } from '../context/ActiveNotebookContext';
import { useEncryption } from '../context/EncryptionContext';
import { useNotebook } from './useNotebook';

export interface ActiveNotebookInfo {
    /** own mode: notebook?.data?.objectId ?? null; shared mode: the shared notebook's id. */
    notebookId: string | null;
    /** own mode: useEncryption().encryptionKey; shared mode: the unwrapped shared content key. */
    encryptionKey: CryptoKey | null;
    isShared: boolean;
    isReadOnly: boolean;
    /** null in own mode. */
    permission: number | null;
    /** null in own mode or when the grant has no expiry. */
    expiresAt: string | null;
}

/**
 * The SINGLE seam every data hook (useFolders/useNotes/useNoteContent/useContentSearchIndex)
 * consumes to know which notebook + which AES-GCM key is currently active. In own mode
 * (ActiveNotebookContext's default) this returns byte-for-byte what those hooks read directly
 * from useNotebook()/useEncryption() before shared viewing existed, so default behavior is
 * provably identical. Kept out of ActiveNotebookContext.tsx to avoid a context -> hooks import
 * cycle (the context file imports from hooks/useSharedAccess).
 */
export function useActiveNotebook(): ActiveNotebookInfo {
    const { active, isShared, isReadOnly } = useActiveNotebookContext();
    const { data: notebook } = useNotebook();
    const { encryptionKey } = useEncryption();

    if (active.kind === 'shared') {
        return {
            notebookId: active.notebookId,
            encryptionKey: active.contentKey,
            isShared,
            isReadOnly,
            permission: active.permission,
            expiresAt: active.expiresAt,
        };
    }

    return {
        notebookId: notebook?.data?.objectId ?? null,
        encryptionKey,
        isShared: false,
        isReadOnly: false,
        permission: null,
        expiresAt: null,
    };
}
