import React from 'react';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EncryptionProvider } from './context/EncryptionContext';
import { SessionProvider } from './context/SessionContext';
import '@mysten/dapp-kit/dist/index.css';

const { networkConfig } = createNetworkConfig({
    testnet: { url: getFullnodeUrl('testnet') },
    mainnet: { url: getFullnodeUrl('mainnet') },
});

const queryClient = new QueryClient();

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <QueryClientProvider client={queryClient}>
            <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
                <WalletProvider>
                    <EncryptionProvider>
                        <SessionProvider>
                            {children}
                        </SessionProvider>
                    </EncryptionProvider>
                </WalletProvider>
            </SuiClientProvider>
        </QueryClientProvider>
    );
};
