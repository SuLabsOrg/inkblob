import { useQuery } from '@tanstack/react-query';
import { useNotebook } from './useNotebook';
import { useEncryption } from '../context/EncryptionContext';
import { decryptText } from '../crypto/decryption';
import { useSuiClient } from '@mysten/dapp-kit';
import { SuiService } from '../services/suiService';
import { Folder } from '../types';

export function useFolders() {
    const { data: notebook } = useNotebook();
    const { encryptionKey } = useEncryption();
    const client = useSuiClient();
    const suiService = new SuiService(client);

    return useQuery({
        queryKey: ['folders', notebook?.data?.objectId],
        queryFn: async () => {
            if (!notebook || !encryptionKey || !notebook.data?.objectId) return [];

            try {
                const rawFolders = await suiService.fetchFolders(notebook.data.objectId);

                const decryptedFolders = await Promise.all(rawFolders.map(async (rawFolder) => {
                    try {
                        const name = await decryptText(rawFolder.name, encryptionKey);
                        return {
                            id: rawFolder.id.id,
                            name: name,
                            icon: 'folder', // Default icon for user folders
                            type: 'user',
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
        enabled: !!notebook && !!encryptionKey && !!notebook.data?.objectId,
    });
}
