import { fromB64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

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
 * OPTIMIZATION: This single signature now serves three purposes:
 * 1. Content encryption key derivation
 * 2. Hot wallet storage encryption
 * 3. Hot wallet keypair derivation
 */
export const KEY_DERIVATION_MESSAGE =
    'Sign this message to derive your InkBlob encryption key.\n\n' +
    'This signature will be used to encrypt and decrypt your notes.\n' +
    'Only sign this message on the official InkBlob application.';

/**
 * Derive Ed25519 Hot Wallet Keypair from the same wallet signature
 * OPTIMIZATION: Reuses the content encryption signature to eliminate
 * the third signature authorization request
 *
 * @param walletSignature - Base64-encoded signature from wallet (same as content encryption)
 * @param deviceFingerprint - SHA-256 hash of device characteristics
 * @param userAddress - SUI wallet address for additional entropy
 * @returns Ed25519 keypair for device-specific hot wallet
 */
export async function deriveHotWalletFromSignature(
    walletSignature: string,
    deviceFingerprint: string,
    userAddress: string
): Promise<Ed25519Keypair> {
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
        ['deriveBits']
    );

    // 4. Derive 32-byte seed for hot wallet using HKDF with proper context separation
    // Use user address as part of salt for additional entropy and separation
    const salt = new TextEncoder().encode(`InkBlob-hot-wallet-from-content-sig-v1-${userAddress.substring(0, 8)}`);
    const info = new TextEncoder().encode(`device:${deviceFingerprint}:hot-wallet-seed`);

    const seedBits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info,
        },
        keyMaterial,
        256 // 32 bytes * 8 bits
    );

    // 5. Create Ed25519 Keypair from seed
    const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(seedBits));

    console.log('[KeyDerivation] Hot wallet derived from content encryption signature:', {
        deviceFingerprint: deviceFingerprint.substring(0, 16) + '...',
        userAddress: userAddress.substring(0, 8) + '...',
        hotWalletAddress: keypair.toSuiAddress()
    });

    return keypair;
}
