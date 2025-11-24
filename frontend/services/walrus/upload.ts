import { createWalrusClient, WALRUS_CONFIG } from './config';
import { encryptContent } from '../../crypto/encryption';
import { withRetry, UploadFailedError } from './errors';
import { WalrusFile } from '@mysten/walrus';

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
    signer?: any,
    currentAccountAddress?: string,
    signAndExecuteTransaction?: any
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
            console.log('[Walrus Upload] Starting upload...');

            if (signer) {
                // Session key available: use simplified writeBlob flow
                console.log('[Walrus Upload] Using writeBlob with session signer...');
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
            } else if (currentAccountAddress && signAndExecuteTransaction) {
                // No session key but have wallet: use writeFilesFlow for browser-friendly upload
                console.log('[Walrus Upload] Using writeFilesFlow with wallet transactions...');

                // Create WalrusFile from encrypted content
                const file = WalrusFile.from({
                    contents: encryptedContent,
                    identifier: `note-${Date.now()}`,
                });

                // Create flow for wallet-based upload
                const flow = client.walrus.writeFilesFlow({
                    files: [file],
                });

                // Encode the flow first (doesn't require user interaction)
                await flow.encode();

                // Step 1: Register blob (requires wallet signature)
                console.log('[Walrus Upload] Registering blob...');
                const registerTx = flow.register({
                    epochs,
                    owner: currentAccountAddress,
                    deletable: false,
                });

                const registerResult = await signAndExecuteTransaction({ transaction: registerTx });
                console.log('[Walrus Upload] Registration complete:', registerResult);

                // Step 2: Upload blob data
                console.log('[Walrus Upload] Uploading blob data...');
                await flow.upload({ digest: registerResult.digest });

                // Step 3: Certify blob (requires another wallet signature)
                console.log('[Walrus Upload] Certifying blob...');
                const certifyTx = flow.certify();
                await signAndExecuteTransaction({ transaction: certifyTx });

                const files = await flow.listFiles();
                console.log('[Walrus Upload] Files uploaded:', files);

                if (files.length === 0) {
                    throw new Error('No files were uploaded');
                }

                const uploadedFile = files[0];
                return {
                    blobId: uploadedFile.blobId,
                    blobObject: uploadedFile.blobId,
                    epochs,
                };
            } else {
                // Neither session key nor wallet available
                console.log('[Walrus Upload] No signer available - cannot upload');
                throw new Error('Unable to upload to Walrus: requires either session authorization or connected wallet');
            }
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
    epochs?: number,
    currentAccountAddress?: string,
    signAndExecuteTransaction?: any
): Promise<UploadResult> {
    // 1. Encrypt content
    const encrypted = await encryptContent(plaintext, encryptionKey);

    // 2. Upload to Walrus
    return await uploadBlob(encrypted, epochs, signer, currentAccountAddress, signAndExecuteTransaction);
}
