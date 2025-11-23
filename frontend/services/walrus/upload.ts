import { createWalrusClient, WALRUS_CONFIG } from './config';
import { encryptContent } from '../../crypto/encryption';
import { withRetry, UploadFailedError } from './errors';

export interface UploadResult {
    blobId: string;
    blobObject: string; // Sui object reference
    epochs: number;
}

/**
 * Upload encrypted content to Walrus
 */
export async function uploadBlob(
    encryptedContent: Uint8Array,
    epochs: number = WALRUS_CONFIG.defaultEpochs
): Promise<UploadResult> {
    // Validate size
    if (encryptedContent.length > WALRUS_CONFIG.maxBlobSize) {
        throw new Error(`Blob exceeds max size of ${WALRUS_CONFIG.maxBlobSize} bytes`);
    }

    return withRetry(async () => {
        const client = createWalrusClient();

        try {
            // Upload blob via upload relay
            // Using walrus() extension API as per SDK v0.8.4
            const result = await client.walrus.writeBlob({
                blob: encryptedContent,
                epochs,
                deletable: false, // Blobs should persist for the specified epochs
            });

            console.log('[Walrus Upload] Result:', result);

            // Extract blob ID and object reference
            // The result structure should contain blobId and possibly blobObject
            const blobId = result.blobId;
            const blobObject = result.blobObject?.blobId || result.blobObject?.id || blobId;

            return {
                blobId,
                blobObject,
                epochs,
            };
        } catch (error: any) {
            console.error('Walrus upload failed:', error);
            throw new UploadFailedError(error.message);
        }
    });
}

/**
 * Upload note content (encrypt + upload)
 */
export async function uploadInkBlobContent(
    plaintext: string,
    encryptionKey: CryptoKey,
    epochs?: number
): Promise<UploadResult> {
    // 1. Encrypt content
    const encrypted = await encryptContent(plaintext, encryptionKey);

    // 2. Upload to Walrus
    return await uploadBlob(encrypted, epochs);
}
