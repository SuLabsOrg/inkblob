import { fromB64 } from '@mysten/sui/utils';

/**
 * Derive AES-256 encryption key from wallet signature
 * Uses HKDF (HMAC-based Key Derivation Function) with SHA-256
 */
export async function deriveEncryptionKey(
    walletSignature: string
): Promise<CryptoKey> {
    // 1. Decode base64 signature to raw bytes
    const signatureBytes = fromB64(walletSignature);

    // 2. Import signature as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        signatureBytes,
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );

    // 3. Derive AES-256-GCM key
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode('InkBlob-encryption-v1'), // Fixed salt for determinism
            info: new TextEncoder().encode('aes-256-gcm-key'),     // Context info
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
