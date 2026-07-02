import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { SuiService } from '../services/suiService';

export interface SharedNotebookEntry {
    notebookId: string;
    /** Always null today - see fetchNotebooksSharedWithMe's doc comment: a grantee has no way
     *  to read the owner-side name mapping, only the notebook_id itself is available. */
    notebookName: string | null;
    permission: number;
    expiresAt: string | null;
}

/**
 * Lists every notebook that has ever granted the CURRENTLY CONNECTED wallet access and still
 * currently does (per the live on-chain permissions Table, not just event history) - the
 * grantee-side counterpart to useSharedAccess (which lists grantees for a notebook the current
 * wallet OWNS). Powers the "Shared with me" discovery UI (SharedNotebooksModal).
 */
export function useSharedNotebooks() {
    const currentAccount = useCurrentAccount();
    const client = useSuiClient();
    const suiService = new SuiService(client);
    const address = currentAccount?.address;

    return useQuery({
        queryKey: ['sharedNotebooks', address],
        queryFn: async (): Promise<SharedNotebookEntry[]> => {
            if (!address) return [];
            try {
                return await suiService.fetchNotebooksSharedWithMe(address);
            } catch (error) {
                console.error('[useSharedNotebooks] Error fetching shared notebooks:', error);
                return [];
            }
        },
        enabled: !!address,
        staleTime: 30_000,
    });
}
