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
            // Upload blob via relay
            const result = await client.store(encryptedContent, {
                epochs,
            });

            // Result contains:
            // - blobId: unique content identifier
            // - blobObject: Sui object reference for tracking
            return {
                blobId: result.blobId,
                blobObject: result.blobObject!.id, // Ensure we get the ID
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
