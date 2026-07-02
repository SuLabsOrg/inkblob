import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from './Modal';
import { useEncryption } from '../context/EncryptionContext';
import { useToast } from '../context/ToastContext';
import { deriveEncryptionKeyRawBits, wrapContentKeyForGrantee } from '../crypto/keySharing';
import { PERMISSION_READ, PERMISSION_WRITE, useSharedAccess } from '../hooks/useSharedAccess';
import { useSuiService } from '../hooks/useSuiService';
import { sanitizeWeb3Error } from '../utils/toastUtils';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    notebookId: string | null;
}

const isValidSuiAddress = (address: string): boolean => /^0x[0-9a-fA-F]{64}$/.test(address.trim());

/**
 * On-chain "access management" for the current notebook - grants/revokes read/write
 * *authorization* to mutate/read notebook state via the Move contract's grant_access/
 * revoke_access. This app end-to-end encrypts note content with a key derived from the
 * owner's wallet signature (see frontend/crypto/hotWalletStorage.ts,
 * frontend/context/SessionContext.tsx), so Move-level authorization alone does not hand
 * over that key. As of the envelope-encryption key-sharing feature (see
 * frontend/crypto/keySharing.ts), granting access here ALSO best-effort wraps a usable
 * copy of the content-encryption key for the grantee IF they have previously registered
 * an encryption public key (i.e. opened InkBlob and connected their wallet at least once).
 * If they haven't, the on-chain permission is still granted (never blocked on this), but
 * the grantee will not be able to decrypt existing content until they do so and are
 * re-shared with. See the disclaimer banner below, which must stay visible and not be
 * watered down.
 */
export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, notebookId }) => {
    const [granteeAddress, setGranteeAddress] = useState('');
    const [permission, setPermission] = useState<0 | 1>(PERMISSION_WRITE);
    const [isGranting, setIsGranting] = useState(false);
    const [revokingAddress, setRevokingAddress] = useState<string | null>(null);

    const toast = useToast();
    const suiService = useSuiService();
    const queryClient = useQueryClient();
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const { data: grants, isLoading: isLoadingGrants } = useSharedAccess();
    // Needed to wrap a real copy of the notebook owner's content-encryption key for the
    // grantee (see handleGrant below) - lastSignature/lastUserAddress are the SAME cached
    // owner wallet signature/address deriveEncryptionKey already used, reused here only to
    // independently re-derive the identical key bytes in extractable form via
    // deriveEncryptionKeyRawBits (see keySharing.ts) - never touches encryptionKey itself.
    const { lastSignature, lastUserAddress } = useEncryption();

    const resetForm = () => {
        setGranteeAddress('');
        setPermission(PERMISSION_WRITE);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleGrant = async () => {
        if (!notebookId) return;
        const trimmed = granteeAddress.trim();

        if (!isValidSuiAddress(trimmed)) {
            toast.error('Invalid Address', 'Enter a valid Sui address (0x followed by 64 hex characters).');
            return;
        }

        setIsGranting(true);
        try {
            // Try to look up the grantee's registered envelope-encryption public key so we can
            // wrap a usable copy of the content-encryption key for them. This is best-effort:
            // if it's not available (they've never opened InkBlob / connected their wallet), we
            // still proceed with a plain on-chain permission grant (empty wrapped key) rather
            // than blocking access - Move-level permission and content decryption are
            // independent, and the contract explicitly allows an empty wrapped_key.
            let wrappedKey = new Uint8Array(0);
            let granteeHasNoRegisteredKey = false;

            const registryId = await suiService.fetchEncryptionKeyRegistryId();
            if (registryId) {
                const granteePublicKey = await suiService.fetchEncryptionPublicKey(registryId, trimmed);
                if (!granteePublicKey) {
                    granteeHasNoRegisteredKey = true;
                } else if (lastSignature && lastUserAddress) {
                    const ownerRawKey = await deriveEncryptionKeyRawBits(lastSignature, lastUserAddress);
                    wrappedKey = await wrapContentKeyForGrantee(ownerRawKey, granteePublicKey);
                } else {
                    // Grantee has a registered public key, but we have no cached owner
                    // signature to derive the content key from (should not normally happen
                    // here, since reaching ShareModal requires an unlocked session) - fall back
                    // to the same "no wrapped key" messaging rather than silently granting
                    // permission-only access without telling the user why.
                    console.warn('[ShareModal] No cached owner signature available - cannot wrap content key this time.');
                    granteeHasNoRegisteredKey = true;
                }
            } else {
                granteeHasNoRegisteredKey = true;
            }

            const tx = suiService.grantAccessTx(notebookId, trimmed, permission, null, wrappedKey);
            await signAndExecuteTransaction({ transaction: tx });

            if (granteeHasNoRegisteredKey) {
                toast.info(
                    'Access Granted - Encryption Not Set Up Yet',
                    `${trimmed.slice(0, 6)}...${trimmed.slice(-4)} can now ${permission === PERMISSION_WRITE ? 'edit' : 'view access to'} this notebook on-chain. ` +
                    `This address has not set up InkBlob encryption yet - ask them to open InkBlob and connect their wallet at least once, then try sharing again.`
                );
            } else {
                toast.success(
                    'Access Granted',
                    `${trimmed.slice(0, 6)}...${trimmed.slice(-4)} can now ${permission === PERMISSION_WRITE ? 'edit' : 'view access to'} this notebook on-chain, and can decrypt its content.`
                );
            }
            resetForm();
            queryClient.invalidateQueries({ queryKey: ['sharedAccess', notebookId] });
        } catch (error) {
            console.error('Failed to grant access:', error);
            const errorInfo = sanitizeWeb3Error(error);
            toast.error(errorInfo.title, 'Access could not be granted. ' + errorInfo.description);
        } finally {
            setIsGranting(false);
        }
    };

    const handleRevoke = async (sharedAccessObjectId: string, address: string) => {
        if (!notebookId) return;

        setRevokingAddress(address);
        try {
            const tx = suiService.revokeAccessTx(notebookId, sharedAccessObjectId);
            await signAndExecuteTransaction({ transaction: tx });

            toast.success('Access Revoked', `${address.slice(0, 6)}...${address.slice(-4)} no longer has access to this notebook.`);
            queryClient.invalidateQueries({ queryKey: ['sharedAccess', notebookId] });
        } catch (error) {
            console.error('Failed to revoke access:', error);
            const errorInfo = sanitizeWeb3Error(error);
            toast.error(errorInfo.title, 'Access could not be revoked. ' + errorInfo.description);
        } finally {
            setRevokingAddress(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Share Notebook Access" className="w-full max-w-lg">
            <div className="flex flex-col gap-4">
                {/* Prominent, unmissable disclaimer - do not remove or soften this copy. */}
                <div className="flex gap-3 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
                    <ShieldAlert size={20} className="shrink-0 mt-0.5 text-yellow-400" />
                    <p className="text-sm leading-snug">
                        This grants on-chain write/read <strong>permission</strong> to this notebook, and
                        also shares a copy of the content-encryption key with the recipient <strong>if</strong>{' '}
                        they have already opened InkBlob and connected their wallet at least once. If they
                        haven't, permission is still granted, but they will <strong>not</strong> be able to
                        view existing note content until they do so and are shared with again.
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-web3-textMuted uppercase tracking-wide">
                        Sui Address
                    </label>
                    <input
                        type="text"
                        placeholder="0x..."
                        value={granteeAddress}
                        onChange={(e) => setGranteeAddress(e.target.value)}
                        className="w-full bg-web3-bg/50 px-4 py-2 rounded-lg border border-web3-border focus:border-web3-primary focus:ring-1 focus:ring-web3-primary outline-none text-web3-text font-mono text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleGrant();
                        }}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-web3-textMuted uppercase tracking-wide">
                        Permission
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPermission(PERMISSION_WRITE)}
                            className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                permission === PERMISSION_WRITE
                                    ? 'border-web3-primary bg-web3-primary/10 text-web3-primary'
                                    : 'border-web3-border text-web3-textMuted hover:bg-web3-cardHover'
                            }`}
                        >
                            Write (edit + view access)
                        </button>
                        <button
                            type="button"
                            onClick={() => setPermission(PERMISSION_READ)}
                            className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                permission === PERMISSION_READ
                                    ? 'border-web3-primary bg-web3-primary/10 text-web3-primary'
                                    : 'border-web3-border text-web3-textMuted hover:bg-web3-cardHover'
                            }`}
                        >
                            Read only
                        </button>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 rounded-lg text-web3-textMuted hover:bg-web3-cardHover transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleGrant}
                        disabled={isGranting || !granteeAddress.trim()}
                        className={`px-4 py-2 rounded-lg bg-web3-primary text-white hover:bg-web3-primary/90 transition-colors font-medium ${
                            isGranting || !granteeAddress.trim() ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isGranting ? 'Granting...' : 'Grant Access'}
                    </button>
                </div>

                <div className="border-t border-web3-border/50 pt-4 mt-1">
                    <h4 className="text-xs font-semibold text-web3-textMuted uppercase tracking-wide mb-2">
                        Currently Granted
                    </h4>

                    {isLoadingGrants && (
                        <p className="text-sm text-web3-textMuted">Loading current grants...</p>
                    )}

                    {!isLoadingGrants && (!grants || grants.length === 0) && (
                        <p className="text-sm text-web3-textMuted">No one else has been granted access yet.</p>
                    )}

                    {!isLoadingGrants && grants && grants.length > 0 && (
                        <ul className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                            {grants.map((grant) => (
                                <li
                                    key={grant.address}
                                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-web3-border/50 bg-web3-bg/30"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-mono text-web3-text truncate">
                                            {grant.address.slice(0, 10)}...{grant.address.slice(-6)}
                                        </p>
                                        <p className="text-xs text-web3-textMuted">
                                            {grant.permission === PERMISSION_WRITE ? 'Write' : 'Read only'}
                                            {grant.isExpired ? ' - expired' : ''}
                                        </p>
                                    </div>
                                    {grant.sharedAccessObjectId ? (
                                        <button
                                            onClick={() => handleRevoke(grant.sharedAccessObjectId!, grant.address)}
                                            disabled={revokingAddress === grant.address}
                                            title="Revoke access"
                                            aria-label={`Revoke access for ${grant.address}`}
                                            className={`shrink-0 p-1.5 rounded-md hover:bg-red-500/10 text-web3-textMuted hover:text-red-400 transition-colors ${
                                                revokingAddress === grant.address ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    ) : (
                                        <span
                                            title="Could not locate the on-chain capability object for this grant (event history unavailable) - it cannot be revoked from this UI."
                                            className="shrink-0 p-1.5 text-web3-textMuted/50"
                                        >
                                            <AlertTriangle size={15} />
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </Modal>
    );
};
