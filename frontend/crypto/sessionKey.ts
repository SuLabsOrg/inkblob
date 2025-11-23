import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';

/**
 * Generate a unique device fingerprint using SHA-256
 * Combines User Agent, Screen Resolution, and a random UUID stored in localStorage
 *
 * SECURITY FIX (P0): Uses SHA-256 hashing to prevent collision attacks
 * Reference: docs/tech/security/review-20251123.md CRYPTO-1
 */
export async function deriveDeviceFingerprint(): Promise<string> {
    // 1. Get persistent device ID from localStorage
    let deviceId: string;
    try {
        deviceId = localStorage.getItem('inkblob_device_id') || '';
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem('inkblob_device_id', deviceId);
        }
    } catch (error) {
        // Fallback for browsers with localStorage disabled
        console.warn('localStorage unavailable, using session-only device ID');
        deviceId = crypto.randomUUID();
    }

    // 2. Combine with browser info for device fingerprinting
    const userAgent = navigator.userAgent;
    const screenRes = `${window.screen.width}x${window.screen.height}`;
    const deviceData = `${deviceId}|${userAgent}|${screenRes}`;

    // 3. Hash with SHA-256 to prevent collision attacks
    if (!crypto.subtle) {
        throw new Error('WebCrypto API not available. Please use HTTPS or a modern browser.');
    }

    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceData));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
        console.error('SHA-256 digest failed:', error);
        throw new Error('Device fingerprint generation failed');
    }
}

/**
 * Derive Ed25519 Hot Wallet Keypair from Wallet Signature
 * Uses HKDF to deterministically generate a seed for the keypair
 *
 * SECURITY FIX (P1): Improved HKDF context separation
 * Reference: docs/tech/security/review-20251123.md CRYPTO-3
 * Device fingerprint moved to info field per HKDF best practices
 *
 * @param walletSignature - Base64-encoded signature from wallet
 * @param deviceFingerprint - SHA-256 hash of device characteristics
 * @returns Ed25519 keypair for device-specific hot wallet
 */
export async function deriveHotWallet(
    walletSignature: string,
    deviceFingerprint: string
): Promise<Ed25519Keypair> {
    // 1. Decode signature
    const signatureBytes = fromB64(walletSignature);

    // 2. Import signature as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        signatureBytes,
        { name: 'HKDF' },
        false,
        ['deriveBits']
    );

    // 3. Derive 32-byte seed using HKDF with proper context separation
    // Fixed salt for protocol version
    const salt = new TextEncoder().encode('InkBlob-hot-wallet-v1');
    // Device fingerprint in info field (proper HKDF usage)
    const info = new TextEncoder().encode(`device:${deviceFingerprint}:seed`);

    const seedBits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt,
            info: info,
        },
        keyMaterial,
        256 // 32 bytes * 8 bits
    );

    // 4. Create Ed25519 Keypair from seed
    return Ed25519Keypair.fromSecretKey(new Uint8Array(seedBits));
}

/**
 * Message to sign for Hot Wallet derivation
 * This can be the same as the encryption key message or distinct.
 * Design doc suggests: "Derive deterministic Ed25519 hot wallet per main wallet + device fingerprint using HKDF derivation"
 * We can reuse the same signature if we want single-sign-on experience, 
 * or ask for a separate signature. 
 * Reusing the signature is better UX.
 */
