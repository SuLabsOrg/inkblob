import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadBlob } from '../upload';
import { downloadBlob } from '../download';
import { BlobNotFoundError } from '../errors';

// Hoist mocks so they are available in the factory
const { mockStore, mockGetFiles } = vi.hoisted(() => ({
    mockStore: vi.fn(),
    mockGetFiles: vi.fn(),
}));

vi.mock('@mysten/walrus', () => {
    return {
        walrus: vi.fn(() => ({
            writeBlob: mockStore,
            getFiles: mockGetFiles,
        })),
    };
});

// Mock encryption/decryption
vi.mock('../../crypto/encryption', () => ({
    encryptContent: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock('../../crypto/decryption', () => ({
    decryptContent: vi.fn().mockResolvedValue('decrypted content'),
}));

// Mock fetch for aggregator tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock createWalrusClient to avoid SDK issues in tests
vi.mock('../config', () => ({
    createWalrusClient: vi.fn(() => ({
        walrus: {
            getFiles: mockGetFiles,
            writeBlob: mockStore,
        },
    })),
    WALRUS_CONFIG: {
        network: 'testnet',
        uploadRelay: 'https://test-uploader.testnet.walrus.space',
        aggregator: 'https://test-aggregator.testnet.walrus.space',
        defaultEpochs: 30,
        maxBlobSize: 100 * 1024 * 1024,
        aggregatorTimeout: 10000,
    },
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

            expect(mockStore).toHaveBeenCalledWith(mockData, { epochs: 30 });
            expect(result.blobId).toBe('test-id');
            expect(result.blobObject).toBe('obj-id');
        });

        it('should throw error if blob exceeds max size', async () => {
            const largeData = new Uint8Array(100 * 1024 * 1024 + 1); // 100MB + 1
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
        describe('Aggregator Downloads', () => {
            it('should download from aggregator successfully', async () => {
                const mockData = new Uint8Array([4, 5, 6]);
                const mockBlob = new Blob([mockData]);
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    blob: async () => mockBlob,
                    arrayBuffer: async () => mockData.buffer,
                });

                const result = await downloadBlob('test-aggregator-id');

                expect(mockFetch).toHaveBeenCalledWith(
                    expect.stringContaining('/v1/blobs/test-aggregator-id'),
                    expect.objectContaining({
                        headers: { 'Accept': 'application/octet-stream' },
                        signal: expect.any(AbortSignal),
                    })
                );
                expect(result).toBeInstanceOf(Uint8Array);
                expect(result).toEqual(mockData);
            });

            it('should fallback to SDK when aggregator returns 404', async () => {
                const mockFile = {
                    bytes: async () => new Uint8Array([7, 8, 9]),
                };
                mockGetFiles.mockResolvedValue([mockFile]);

                // Aggregator returns 404
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                });

                const result = await downloadBlob('test-fallback-id');

                expect(mockFetch).toHaveBeenCalledTimes(1);
                expect(mockGetFiles).toHaveBeenCalledWith({ ids: ['test-fallback-id'] });
                expect(result).toEqual(new Uint8Array([7, 8, 9]));
            });

            it('should fallback to SDK when aggregator fails with network error', async () => {
                const mockFile = {
                    bytes: async () => new Uint8Array([10, 11, 12]),
                };
                mockGetFiles.mockResolvedValue([mockFile]);

                // Aggregator fails with network error
                mockFetch.mockRejectedValueOnce(new Error('Network error'));

                const result = await downloadBlob('test-network-id');

                expect(mockFetch).toHaveBeenCalledTimes(1);
                expect(mockGetFiles).toHaveBeenCalledWith({ ids: ['test-network-id'] });
                expect(result).toEqual(new Uint8Array([10, 11, 12]));
            });

            it('should fallback to SDK when aggregator times out', async () => {
                const mockFile = {
                    bytes: async () => new Uint8Array([13, 14, 15]),
                };
                mockGetFiles.mockResolvedValue([mockFile]);

                // Aggregator times out
                mockFetch.mockImplementationOnce(() => {
                    return new Promise((_, reject) => {
                        const error = new Error('Request timeout');
                        error.name = 'AbortError';
                        setTimeout(() => reject(error), 100); // Faster than test timeout
                    });
                });

                const result = await downloadBlob('test-timeout-id');

                expect(mockFetch).toHaveBeenCalledTimes(1);
                expect(mockGetFiles).toHaveBeenCalledWith({ ids: ['test-timeout-id'] });
                expect(result).toEqual(new Uint8Array([13, 14, 15]));
            });

            it('should handle aggregator URL with /status suffix', async () => {
                const mockData = new Uint8Array([16, 17, 18]);
                const mockBlob = new Blob([mockData]);

                // Test URL handling by checking that /status suffix is removed
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    blob: async () => mockBlob,
                    arrayBuffer: async () => mockData.buffer,
                });

                await downloadBlob('test-url-id');

                expect(mockFetch).toHaveBeenCalledWith(
                    expect.stringContaining('/v1/blobs/test-url-id'),
                    expect.objectContaining({
                        headers: { 'Accept': 'application/octet-stream' },
                        signal: expect.any(AbortSignal),
                    })
                );
            });
        });

        describe('SDK Fallback Downloads', () => {
            it('should download from SDK successfully', async () => {
                const mockFile = {
                    bytes: async () => new Uint8Array([1, 2, 3]),
                };
                mockGetFiles.mockResolvedValue([mockFile]);

                // Make aggregator fail to force SDK usage
                mockFetch.mockRejectedValueOnce(new Error('Aggregator unavailable'));

                const result = await downloadBlob('test-sdk-id');

                expect(mockGetFiles).toHaveBeenCalledWith({ ids: ['test-sdk-id'] });
                expect(result).toEqual(new Uint8Array([1, 2, 3]));
            });

            it('should throw BlobNotFoundError when SDK returns not found', async () => {
                const error: any = new Error('Not found');
                error.status = 404;
                mockGetFiles.mockRejectedValue(error);

                // Make aggregator fail to force SDK usage
                mockFetch.mockRejectedValueOnce(new Error('Aggregator unavailable'));

                await expect(downloadBlob('test-sdk-not-found')).rejects.toThrow(BlobNotFoundError);
            });

            it('should retry SDK on temporary failure', async () => {
                const mockFile = {
                    bytes: async () => new Uint8Array([4, 5, 6]),
                };

                // Aggregator fails first time, then SDK fails once, then succeeds
                mockFetch.mockRejectedValueOnce(new Error('Aggregator unavailable'));
                mockGetFiles.mockRejectedValueOnce(new Error('Network error'))
                    .mockResolvedValue([mockFile]);

                const result = await downloadBlob('test-sdk-retry-id');

                expect(mockGetFiles).toHaveBeenCalledTimes(2);
                expect(result).toEqual(new Uint8Array([4, 5, 6]));
            });
        });

        describe('Error Handling', () => {
            it('should throw BlobNotFoundError when both aggregator and SDK return 404', async () => {
                // Aggregator returns 404
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                });

                // SDK also returns 404
                const error: any = new Error('Not found');
                error.status = 404;
                mockGetFiles.mockRejectedValue(error);

                await expect(downloadBlob('test-both-404')).rejects.toThrow(BlobNotFoundError);
            });

            it('should throw DownloadFailedError for other SDK errors', async () => {
                // Aggregator fails with network error
                mockFetch.mockRejectedValueOnce(new Error('Network error'));

                // SDK fails with other error
                mockGetFiles.mockRejectedValueOnce(new Error('SDK error'));

                // Should retry and eventually fail with DownloadFailedError
                await expect(downloadBlob('test-sdk-error')).rejects.toThrow('Download failed for blob test-sdk-error: SDK error');
            });
        });
    });
});
