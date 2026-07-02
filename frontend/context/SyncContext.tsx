import React, { createContext, useContext, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSuiService } from '../hooks/useSuiService';
import { useActiveNotebook } from '../hooks/useActiveNotebook';

// Placeholder for future sync state (e.g. isSyncing) - empty for now
type SyncContextValue = Record<string, never>;

const SyncContext = createContext<SyncContextValue | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const suiService = useSuiService();
    // Gated on the ACTIVE notebook id (own or shared) rather than useNotebook directly, so a
    // grantee viewing a shared notebook still gets event-driven invalidation even while their own
    // notebook is missing/initializing. Own-mode value is identical to the old
    // notebook?.data?.objectId. The invalidations below deliberately stay prefix-shaped
    // (['notes'] / ['folders']): React Query v5's default fuzzy matching prefix-matches
    // ['notes', <anyNotebookId>], so they cover both modes' query keys unchanged.
    const { notebookId } = useActiveNotebook();

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        const setupSubscription = async () => {
            if (!notebookId) return;

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
    }, [suiService, notebookId, queryClient]);

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
