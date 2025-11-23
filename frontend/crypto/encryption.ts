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

    // Return as base64, but use a UTF-8 safe approach
    // Convert Uint8Array to base64 using a safer method
    const binaryString = Array.from(encrypted, byte => String.fromCharCode(byte)).join('');
    const base64String = btoa(binaryString);

    console.debug('[encryptText] Encrypted text:', {
        originalLength: text.length,
        encryptedLength: encrypted.length,
        base64Length: base64String.length,
        originalPreview: text.substring(0, 20),
        base64Preview: base64String.substring(0, 40) + '...'
    });

    return base64String;
}
