import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSuiService } from './useSuiService';

export function useNotebook() {
    const currentAccount = useCurrentAccount();
    const suiService = useSuiService();

    return useQuery({
        queryKey: ['notebook', currentAccount?.address],
        queryFn: async () => {
            if (!currentAccount?.address) {
                console.log('[useNotebook] No current account, returning null');
                return null;
            }

            console.log('[useNotebook] Querying notebook for account:', currentAccount.address);

            // 1. Query owned NotebookRegistry
            const registry = await suiService.queryNotebookRegistry(currentAccount.address);

            if (!registry) {
                console.log('[useNotebook] No NotebookRegistry found for user');
                return null;
            }

            console.log('[useNotebook] NotebookRegistry found:', JSON.stringify(registry, null, 2));

            // 2. Parse NotebookRegistry fields
            // The registry structure is: { data: { content: { fields: { ... } } } }
            const registryFields = registry?.data?.content?.fields;
            if (!registryFields) {
                console.error('[useNotebook] Cannot parse NotebookRegistry fields');
                return null;
            }

            const activeNotebookName = registryFields.active_notebook;
            const notebooksTable = registryFields.notebooks;

            if (!activeNotebookName) {
                console.warn('[useNotebook] No active_notebook found in registry');
                return null;
            }

            if (!notebooksTable || !notebooksTable.fields || !notebooksTable.fields.id || !notebooksTable.fields.id.id) {
                console.error('[useNotebook] Invalid notebooks table structure');
                return null;
            }

            const tableId = notebooksTable.fields.id.id;
            console.log('[useNotebook] Active notebook name:', activeNotebookName);
            console.log('[useNotebook] Notebooks table ID:', tableId);

            // 3. Query the Table dynamic field to get notebook ID
            try {
                const dynamicField = await suiService.getDynamicFieldObject(tableId, activeNotebookName);

                if (!dynamicField || !dynamicField.data) {
                    console.error('[useNotebook] No notebook found in table for name:', activeNotebookName);
                    return null;
                }

                console.log('[useNotebook] Dynamic field result:', JSON.stringify(dynamicField, null, 2));

                // The value should be an ID (address)
                const notebookId = dynamicField.data.content?.fields?.value;

                if (!notebookId) {
                    console.error('[useNotebook] Cannot extract notebook ID from dynamic field');
                    return null;
                }

                console.log('[useNotebook] Fetching notebook with ID:', notebookId);

                // 4. Fetch the actual Notebook object
                const notebook = await suiService.fetchNotebook(notebookId);
                console.log('[useNotebook] Notebook fetched successfully:', notebook);

                return notebook;
            } catch (error) {
                console.error('[useNotebook] Error querying table dynamic field:', error);
                return null;
            }
        },
        enabled: !!currentAccount,
        staleTime: 30_000, // Refetch every 30s
    });
}
