import { useQuery } from '@tanstack/react-query';
import { useNotebook } from './useNotebook';
import { useEncryption } from '../context/EncryptionContext';
import { decryptText } from '../crypto/decryption';

export function useFolders() {
    const { data: notebook } = useNotebook();
    const { encryptionKey } = useEncryption();

    return useQuery({
        queryKey: ['folders', notebook?.data?.objectId],
        queryFn: async () => {
            if (!notebook || !encryptionKey) return [];

            // Similar to notes, fetching Table contents requires more than just getting the parent object.
            // For now, returning empty array.
            return [];
        },
        enabled: !!notebook && !!encryptionKey,
    });
}
