import { WalrusClient } from '@mysten/walrus';

export const WALRUS_CONFIG = {
    // Testnet configuration
    network: 'testnet' as const,

    // Upload relay for browser compatibility
    uploadRelay: 'https://publisher.walrus-testnet.walrus.space',

    // Aggregator for downloads
    aggregator: 'https://aggregator.walrus-testnet.walrus.space',

    // Default storage duration (epochs)
    // 1 epoch ≈ 24 hours on testnet
    defaultEpochs: 30, // ~30 days

    // Max blob size (100 MB)
    maxBlobSize: 100 * 1024 * 1024,
};

/**
 * Initialize Walrus client
 */
export function createWalrusClient(): WalrusClient {
    return new WalrusClient({
        publisher: WALRUS_CONFIG.uploadRelay,
        aggregator: WALRUS_CONFIG.aggregator,
    });
}
