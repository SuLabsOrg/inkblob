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
    epochs: number = WALRUS_CONFIG.defaultEpochs,
    signer?: any
): Promise<UploadResult> {
    // Validate size
    if (encryptedContent.length > WALRUS_CONFIG.maxBlobSize) {
        throw new Error(`Blob exceeds max size of ${WALRUS_CONFIG.maxBlobSize} bytes`);
    }

    return withRetry(async () => {
        console.log('[Walrus Upload] Creating client with signer:', !!signer);
        if (signer) {
            console.log('[Walrus Upload] Signer type:', signer.constructor.name);
            console.log('[Walrus Upload] Signer has toSuiAddress:', typeof signer.toSuiAddress);
            try {
                console.log('[Walrus Upload] Signer address:', signer.toSuiAddress());
            } catch (e) {
                console.error('[Walrus Upload] Failed to get signer address:', e);
            }
        }

        const client = createWalrusClient(signer);

        try {
            // Upload blob via upload relay
            // Using walrus() extension API as per SDK v0.8.4
            console.log('[Walrus Upload] Calling writeBlob...');
            const result = await client.walrus.writeBlob({
                blob: encryptedContent,
                epochs,
                deletable: false, // Blobs should persist for the specified epochs
                signer, // Pass signer explicitly to writeBlob
            });

            console.log('[Walrus Upload] Result:', result);

            // Extract blob ID and object reference
            // The result structure uses snake_case
            const blobId = result.blobId || (result as any).blob_id;
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
    signer?: any,
    epochs?: number
): Promise<UploadResult> {
    // 1. Encrypt content
    const encrypted = await encryptContent(plaintext, encryptionKey);

    // 2. Upload to Walrus
    return await uploadBlob(encrypted, epochs, signer);
}
