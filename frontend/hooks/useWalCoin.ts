import { useSuiClient } from '@mysten/dapp-kit';
import { useCallback } from 'react';

// Same VITE_WAL_PACKAGE_ID lookup / coinType construction already used by SessionContext.tsx's
// authorizeSessionCore (WAL coin discovery for funding a session hot wallet) and by
// SessionStatus.tsx (hot wallet WAL balance display) - reused here for the same coin type,
// just for a different purpose (funding a real WAL storage-fee payment on note save).
const WAL_PACKAGE_ID = (import.meta as any).env.VITE_WAL_PACKAGE_ID;

export interface SpendableWalCoin {
    coinObjectId: string;
    balance: number; // in FROST (the WAL token's smallest unit, same unit as the Move contract's u64 fee amounts)
}

/**
 * Resolves a spendable Coin<WAL> for a given owner address - reuses the exact same
 * `client.getCoins({ owner, coinType })` pattern SessionContext.tsx already uses to find a WAL
 * coin for authorizeSessionTx's walCoinId, rather than inventing a new lookup mechanism.
 *
 * Returns the largest single coin (not a merged total) since a real payment needs one concrete
 * object id to pass as `walCoinId` to suiService's *NoteTx methods, which then split the
 * required fee off it via tx.splitCoins - picking the largest single coin (instead of just the
 * first, as authorizeSessionCore does) maximizes the chance a single coin alone covers the fee
 * without needing a separate merge step this hook does not implement.
 */
export function useWalCoin() {
    const client = useSuiClient();

    const getSpendableWalCoin = useCallback(async (owner: string): Promise<SpendableWalCoin | null> => {
        if (!owner || !WAL_PACKAGE_ID) return null;

        try {
            const result = await client.getCoins({
                owner,
                coinType: `${WAL_PACKAGE_ID}::wal::WAL`,
            });

            if (result.data.length === 0) return null;

            const largest = result.data.reduce((best, coin) =>
                BigInt(coin.balance) > BigInt(best.balance) ? coin : best
            );

            return {
                coinObjectId: largest.coinObjectId,
                balance: Number(largest.balance),
            };
        } catch (error) {
            console.error('[useWalCoin] Failed to query WAL coins:', error);
            return null;
        }
    }, [client]);

    return { getSpendableWalCoin };
}
