import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toB64 } from '@mysten/sui/utils';
import { KEY_DERIVATION_MESSAGE } from '../keyDerivation';
import {
    storeHotWallet,
    retrieveHotWallet,
    clearHotWallet,
    hasValidStoredHotWallet,
    getHotWalletInfo,
} from '../hotWalletStorage';

// Mock browser globals
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('Hot Wallet Storage (CRYPTO-4 Security Fix)', () => {
    const mockUserAddress = '0x' + '1'.repeat(64);
    const mockFingerprint = 'a'.repeat(64); // SHA-256 hex
    const mockExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    beforeEach(() => {
        localStorage.clear();
    });

    describe('Encryption Message', () => {
        it('should reuse content encryption message for optimization', () => {
            expect(KEY_DERIVATION_MESSAGE).toContain('derive your InkBlob encryption key');
            expect(KEY_DERIVATION_MESSAGE).toContain('encrypt and decrypt your notes');
        });
    });

    describe('Store and Retrieve Hot Wallet', () => {
        it('should store encrypted hot wallet in localStorage', async () => {
            // Generate a test keypair
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            // Store encrypted
            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                mockUserAddress
            );

            // Verify storage
            const storageKey = `inkblob_hot_wallet_${mockFingerprint}`;
            const stored = localStorage.getItem(storageKey);
            expect(stored).not.toBeNull();

            const data = JSON.parse(stored!);
            expect(data.version).toBe('v1');
            expect(data.deviceFingerprint).toBe(mockFingerprint);
            expect(data.expiresAt).toBe(mockExpiresAt);
            expect(data.hotWalletAddress).toBe(keypair.toSuiAddress());
            expect(data.encryptedPrivateKey).toBeTruthy();
            expect(data.iv).toBeTruthy();

            // Private key should be encrypted (not plaintext)
            const rawPrivateKey = toB64(keypair.getSecretKey());
            expect(data.encryptedPrivateKey).not.toBe(rawPrivateKey);
        });

        it('should retrieve and decrypt hot wallet', async () => {
            const originalKeypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            // Store
            await storeHotWallet(
                originalKeypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                mockUserAddress
            );

            // Retrieve
            const retrievedKeypair = await retrieveHotWallet(
                mockFingerprint,
                mockSignature,
                mockUserAddress
            );

            expect(retrievedKeypair).not.toBeNull();
            expect(retrievedKeypair!.toSuiAddress()).toBe(originalKeypair.toSuiAddress());

            // Verify it's a functional keypair
            const testMessage = new Uint8Array([1, 2, 3, 4, 5]);
            const signature1 = await originalKeypair.sign(testMessage);
            const signature2 = await retrievedKeypair!.sign(testMessage);
            expect(signature1).toEqual(signature2);
        });

        it('should return null for non-existent hot wallet', async () => {
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            const result = await retrieveHotWallet(
                mockFingerprint,
                mockSignature,
                mockUserAddress
            );

            expect(result).toBeNull();
        });

        it('should return null for expired hot wallet', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));
            const pastExpiration = Date.now() - 1000; // Expired 1 second ago

            await storeHotWallet(
                keypair,
                mockFingerprint,
                pastExpiration,
                mockSignature,
                mockUserAddress
            );

            const result = await retrieveHotWallet(
                mockFingerprint,
                mockSignature,
                mockUserAddress
            );

            expect(result).toBeNull();

            // Should also clear from storage
            const storageKey = `inkblob_hot_wallet_${mockFingerprint}`;
            expect(localStorage.getItem(storageKey)).toBeNull();
        });

        it('should return null for fingerprint mismatch', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                mockUserAddress
            );

            // Try to retrieve with different fingerprint
            const differentFingerprint = 'b'.repeat(64);
            const result = await retrieveHotWallet(
                differentFingerprint,
                mockSignature,
                mockUserAddress
            );

            expect(result).toBeNull();
        });

        it('should fail decryption with wrong signature', async () => {
            const keypair = new Ed25519Keypair();
            const correctSignature = toB64(new Uint8Array(64).fill(42));
            const wrongSignature = toB64(new Uint8Array(64).fill(99));

            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                correctSignature,
                mockUserAddress
            );

            // Try to decrypt with wrong signature
            const result = await retrieveHotWallet(
                mockFingerprint,
                wrongSignature,
                mockUserAddress
            );

            expect(result).toBeNull();

            // Should clear corrupted data
            const storageKey = `inkblob_hot_wallet_${mockFingerprint}`;
            expect(localStorage.getItem(storageKey)).toBeNull();
        });
    });

    describe('Clear Hot Wallet', () => {
        it('should clear hot wallet from storage', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                mockUserAddress
            );

            const storageKey = `inkblob_hot_wallet_${mockFingerprint}`;
            expect(localStorage.getItem(storageKey)).not.toBeNull();

            clearHotWallet(mockFingerprint);

            expect(localStorage.getItem(storageKey)).toBeNull();
        });
    });

    describe('Validation Helpers', () => {
        it('hasValidStoredHotWallet should return true for valid session', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                mockUserAddress
            );

            const isValid = await hasValidStoredHotWallet(mockFingerprint);
            expect(isValid).toBe(true);
        });

        it('hasValidStoredHotWallet should return false for expired session', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));
            const pastExpiration = Date.now() - 1000;

            await storeHotWallet(
                keypair,
                mockFingerprint,
                pastExpiration,
                mockSignature,
                mockUserAddress
            );

            const isValid = await hasValidStoredHotWallet(mockFingerprint);
            expect(isValid).toBe(false);
        });

        it('getHotWalletInfo should return address and expiration', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                mockUserAddress
            );

            const info = getHotWalletInfo(mockFingerprint);
            expect(info).not.toBeNull();
            expect(info!.address).toBe(keypair.toSuiAddress());
            expect(info!.expiresAt).toBe(mockExpiresAt);
        });

        it('getHotWalletInfo should return null for non-existent session', () => {
            const info = getHotWalletInfo(mockFingerprint);
            expect(info).toBeNull();
        });

        it('getHotWalletInfo should return null for expired session', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));
            const pastExpiration = Date.now() - 1000;

            await storeHotWallet(
                keypair,
                mockFingerprint,
                pastExpiration,
                mockSignature,
                mockUserAddress
            );

            const info = getHotWalletInfo(mockFingerprint);
            expect(info).toBeNull();
        });
    });

    describe('Security Properties', () => {
        it('should use separate HKDF context for encryption (CRYPTO-4)', async () => {
            // This is implicit in the implementation, but we can verify
            // that different signatures produce different encryption results
            const keypair = new Ed25519Keypair();
            const signature1 = toB64(new Uint8Array(64).fill(1));
            const signature2 = toB64(new Uint8Array(64).fill(2));

            // Store with signature1
            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                signature1,
                mockUserAddress
            );

            const storageKey = `inkblob_hot_wallet_${mockFingerprint}`;
            const encrypted1 = localStorage.getItem(storageKey)!;

            // Store same keypair with different signature
            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                signature2,
                mockUserAddress
            );

            const encrypted2 = localStorage.getItem(storageKey)!;

            // Encrypted data should be different
            expect(encrypted1).not.toBe(encrypted2);
        });

        it('should include user address in encryption key derivation', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));
            const userAddress1 = '0x' + '1'.repeat(64);
            const userAddress2 = '0x' + '2'.repeat(64);

            // Store with userAddress1
            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                userAddress1
            );

            // Try to retrieve with userAddress2 (wrong user)
            const result = await retrieveHotWallet(
                mockFingerprint,
                mockSignature,
                userAddress2
            );

            // Should fail (decryption key will be different)
            expect(result).toBeNull();
        });

        it('should verify address after decryption', async () => {
            const keypair = new Ed25519Keypair();
            const mockSignature = toB64(new Uint8Array(64).fill(42));

            await storeHotWallet(
                keypair,
                mockFingerprint,
                mockExpiresAt,
                mockSignature,
                mockUserAddress
            );

            // Manually corrupt the stored address
            const storageKey = `inkblob_hot_wallet_${mockFingerprint}`;
            const data = JSON.parse(localStorage.getItem(storageKey)!);
            data.hotWalletAddress = '0x' + 'bad'.repeat(21) + 'bad';
            localStorage.setItem(storageKey, JSON.stringify(data));

            // Retrieval should detect mismatch and fail
            const result = await retrieveHotWallet(
                mockFingerprint,
                mockSignature,
                mockUserAddress
            );

            expect(result).toBeNull();
            // Should clear corrupted data
            expect(localStorage.getItem(storageKey)).toBeNull();
        });
    });
});
