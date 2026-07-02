import { KeyRound, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import React, { useState } from 'react';
import { Modal } from './Modal';
import { useActiveNotebookContext } from '../context/ActiveNotebookContext';
import { useEncryption } from '../context/EncryptionContext';
import { useToast } from '../context/ToastContext';
import { decryptText } from '../crypto/decryption';
import { deriveX25519KeyPair, unwrapContentKey } from '../crypto/keySharing';
import { PERMISSION_WRITE } from '../hooks/useSharedAccess';
import { SharedNotebookEntry, useSharedNotebooks } from '../hooks/useSharedNotebooks';
import { useSuiService } from '../hooks/useSuiService';

interface SharedNotebooksModalProps {
    isOpen: boolean;
    onClose: () => void;
    /**
     * Read at Open-click time (a callback, not a boolean prop, so the ref-backed dirty state in
     * App.tsx is always current). Entering shared mode resets the workspace and skips the
     * autosave unmount-flush (flushing would target the SHARED notebook - see useAutosave's
     * enabled doc), so any not-yet-flushed edits would be silently dropped; this lets us confirm
     * with the user first instead.
     */
    getHasUnsavedChanges?: () => boolean;
}

type VerifyOutcome =
    | { status: 'no-key'; notebookId: string }
    | { status: 'error'; notebookId: string; message: string };

/**
 * Discovery UI for notebooks OTHER people have shared with the current wallet (see
 * useSharedNotebooks / fetchNotebooksSharedWithMe) - the grantee-side counterpart to ShareModal
 * (which is the owner-side "who have I granted access to" UI for the user's own notebook).
 *
 * "Open" actually switches the app into the shared notebook: it fetches this user's
 * wrapped_content_key, unwraps it with their own long-term X25519 private key, imports the
 * recovered raw bytes as a non-extractable AES-GCM CryptoKey (encrypt+decrypt - write-mode saves
 * re-encrypt with this same key, byte-identical to the owner's, so owner decryptability is
 * preserved), validates it by decrypting a real folder name where one exists, then hands the key
 * to ActiveNotebookContext via enterShared and closes this modal. App.tsx renders the shared
 * notebook (read-only or writable per the grant's permission) with a persistent SharedModeBanner
 * until the user exits.
 */
export const SharedNotebooksModal: React.FC<SharedNotebooksModalProps> = ({ isOpen, onClose, getHasUnsavedChanges }) => {
    const { data: sharedNotebooks, isLoading } = useSharedNotebooks();
    const { lastSignature, lastUserAddress } = useEncryption();
    const { enterShared } = useActiveNotebookContext();
    const suiService = useSuiService();
    const toast = useToast();

    // Per-notebook verification state - keyed by notebookId so multiple rows can be
    // in-flight/resolved independently without clobbering each other.
    const [verifying, setVerifying] = useState<Record<string, boolean>>({});
    const [results, setResults] = useState<Record<string, VerifyOutcome>>({});

    const truncate = (id: string) => `${id.slice(0, 10)}...${id.slice(-6)}`;

    /**
     * Opens a shared notebook for real: unwrap the wrapped_content_key this notebook's owner
     * shared with ME (the current grantee), validate it by decrypting a real folder name, then
     * enter shared-viewing mode (ActiveNotebookContext.enterShared) and close the modal. Uses MY
     * OWN cached wallet signature (lastSignature/lastUserAddress from useEncryption) to re-derive
     * MY long-term X25519 private key - never the notebook owner's - since only the grantee's
     * own private key can unwrap a blob that was wrapped for the grantee's public key.
     */
    const handleOpen = async (entry: SharedNotebookEntry) => {
        const notebookId = entry.notebookId;
        if (!lastSignature || !lastUserAddress) {
            toast.error(
                'Not Unlocked',
                'Your encryption session is not unlocked, so a decryption key cannot be derived. Reconnect your wallet and try again.'
            );
            return;
        }

        // Entering shared mode resets the workspace and deliberately skips the autosave
        // unmount-flush (see getHasUnsavedChanges' doc) - so edits still inside the autosave
        // debounce window would be silently lost. Confirm rather than surprise.
        if (getHasUnsavedChanges?.()) {
            const proceed = await toast.confirm({
                title: 'Unsaved Changes',
                description: 'You have edits that haven\'t been saved yet. Opening a shared notebook will discard them. Save first, or continue and discard.',
                confirmLabel: 'Discard & Open',
                cancelLabel: 'Cancel',
            });
            if (!proceed) return;
        }

        setVerifying((prev) => ({ ...prev, [notebookId]: true }));
        setResults((prev) => {
            const next = { ...prev };
            delete next[notebookId];
            return next;
        });

        try {
            // 1. Fetch the wrapped content key this notebook's owner shared with ME.
            const wrappedKey = await suiService.fetchWrappedContentKey(notebookId, lastUserAddress);
            if (!wrappedKey) {
                setResults((prev) => ({ ...prev, [notebookId]: { status: 'no-key', notebookId } }));
                return;
            }

            // 2. Derive MY OWN long-term X25519 private key from MY OWN cached signature, and
            //    unwrap the content key that was wrapped for my matching public key.
            const { privateKey: myPrivateKey } = await deriveX25519KeyPair(lastSignature);
            const rawContentKeyBytes = await unwrapContentKey(wrappedKey, myPrivateKey);

            // 3. Import the recovered raw bytes as a non-extractable AES-GCM CryptoKey with BOTH
            //    usages: write-grant mode re-encrypts saved titles/content with this key, and the
            //    bytes are identical to the owner's own key, so everything a grantee saves stays
            //    decryptable by the owner. Granting 'encrypt' to a read-only session is harmless -
            //    read-only mode has no encrypt call sites. Non-extractable so even a later bug
            //    can't export the raw key material.
            const contentKey = await crypto.subtle.importKey(
                'raw',
                rawContentKeyBytes,
                { name: 'AES-GCM' },
                false,
                ['encrypt', 'decrypt']
            );
            // Best-effort scrub of the raw key bytes now that the (non-extractable) CryptoKey exists.
            rawContentKeyBytes.fill(0);

            // 4. Lightweight validation before actually entering shared mode: decrypt one real
            //    folder name where one exists, proving the recovered key is correct (not merely
            //    that unwrap didn't throw). A notebook with no folders skips this - the key
            //    unwrapped cleanly, which is all that can be checked.
            const rawFolders = await suiService.fetchFolders(notebookId);
            const firstNamed = rawFolders.find((f) => !!f?.encrypted_name);
            if (firstNamed) {
                await decryptText(firstNamed.encrypted_name, contentKey);
            }

            // 5. Switch the app into the shared notebook and close the modal.
            enterShared({
                notebookId,
                permission: entry.permission,
                expiresAt: entry.expiresAt,
                contentKey,
            });
            onClose();
        } catch (error) {
            console.error('[SharedNotebooksModal] Failed to open shared notebook:', notebookId, error);
            setResults((prev) => ({
                ...prev,
                [notebookId]: {
                    status: 'error',
                    notebookId,
                    message: error instanceof Error ? error.message : 'Unknown error',
                },
            }));
        } finally {
            setVerifying((prev) => ({ ...prev, [notebookId]: false }));
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Shared With Me" className="w-full max-w-lg">
            <div className="flex flex-col gap-4">
                <div className="flex gap-3 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
                    <ShieldAlert size={20} className="shrink-0 mt-0.5 text-yellow-400" />
                    <p className="text-sm leading-snug">
                        These are notebooks whose owner granted this wallet on-chain access. A
                        notebook does not store its own name where a grantee can read it, so
                        only the notebook's id is shown below. "Open" unwraps the decryption key
                        the owner shared with you and switches this app into that notebook -
                        read-only or editable depending on your grant.
                    </p>
                </div>

                {isLoading && (
                    <p className="text-sm text-web3-textMuted">Looking for notebooks shared with you...</p>
                )}

                {!isLoading && (!sharedNotebooks || sharedNotebooks.length === 0) && (
                    <p className="text-sm text-web3-textMuted">No one has shared a notebook with this wallet yet.</p>
                )}

                {!isLoading && sharedNotebooks && sharedNotebooks.length > 0 && (
                    <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar">
                        {sharedNotebooks.map((entry) => {
                            const result = results[entry.notebookId];
                            const isVerifying = !!verifying[entry.notebookId];

                            return (
                                <li
                                    key={entry.notebookId}
                                    className="flex flex-col gap-2 px-3 py-2 rounded-lg border border-web3-border/50 bg-web3-bg/30"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-mono text-web3-text truncate">
                                                {truncate(entry.notebookId)}
                                            </p>
                                            <p className="text-xs text-web3-textMuted">
                                                {entry.permission === PERMISSION_WRITE ? 'Write' : 'Read only'}
                                                {entry.expiresAt ? ` - expires ${new Date(Number(entry.expiresAt)).toLocaleDateString()}` : ''}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleOpen(entry)}
                                            disabled={isVerifying}
                                            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-web3-border text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-text transition-colors ${
                                                isVerifying ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                        >
                                            {isVerifying ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" /> Opening...
                                                </>
                                            ) : (
                                                <>
                                                    <KeyRound size={14} /> Open
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {result?.status === 'no-key' && (
                                        <div className="flex gap-2 px-2.5 py-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
                                            <ShieldAlert size={14} className="shrink-0 mt-0.5 text-yellow-400" />
                                            <p className="text-xs leading-snug">
                                                No decryption key has been shared with you for this notebook
                                                yet (the owner hasn't shared, or shared before you registered
                                                your encryption key). You have on-chain permission, but cannot
                                                decrypt its content yet.
                                            </p>
                                        </div>
                                    )}

                                    {result?.status === 'error' && (
                                        <div className="flex gap-2 px-2.5 py-2 rounded-md border border-red-500/30 bg-red-500/10 text-red-200">
                                            <XCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
                                            <p className="text-xs leading-snug">
                                                Could not open this notebook: {result.message}. This is a
                                                genuine decryption/unwrap failure, not simply "no key shared
                                                yet" - the shared key may be corrupted or mismatched.
                                            </p>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className="flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-web3-textMuted hover:bg-web3-cardHover transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
};
