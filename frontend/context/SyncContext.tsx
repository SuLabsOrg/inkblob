import React, { createContext, useContext, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSuiService } from '../hooks/useSuiService';
import { useNotebook } from '../hooks/useNotebook';

interface SyncContextValue {
    // Add any sync state if needed, e.g., isSyncing
}

const SyncContext = createContext<SyncContextValue | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const suiService = useSuiService();
    const { data: notebook } = useNotebook();

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        const setupSubscription = async () => {
            if (!notebook?.data?.objectId) return;

            try {
                unsubscribe = await suiService.subscribeToEvents((event) => {
                    console.log('Received event:', event);
                    // Invalidate queries to trigger refetch
                    // We can be more granular based on event type if needed
                    queryClient.invalidateQueries({ queryKey: ['notes'] });
                    queryClient.invalidateQueries({ queryKey: ['folders'] });
                });
            } catch (error) {
                console.error('Failed to subscribe to events:', error);
            }
        };

        setupSubscription();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [suiService, notebook?.data?.objectId, queryClient]);

    return (
        <SyncContext.Provider value={{}}>
            {children}
        </SyncContext.Provider>
    );
};

export const useSync = () => {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
};
