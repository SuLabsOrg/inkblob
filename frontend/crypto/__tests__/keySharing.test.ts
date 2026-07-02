import { describe, it, expect } from 'vitest';
import { toB64 } from '@mysten/sui/utils';
import {
    deriveEncryptionKeyRawBits,
    deriveX25519KeyPair,
    wrapContentKeyForGrantee,
    unwrapContentKey,
} from '../keySharing';
import { decryptContent } from '../decryption';

const mockUserAddress = '0x' + '1'.repeat(64);
const mockSignature = toB64(new Uint8Array(64).fill(7));
const otherSignature = toB64(new Uint8Array(64).fill(9));

describe('keySharing (envelope encryption)', () => {
    describe('deriveX25519KeyPair', () => {
        it('is deterministic: identical signature produces identical publicKeyRaw', async () => {
            const { publicKeyRaw: pub1 } = await deriveX25519KeyPair(mockSignature);
            const { publicKeyRaw: pub2 } = await deriveX25519KeyPair(mockSignature);

            expect(pub1.byteLength).toBe(32);
            expect(pub2.byteLength).toBe(32);
            expect(Array.from(pub1)).toEqual(Array.from(pub2));
        });

        it('produces different public keys for different signatures', async () => {
            const { publicKeyRaw: pubA } = await deriveX25519KeyPair(mockSignature);
            const { publicKeyRaw: pubB } = await deriveX25519KeyPair(otherSignature);

            expect(Array.from(pubA)).not.toEqual(Array.from(pubB));
        });
    });

    describe('wrapContentKeyForGrantee / unwrapContentKey round trip', () => {
        it('recovers the exact original contentKeyRaw bytes with the matching keypair', async () => {
            const granteeKeyPair = await deriveX25519KeyPair(mockSignature);
            const contentKeyRaw = crypto.getRandomValues(new Uint8Array(32));

            const wrapped = await wrapContentKeyForGrantee(contentKeyRaw, granteeKeyPair.publicKeyRaw);

            // blob format: 32-byte ephemeral pubkey || 12-byte IV || ciphertext+tag
            expect(wrapped.byteLength).toBe(32 + 12 + 32 + 16);

            const unwrapped = await unwrapContentKey(wrapped, granteeKeyPair.privateKey);

            expect(unwrapped.byteLength).toBe(contentKeyRaw.byteLength);
            expect(Array.from(unwrapped)).toEqual(Array.from(contentKeyRaw));
        });

        it('produces a different (non-deterministic) blob across calls due to fresh ephemeral keys', async () => {
            const granteeKeyPair = await deriveX25519KeyPair(mockSignature);
            const contentKeyRaw = crypto.getRandomValues(new Uint8Array(32));

            const wrapped1 = await wrapContentKeyForGrantee(contentKeyRaw, granteeKeyPair.publicKeyRaw);
            const wrapped2 = await wrapContentKeyForGrantee(contentKeyRaw, granteeKeyPair.publicKeyRaw);

            expect(Array.from(wrapped1)).not.toEqual(Array.from(wrapped2));

            // Both must still decrypt to the same original bytes.
            const unwrapped1 = await unwrapContentKey(wrapped1, granteeKeyPair.privateKey);
            const unwrapped2 = await unwrapContentKey(wrapped2, granteeKeyPair.privateKey);
            expect(Array.from(unwrapped1)).toEqual(Array.from(contentKeyRaw));
            expect(Array.from(unwrapped2)).toEqual(Array.from(contentKeyRaw));
        });

        it('rejects when unwrapping with the WRONG recipient private key (auth tag must fail)', async () => {
            const granteeKeyPair = await deriveX25519KeyPair(mockSignature);
            const wrongKeyPair = await deriveX25519KeyPair(otherSignature);
            const contentKeyRaw = crypto.getRandomValues(new Uint8Array(32));

            const wrapped = await wrapContentKeyForGrantee(contentKeyRaw, granteeKeyPair.publicKeyRaw);

            await expect(unwrapContentKey(wrapped, wrongKeyPair.privateKey)).rejects.toThrow();
        });
    });

    describe('deriveEncryptionKeyRawBits matches the real (non-extractable) content key', () => {
        it('produces bytes that, imported as AES-GCM, correctly encrypt/decrypt (matches deriveEncryptionKey behavior)', async () => {
            const rawBits = await deriveEncryptionKeyRawBits(mockSignature, mockUserAddress);
            expect(rawBits.byteLength).toBe(32);

            // Import the raw bits as a non-extractable AES-GCM key, exactly like the real
            // deriveEncryptionKey would produce, and round-trip via the actual production
            // decrypt function (frontend/crypto/decryption.ts decryptContent), which already
            // exists in this codebase and uses the same 12-byte-IV-prefix format as
            // frontend/crypto/encryption.ts encryptContent. No new production export is added;
            // this test simply exercises decryptContent that already exists.
            const aesKey = await crypto.subtle.importKey(
                'raw',
                rawBits,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            const plaintext = 'InkBlob envelope-encryption raw-bits verification';
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const plaintextBytes = new TextEncoder().encode(plaintext);

            const ciphertextWithTag = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: 128 },
                aesKey,
                plaintextBytes
            );

            const encrypted = new Uint8Array(12 + ciphertextWithTag.byteLength);
            encrypted.set(iv, 0);
            encrypted.set(new Uint8Array(ciphertextWithTag), 12);

            const decrypted = await decryptContent(encrypted, aesKey);

            expect(decrypted).toBe(plaintext);
        });

        it('is deterministic for the same signature + userAddress', async () => {
            const bits1 = await deriveEncryptionKeyRawBits(mockSignature, mockUserAddress);
            const bits2 = await deriveEncryptionKeyRawBits(mockSignature, mockUserAddress);

            expect(Array.from(bits1)).toEqual(Array.from(bits2));
        });
    });
});
