export class WalrusError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WalrusError';
    }
}

export class UploadFailedError extends WalrusError {
    constructor(message: string) {
        super(`Upload failed: ${message}`);
        this.name = 'UploadFailedError';
    }
}

export class DownloadFailedError extends WalrusError {
    constructor(blobId: string, message: string) {
        super(`Download failed for blob ${blobId}: ${message}`);
        this.name = 'DownloadFailedError';
    }
}

export class BlobNotFoundError extends WalrusError {
    constructor(blobId: string) {
        super(`Blob not found: ${blobId}`);
        this.name = 'BlobNotFoundError';
    }
}

export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // Don't retry if it's a BlobNotFoundError
            if (error instanceof BlobNotFoundError) {
                throw error;
            }

            // Don't retry on the last attempt
            if (attempt < maxRetries - 1) {
                // Exponential backoff
                const backoff = delayMs * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }
    }

    throw lastError;
}
