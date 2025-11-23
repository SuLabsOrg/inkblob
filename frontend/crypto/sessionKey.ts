import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';

/**
 * Generate a unique device fingerprint
 * Combines User Agent, Screen Resolution, and a random UUID stored in localStorage
 */
export function deriveDeviceFingerprint(): string {
    // 1. Get persistent device ID from localStorage
    let deviceId = localStorage.getItem('inkblob_device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('inkblob_device_id', deviceId);
    }

    // 2. Combine with browser info (simple fingerprinting)
    // Note: In a real app, we might use a more robust library like FingerprintJS,
    // but for this MVP, we just need to distinguish devices for the user.
    const userAgent = navigator.userAgent;
    const screenRes = `${window.screen.width}x${window.screen.height}`;

    // 3. Hash the components to create a clean string
    // We'll just return the UUID for now as it's the most reliable unique identifier per browser profile
    return `device_${deviceId}`;
}

/**
 * Derive Ed25519 Hot Wallet Keypair from Wallet Signature
 * Uses HKDF to deterministically generate a seed for the keypair
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

    // 3. Derive 32-byte seed using HKDF
    // Salt includes device fingerprint to ensure unique keys per device
    const salt = new TextEncoder().encode(`InkBlob-hot-wallet-v1-${deviceFingerprint}`);
    const info = new TextEncoder().encode('ed25519-seed');

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
