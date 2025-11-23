import React, { createContext, useContext, useState } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

interface SessionContextValue {
    sessionCap: any | null; // Replace 'any' with actual SessionCap type
    ephemeralKeypair: Ed25519Keypair | null;
    isSessionValid: boolean;
    authorizeSession: () => Promise<void>;
    revokeSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [sessionCap, setSessionCap] = useState<any | null>(null);
    const [ephemeralKeypair, setEphemeralKeypair] = useState<Ed25519Keypair | null>(null);

    const authorizeSession = async () => {
        // Implement session authorization logic
        console.log('Authorizing session...');
    };

    const revokeSession = async () => {
        // Implement session revocation logic
        console.log('Revoking session...');
        setSessionCap(null);
        setEphemeralKeypair(null);
    };

    return (
        <SessionContext.Provider value={{
            sessionCap,
            ephemeralKeypair,
            isSessionValid: !!sessionCap,
            authorizeSession,
            revokeSession
        }}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};
