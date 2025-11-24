import React, { createContext, useContext, useState } from 'react';
import { deriveEncryptionKey } from '../crypto/keyDerivation';

interface EncryptionContextValue {
    encryptionKey: CryptoKey | null;
    lastSignature: string | null;
    lastUserAddress: string | null;
    deriveKey: (signature: string, userAddress: string) => Promise<void>;
    clearKey: () => void;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export const EncryptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
    const [lastSignature, setLastSignature] = useState<string | null>(null);
    const [lastUserAddress, setLastUserAddress] = useState<string | null>(null);

    const deriveKey = async (signature: string, userAddress: string) => {
        // SECURITY FIX (P1): Now requires user address for user-specific salt
        if (!userAddress) {
            throw new Error('User address is required to derive encryption key');
        }
        const key = await deriveEncryptionKey(signature, userAddress);
        setEncryptionKey(key);

        // Store signature for potential reuse in session creation (OPTIMIZATION)
        setLastSignature(signature);
        setLastUserAddress(userAddress);
    };

    const clearKey = () => {
        setEncryptionKey(null);
        setLastSignature(null);
        setLastUserAddress(null);
    };

    return (
        <EncryptionContext.Provider value={{
            encryptionKey,
            lastSignature,
            lastUserAddress,
            deriveKey,
            clearKey
        }}>
            {children}
        </EncryptionContext.Provider>
    );
};

export const useEncryption = () => {
    const context = useContext(EncryptionContext);
    if (!context) {
        throw new Error('useEncryption must be used within an EncryptionProvider');
    }
    return context;
};
