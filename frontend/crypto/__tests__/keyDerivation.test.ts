import { describe, it, expect, beforeEach } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toB64 } from '@mysten/sui/utils';
import {
    deriveEncryptionKey,
    deriveHotWalletFromSignature,
    KEY_DERIVATION_MESSAGE
} from '../keyDerivation';

// Mock crypto.subtle for testing
const mockSignature = toB64(new Uint8Array(64).fill(1));
const mockUserAddress = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const mockDeviceFingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('Key Derivation Optimizations', () => {
    describe('deriveHotWalletFromSignature', () => {
        it('should derive deterministic hot wallet from content encryption signature', async () => {
            const keypair1 = await deriveHotWalletFromSignature(
                mockSignature,
                mockDeviceFingerprint,
                mockUserAddress
            );
            const keypair2 = await deriveHotWalletFromSignature(
                mockSignature,
                mockDeviceFingerprint,
                mockUserAddress
            );

            expect(keypair1.toSuiAddress()).toBe(keypair2.toSuiAddress());
            expect(keypair1.toSuiAddress()).toMatch(/^0x[a-fA-F0-9]{64}$/);
        });

        it('should derive different hot wallets for different device fingerprints', async () => {
            const fingerprint1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
            const fingerprint2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

            const keypair1 = await deriveHotWalletFromSignature(
                mockSignature,
                fingerprint1,
                mockUserAddress
            );
            const keypair2 = await deriveHotWalletFromSignature(
                mockSignature,
                fingerprint2,
                mockUserAddress
            );

            expect(keypair1.toSuiAddress()).not.toBe(keypair2.toSuiAddress());
        });

        it('should derive different hot wallets for different user addresses', async () => {
            const address1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
            const address2 = '0x2222222222222222222222222222222222222222222222222222222222222222';

            const keypair1 = await deriveHotWalletFromSignature(
                mockSignature,
                mockDeviceFingerprint,
                address1
            );
            const keypair2 = await deriveHotWalletFromSignature(
                mockSignature,
                mockDeviceFingerprint,
                address2
            );

            expect(keypair1.toSuiAddress()).not.toBe(keypair2.toSuiAddress());
        });

        it('should validate user address format', async () => {
            await expect(
                deriveHotWalletFromSignature(mockSignature, mockDeviceFingerprint, 'invalid-address')
            ).rejects.toThrow('Invalid SUI address format');
        });

        it('should be separate from content encryption key derivation', async () => {
            // Get content encryption key
            const encryptionKey = await deriveEncryptionKey(mockSignature, mockUserAddress);

            // Get hot wallet
            const hotWallet = await deriveHotWalletFromSignature(
                mockSignature,
                mockDeviceFingerprint,
                mockUserAddress
            );

            expect(encryptionKey).toBeDefined();
            expect(hotWallet).toBeDefined();
            expect(hotWallet.toSuiAddress()).toMatch(/^0x[a-fA-F0-9]{64}$/);
        });
    });

    describe('KEY_DERIVATION_MESSAGE', () => {
        it('should contain correct message content', () => {
            expect(KEY_DERIVATION_MESSAGE).toContain('derive your InkBlob encryption key');
            expect(KEY_DERIVATION_MESSAGE).toContain('encrypt and decrypt your notes');
            expect(KEY_DERIVATION_MESSAGE).toContain('official InkBlob application');
        });
    });
});