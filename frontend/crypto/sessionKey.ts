import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64, toB64 } from '@mysten/sui/utils';
import { deriveEncryptionKey } from './keyDerivation';
import { encryptContent } from './encryption';
import { decryptContent } from './decryption';

/**
 * Generate ephemeral Ed25519 keypair for session
 */
export function generateEphemeralKeypair(): Ed25519Keypair {
    return new Ed25519Keypair();
}

/**
 * Encrypt ephemeral private key for storage
 */
export async function encryptPrivateKey(
    privateKey: Uint8Array,
    walletSignature: string
): Promise<string> {
    // Derive encryption key from wallet signature
    const encKey = await deriveEncryptionKey(walletSignature);

    // Encrypt private key bytes
    const encrypted = await encryptContent(
        toB64(privateKey),
        encKey
    );

    return toB64(encrypted);
}

/**
 * Decrypt ephemeral private key from storage
 */
export async function decryptPrivateKey(
    encryptedKey: string,
    walletSignature: string
): Promise<Ed25519Keypair> {
    // Derive decryption key from wallet signature
    const decKey = await deriveEncryptionKey(walletSignature);

    // Decrypt private key bytes
    const decrypted = await decryptContent(
        fromB64(encryptedKey),
        decKey
    );

    // Reconstruct keypair
    const privateKeyBytes = fromB64(decrypted);
    return Ed25519Keypair.fromSecretKey(privateKeyBytes);
}

/**
 * Store encrypted ephemeral key in localStorage
 */
export function storeEphemeralKey(encryptedKey: string, expiresAt: number): void {
    localStorage.setItem('InkBlob_ephemeral_key', encryptedKey);
    localStorage.setItem('InkBlob_session_expires', expiresAt.toString());
}

/**
 * Retrieve encrypted ephemeral key from localStorage
 */
export function retrieveEphemeralKey(): { encryptedKey: string; expiresAt: number } | null {
    const encryptedKey = localStorage.getItem('InkBlob_ephemeral_key');
    const expiresAt = localStorage.getItem('InkBlob_session_expires');

    if (!encryptedKey || !expiresAt) {
        return null;
    }

    // Check if expired
    if (Date.now() > parseInt(expiresAt)) {
        clearEphemeralKey();
        return null;
    }

    return {
        encryptedKey,
        expiresAt: parseInt(expiresAt),
    };
}

/**
 * Clear ephemeral key from storage
 */
export function clearEphemeralKey(): void {
    localStorage.removeItem('InkBlob_ephemeral_key');
    localStorage.removeItem('InkBlob_session_expires');
}
