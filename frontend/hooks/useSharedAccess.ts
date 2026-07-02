import { useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { SuiService } from '../services/suiService';
import { useNotebook } from './useNotebook';

// Mirrors the Move contract's PERMISSION_READ / PERMISSION_WRITE constants
// (contracts/inkblob/sources/notebook.move) - kept in sync manually, same as
// E_VERSION_MISMATCH is in App.tsx, since there are no generated bindings.
export const PERMISSION_READ = 0;
export const PERMISSION_WRITE = 1;

// Sentinel the contract uses for "no expiry" (u64::MAX) - see notebook.move's NO_EXPIRY.
const NO_EXPIRY_SENTINEL = '18446744073709551615';

export interface SharedAccessGrant {
    /** The granted address. */
    address: string;
    permission: 0 | 1;
    /** null if the grant never expires. */
    expiresAt: number | null;
    /**
     * The grantee's owned SharedAccess object id, recovered from AccessGranted event history
     * (see fetchAccessGrantedEvents) - null if it couldn't be recovered (e.g. pruned event
     * history on the connected fullnode), in which case this grant can be viewed but not
     * revoked from this UI.
     */
    sharedAccessObjectId: string | null;
    /** True if expiresAt is in the past - the grant is inert on-chain even though the
     *  permissions Table entry hasn't been cleaned up yet (only a fresh mutation attempt by
     *  the grantee, or an explicit revoke, actually removes a table entry). */
    isExpired: boolean;
}

/**
 * Lists every address currently granted read/write access to the active notebook, for the
 * owner-side "who has access" UI (ShareModal). See fetchNotebookPermissions and
 * fetchAccessGrantedEvents in suiService.ts for why two separate queries are needed: the
 * permissions Table (read directly off the shared Notebook object) is the source of truth for
 * which grants are currently active, but doesn't record the SharedAccess object id needed to
 * revoke a grant - that's only recoverable from AccessGranted event history, keyed by grantee
 * address.
 */
export function useSharedAccess() {
    const { data: notebook } = useNotebook();
    const client = useSuiClient();
    const suiService = new SuiService(client);
    const notebookId = notebook?.data?.objectId;

    return useQuery({
        queryKey: ['sharedAccess', notebookId],
        queryFn: async (): Promise<SharedAccessGrant[]> => {
            if (!notebookId) return [];

            try {
                const [permissions, eventMap] = await Promise.all([
                    suiService.fetchNotebookPermissions(notebookId),
                    suiService.fetchAccessGrantedEvents(notebookId),
                ]);

                const now = Date.now();

                return permissions.map((grant) => {
                    const isNoExpiry = !grant.expiresAt || grant.expiresAt === NO_EXPIRY_SENTINEL;
                    const expiresAtMs = isNoExpiry ? null : Number(grant.expiresAt);
                    const isExpired = expiresAtMs !== null && expiresAtMs <= now;

                    return {
                        address: grant.address,
                        permission: grant.permission === PERMISSION_WRITE ? PERMISSION_WRITE : PERMISSION_READ,
                        expiresAt: expiresAtMs,
                        sharedAccessObjectId: eventMap.get(grant.address.toLowerCase()) ?? null,
                        isExpired,
                    };
                });
            } catch (error) {
                console.error('[useSharedAccess] Error fetching shared access grants:', error);
                return [];
            }
        },
        enabled: !!notebookId,
    });
}
