import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveDeviceFingerprint, deriveHotWallet } from '../sessionKey';
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

describe('Session Key Derivation', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should derive a consistent device fingerprint', () => {
        const fingerprint1 = deriveDeviceFingerprint();
        const fingerprint2 = deriveDeviceFingerprint();
        expect(fingerprint1).toBe(fingerprint2);
        expect(fingerprint1).toMatch(/^device_[a-f0-9-]+$/);
    });

    it('should derive a hot wallet from signature', async () => {
        const mockSignature = toB64(new Uint8Array(64).fill(1)); // Mock 64-byte signature
        const fingerprint = 'device_test_123';

        const keypair1 = await deriveHotWallet(mockSignature, fingerprint);
        const keypair2 = await deriveHotWallet(mockSignature, fingerprint);

        expect(keypair1).toBeInstanceOf(Ed25519Keypair);
        expect(keypair1.getPublicKey().toSuiAddress()).toBe(keypair2.getPublicKey().toSuiAddress());
    });

    it('should derive different wallets for different fingerprints', async () => {
        const mockSignature = toB64(new Uint8Array(64).fill(1));
        const fingerprint1 = 'device_1';
        const fingerprint2 = 'device_2';

        const keypair1 = await deriveHotWallet(mockSignature, fingerprint1);
        const keypair2 = await deriveHotWallet(mockSignature, fingerprint2);

        expect(keypair1.getPublicKey().toSuiAddress()).not.toBe(keypair2.getPublicKey().toSuiAddress());
    });
});
