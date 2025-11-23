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
 * Decrypt base64-encoded text (for titles, folder names)
 */
export async function decryptText(
    encryptedText: string,
    key: CryptoKey
): Promise<string> {
    // Decode base64 to bytes
    const encryptedBytes = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));

    return await decryptContent(encryptedBytes, key);
}
