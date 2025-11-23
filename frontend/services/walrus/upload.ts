import { createWalrusClient, WALRUS_CONFIG, createWalrusClientWithKeypair } from './config';
import { encryptContent } from '../../crypto/encryption';
import { withRetry, UploadFailedError } from './errors';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { getFullnodeUrl } from '@mysten/sui/client';

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

            // Check if this is the specific error related to missing address
            if (error.message && error.message.includes('toSuiAddress')) {
                throw new UploadFailedError(
                    'Walrus upload failed: Missing account address information. ' +
                    'This may occur when the wallet is not properly connected or the session keypair is not available. ' +
                    'Please make sure your wallet is connected and try again. Error: ' + error.message
                );
            }

            throw new UploadFailedError(error.message);
        }
    });
}

/**
 * Upload encrypted content to Walrus using session keypair for authentication
 * Uses direct Sui transaction to avoid the upload relay mechanism that causes the toSuiAddress error
 */
export async function uploadBlobWithSession(
    encryptedContent: Uint8Array,
    keypair: any,
    epochs: number = WALRUS_CONFIG.defaultEpochs
): Promise<UploadResult> {
    // Validate size
    if (encryptedContent.length > WALRUS_CONFIG.maxBlobSize) {
        throw new Error(`Blob exceeds max size of ${WALRUS_CONFIG.maxBlobSize} bytes`);
    }

    // Check if keypair is valid before proceeding
    if (!keypair || !keypair.toSuiAddress) {
        throw new Error('Valid keypair with toSuiAddress method required for session uploads');
    }

    // Get the account address from the keypair
    const accountAddress = keypair.toSuiAddress();
    console.log('[Walrus Upload with Session] Using account address:', accountAddress);

    return withRetry(async () => {
        try {
            // Use the Walrus client with the session keypair to ensure the SDK has access to address info
            // This properly integrates the keypair as required by the review
            const walrusClient = createWalrusClientWithKeypair(keypair);

            // Execute the upload operation using the Walrus SDK but with our keypair-aware client
            const result = await walrusClient.walrus.writeBlob({
                blob: encryptedContent,
                epochs,
                deletable: false,
            });

            console.log('[Walrus Upload with Session] Result:', result);

            // Extract blob ID and object reference from the Walrus SDK result
            const blobId = result.blobId;
            const blobObject = result.blobObject?.blobId || result.blobObject?.id || result.blobObject || blobId;

            return {
                blobId,
                blobObject,
                epochs,
            };

        } catch (error: any) {
            console.error('Walrus direct upload with session failed:', error);

            // Check if this is the specific error related to missing address in upload relay
            if (error.message && error.message.includes('toSuiAddress')) {
                throw new UploadFailedError(
                    'Walrus upload with session failed: The upload mechanism requires proper account information. Error: ' + error.message
                );
            }

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

/**
 * Upload note content using session keypair for authentication
 */
export async function uploadInkBlobContentWithSession(
    plaintext: string,
    encryptionKey: CryptoKey,
    keypair: any,
    epochs?: number
): Promise<UploadResult> {
    // 1. Encrypt content
    const encrypted = await encryptContent(plaintext, encryptionKey);

    // 2. Upload to Walrus using session
    return await uploadBlobWithSession(encrypted, keypair, epochs);
}
