import { useSuiClient } from '@mysten/dapp-kit';
import { useMemo } from 'react';
import { SuiService } from '../services/suiService';

export function useSuiService() {
    const client = useSuiClient();

    return useMemo(() => new SuiService(client), [client]);
}
