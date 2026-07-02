/**
 * Envelope encryption for sharing note/folder content keys with SharedAccess grantees.
 *
 * PURELY ADDITIVE MODULE - does not modify, import mutably, or otherwise change the
 * behavior of frontend/crypto/keyDerivation.ts or frontend/crypto/hotWalletStorage.ts.
 * The owner's own encrypt/decrypt path (deriveEncryptionKey -> non-extractable AES-GCM
 * CryptoKey) is completely untouched by this file.
 *
 * Purpose: allow a notebook owner to "wrap" (encrypt) their raw content-encryption-key
 * bytes for a specific grantee's X25519 public key, so that grantee (who already has
 * on-chain SharedAccess permission but never had the owner's wallet signature) can
 * "unwrap" (decrypt) the content key using their own X25519 private key, which is itself
 * deterministically derived from THEIR OWN wallet signature.
 *
 * Design (X25519 + HKDF + AES-256-GCM, i.e. a minimal ECIES-style construction):
 *  - Each user deterministically derives a long-term X25519 keypair from their own
 *    wallet signature (deriveX25519KeyPair). Only the public key ever needs to leave
 *    the device (e.g. published on-chain or shared out-of-band).
 *  - To share a content key, the owner generates a FRESH ephemeral X25519 keypair,
 *    does ECDH with the grantee's public key, derives an AES-256-GCM key from the
 *    shared secret via HKDF, and encrypts the raw content-key bytes with it
 *    (wrapContentKeyForGrantee).
 *  - The grantee reverses this with their own long-term private key (unwrapContentKey).
 *
 * Blob format for the wrapped key: [32-byte ephemeral X25519 public key] || [12-byte IV]
 * || [ciphertext || 16-byte GCM auth tag] - mirrors the IV-prepend convention used by
 * frontend/crypto/encryption.ts encryptContent for consistency.
 */

import { fromB64 } from '@mysten/sui/utils';

// ---------------------------------------------------------------------------
// Small local base64url helper (JWK "x"/"d" fields are base64url, not base64).
// No base64url utility exists elsewhere in this codebase (checked @mysten/sui/utils
// and @mysten/bcs - both only expose standard base64 fromB64/toB64), so we implement
// a minimal decoder here, scoped to this file.
// ---------------------------------------------------------------------------
function base64UrlToBytes(base64url: string): Uint8Array {
    const padded = base64url
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(base64url.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// RFC 8410 PKCS8 DER header for a raw 32-byte X25519 private key seed.
// Verified empirically (see task context) to make crypto.subtle.importKey('pkcs8', ...)
// accept a hand-built PKCS8 structure wrapping the raw seed, since raw-format import of
// X25519 PRIVATE keys is not supported in this environment.
const X25519_PKCS8_HEADER = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
]);

function seedToPkcs8(seed32: Uint8Array): ArrayBuffer {
    if (seed32.byteLength !== 32) {
        throw new Error('X25519 seed must be exactly 32 bytes');
    }
    const der = new Uint8Array(X25519_PKCS8_HEADER.byteLength + 32);
    der.set(X25519_PKCS8_HEADER, 0);
    der.set(seed32, X25519_PKCS8_HEADER.byteLength);
    return der.buffer;
}

/**
 * Re-derive the EXACT SAME 256 bits that frontend/crypto/keyDerivation.ts
 * deriveEncryptionKey wraps into a non-extractable AES-GCM CryptoKey - but as raw,
 * exportable bytes, using crypto.subtle.deriveBits instead of deriveKey.
 *
 * This mirrors deriveEncryptionKey's salt/info/hash EXACTLY:
 *  - salt: `InkBlob-v1-${userAddress}`
 *  - info: `aes-256-gcm-key`
 *  - hash: SHA-256
 *  - keyMaterial: raw signature bytes imported as HKDF key material
 *
 * deriveKey(HKDF params, keyMaterial, AES-GCM-256, ...) is defined by the WebCrypto
 * spec to be equivalent to deriveBits(same HKDF params, keyMaterial, 256) followed by
 * importKey('raw', bits, AES-GCM, ...) - so the 256 bits produced here are identical to
 * what the real (non-extractable) key was built from. This function is used ONLY to
 * obtain extractable bytes for envelope-encryption wrapping; it never replaces or calls
 * deriveEncryptionKey, and the real encryption key derivation path is untouched.
 *
 * @param signature - Base64-encoded wallet signature (same one passed to deriveEncryptionKey)
 * @param userAddress - SUI wallet address (0x + 64 hex chars)
 * @returns raw 32-byte key material, byte-identical to the owner's real content key
 */
export async function deriveEncryptionKeyRawBits(
    signature: string,
    userAddress: string
): Promise<Uint8Array> {
    if (!userAddress || !/^0x[a-fA-F0-9]{64}$/.test(userAddress)) {
        throw new Error('Invalid SUI address format. Expected 0x + 64 hex characters.');
    }

    const signatureBytes = fromB64(signature);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        signatureBytes,
        { name: 'HKDF' },
        false,
        ['deriveBits']
    );

    const userSpecificSalt = new TextEncoder().encode(`InkBlob-v1-${userAddress}`);

    const bits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: userSpecificSalt,
            info: new TextEncoder().encode('aes-256-gcm-key'),
        },
        keyMaterial,
        256
    );

    return new Uint8Array(bits);
}

/**
 * Derive a deterministic, long-term X25519 keypair from the user's wallet signature,
 * for use as their "key-sharing identity" (grantees publish publicKeyRaw; owners use
 * it as the ECDH recipient public key in wrapContentKeyForGrantee).
 *
 * Reuses the same "raw signature bytes imported as HKDF key material" pattern as
 * deriveEncryptionKey/deriveHotWalletFromSignature in keyDerivation.ts, but with a new,
 * non-colliding info string (`x25519-key-sharing-seed-v1`) so the derived seed is
 * cryptographically independent of the content-encryption key and the hot-wallet keys.
 *
 * @param signature - Base64-encoded wallet signature
 * @returns the X25519 private key (extractable CryptoKey) and its raw public key bytes
 */
export async function deriveX25519KeyPair(
    signature: string
): Promise<{ privateKey: CryptoKey; publicKeyRaw: Uint8Array }> {
    const signatureBytes = fromB64(signature);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        signatureBytes,
        { name: 'HKDF' },
        false,
        ['deriveBits']
    );

    // Distinct salt/info from every other derivation in keyDerivation.ts:
    //  - content key:      salt `InkBlob-v1-${userAddress}`,                info `aes-256-gcm-key`
    //  - hot wallet store: salt `InkBlob-hot-wallet-storage-v1-${addr}`,    info `aes-256-gcm-hot-wallet-key`
    //  - hot wallet seed:  salt `InkBlob-hot-wallet-from-content-sig-v1-*`, info `device:*:hot-wallet-seed`
    //  - session hot wallet: salt `InkBlob-hot-wallet-v1`,                  info `device:*:seed`
    const salt = new TextEncoder().encode('InkBlob-key-sharing-v1');
    const info = new TextEncoder().encode('x25519-key-sharing-seed-v1');

    const seedBits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info,
        },
        keyMaterial,
        256
    );

    const pkcs8 = seedToPkcs8(new Uint8Array(seedBits));

    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        pkcs8,
        { name: 'X25519' },
        true,
        ['deriveBits']
    );

    // Raw-format export/import for X25519 PRIVATE keys is broken in this environment,
    // but the public key is reliably obtainable via JWK export (has a base64url "x" field).
    const jwk = await crypto.subtle.exportKey('jwk', privateKey);
    if (!jwk.x) {
        throw new Error('Failed to derive X25519 public key: JWK export missing "x" field');
    }
    const publicKeyRaw = base64UrlToBytes(jwk.x);

    return { privateKey, publicKeyRaw };
}

const ECDH_HKDF_SALT = new TextEncoder().encode('InkBlob-key-sharing-ecdh-v1');
const ECDH_HKDF_INFO = new TextEncoder().encode('aes-256-gcm-wrap-key');

/**
 * Derive an AES-256-GCM CryptoKey from a 32-byte X25519 shared secret via HKDF.
 * Shared by wrapContentKeyForGrantee and unwrapContentKey to guarantee both sides
 * derive the identical wrapping key from the identical shared secret.
 */
async function deriveWrapKeyFromSharedSecret(sharedSecretBits: ArrayBuffer): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        sharedSecretBits,
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: ECDH_HKDF_SALT,
            info: ECDH_HKDF_INFO,
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt (wrap) a raw content-encryption-key for a specific grantee, using their
 * long-term X25519 public key (deriveX25519KeyPair(...).publicKeyRaw).
 *
 * Generates a fresh ephemeral X25519 keypair per call (standard ECIES practice - never
 * reuse ephemeral keys), so the output blob is non-deterministic even for the same
 * inputs, but always decryptable by the grantee's matching private key.
 *
 * @param contentKeyRaw - raw 32-byte content-encryption-key bytes to share
 * @param granteePublicKeyRaw - grantee's raw X25519 public key bytes
 * @returns blob: [32-byte ephemeral pubkey] || [12-byte IV] || [ciphertext || 16-byte tag]
 */
export async function wrapContentKeyForGrantee(
    contentKeyRaw: Uint8Array,
    granteePublicKeyRaw: Uint8Array
): Promise<Uint8Array> {
    // TypeScript's default DOM lib overloads for generateKey don't include X25519 (it's
    // a newer WebCrypto algorithm), so the return type widens to CryptoKey | CryptoKeyPair.
    // We know at runtime this always returns a CryptoKeyPair for X25519.
    const ephemeralKeyPair = (await crypto.subtle.generateKey(
        { name: 'X25519' },
        true,
        ['deriveBits']
    )) as CryptoKeyPair;

    const granteePublicKey = await crypto.subtle.importKey(
        'raw',
        granteePublicKeyRaw,
        { name: 'X25519' },
        false,
        []
    );

    const sharedSecretBits = await crypto.subtle.deriveBits(
        { name: 'X25519', public: granteePublicKey },
        ephemeralKeyPair.privateKey,
        256
    );

    const wrapKey = await deriveWrapKeyFromSharedSecret(sharedSecretBits);

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertextWithTag = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        wrapKey,
        contentKeyRaw
    );

    const ephemeralPublicKeyRaw = new Uint8Array(
        await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey)
    );

    const blob = new Uint8Array(
        ephemeralPublicKeyRaw.byteLength + iv.byteLength + ciphertextWithTag.byteLength
    );
    blob.set(ephemeralPublicKeyRaw, 0);
    blob.set(iv, ephemeralPublicKeyRaw.byteLength);
    blob.set(new Uint8Array(ciphertextWithTag), ephemeralPublicKeyRaw.byteLength + iv.byteLength);

    return blob;
}

const EPHEMERAL_PUBLIC_KEY_LENGTH = 32;
const IV_LENGTH = 12;

/**
 * Decrypt (unwrap) a content-key blob produced by wrapContentKeyForGrantee, using the
 * grantee's own long-term X25519 private key (deriveX25519KeyPair(...).privateKey).
 *
 * Throws/rejects (rather than silently returning wrong bytes) if myPrivateKey does not
 * match the private key corresponding to the public key the blob was wrapped for - the
 * AES-GCM authentication tag will fail to verify against a mismatched shared secret.
 *
 * @param blob - [32-byte ephemeral pubkey] || [12-byte IV] || [ciphertext || 16-byte tag]
 * @param myPrivateKey - the grantee's own X25519 private key
 * @returns the original raw content-key bytes
 */
export async function unwrapContentKey(
    blob: Uint8Array,
    myPrivateKey: CryptoKey
): Promise<Uint8Array> {
    if (blob.byteLength < EPHEMERAL_PUBLIC_KEY_LENGTH + IV_LENGTH) {
        throw new Error('Invalid wrapped content key blob: too short');
    }

    const ephemeralPublicKeyRaw = blob.slice(0, EPHEMERAL_PUBLIC_KEY_LENGTH);
    const iv = blob.slice(
        EPHEMERAL_PUBLIC_KEY_LENGTH,
        EPHEMERAL_PUBLIC_KEY_LENGTH + IV_LENGTH
    );
    const ciphertextWithTag = blob.slice(EPHEMERAL_PUBLIC_KEY_LENGTH + IV_LENGTH);

    const ephemeralPublicKey = await crypto.subtle.importKey(
        'raw',
        ephemeralPublicKeyRaw,
        { name: 'X25519' },
        false,
        []
    );

    const sharedSecretBits = await crypto.subtle.deriveBits(
        { name: 'X25519', public: ephemeralPublicKey },
        myPrivateKey,
        256
    );

    const wrapKey = await deriveWrapKeyFromSharedSecret(sharedSecretBits);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        wrapKey,
        ciphertextWithTag
    );

    return new Uint8Array(plaintext);
}
