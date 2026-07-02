import { useCurrentAccount } from '@mysten/dapp-kit';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useEncryption } from './EncryptionContext';
import { PERMISSION_READ } from '../hooks/useSharedAccess';

/**
 * Which notebook the app is currently viewing/editing:
 * - 'own' (the default): the connected wallet's own notebook, exactly as before this context
 *   existed - every consumer falls back to useNotebook()/useEncryption() values, so own-mode
 *   behavior is byte-for-byte identical to the pre-shared-viewing app.
 * - 'shared': a notebook someone else owns, opened from SharedNotebooksModal after successfully
 *   unwrapping the owner's wrapped content key (envelope key-sharing). The unwrapped AES-GCM
 *   CryptoKey lives ONLY here, in React state - never persisted to any storage, never placed in
 *   a query-cache value, and imported non-extractable so it can't be exported even by a bug.
 */
export type ActiveNotebookState =
    | { kind: 'own' }
    | {
          kind: 'shared';
          /** The shared Notebook's on-chain object id. */
          notebookId: string;
          /** PERMISSION_READ (0) | PERMISSION_WRITE (1) - governs UI mode + on-chain write enforcement. */
          permission: number;
          /** ms-epoch string from the AccessGrant, for banner display only; null = no expiry. */
          expiresAt: string | null;
          /** AES-GCM, extractable:false, usages ['encrypt','decrypt'], memory only. */
          contentKey: CryptoKey;
      };

interface ActiveNotebookContextValue {
    active: ActiveNotebookState;
    enterShared: (entry: Omit<Extract<ActiveNotebookState, { kind: 'shared' }>, 'kind'>) => void;
    exitShared: () => void;
    /** active.kind === 'shared' - derived once here so consumers don't re-derive it. */
    isShared: boolean;
    /** isShared && active.permission === PERMISSION_READ. */
    isReadOnly: boolean;
}

const ActiveNotebookContext = createContext<ActiveNotebookContextValue | null>(null);

export const ActiveNotebookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [active, setActive] = useState<ActiveNotebookState>({ kind: 'own' });
    const currentAccount = useCurrentAccount();
    const { encryptionKey } = useEncryption();

    const address = currentAccount?.address ?? null;

    // Force-reset to own mode (dropping the shared contentKey reference) whenever the connected
    // wallet changes - a different account must never inherit the previous account's shared key.
    useEffect(() => {
        setActive({ kind: 'own' });
    }, [address]);

    // Same on encryption lock: the render chain would show the unlock screen anyway, this just
    // guarantees the shared CryptoKey object becomes unreferenced at the same moment the own key does.
    useEffect(() => {
        if (!encryptionKey) {
            setActive({ kind: 'own' });
        }
    }, [encryptionKey]);

    const value = useMemo<ActiveNotebookContextValue>(() => {
        const isShared = active.kind === 'shared';
        return {
            active,
            enterShared: (entry) => setActive({ kind: 'shared', ...entry }),
            exitShared: () => setActive({ kind: 'own' }),
            isShared,
            isReadOnly: isShared && active.permission === PERMISSION_READ,
        };
    }, [active]);

    return <ActiveNotebookContext.Provider value={value}>{children}</ActiveNotebookContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- same provider+hook file shape as every other context in this app; suppressed (rather than left as a new warning) to keep the project's exact lint-warning baseline
export const useActiveNotebookContext = (): ActiveNotebookContextValue => {
    const context = useContext(ActiveNotebookContext);
    if (!context) {
        throw new Error('useActiveNotebookContext must be used within an ActiveNotebookProvider');
    }
    return context;
};
