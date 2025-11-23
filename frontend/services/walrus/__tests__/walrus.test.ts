import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadBlob } from '../upload';
import { downloadBlob } from '../download';
import { WALRUS_CONFIG } from '../config';
import { BlobNotFoundError } from '../errors';

// Hoist mocks so they are available in the factory
const { mockStore, mockRead } = vi.hoisted(() => ({
    mockStore: vi.fn(),
    mockRead: vi.fn(),
}));

vi.mock('@mysten/walrus', () => {
    return {
        WalrusClient: class {
            store = mockStore;
            read = mockRead;
        },
    };
});

// Mock encryption/decryption
vi.mock('../../crypto/encryption', () => ({
    encryptContent: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock('../../crypto/decryption', () => ({
    decryptContent: vi.fn().mockResolvedValue('decrypted content'),
}));

describe('Walrus Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Upload Service', () => {
        it('should upload blob successfully', async () => {
            const mockData = new Uint8Array([1, 2, 3]);
            const mockResult = { blobId: 'test-id', blobObject: { id: 'obj-id' } };
            mockStore.mockResolvedValue(mockResult);

            const result = await uploadBlob(mockData);

            expect(mockStore).toHaveBeenCalledWith(mockData, { epochs: WALRUS_CONFIG.defaultEpochs });
            expect(result.blobId).toBe('test-id');
            expect(result.blobObject).toBe('obj-id');
        });

        it('should throw error if blob exceeds max size', async () => {
            const largeData = new Uint8Array(WALRUS_CONFIG.maxBlobSize + 1);
            await expect(uploadBlob(largeData)).rejects.toThrow('exceeds max size');
        });

        it('should retry on failure', async () => {
            const mockData = new Uint8Array([1, 2, 3]);
            mockStore.mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue({ blobId: 'test-id', blobObject: { id: 'obj-id' } });

            const result = await uploadBlob(mockData);

            expect(mockStore).toHaveBeenCalledTimes(2);
            expect(result.blobId).toBe('test-id');
        });
    });

    describe('Download Service', () => {
        it('should download blob successfully', async () => {
            const mockBlob = {
                arrayBuffer: async () => new ArrayBuffer(3),
            };
            mockRead.mockResolvedValue(mockBlob);

            const result = await downloadBlob('test-id');

            expect(mockRead).toHaveBeenCalledWith('test-id');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(3);
        });

        it('should throw BlobNotFoundError when not found', async () => {
            const error: any = new Error('Not found');
            error.status = 404;
            mockRead.mockRejectedValue(error);

            await expect(downloadBlob('test-id')).rejects.toThrow(BlobNotFoundError);
        });

        it('should retry on temporary failure', async () => {
            const mockBlob = {
                arrayBuffer: async () => new ArrayBuffer(3),
            };
            mockRead.mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue(mockBlob);

            const result = await downloadBlob('test-id');

            expect(mockRead).toHaveBeenCalledTimes(2);
            expect(result).toBeInstanceOf(Uint8Array);
        });
    });
});
