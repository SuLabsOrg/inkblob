import { fromB64 } from '@mysten/sui/utils';

/**
 * Derive AES-256 encryption key from wallet signature
 * Uses HKDF (HMAC-based Key Derivation Function) with SHA-256
 *
 * SECURITY FIX (P1): Uses user-specific salt to prevent correlation attacks
 * Reference: docs/tech/security/review-20251123.md CRYPTO-2
 *
 * @param walletSignature - Base64-encoded signature from wallet
 * @param userAddress - SUI wallet address (0x + 64 hex chars)
 * @returns AES-256-GCM encryption key
 */
export async function deriveEncryptionKey(
    walletSignature: string,
    userAddress: string
): Promise<CryptoKey> {
    // 1. Validate user address format
    if (!userAddress || !/^0x[a-fA-F0-9]{64}$/.test(userAddress)) {
        throw new Error('Invalid SUI address format. Expected 0x + 64 hex characters.');
    }

    // 2. Decode base64 signature to raw bytes
    const signatureBytes = fromB64(walletSignature);

    // 3. Import signature as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        signatureBytes,
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );

    // 4. Derive AES-256-GCM key with user-specific salt
    const userSpecificSalt = new TextEncoder().encode(`InkBlob-v1-${userAddress}`);

    const aesKey = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: userSpecificSalt,  // User-specific for better entropy
            info: new TextEncoder().encode('aes-256-gcm-key'),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, // Not extractable (security)
        ['encrypt', 'decrypt']
    );

    return aesKey;
}

/**
 * Standard message for wallet signature (must be consistent)
 */
export const KEY_DERIVATION_MESSAGE =
    'Sign this message to derive your InkBlob encryption key.\n\n' +
    'This signature will be used to encrypt and decrypt your notes.\n' +
    'Only sign this message on the official InkBlob application.';
