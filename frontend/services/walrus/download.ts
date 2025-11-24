import { decryptContent } from '../../crypto/decryption';
import { createWalrusClient, WALRUS_CONFIG } from './config';
import { BlobNotFoundError, DownloadFailedError, withRetry } from './errors';

/**
 * Download blob from Walrus aggregator with timeout
 */
async function downloadFromAggregator(blobId: string): Promise<Uint8Array> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WALRUS_CONFIG.aggregatorTimeout);

    try {
        // Build aggregator URL - supports both /status and direct aggregator URLs
        const baseUrl = WALRUS_CONFIG.aggregator.replace('/status', '');
        const url = `${baseUrl}/v1/blobs/${blobId}`;

        console.debug(`[Walrus Download] Trying aggregator: ${url}`);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/octet-stream',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.debug(`[Walrus Download] Aggregator response: ${response.status} ${response.statusText}`);

            // For 404, don't throw error - will try SDK fallback
            if (response.status === 404) {
                throw new BlobNotFoundError(blobId);
            }

            // For other errors, include status in error message
            throw new Error(`Aggregator error: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        console.debug(`[Walrus Download] Aggregator success: ${arrayBuffer.byteLength} bytes`);
        return new Uint8Array(arrayBuffer);

    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.debug(`[Walrus Download] Aggregator timeout after ${WALRUS_CONFIG.aggregatorTimeout}ms`);
            throw new Error(`Aggregator timeout after ${WALRUS_CONFIG.aggregatorTimeout}ms`);
        }

        // Re-throw error for caller to handle
        throw error;
    }
}

/**
 * Download blob from Walrus SDK (fallback method)
 */
async function downloadFromSDK(blobId: string): Promise<Uint8Array> {
    const client = createWalrusClient();

    try {
        console.debug('[Walrus Download] Trying SDK fallback');

        // Fetch blob using walrus() extension API
        const [file] = await client.walrus.getFiles({ ids: [blobId] });
        const result = await file.bytes();

        console.debug(`[Walrus Download] SDK success: ${result.length} bytes`);
        return result;
    } catch (error: any) {
        console.error('[Walrus Download] SDK download failed:', error);

        // Check for 404 or specific error codes that indicate not found
        if (error.status === 404 || error.message?.includes('not found')) {
            throw new BlobNotFoundError(blobId);
        }

        throw new DownloadFailedError(blobId, error.message);
    }
}

/**
 * Download blob from Walrus by blob ID
 * Tries aggregator first, falls back to SDK if aggregator fails
 */
export async function downloadBlob(blobId: string): Promise<Uint8Array> {
    // First try aggregator (fast path)
    return withRetry(async () => {
        try {
            return await downloadFromAggregator(blobId);
        } catch (error: any) {
            console.debug('[Walrus Download] Aggregator failed, trying SDK fallback');

            // If aggregator is not available or blob not found, try SDK
            if (error instanceof BlobNotFoundError ||
                error.message?.includes('timeout') ||
                error.message?.includes('fetch') ||
                error.message?.includes('network') ||
                error.message?.includes('Aggregator error')) {

                return await downloadFromSDK(blobId);
            }

            // For other errors, re-throw for withRetry to handle
            throw error;
        }
    });
}

/**
 * Download and decrypt note content
 */
export async function downloadInkBlobContent(
    blobId: string,
    decryptionKey: CryptoKey
): Promise<string> {
    // 1. Download encrypted blob
    const encryptedBlob = await downloadBlob(blobId);

    // 2. Decrypt content
    return await decryptContent(encryptedBlob, decryptionKey);
}
