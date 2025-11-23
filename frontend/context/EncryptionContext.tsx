import React, { createContext, useContext, useState } from 'react';
import { deriveEncryptionKey } from '../crypto/keyDerivation';

interface EncryptionContextValue {
    encryptionKey: CryptoKey | null;
    deriveKey: (signature: string, userAddress: string) => Promise<void>;
    clearKey: () => void;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export const EncryptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    const deriveKey = async (signature: string, userAddress: string) => {
        // SECURITY FIX (P1): Now requires user address for user-specific salt
        if (!userAddress) {
            throw new Error('User address is required to derive encryption key');
        }
        const key = await deriveEncryptionKey(signature, userAddress);
        setEncryptionKey(key);
    };

    const clearKey = () => {
        setEncryptionKey(null);
    };

    return (
        <EncryptionContext.Provider value={{ encryptionKey, deriveKey, clearKey }}>
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
