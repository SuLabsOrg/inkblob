import { useQuery } from '@tanstack/react-query';
import { useActiveNotebook } from './useActiveNotebook';
import { decryptText } from '../crypto/decryption';
import { useSuiClient } from '@mysten/dapp-kit';
import { SuiService } from '../services/suiService';
import { Folder } from '../types';

export function useFolders() {
    // Active-notebook seam: in own mode this is exactly useNotebook()'s objectId +
    // useEncryption()'s key (identical behavior/query key to before); in shared mode it's the
    // shared notebook id + the unwrapped shared content key, and the changed query key makes
    // React Query refetch while keeping the own-mode cache warm for instant exit.
    const { notebookId, encryptionKey } = useActiveNotebook();
    const client = useSuiClient();
    const suiService = new SuiService(client);

    return useQuery({
        queryKey: ['folders', notebookId],
        queryFn: async () => {
            if (!notebookId || !encryptionKey) return [];

            try {
                const rawFolders = await suiService.fetchFolders(notebookId);

                const decryptedFolders = await Promise.all(rawFolders.map(async (rawFolder) => {
                    try {
                        const name = await decryptText(rawFolder.encrypted_name, encryptionKey);

                        // Handle parent_id (Option<ID>) - Move Option representation
                        let parentId: string | null = null;
                        if (rawFolder.parent_id && rawFolder.parent_id.fields && rawFolder.parent_id.fields.vec && rawFolder.parent_id.fields.vec.length > 0) {
                            parentId = rawFolder.parent_id.fields.vec[0];
                        }

                        const sortOrder = parseInt(rawFolder.sort_order) || 0;
                        const isDeleted = rawFolder.is_deleted === true;

                        return {
                            id: rawFolder.id.id ?? rawFolder.id,
                            name: name,
                            icon: 'folder', // Default icon for user folders
                            type: 'user',
                            parentId,
                            sortOrder,
                            isDeleted,
                        } as Folder;
                    } catch (e) {
                        console.error('Failed to decrypt folder:', rawFolder.id, e);
                        return null;
                    }
                }));

                return decryptedFolders.filter((f): f is Folder => f !== null);
            } catch (error) {
                console.error('Error fetching folders:', error);
                return [];
            }
        },
        enabled: !!notebookId && !!encryptionKey,
    });
}
