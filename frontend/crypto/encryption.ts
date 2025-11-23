/**
 * Encrypt plaintext using AES-256-GCM with random IV
 * Returns IV-prepended ciphertext: [IV || ciphertext || auth_tag]
 */
export async function encryptContent(
    plaintext: string,
    key: CryptoKey
): Promise<Uint8Array> {
    // 1. Generate random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 2. Encode plaintext to bytes
    const plaintextBytes = new TextEncoder().encode(plaintext);

    // 3. Encrypt with AES-256-GCM
    const ciphertextWithTag = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128, // 16-byte authentication tag
        },
        key,
        plaintextBytes
    );

    // 4. Prepend IV to ciphertext
    // Format: [12-byte IV || ciphertext || 16-byte tag]
    const encrypted = new Uint8Array(12 + ciphertextWithTag.byteLength);
    encrypted.set(iv, 0);
    encrypted.set(new Uint8Array(ciphertextWithTag), 12);

    return encrypted;
}

/**
 * Encrypt small text (e.g., note title, folder name)
 * Same algorithm, but for shorter content
 */
export async function encryptText(
    text: string,
    key: CryptoKey
): Promise<string> {
    const encrypted = await encryptContent(text, key);

    // Return as base64 for storage in blockchain strings
    return btoa(String.fromCharCode(...encrypted));
}
