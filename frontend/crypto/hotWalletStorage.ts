import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64, toB64 } from '@mysten/sui/utils';

/**
 * Hot Wallet Storage with Encryption
 *
 * SECURITY FIX (P1): CRYPTO-4 - Separate signature for hot wallet key encryption
 * Reference: docs/tech/security/review-20251123.md
 *
 * Hot wallet private keys are encrypted before localStorage storage using
 * a SEPARATE wallet signature (not the same one used for content encryption).
 */

const STORAGE_KEY_PREFIX = 'inkblob_hot_wallet_';
const STORAGE_VERSION = 'v1';

/**
 * Message to sign for hot wallet encryption key derivation
 * This is SEPARATE from the content encryption message
 */
export const HOT_WALLET_ENCRYPTION_MESSAGE =
    'Sign this message to encrypt your InkBlob session key.\n\n' +
    'This signature will be used to protect your device-specific hot wallet key in browser storage.\n\n' +
    'This is NOT your main wallet and will only be used for this device.\n\n' +
    'You can revoke this session at any time.';

interface EncryptedHotWalletData {
    version: string;
    encryptedPrivateKey: string; // Base64-encoded encrypted bytes
    iv: string; // Base64-encoded initialization vector
    deviceFingerprint: string; // SHA-256 hash for verification
    expiresAt: number; // Timestamp
    hotWalletAddress: string; // For display purposes
}

/**
 * Derive AES-256-GCM key for hot wallet encryption
 * Uses SEPARATE signature from content encryption (CRYPTO-4 fix)
 */
async function deriveHotWalletEncryptionKey(
    walletSignature: string,
    userAddress: string
): Promise<CryptoKey> {
    const signatureBytes = fromB64(walletSignature);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        signatureBytes,
        { name: 'HKDF' },
        false,
        ['deriveBits']
    );

    // SECURITY: Separate HKDF context for hot wallet encryption
    const salt = new TextEncoder().encode('InkBlob-SEPARATE-hot-wallet-encryption-v1');
    const info = new TextEncoder().encode(`hot-wallet-key-ENCRYPTION-ONLY:${userAddress}`);

    const keyBits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info,
        },
        keyMaterial,
        256
    );

    return crypto.subtle.importKey(
        'raw',
        keyBits,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt and store hot wallet keypair in localStorage
 */
export async function storeHotWallet(
    keypair: Ed25519Keypair,
    deviceFingerprint: string,
    expiresAt: number,
    encryptionSignature: string,
    userAddress: string
): Promise<void> {
    // 1. Get private key bytes
    const privateKeyBytes = keypair.export().privateKey;

    // 2. Derive encryption key from SEPARATE signature
    const encryptionKey = await deriveHotWalletEncryptionKey(encryptionSignature, userAddress);

    // 3. Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 4. Encrypt private key
    const encryptedBytes = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        privateKeyBytes
    );

    // 5. Prepare storage data
    const storageData: EncryptedHotWalletData = {
        version: STORAGE_VERSION,
        encryptedPrivateKey: toB64(new Uint8Array(encryptedBytes)),
        iv: toB64(iv),
        deviceFingerprint,
        expiresAt,
        hotWalletAddress: keypair.toSuiAddress(),
    };

    // 6. Store in localStorage
    const storageKey = `${STORAGE_KEY_PREFIX}${deviceFingerprint}`;
    try {
        localStorage.setItem(storageKey, JSON.stringify(storageData));
        console.log('[HotWalletStorage] Stored encrypted hot wallet:', {
            fingerprint: deviceFingerprint.substring(0, 16) + '...',
            address: storageData.hotWalletAddress,
            expiresAt: new Date(expiresAt).toISOString(),
        });
    } catch (error) {
        console.error('[HotWalletStorage] Failed to store hot wallet:', error);
        throw new Error('Failed to store hot wallet in localStorage');
    }
}

/**
 * Retrieve and decrypt hot wallet keypair from localStorage
 */
export async function retrieveHotWallet(
    deviceFingerprint: string,
    encryptionSignature: string,
    userAddress: string
): Promise<Ed25519Keypair | null> {
    const storageKey = `${STORAGE_KEY_PREFIX}${deviceFingerprint}`;

    try {
        // 1. Retrieve from localStorage
        const storedData = localStorage.getItem(storageKey);
        if (!storedData) {
            console.log('[HotWalletStorage] No stored hot wallet found');
            return null;
        }

        const data: EncryptedHotWalletData = JSON.parse(storedData);

        // 2. Verify version
        if (data.version !== STORAGE_VERSION) {
            console.warn('[HotWalletStorage] Version mismatch, clearing old data');
            localStorage.removeItem(storageKey);
            return null;
        }

        // 3. Verify device fingerprint
        if (data.deviceFingerprint !== deviceFingerprint) {
            console.warn('[HotWalletStorage] Fingerprint mismatch, clearing data');
            localStorage.removeItem(storageKey);
            return null;
        }

        // 4. Check expiration
        if (Date.now() > data.expiresAt) {
            console.log('[HotWalletStorage] Hot wallet expired, clearing');
            localStorage.removeItem(storageKey);
            return null;
        }

        // 5. Derive decryption key
        const decryptionKey = await deriveHotWalletEncryptionKey(encryptionSignature, userAddress);

        // 6. Decrypt private key
        const iv = fromB64(data.iv);
        const encryptedBytes = fromB64(data.encryptedPrivateKey);

        const decryptedBytes = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            decryptionKey,
            encryptedBytes
        );

        // 7. Reconstruct keypair
        const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(decryptedBytes));

        // 8. Verify address matches
        if (keypair.toSuiAddress() !== data.hotWalletAddress) {
            console.error('[HotWalletStorage] Address mismatch after decryption!');
            localStorage.removeItem(storageKey);
            return null;
        }

        console.log('[HotWalletStorage] Successfully retrieved hot wallet:', {
            address: data.hotWalletAddress,
            expiresAt: new Date(data.expiresAt).toISOString(),
        });

        return keypair;

    } catch (error) {
        console.error('[HotWalletStorage] Failed to retrieve hot wallet:', error);
        // Clear corrupted data
        try {
            localStorage.removeItem(storageKey);
        } catch (e) {
            // Ignore cleanup errors
        }
        return null;
    }
}

/**
 * Remove hot wallet from localStorage
 */
export function clearHotWallet(deviceFingerprint: string): void {
    const storageKey = `${STORAGE_KEY_PREFIX}${deviceFingerprint}`;
    try {
        localStorage.removeItem(storageKey);
        console.log('[HotWalletStorage] Cleared hot wallet for fingerprint:', deviceFingerprint.substring(0, 16) + '...');
    } catch (error) {
        console.error('[HotWalletStorage] Failed to clear hot wallet:', error);
    }
}

/**
 * Check if stored hot wallet is still valid
 */
export async function hasValidStoredHotWallet(deviceFingerprint: string): Promise<boolean> {
    const storageKey = `${STORAGE_KEY_PREFIX}${deviceFingerprint}`;

    try {
        const storedData = localStorage.getItem(storageKey);
        if (!storedData) return false;

        const data: EncryptedHotWalletData = JSON.parse(storedData);

        // Check version, fingerprint, and expiration
        return (
            data.version === STORAGE_VERSION &&
            data.deviceFingerprint === deviceFingerprint &&
            Date.now() < data.expiresAt
        );
    } catch (error) {
        return false;
    }
}

/**
 * Get hot wallet info without decrypting (for display)
 */
export function getHotWalletInfo(deviceFingerprint: string): {
    address: string;
    expiresAt: number;
} | null {
    const storageKey = `${STORAGE_KEY_PREFIX}${deviceFingerprint}`;

    try {
        const storedData = localStorage.getItem(storageKey);
        if (!storedData) return null;

        const data: EncryptedHotWalletData = JSON.parse(storedData);

        if (data.version !== STORAGE_VERSION || Date.now() > data.expiresAt) {
            return null;
        }

        return {
            address: data.hotWalletAddress,
            expiresAt: data.expiresAt,
        };
    } catch (error) {
        return null;
    }
}
