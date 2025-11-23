import React, { useState } from 'react';
import { useSignPersonalMessage, useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { useEncryption } from '../context/EncryptionContext';
import { useSuiService } from '../hooks/useSuiService';
import { KEY_DERIVATION_MESSAGE } from '../crypto/keyDerivation';
import { Loader2, Lock, Plus } from 'lucide-react';

interface OnboardingProps {
    mode: 'unlock' | 'initialize';
    onComplete?: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ mode, onComplete }) => {
    const { deriveKey } = useEncryption();
    const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const suiService = useSuiService();
    const currentAccount = useCurrentAccount();
    const [isLoading, setIsLoading] = useState(false);

    const handleUnlock = async () => {
        setIsLoading(true);
        try {
            const message = new TextEncoder().encode(KEY_DERIVATION_MESSAGE);
            const { signature } = await signPersonalMessage({ message });
            await deriveKey(signature);
            onComplete?.();
        } catch (error) {
            console.error('Unlock failed:', error);
            alert('Failed to unlock notebook. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInitialize = async () => {
        if (!currentAccount) return;
        setIsLoading(true);
        try {
            const tx = suiService.createNotebookTx();
            await signAndExecuteTransaction({
                transaction: tx,
            });
            // Wait for indexing/state update? 
            // In a real app we might poll, but for now we rely on parent re-render or manual refresh
            // Calling onComplete might trigger a refetch if parent handles it
            onComplete?.();
        } catch (error) {
            console.error('Initialization failed:', error);
            alert('Failed to create notebook. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (mode === 'unlock') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Unlock Your Notebook</h1>
                    <p className="text-muted-foreground">
                        Sign a message to derive your encryption key. Your notes are encrypted and can only be decrypted with this key.
                    </p>
                    <button
                        onClick={handleUnlock}
                        disabled={isLoading}
                        className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                        {isLoading ? 'Unlocking...' : 'Unlock Notebook'}
                    </button>
                </div>
            </div>
        );
    }

    if (mode === 'initialize') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <Plus className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Create Your Notebook</h1>
                    <p className="text-muted-foreground">
                        It looks like you don't have a notebook yet. Create one on the Sui blockchain to start storing your encrypted notes.
                    </p>
                    <button
                        onClick={handleInitialize}
                        disabled={isLoading}
                        className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        {isLoading ? 'Creating Notebook...' : 'Create Notebook'}
                    </button>
                </div>
            </div>
        );
    }

    return null;
};
