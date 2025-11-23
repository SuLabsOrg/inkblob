import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSuiService } from './useSuiService';

export function useNotebook() {
    const currentAccount = useCurrentAccount();
    const suiService = useSuiService();

    return useQuery({
        queryKey: ['notebook', currentAccount?.address],
        queryFn: async () => {
            if (!currentAccount?.address) return null;

            // 1. Query owned NotebookRegistry
            const registry = await suiService.queryNotebookRegistry(currentAccount.address);

            if (!registry) return null;

            // 2. Fetch shared Notebook object
            // Note: registry.notebook_id needs to be accessed correctly based on the Move struct parsing
            // For now assuming registry has a field notebook_id
            // In reality, we need to parse the Move struct fields
            // Using optional chaining and fallback for safety
            const notebookId = registry?.content?.fields?.notebook_id || registry?.data?.content?.fields?.notebook_id;

            if (!notebookId) return null;

            const notebook = await suiService.fetchNotebook(notebookId);
            return notebook;
        },
        enabled: !!currentAccount,
        staleTime: 30_000, // Refetch every 30s
    });
}
