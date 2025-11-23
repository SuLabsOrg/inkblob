import React, { createContext, useContext, useState, useEffect } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { useCurrentAccount, useSignPersonalMessage, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { deriveDeviceFingerprint, deriveHotWallet } from '../crypto/sessionKey';
import { SuiService, PACKAGE_ID } from '../services/suiService';
import { fromB64 } from '@mysten/sui/utils';

interface SessionContextValue {
    sessionCap: any | null;
    ephemeralKeypair: Ed25519Keypair | null;
    isSessionValid: boolean;
    authorizeSession: (notebookId: string) => Promise<void>;
    revokeSession: () => Promise<void>;
    isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [sessionCap, setSessionCap] = useState<any | null>(null);
    const [ephemeralKeypair, setEphemeralKeypair] = useState<Ed25519Keypair | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const currentAccount = useCurrentAccount();
    const client = useSuiClient();
    const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const suiService = new SuiService(client);

    const authorizeSession = async (notebookId: string) => {
        if (!currentAccount) return;
        setIsLoading(true);

        try {
            // 1. Derive Hot Wallet (requires user signature)
            // SECURITY FIX (P0): deriveDeviceFingerprint is now async with SHA-256
            const fingerprint = await deriveDeviceFingerprint();

            // Check for fingerprint format migration (old: "device_uuid", new: SHA-256 hex)
            const oldFingerprint = localStorage.getItem('inkblob_last_fingerprint');
            if (oldFingerprint && !oldFingerprint.match(/^[a-f0-9]{64}$/)) {
                console.log('[SessionContext] Fingerprint format changed, clearing old session');
                localStorage.removeItem('inkblob_last_fingerprint');
                setSessionCap(null);
                setEphemeralKeypair(null);
            }
            localStorage.setItem('inkblob_last_fingerprint', fingerprint);

            const message = new TextEncoder().encode(
                `Authorize InkBlob Session\nDevice: ${fingerprint}\nWallet: ${currentAccount.address}`
            );

            const { signature } = await signPersonalMessage({
                message,
            });

            const keypair = await deriveHotWallet(signature, fingerprint);
            setEphemeralKeypair(keypair);
            const hotWalletAddress = keypair.toSuiAddress();

            // 2. Check for existing valid SessionCap
            // We need to query objects owned by the hot wallet
            const ownedObjects = await client.getOwnedObjects({
                owner: hotWalletAddress,
                filter: { StructType: `${PACKAGE_ID}::notebook::SessionCap` },
                options: { showContent: true },
            });

            const validCap = ownedObjects.data.find(obj => {
                const content = obj.data?.content as any;
                if (!content || !content.fields) return false;
                // Check expiration
                const expiresAt = parseInt(content.fields.expires_at);
                return expiresAt > Date.now();
            });

            if (validCap) {
                console.log('Found valid session cap:', validCap.data?.objectId);
                setSessionCap(validCap.data);
            } else {
                console.log('No valid session cap found, creating new one...');
                // 3. Create new SessionCap
                // We need to find a WAL coin first
                // For MVP, we'll just query all coins and pick the first one with balance > 0.5 WAL
                // Note: This assumes the user has WAL coins.
                const walCoins = await client.getCoins({
                    owner: currentAccount.address,
                    coinType: `${PACKAGE_ID}::wal::WAL`, // Replace with actual WAL type
                });

                if (walCoins.data.length === 0) {
                    throw new Error('No WAL coins found. Please faucet some WAL.');
                }

                const walCoinId = walCoins.data[0].coinObjectId;
                const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

                const tx = suiService.authorizeSessionTx(
                    notebookId,
                    fingerprint,
                    hotWalletAddress,
                    expiresAt,
                    undefined, // default SUI
                    undefined, // default WAL
                    walCoinId
                );

                await signAndExecuteTransaction({
                    transaction: tx,
                });

                // 4. Fetch the newly created SessionCap
                // We might need to wait a bit or retry
                // For now, let's just retry the query once
                await new Promise(resolve => setTimeout(resolve, 2000));

                const newOwnedObjects = await client.getOwnedObjects({
                    owner: hotWalletAddress,
                    filter: { StructType: `${PACKAGE_ID}::notebook::SessionCap` },
                    options: { showContent: true },
                });

                if (newOwnedObjects.data.length > 0) {
                    setSessionCap(newOwnedObjects.data[0].data);
                } else {
                    throw new Error('Failed to find SessionCap after creation');
                }
            }

        } catch (error) {
            console.error('Session authorization failed:', error);
            alert('Session authorization failed. See console for details.');
        } finally {
            setIsLoading(false);
        }
    };

    const revokeSession = async () => {
        setSessionCap(null);
        setEphemeralKeypair(null);
        // In a real app, we might also want to call a revoke transaction on-chain
        // to reclaim the funds, but for now we just clear local state.
    };

    return (
        <SessionContext.Provider value={{
            sessionCap,
            ephemeralKeypair,
            isSessionValid: !!sessionCap && !!ephemeralKeypair,
            authorizeSession,
            revokeSession,
            isLoading
        }}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};
