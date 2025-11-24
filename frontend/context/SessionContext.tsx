import { useCurrentAccount, useSignAndExecuteTransaction, useSignPersonalMessage, useSuiClient } from '@mysten/dapp-kit';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
    clearHotWallet,
    getHotWalletInfo,
    hasValidStoredHotWallet,
    retrieveHotWallet,
    storeHotWallet,
} from '../crypto/hotWalletStorage';
import { KEY_DERIVATION_MESSAGE, deriveHotWalletFromSignature } from '../crypto/keyDerivation';
import { deriveDeviceFingerprint } from '../crypto/sessionKey';
import { PACKAGE_ID, SuiService } from '../services/suiService';
import { retryUntil } from '../utils/retry';

interface SessionAuthResult {
    sessionCap: any;
    ephemeralKeypair: Ed25519Keypair;
    hotWalletAddress: string;
    expiresAt: number;
}

interface SessionContextValue {
    sessionCap: any | null;
    ephemeralKeypair: Ed25519Keypair | null;
    isSessionValid: boolean;
    sessionExpiresAt: number | null;
    hotWalletAddress: string | null;
    authorizeSession: (notebookId: string) => Promise<SessionAuthResult>;
    authorizeSessionWithSignature: (notebookId: string, signature: string, userAddress: string) => Promise<SessionAuthResult>;
    revokeSession: () => Promise<void>;
    refreshSession: () => Promise<void>;
    loadStoredSession: () => Promise<void>; // Added for manual session restoration
    isLoading: boolean;
    error: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Session expiration warning threshold (1 hour before expiration)
const EXPIRATION_WARNING_THRESHOLD = 60 * 60 * 1000;

// WAL token testnet faucet URL
const WAL_FAUCET_URL = 'https://faucet.testnet.walrus.space';

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [sessionCap, setSessionCap] = useState<any | null>(null);
    const [ephemeralKeypair, setEphemeralKeypair] = useState<Ed25519Keypair | null>(null);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
    const [hotWalletAddress, setHotWalletAddress] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentAccount = useCurrentAccount();
    const client = useSuiClient();
    const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const suiService = new SuiService(client);

    /**
     * Load existing session from encrypted localStorage
     */
    const loadStoredSession = useCallback(async () => {
        if (!currentAccount) return;

        try {
            const fingerprint = await deriveDeviceFingerprint();

            // Check if we have a valid stored hot wallet
            const hasStored = await hasValidStoredHotWallet(fingerprint);
            if (!hasStored) {
                console.log('[SessionContext] No valid stored session found');
                return;
            }

            // Get session info for display
            const info = getHotWalletInfo(fingerprint);
            if (!info) return;

            console.log('[SessionContext] Found stored session, attempting to restore...');

            // Request signature for hot wallet encryption (OPTIMIZATION: reuse content encryption signature)
            const encryptionMessage = new TextEncoder().encode(KEY_DERIVATION_MESSAGE);
            const { signature: encryptionSignature } = await signPersonalMessage({
                message: encryptionMessage,
            });

            // Retrieve and decrypt hot wallet
            const keypair = await retrieveHotWallet(
                fingerprint,
                encryptionSignature,
                currentAccount.address
            );

            if (!keypair) {
                console.log('[SessionContext] Failed to decrypt stored session');
                return;
            }

            setEphemeralKeypair(keypair);
            setHotWalletAddress(keypair.toSuiAddress());
            setSessionExpiresAt(info.expiresAt);

            // Fetch SessionCap from blockchain
            const ownedObjects = await client.getOwnedObjects({
                owner: keypair.toSuiAddress(),
                filter: { StructType: `${PACKAGE_ID}::notebook::SessionCap` },
                options: { showContent: true },
            });

            const validCap = ownedObjects.data.find(obj => {
                const content = obj.data?.content as any;
                if (!content || !content.fields) return false;
                const expiresAt = parseInt(content.fields.expires_at);
                return expiresAt > Date.now();
            });

            if (validCap) {
                setSessionCap(validCap.data);
                console.log('[SessionContext] Session restored successfully');
            } else {
                console.log('[SessionContext] SessionCap not found or expired, clearing stored session');
                clearHotWallet(fingerprint);
                setEphemeralKeypair(null);
                setHotWalletAddress(null);
                setSessionExpiresAt(null);
            }

        } catch (error) {
            console.error('[SessionContext] Failed to load stored session:', error);
            // Don't show error to user, just log and continue
        }
    }, [currentAccount, client, signPersonalMessage]);

    /**
     * Authorize new session with enhanced error handling
     */
    const authorizeSession = async (notebookId: string) => {
        if (!currentAccount) {
            setError('Please connect your wallet first');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 1. Derive device fingerprint (P0: SHA-256)
            const fingerprint = await deriveDeviceFingerprint();

            // Check for fingerprint format migration
            const oldFingerprint = localStorage.getItem('inkblob_last_fingerprint');
            if (oldFingerprint && !oldFingerprint.match(/^[a-f0-9]{64}$/)) {
                console.log('[SessionContext] Fingerprint format changed, clearing old session');
                localStorage.removeItem('inkblob_last_fingerprint');
                clearHotWallet(oldFingerprint);
            }
            localStorage.setItem('inkblob_last_fingerprint', fingerprint);

            // 2. Request single signature for both content encryption and hot wallet derivation (OPTIMIZATION)
            console.log('[SessionContext] Requesting single signature for content encryption and hot wallet...');
            const encryptionMessage = new TextEncoder().encode(KEY_DERIVATION_MESSAGE);
            const { signature: contentSignature } = await signPersonalMessage({
                message: encryptionMessage,
            });

            // 3. Derive hot wallet keypair from the same signature (OPTIMIZATION: eliminates third signature)
            console.log('[SessionContext] Deriving hot wallet from content encryption signature...');
            const keypair = await deriveHotWalletFromSignature(contentSignature, fingerprint, currentAccount.address);
            const hotWallet = keypair.toSuiAddress();
            setEphemeralKeypair(keypair);
            setHotWalletAddress(hotWallet);

            console.log('[SessionContext] Hot wallet derived from content signature:', hotWallet);

            // 4. Check for existing valid SessionCap
            const existingCaps = await client.getOwnedObjects({
                owner: hotWallet,
                filter: { StructType: `${PACKAGE_ID}::notebook::SessionCap` },
                options: { showContent: true },
            });

            const validCap = existingCaps.data.find(obj => {
                const content = obj.data?.content as any;
                if (!content || !content.fields) return false;
                const expiresAt = parseInt(content.fields.expires_at);
                return expiresAt > Date.now();
            });

            let expiresAt: number;
            let finalSessionCap: any;

            if (validCap) {
                // Use existing SessionCap
                console.log('[SessionContext] Found valid existing SessionCap');
                finalSessionCap = validCap.data;
                setSessionCap(validCap.data);
                const content = validCap.data?.content as any;
                expiresAt = parseInt(content.fields.expires_at);
                setSessionExpiresAt(expiresAt);

            } else {
                // 5. Create new SessionCap
                console.log('[SessionContext] Creating new SessionCap...');

                // Check for WAL coins with better error handling
                let walCoinId: string;
                try {
                    console.log('[SessionContext] Checking for WAL coins in wallet:', currentAccount.address);

                    // Validate WAL package ID is configured
                    const walPackageId = import.meta.env.VITE_WAL_PACKAGE_ID;
                    if (!walPackageId) {
                        throw new Error(
                            `WAL package ID not configured.\n\n` +
                            `Please set VITE_WAL_PACKAGE_ID in your environment variables.\n` +
                            `Example: VITE_WAL_PACKAGE_ID=0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a`
                        );
                    }

                    console.log('[SessionContext] Using WAL package ID:', walPackageId);
                    const walCoins = await client.getCoins({
                        owner: currentAccount.address,
                        coinType: `${walPackageId}::wal::WAL`,
                    });

                    console.log('[SessionContext] WAL coins found:', walCoins.data.length);

                    if (walCoins.data.length === 0) {
                        const errorMsg = `No WAL tokens found in your wallet.\n\n` +
                            `To create a session, you need WAL tokens for funding the hot wallet.\n\n` +
                            `Please visit the WAL testnet faucet:\n${WAL_FAUCET_URL}\n\n` +
                            `After receiving tokens, refresh and try again.`;
                        console.log('[SessionContext] WAL token check failed:', errorMsg);
                        throw new Error(errorMsg);
                    }

                    walCoinId = walCoins.data[0].coinObjectId;
                    console.log('[SessionContext] Using WAL coin:', walCoinId, 'with balance:', walCoins.data[0].balance);

                } catch (walError: any) {
                    // Enhance error message
                    if (walError.message?.includes('No WAL')) {
                        throw walError;
                    }
                    throw new Error(
                        `Failed to query WAL tokens: ${walError.message}\n\n` +
                        `Please ensure you have WAL tokens in your wallet.\n` +
                        `Get WAL tokens from: ${WAL_FAUCET_URL}`
                    );
                }

                // Calculate expiration (24 hours from now)
                expiresAt = Date.now() + 24 * 60 * 60 * 1000;

                try {
                    // Build transaction
                    console.log('[SessionContext] Building transaction with params:', {
                        notebookId,
                        fingerprint: fingerprint.substring(0, 16) + '...',
                        hotWallet,
                        senderAddress: currentAccount.address,
                        expiresAt,
                        suiAmount: 100000000,
                        walAmount: 500000000,
                        walCoinId
                    });

                    let tx;
                    try {
                        tx = suiService.authorizeSessionTx(
                            notebookId,
                            fingerprint,
                            hotWallet,
                            expiresAt,
                            currentAccount.address, // Sender address to return remaining coins
                            100000000, // 0.1 SUI
                            200000000, // 0.2 WAL
                            walCoinId
                        );
                        console.log('[SessionContext] SessionCap transaction built successfully:', tx);
                    } catch (buildError: any) {
                        console.error('[SessionContext] Failed to build transaction:', buildError);
                        throw new Error(`Failed to build transaction: ${buildError.message || buildError}`);
                    }
                    console.log('[SessionContext] Submitting SessionCap creation transaction...');

                    const result = await signAndExecuteTransaction({ transaction: tx });
                    console.log('[SessionContext] SessionCap transaction submitted successfully:', result);
                } catch (txError: any) {
                    console.error('[SessionContext] SessionCap transaction failed:', txError);
                    throw new Error(`Transaction failed: ${txError.message || txError}`);
                }

                // 6. Wait for SessionCap with retry logic (replaces fixed delay)
                console.log('[SessionContext] Waiting for SessionCap to appear on-chain...');
                const newCap = await retryUntil(
                    async () => {
                        const objects = await client.getOwnedObjects({
                            owner: hotWallet,
                            filter: { StructType: `${PACKAGE_ID}::notebook::SessionCap` },
                            options: { showContent: true },
                        });
                        return objects.data.find(obj => {
                            const content = obj.data?.content as any;
                            if (!content || !content.fields) return false;
                            const capExpiresAt = parseInt(content.fields.expires_at);
                            return capExpiresAt > Date.now();
                        });
                    },
                    (result) => result !== null && result !== undefined,
                    {
                        maxAttempts: 10,
                        initialDelay: 500,
                        maxDelay: 3000,
                        onRetry: (attempt, delay) => {
                            console.log(`[SessionContext] Polling for SessionCap (attempt ${attempt}/10)...`);
                        },
                    }
                );

                if (!newCap) {
                    throw new Error('SessionCap creation succeeded but object not found on-chain after 10 retries');
                }

                finalSessionCap = newCap.data;
                setSessionCap(newCap.data);
                setSessionExpiresAt(expiresAt);
                console.log('[SessionContext] SessionCap created successfully');
            }

            // 7. Store encrypted hot wallet (OPTIMIZATION: reuse the same content encryption signature)
            console.log('[SessionContext] Encrypting and storing hot wallet with shared signature...');
            await storeHotWallet(
                keypair,
                fingerprint,
                expiresAt,
                contentSignature, // Reuse the same signature from step 2
                currentAccount.address
            );

            console.log('[SessionContext] Session authorized successfully');
            setIsLoading(false); // Ensure loading is reset on success

            // CRITICAL: Return session info so caller can use it immediately
            // without waiting for React state propagation
            return {
                sessionCap: finalSessionCap,
                ephemeralKeypair: keypair,
                hotWalletAddress: hotWallet,
                expiresAt,
            };

        } catch (error: any) {
            console.error('[SessionContext] Session authorization failed:', error);
            const errorMessage = error?.message || 'Unknown error occurred';
            setError(errorMessage);

            // Clear partial state
            setSessionCap(null);
            setEphemeralKeypair(null);
            setHotWalletAddress(null);
            setSessionExpiresAt(null);

            // Re-throw for caller to handle
            throw error;



        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Authorize new session using existing signature (OPTIMIZATION)
     * Reuses the signature from content encryption to avoid duplicate signature requests
     */
    const authorizeSessionWithSignature = async (
        notebookId: string,
        existingSignature: string,
        userAddress: string
    ): Promise<SessionAuthResult> => {
        if (!currentAccount) {
            throw new Error('Please connect your wallet first');
        }

        if (!existingSignature || !userAddress) {
            throw new Error('Existing signature and user address are required');
        }

        console.log('[SessionContext] Authorizing session with existing signature (optimization)...');

        try {
            // 1. Derive device fingerprint (P0: SHA-256)
            const fingerprint = await deriveDeviceFingerprint();

            // Check for fingerprint format migration
            const oldFingerprint = localStorage.getItem('inkblob_last_fingerprint');
            if (oldFingerprint && !oldFingerprint.match(/^[a-f0-9]{64}$/)) {
                console.log('[SessionContext] Fingerprint format changed, clearing old session');
                localStorage.removeItem('inkblob_last_fingerprint');
                clearHotWallet(oldFingerprint);
            }
            localStorage.setItem('inkblob_last_fingerprint', fingerprint);

            // 2. Use existing signature for hot wallet derivation (OPTIMIZATION: no additional signature)
            console.log('[SessionContext] Using existing signature for hot wallet derivation...');
            const keypair = await deriveHotWalletFromSignature(existingSignature, fingerprint, userAddress);
            const hotWallet = keypair.toSuiAddress();
            setEphemeralKeypair(keypair);
            setHotWalletAddress(hotWallet);

            console.log('[SessionContext] Hot wallet derived from existing signature:', hotWallet);

            // 3. Check for existing valid SessionCap
            const existingCaps = await client.getOwnedObjects({
                owner: hotWallet,
                filter: { StructType: `${PACKAGE_ID}::notebook::SessionCap` },
                options: { showContent: true },
            });

            const validCap = existingCaps.data.find(obj => {
                const content = obj.data?.content as any;
                if (!content || !content.fields) return false;
                const expiresAt = parseInt(content.fields.expires_at);
                return expiresAt > Date.now();
            });

            let expiresAt: number;
            let finalSessionCap: any;

            if (validCap) {
                // Use existing SessionCap
                console.log('[SessionContext] Found valid existing SessionCap');
                finalSessionCap = validCap.data;
                setSessionCap(validCap.data);
                const content = validCap.data?.content as any;
                expiresAt = parseInt(content.fields.expires_at);
                setSessionExpiresAt(expiresAt);

            } else {
                // 4. Create new SessionCap (this still requires WAL tokens and transaction signing)
                console.log('[SessionContext] Creating new SessionCap with existing signature...');

                // Check for WAL coins with better error handling
                let walCoinId: string;
                try {
                    console.log('[SessionContext] Checking for WAL coins in wallet:', currentAccount.address);

                    // Validate WAL package ID is configured
                    const walPackageId = import.meta.env.VITE_WAL_PACKAGE_ID;
                    if (!walPackageId) {
                        throw new Error(
                            `WAL package ID not configured.\n\n` +
                            `Please set VITE_WAL_PACKAGE_ID in your environment variables.\n` +
                            `Example: VITE_WAL_PACKAGE_ID=0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a`
                        );
                    }

                    console.log('[SessionContext] Using WAL package ID:', walPackageId);
                    const walCoins = await client.getCoins({
                        owner: currentAccount.address,
                        coinType: `${walPackageId}::wal::WAL`,
                    });

                    console.log('[SessionContext] WAL coins found:', walCoins.data.length);

                    if (walCoins.data.length === 0) {
                        const errorMsg = `No WAL tokens found in your wallet.\n\n` +
                            `To create a session, you need WAL tokens for funding the hot wallet.\n\n` +
                            `Please visit the WAL testnet faucet:\n${WAL_FAUCET_URL}\n\n` +
                            `After receiving tokens, refresh and try again.`;
                        console.log('[SessionContext] WAL token check failed:', errorMsg);
                        throw new Error(errorMsg);
                    }

                    walCoinId = walCoins.data[0].coinObjectId;
                    console.log('[SessionContext] Using WAL coin:', walCoinId, 'with balance:', walCoins.data[0].balance);

                } catch (walError: any) {
                    // Enhance error message
                    if (walError.message?.includes('No WAL')) {
                        throw walError;
                    }
                    throw new Error(
                        `Failed to query WAL tokens: ${walError.message}\n\n` +
                        `Please ensure you have WAL tokens in your wallet.\n` +
                        `Get WAL tokens from: ${WAL_FAUCET_URL}`
                    );
                }

                // Calculate expiration (24 hours from now)
                expiresAt = Date.now() + 24 * 60 * 60 * 1000;

                try {
                    // Build transaction
                    console.log('[SessionContext] Building transaction with params:', {
                        notebookId,
                        fingerprint: fingerprint.substring(0, 16) + '...',
                        hotWallet,
                        senderAddress: currentAccount.address,
                        expiresAt,
                        suiAmount: 100000000,
                        walAmount: 500000000,
                        walCoinId
                    });

                    let tx;
                    try {
                        tx = suiService.authorizeSessionTx(
                            notebookId,
                            fingerprint,
                            hotWallet,
                            expiresAt,
                            currentAccount.address, // Sender address to return remaining coins
                            100000000, // 0.1 SUI
                            200000000, // 0.2 WAL
                            walCoinId
                        );
                        console.log('[SessionContext] SessionCap transaction built successfully');
                    } catch (buildError: any) {
                        console.error('[SessionContext] Failed to build transaction:', buildError);
                        throw new Error(`Failed to build transaction: ${buildError.message || buildError}`);
                    }
                    console.log('[SessionContext] Submitting SessionCap creation transaction...');

                    const result = await signAndExecuteTransaction({ transaction: tx });
                    console.log('[SessionContext] SessionCap transaction submitted successfully:', result);
                } catch (txError: any) {
                    console.error('[SessionContext] SessionCap transaction failed:', txError);
                    throw new Error(`Transaction failed: ${txError.message || txError}`);
                }

                // 5. Wait for SessionCap with retry logic
                console.log('[SessionContext] Waiting for SessionCap to appear on-chain...');
                const newCap = await retryUntil(
                    async () => {
                        const objects = await client.getOwnedObjects({
                            owner: hotWallet,
                            filter: { StructType: `${PACKAGE_ID}::notebook::SessionCap` },
                            options: { showContent: true },
                        });
                        return objects.data.find(obj => {
                            const content = obj.data?.content as any;
                            if (!content || !content.fields) return false;
                            const capExpiresAt = parseInt(content.fields.expires_at);
                            return capExpiresAt > Date.now();
                        });
                    },
                    (result) => result !== null && result !== undefined,
                    {
                        maxAttempts: 10,
                        initialDelay: 500,
                        maxDelay: 3000,
                        onRetry: (attempt, delay) => {
                            console.log(`[SessionContext] Polling for SessionCap (attempt ${attempt}/10)...`);
                        },
                    }
                );

                if (!newCap) {
                    throw new Error('SessionCap creation succeeded but object not found on-chain after 10 retries');
                }

                finalSessionCap = newCap.data;
                setSessionCap(newCap.data);
                setSessionExpiresAt(expiresAt);
                console.log('[SessionContext] SessionCap created successfully with existing signature');
            }

            // 6. Store encrypted hot wallet (OPTIMIZATION: reuse the same signature)
            console.log('[SessionContext] Encrypting and storing hot wallet with existing signature...');
            await storeHotWallet(
                keypair,
                fingerprint,
                expiresAt,
                existingSignature, // Reuse the existing signature
                userAddress
            );

            console.log('[SessionContext] Session authorized successfully with existing signature');

            // CRITICAL: Return session info so caller can use it immediately
            return {
                sessionCap: finalSessionCap,
                ephemeralKeypair: keypair,
                hotWalletAddress: hotWallet,
                expiresAt,
            };

        } catch (error: any) {
            console.error('[SessionContext] Session authorization with existing signature failed:', error);
            const errorMessage = error?.message || 'Unknown error occurred';

            // Clear partial state
            setSessionCap(null);
            setEphemeralKeypair(null);
            setHotWalletAddress(null);
            setSessionExpiresAt(null);

            // Re-throw for caller to handle
            throw error;
        }
    };

    /**
     * Revoke session and clear all data
     */
    const revokeSession = async () => {
        try {
            // Clear encrypted storage
            const fingerprint = await deriveDeviceFingerprint();
            clearHotWallet(fingerprint);

            // Clear state
            setSessionCap(null);
            setEphemeralKeypair(null);
            setHotWalletAddress(null);
            setSessionExpiresAt(null);
            setError(null);

            console.log('[SessionContext] Session revoked successfully');

            // TODO: Call on-chain revoke_session() to reclaim funds

        } catch (error) {
            console.error('[SessionContext] Failed to revoke session:', error);
        }
    };

    /**
     * Refresh session (re-authorize before expiration)
     */
    const refreshSession = async () => {
        if (!currentAccount || !sessionCap) return;

        const content = sessionCap.content as any;
        const notebookId = content?.fields?.notebook_id;

        if (!notebookId) {
            console.error('[SessionContext] Cannot refresh: notebook ID not found');
            return;
        }

        // Revoke current session
        await revokeSession();

        // Authorize new session
        await authorizeSession(notebookId);
    };

    /**
     * Monitor session expiration and warn user
     */
    useEffect(() => {
        if (!sessionExpiresAt) return;

        const checkExpiration = () => {
            const timeUntilExpiration = sessionExpiresAt - Date.now();

            if (timeUntilExpiration <= 0) {
                console.warn('[SessionContext] Session expired, clearing...');
                revokeSession();
            } else if (timeUntilExpiration <= EXPIRATION_WARNING_THRESHOLD) {
                console.warn('[SessionContext] Session expiring soon:', new Date(sessionExpiresAt).toISOString());
                // TODO: Show UI warning to user
            }
        };

        // Check immediately
        checkExpiration();

        // Check every minute
        const interval = setInterval(checkExpiration, 60 * 1000);

        return () => clearInterval(interval);
    }, [sessionExpiresAt]);

    /**
     * NOTE: Removed auto-load stored session on wallet connection
     * UX improvement: Don't automatically request signature on wallet connect
     * Users should explicitly click "Unlock Notebook" to authorize access
     */

    return (
        <SessionContext.Provider value={{
            sessionCap,
            ephemeralKeypair,
            isSessionValid: !!sessionCap && !!ephemeralKeypair && !!sessionExpiresAt && sessionExpiresAt > Date.now(),
            sessionExpiresAt,
            hotWalletAddress,
            authorizeSession,
            authorizeSessionWithSignature,
            revokeSession,
            refreshSession,
            loadStoredSession, // Export for manual session restoration
            isLoading,
            error,
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
