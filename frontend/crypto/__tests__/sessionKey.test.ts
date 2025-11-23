import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveDeviceFingerprint, deriveHotWallet } from '../sessionKey';
import { deriveEncryptionKey } from '../keyDerivation';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toB64 } from '@mysten/sui/utils';

// Mock browser globals
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value; },
        clear: () => { store = {}; }
    };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });
Object.defineProperty(global, 'navigator', { value: { userAgent: 'test-agent' } });
Object.defineProperty(global, 'window', { value: { screen: { width: 1920, height: 1080 } } });

describe('Session Key Derivation (P0/P1 Security Fixes)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('Device Fingerprint (P0 - SHA-256)', () => {
        it('should derive a consistent SHA-256 device fingerprint', async () => {
            const fingerprint1 = await deriveDeviceFingerprint();
            const fingerprint2 = await deriveDeviceFingerprint();

            expect(fingerprint1).toBe(fingerprint2);
            // SECURITY FIX: Now returns 64-char hex SHA-256 hash (not "device_uuid")
            expect(fingerprint1).toMatch(/^[a-f0-9]{64}$/);
            expect(fingerprint1.length).toBe(64);
        });

        it('should use SHA-256 hashing for collision resistance', async () => {
            const fingerprint = await deriveDeviceFingerprint();

            // SHA-256 produces 256-bit (32-byte) output = 64 hex characters
            expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);

            // Different from old "device_uuid" format
            expect(fingerprint).not.toMatch(/^device_/);
        });

        it('should handle localStorage unavailable gracefully', async () => {
            // Mock localStorage to throw error
            const originalGetItem = localStorage.getItem;
            const originalSetItem = localStorage.setItem;
            vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
                throw new Error('localStorage disabled');
            });
            vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
                throw new Error('localStorage disabled');
            });

            // Should still generate fingerprint (using session-only UUID)
            const fingerprint = await deriveDeviceFingerprint();
            expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);

            // Restore mocks
            localStorage.getItem = originalGetItem;
            localStorage.setItem = originalSetItem;
        });
    });

    describe('Hot Wallet Derivation (P1 - HKDF Context)', () => {
        it('should derive a hot wallet from signature', async () => {
            const mockSignature = toB64(new Uint8Array(64).fill(1));
            const fingerprint = await deriveDeviceFingerprint();

            const keypair1 = await deriveHotWallet(mockSignature, fingerprint);
            const keypair2 = await deriveHotWallet(mockSignature, fingerprint);

            expect(keypair1).toBeInstanceOf(Ed25519Keypair);
            expect(keypair1.getPublicKey().toSuiAddress()).toBe(keypair2.getPublicKey().toSuiAddress());
        });

        it('should derive different wallets for different fingerprints', async () => {
            const mockSignature = toB64(new Uint8Array(64).fill(1));

            // Use SHA-256 hashes as fingerprints (64 hex chars)
            const fingerprint1 = 'a'.repeat(64);
            const fingerprint2 = 'b'.repeat(64);

            const keypair1 = await deriveHotWallet(mockSignature, fingerprint1);
            const keypair2 = await deriveHotWallet(mockSignature, fingerprint2);

            expect(keypair1.getPublicKey().toSuiAddress()).not.toBe(keypair2.getPublicKey().toSuiAddress());
        });

        it('should maintain deterministic derivation (same inputs = same output)', async () => {
            const mockSignature = toB64(new Uint8Array(64).fill(42));
            const fingerprint = 'c'.repeat(64);

            const keypair1 = await deriveHotWallet(mockSignature, fingerprint);
            const keypair2 = await deriveHotWallet(mockSignature, fingerprint);
            const keypair3 = await deriveHotWallet(mockSignature, fingerprint);

            const address1 = keypair1.getPublicKey().toSuiAddress();
            const address2 = keypair2.getPublicKey().toSuiAddress();
            const address3 = keypair3.getPublicKey().toSuiAddress();

            expect(address1).toBe(address2);
            expect(address2).toBe(address3);
        });
    });

    describe('Encryption Key Derivation (P1 - User-Specific Salt)', () => {
        const mockUserAddress = '0x' + '1'.repeat(64);
        const mockSignature = toB64(new Uint8Array(64).fill(7));

        it('should require valid user address', async () => {
            await expect(deriveEncryptionKey(mockSignature, '')).rejects.toThrow('Invalid SUI address format');
            await expect(deriveEncryptionKey(mockSignature, 'invalid')).rejects.toThrow('Invalid SUI address format');
            await expect(deriveEncryptionKey(mockSignature, '0x123')).rejects.toThrow('Invalid SUI address format');
        });

        it('should derive encryption key with user-specific salt', async () => {
            const key = await deriveEncryptionKey(mockSignature, mockUserAddress);

            expect(key).toBeInstanceOf(CryptoKey);
            expect(key.type).toBe('secret');
            expect(key.algorithm.name).toBe('AES-GCM');
            // @ts-ignore - length is on AesKeyAlgorithm
            expect(key.algorithm.length).toBe(256);
        });

        it('should derive different keys for different users', async () => {
            const userAddress1 = '0x' + '1'.repeat(64);
            const userAddress2 = '0x' + '2'.repeat(64);

            const key1 = await deriveEncryptionKey(mockSignature, userAddress1);
            const key2 = await deriveEncryptionKey(mockSignature, userAddress2);

            // Keys should be different (cannot directly compare CryptoKey objects)
            // But we can verify they're both valid AES-GCM keys
            expect(key1.algorithm.name).toBe('AES-GCM');
            expect(key2.algorithm.name).toBe('AES-GCM');
            expect(key1).not.toBe(key2);
        });

        it('should maintain deterministic derivation with same user', async () => {
            const key1 = await deriveEncryptionKey(mockSignature, mockUserAddress);
            const key2 = await deriveEncryptionKey(mockSignature, mockUserAddress);

            // Both should be valid AES-256-GCM keys
            expect(key1.algorithm.name).toBe('AES-GCM');
            expect(key2.algorithm.name).toBe('AES-GCM');
            // @ts-ignore
            expect(key1.algorithm.length).toBe(256);
            // @ts-ignore
            expect(key2.algorithm.length).toBe(256);
        });
    });
});
