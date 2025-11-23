import { createWalrusClient } from './config';
import { decryptContent } from '../../crypto/decryption';
import { withRetry, DownloadFailedError, BlobNotFoundError } from './errors';

/**
 * Download blob from Walrus by blob ID
 */
export async function downloadBlob(blobId: string): Promise<Uint8Array> {
    return withRetry(async () => {
        const client = createWalrusClient();

        try {
            // Fetch from aggregator
            const blob = await client.read(blobId);
            return new Uint8Array(await blob.arrayBuffer());
        } catch (error: any) {
            console.error('Walrus download failed:', error);

            // Check for 404 or specific error codes that indicate not found
            // Note: The SDK might throw specific errors, we need to handle them.
            // Assuming standard HTTP error structure or SDK specific structure.
            // For now, we'll check message or status if available.
            if (error.status === 404 || error.message?.includes('not found')) {
                throw new BlobNotFoundError(blobId);
            }

            throw new DownloadFailedError(blobId, error.message);
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
