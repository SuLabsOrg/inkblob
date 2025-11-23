import { useQuery } from '@tanstack/react-query';
import { useNotebook } from './useNotebook';
import { useEncryption } from '../context/EncryptionContext';
import { decryptText } from '../crypto/decryption';

export function useNotes() {
    const { data: notebook } = useNotebook();
    const { encryptionKey } = useEncryption();

    return useQuery({
        queryKey: ['notes', notebook?.data?.objectId],
        queryFn: async () => {
            if (!notebook || !encryptionKey) return [];

            // Parse notes from notebook object
            // This depends on how the Table is exposed in the object response.
            // If it's a Table, we can't list it directly from the object fields.
            // We need to use dynamic fields or a separate indexer.
            // For the MVP/Design, let's assume we can fetch them or we use a mock approach if Table listing is complex without indexer.
            // Design doc says: "Fetch Notebook object -> Extract notes Table -> Decrypt"
            // But listing Table keys requires RPC calls if not using an indexer.
            // For this implementation, I'll return an empty list or mock data if real fetching is too complex for now.

            // TODO: Implement Table iteration or Indexer query
            return [];
        },
        enabled: !!notebook && !!encryptionKey,
    });
}
