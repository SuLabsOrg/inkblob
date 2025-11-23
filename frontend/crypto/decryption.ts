/**
 * Decrypt IV-prepended ciphertext
 * Input format: [12-byte IV || ciphertext || 16-byte auth_tag]
 */
export async function decryptContent(
    encryptedBlob: Uint8Array,
    key: CryptoKey
): Promise<string> {
    // Validate minimum length (12 IV + 16 tag = 28 bytes minimum)
    if (encryptedBlob.length < 28) {
        throw new Error('Invalid encrypted blob: too short');
    }

    // 1. Extract IV (first 12 bytes)
    const iv = encryptedBlob.slice(0, 12);

    // 2. Extract ciphertext with tag (remaining bytes)
    const ciphertextWithTag = encryptedBlob.slice(12);

    // 3. Decrypt with AES-256-GCM
    try {
        const plaintextBytes = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128,
            },
            key,
            ciphertextWithTag
        );

        // 4. Decode bytes to string
        return new TextDecoder().decode(plaintextBytes);
    } catch (error) {
        // Authentication tag verification failed or decryption error
        throw new Error('Decryption failed: data may be corrupted or tampered with');
    }
}

/**
 * Safely decode base64 string that may have UTF-8 encoding issues
 * Handles the case where base64 strings are corrupted by UTF-8 round-trip
 */
function safeBase64Decode(base64String: string): Uint8Array {
    try {
        // First attempt: standard base64 decoding
        return Uint8Array.from(atob(base64String), c => c.charCodeAt(0));
    } catch (error) {
        console.warn('[decryptText] Standard base64 decoding failed, attempting UTF-8 cleanup:', error.message);

        // Fix common UTF-8 base64 issues:
        // 1. Remove any non-base64 characters
        // 2. Fix padding issues
        // 3. Handle line breaks and whitespace
        const cleanedBase64 = base64String
            // Remove any characters that aren't valid base64
            .replace(/[^A-Za-z0-9+/=]/g, '')
            // Fix padding: base64 strings must have length divisible by 4
            .replace(/(.{2})(?=.)/g, '$1'); // Simple cleanup

        // Add proper padding if missing
        const paddedBase64 = cleanedBase64.padEnd(
            Math.ceil(cleanedBase64.length / 4) * 4,
            '='
        );

        console.debug('[decryptText] Cleaned base64:', {
            original: base64String,
            cleaned: cleanedBase64,
            padded: paddedBase64,
            originalLength: base64String.length,
            cleanedLength: cleanedBase64.length,
            paddedLength: paddedBase64.length
        });

        try {
            return Uint8Array.from(atob(paddedBase64), c => c.charCodeAt(0));
        } catch (secondError) {
            console.error('[decryptText] All base64 decoding attempts failed:', {
                originalError: error.message,
                secondError: secondError.message,
                originalString: base64String,
                cleanedString: paddedBase64
            });
            throw new Error(`Base64 decoding failed: ${secondError.message}`);
        }
    }
}

/**
 * Decrypt base64-encoded text (for titles, folder names)
 * Enhanced to handle UTF-8 encoding corruption from Move string storage
 */
export async function decryptText(
    encryptedText: string,
    key: CryptoKey
): Promise<string> {
    // Validate input - be more permissive for null/empty cases
    if (!encryptedText || typeof encryptedText !== 'string') {
        console.warn('[decryptText] Invalid encrypted text provided:', {
            encryptedText,
            type: typeof encryptedText,
            length: encryptedText?.length || 0
        });
        throw new Error('Invalid encrypted text: must be non-empty string');
    }

    // Trim whitespace and check if empty after trimming
    const trimmedText = encryptedText.trim();
    if (trimmedText === '') {
        console.warn('[decryptText] Empty encrypted text after trimming');
        throw new Error('Invalid encrypted text: empty string after trimming');
    }

    console.debug('[decryptText] Attempting to decrypt:', {
        textLength: encryptedText.length,
        textPreview: encryptedText.substring(0, 50) + (encryptedText.length > 50 ? '...' : ''),
        firstChar: encryptedText.charCodeAt(0),
        lastChar: encryptedText.charCodeAt(encryptedText.length - 1)
    });

    try {
        // Decode base64 to bytes with UTF-8 error handling
        const encryptedBytes = safeBase64Decode(encryptedText);

        console.debug('[decryptText] Base64 decoding successful:', {
            byteLength: encryptedBytes.length,
            expectedMinLength: 28, // 12 IV + 16 tag minimum
            firstBytes: Array.from(encryptedBytes.slice(0, 8)),
            lastBytes: Array.from(encryptedBytes.slice(-8))
        });

        // Validate minimum encrypted data length
        if (encryptedBytes.length < 28) {
            throw new Error(`Encrypted data too short: ${encryptedBytes.length} bytes (minimum 28)`);
        }

        // Decrypt the content
        const decryptedText = await decryptContent(encryptedBytes, key);

        console.debug('[decryptText] Decryption successful:', {
            resultLength: decryptedText.length,
            resultPreview: decryptedText.substring(0, 50)
        });

        return decryptedText;
    } catch (error) {
        console.error('[decryptText] Decryption failed:', {
            error: error.message,
            textLength: encryptedText.length,
            textSample: encryptedText.substring(0, 20)
        });
        throw error;
    }
}
