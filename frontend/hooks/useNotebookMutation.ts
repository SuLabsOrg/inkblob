import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useEffect, useRef } from 'react';
import { useEncryption } from '../context/EncryptionContext';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { sanitizeWeb3Error } from '../utils/toastUtils';
import { useSuiService } from './useSuiService';

interface AuthorizedSigner {
    sessionCap: any;
    ephemeralKeypair: any;
}

interface SessionMutationBuilders {
    session: (sessionCapId: string) => Transaction;
    wallet: () => Transaction;
}

/**
 * Shared session-authorization + transaction-execution logic, extracted out of the near-identical
 * blocks that used to live separately in App.tsx's handleCreateNote and handleSaveNote.
 *
 * Only note create/update have a session-capable (`_with_session`) contract path today - every
 * folder/move mutation is wallet-only on-chain, so runWalletOnlyMutation exists purely to keep
 * call sites uniform, not because there's a signer choice to make for those.
 */
export function useNotebookMutation() {
    const currentAccount = useCurrentAccount();
    const { lastSignature, lastUserAddress } = useEncryption();
    const {
        isSessionValid,
        sessionCap,
        ephemeralKeypair,
        authorizeSession,
        authorizeSessionWithSignature,
    } = useSession();
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const suiService = useSuiService();
    const toast = useToast();

    // Once the user declines the session-enrollment prompt, stop re-asking for the rest of this
    // app session - without this, autosave (which calls ensureSessionAuthorized far more often
    // than the old manual-save-only flow did: every debounce cycle and every note switch) would
    // re-show the same confirm dialog repeatedly after a single "Not Now". Reset on account
    // switch, since declining for one wallet shouldn't silently suppress the prompt for another.
    const hasDeclinedSessionPromptRef = useRef(false);
    useEffect(() => {
        hasDeclinedSessionPromptRef.current = false;
    }, [currentAccount?.address]);

    /**
     * If there's already a valid session, reuse it. Otherwise offers the user a one-time prompt to
     * enroll a session (reusing the unlock signature when possible), returning null on decline or
     * failure so the caller falls back to plain wallet signing.
     */
    const ensureSessionAuthorized = async (notebookId: string): Promise<AuthorizedSigner | null> => {
        if (isSessionValid && sessionCap && ephemeralKeypair) {
            return { sessionCap, ephemeralKeypair };
        }

        if (hasDeclinedSessionPromptRef.current) {
            return null;
        }

        const userConfirmed = await toast.confirm({
            title: 'Enable Frictionless Note Saving?',
            description: 'This will create a session key for this device, allowing you to save notes without signing every transaction.\n\nYou will need to sign twice now, but future saves will be automatic.',
            confirmLabel: 'Enable',
            cancelLabel: 'Not Now',
        });

        if (!userConfirmed) {
            hasDeclinedSessionPromptRef.current = true;
            return null;
        }

        try {
            if (lastSignature && lastUserAddress === currentAccount?.address) {
                return await authorizeSessionWithSignature(notebookId, lastSignature, lastUserAddress);
            }
            return await authorizeSession(notebookId);
        } catch (authError: any) {
            if (authError?.message?.includes('WAL')) {
                toast.info(
                    'Session authorization requires WAL tokens',
                    'You can get WAL tokens from the testnet faucet. For now, each save will require a signature.'
                );
            } else if (authError?.message?.includes('User rejected')) {
                toast.info('Session Cancelled', 'You chose not to authorize session. Continuing with wallet signing.');
            } else {
                const errorInfo = sanitizeWeb3Error(authError);
                toast.error(errorInfo.title, 'Continuing with regular wallet signing instead. ' + errorInfo.description);
            }
            return null;
        }
    };

    /**
     * Executes a sessionable transaction pair given an already-resolved signer (or null for
     * wallet-only signing).
     */
    const executeWithSigner = async <T,>(signer: AuthorizedSigner | null, builders: SessionMutationBuilders): Promise<T> => {
        if (signer) {
            const tx = builders.session(signer.sessionCap.objectId);
            return suiService.executeWithSession(tx, signer.ephemeralKeypair);
        }

        const tx = builders.wallet();
        return signAndExecuteTransaction({ transaction: tx }) as Promise<T>;
    };

    /**
     * Runs a mutation that has both a session-capable and wallet-only contract path (note create/update).
     */
    const runSessionableMutation = async <T,>(notebookId: string, builders: SessionMutationBuilders): Promise<T> => {
        const signer = await ensureSessionAuthorized(notebookId);
        return executeWithSigner(signer, builders);
    };

    /**
     * Runs a mutation with no session-capable contract path (folder create/rename/reorder/delete,
     * note move) - always signs via the connected wallet.
     */
    const runWalletOnlyMutation = async <T,>(txBuilder: () => Transaction): Promise<T> => {
        const tx = txBuilder();
        return signAndExecuteTransaction({ transaction: tx }) as Promise<T>;
    };

    return { ensureSessionAuthorized, executeWithSigner, runSessionableMutation, runWalletOnlyMutation };
}
