import { useQuery } from '@tanstack/react-query';
import { useSuiService } from './useSuiService';

/**
 * Looks up the shared WalFeeReserve object id for a notebook - required as a moveCall
 * argument by update_note/update_note_with_session (see suiService.ts's fetchWalFeeReserveId
 * doc comment for why this can't be read directly off the Notebook object).
 */
export function useWalFeeReserve(notebookId: string | undefined | null) {
    const suiService = useSuiService();

    return useQuery({
        queryKey: ['walFeeReserve', notebookId],
        queryFn: () => suiService.fetchWalFeeReserveId(notebookId as string),
        enabled: !!notebookId,
        staleTime: Infinity, // a notebook's reserve id never changes once created
    });
}
