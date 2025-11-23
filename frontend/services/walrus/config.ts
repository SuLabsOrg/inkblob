import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { walrus } from '@mysten/walrus';
// Import WASM URL for Vite bundler
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';

export const WALRUS_CONFIG = {
    // Testnet configuration
    network: 'testnet' as const,

    // Upload relay for browser compatibility
    uploadRelay: import.meta.env.VITE_WALRUS_PUBLISHER_URL || 'https://publisher.testnet.walrus.space',

    // Aggregator for downloads
    aggregator: import.meta.env.VITE_WALRUS_AGGREGATOR_URL || 'https://aggregator.testnet.walrus.space',

    // Default storage duration (epochs)
    // 1 epoch ≈ 24 hours on testnet
    defaultEpochs: 30, // ~30 days

    // Max blob size (100 MB)
    maxBlobSize: 100 * 1024 * 1024,
};

/**
 * Create Walrus-extended Sui client with JSON RPC
 * Uses SuiJsonRpcClient with walrus() extension as per SDK v0.8.4 requirements
 */
export function createWalrusClient() {
    const client = new SuiJsonRpcClient({
        url: getFullnodeUrl('testnet'),
        network: 'testnet',
    }).$extend(
        walrus({
            // Configure WASM URL for Vite bundler
            // This ensures the WASM file is properly loaded in browser
            wasmUrl: walrusWasmUrl,

            // Configure upload relay for browser environments
            // This reduces the number of requests needed for uploads
            uploadRelay: {
                host: WALRUS_CONFIG.uploadRelay,
                sendTip: {
                    max: 1_000, // Maximum tip in MIST
                },
            },
        })
    );

    return client;
}

/**
 * Create Walrus client that can be used with session keypair for signing
 * @param keypair The Ed25519Keypair to use for signing operations
 * @returns Extended SuiClient that supports Walrus operations
 */
export function createWalrusClientWithKeypair(keypair: any) {
    // We still create the same client, but the keypair info would be used differently
    // Since the Walrus SDK expects address information internally,
    // we need to ensure that when write operations happen,
    // the keypair's address is available in the right context
    const client = new SuiJsonRpcClient({
        url: getFullnodeUrl('testnet'),
        network: 'testnet',  // Add the network parameter that Walrus SDK requires
    }).$extend(
        walrus({
            // Configure WASM URL for Vite bundler
            wasmUrl: walrusWasmUrl,

            // Configure upload relay for browser environments
            uploadRelay: {
                host: WALRUS_CONFIG.uploadRelay,
                sendTip: {
                    max: 1_000, // Maximum tip in MIST
                },
            },
        })
    );

    // Attach the keypair to the client instance for reference if needed
    (client as any).keypair = keypair;

    return client;
}
