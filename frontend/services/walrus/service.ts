import { createWalrusClient, WALRUS_CONFIG } from './config';
import { encryptContent } from '../../crypto/encryption';
import { decryptContent } from '../../crypto/decryption';

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
        throw new Error(`Failed to upload to Walrus: ${error.message}`);
    }
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
 * Download blob from Walrus by blob ID
 */
export async function downloadBlob(blobId: string): Promise<Uint8Array> {
    const client = createWalrusClient();

    try {
        // Fetch from aggregator
        const blob = await client.read(blobId);

        return new Uint8Array(await blob.arrayBuffer()); // Convert to Uint8Array
    } catch (error: any) {
        console.error('Walrus download failed:', error);
        throw new Error(`Failed to download from Walrus: ${error.message}`);
    }
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
    // Note: decryptContent is imported from encryption.ts but it should be from decryption.ts
    // I will fix the import in the file content.
    const { decryptContent } = await import('../../crypto/decryption');
    return await decryptContent(encryptedBlob, decryptionKey);
}
