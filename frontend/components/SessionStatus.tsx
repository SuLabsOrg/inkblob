import React from 'react';
import { Clock, Wallet, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useSession } from '../context/SessionContext';
import { useSettings } from '../context/SettingsContext';

interface SessionStatusProps {
    className?: string;
}

export const SessionStatus: React.FC<SessionStatusProps> = ({ className = '' }) => {
    const { showSessionStatus } = useSettings();
    const { isSessionValid, sessionExpiresAt, hotWalletAddress } = useSession();
    const currentAccount = useCurrentAccount();
    const client = useSuiClient();

    // Query hot wallet balances only when session is valid
    const { data: suiBalance, isLoading: suiLoading } = useQuery({
        queryKey: ['hot-wallet-sui-balance', hotWalletAddress],
        queryFn: async () => {
            if (!hotWalletAddress) return null;
            try {
                const result = await client.getBalance({
                    owner: hotWalletAddress,
                    coinType: '0x2::sui::SUI',
                });
                return Number(result.totalBalance) / 1_000_000_000; // Convert MIST to SUI
            } catch (error) {
                console.error('[SessionStatus] Failed to fetch SUI balance:', error);
                return null;
            }
        },
        enabled: !!hotWalletAddress && isSessionValid,
        staleTime: 5 * 60 * 1000, // 5 minutes cache
    });

    const { data: walBalance, isLoading: walLoading } = useQuery({
        queryKey: ['hot-wallet-wal-balance', hotWalletAddress],
        queryFn: async () => {
            if (!hotWalletAddress) return null;
            try {
                const walPackageId = import.meta.env.VITE_WAL_PACKAGE_ID;
                if (!walPackageId) return null;

                const result = await client.getBalance({
                    owner: hotWalletAddress,
                    coinType: `${walPackageId}::wal::WAL`,
                });
                return Number(result.totalBalance) / 1_000_000_000; // Convert to WAL (assuming 9 decimals)
            } catch (error) {
                console.error('[SessionStatus] Failed to fetch WAL balance:', error);
                return null;
            }
        },
        enabled: !!hotWalletAddress && isSessionValid,
        staleTime: 5 * 60 * 1000, // 5 minutes cache
    });

    // Calculate time until expiration
    const getTimeUntilExpiration = () => {
        if (!sessionExpiresAt) return null;
        const now = Date.now();
        const timeLeft = sessionExpiresAt - now;

        if (timeLeft <= 0) return 'Expired';

        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    };

    // Determine status color
    const getStatusColor = () => {
        if (!isSessionValid) return 'text-web3-textMuted';

        if (!sessionExpiresAt) return 'text-web3-textMuted';

        const timeLeft = sessionExpiresAt - Date.now();
        const oneHour = 60 * 60 * 1000;

        if (timeLeft <= 0) return 'text-web3-textMuted';
        if (timeLeft <= oneHour) return 'text-orange-500'; // Warning color
        return 'text-web3-accent'; // Active color
    };

    // Don't render if user has disabled session status or no account connected
    if (!showSessionStatus || !currentAccount) {
        return null;
    }

    const statusColor = getStatusColor();
    const timeUntilExpiration = getTimeUntilExpiration();
    const isBalanceLoading = suiLoading || walLoading;

    return (
        <div className={`flex items-center gap-3 text-xs ${className}`}>
            {/* Status Indicator */}
            <div className={`flex items-center gap-1 ${statusColor}`}>
                {isSessionValid ? (
                    <CheckCircle size={14} className="text-green-500" />
                ) : (
                    <X size={14} className="text-web3-textMuted" />
                )}
                <span className="font-medium">
                    {isSessionValid ? 'Session Active' : 'No Session'}
                </span>
            </div>

            {/* Expiration Time */}
            {isSessionValid && timeUntilExpiration && (
                <div className={`flex items-center gap-1 ${statusColor}`}>
                    <Clock size={12} />
                    <span>{timeUntilExpiration}</span>
                </div>
            )}

            {/* SUI Balance */}
            {isSessionValid && hotWalletAddress && (
                <div className={`flex items-center gap-1 text-web3-textMuted`}>
                    <Wallet size={12} />
                    <span>
                        {isBalanceLoading ? (
                            '...'
                        ) : suiBalance !== null ? (
                            `${suiBalance.toFixed(4)} SUI`
                        ) : (
                            'Error'
                        )}
                    </span>
                </div>
            )}

            {/* WAL Balance */}
            {isSessionValid && hotWalletAddress && walBalance !== null && (
                <div className={`flex items-center gap-1 text-web3-textMuted`}>
                    <span className="text-xs">WAL</span>
                    <span>
                        {isBalanceLoading ? (
                            '...'
                        ) : walBalance !== null ? (
                            `${walBalance.toFixed(4)}`
                        ) : (
                            'Error'
                        )}
                    </span>
                </div>
            )}

            {/* Warning for expiring session */}
            {isSessionValid && sessionExpiresAt && sessionExpiresAt - Date.now() <= 60 * 60 * 1000 && (
                <div className="flex items-center gap-1 text-orange-500">
                    <AlertCircle size={12} />
                    <span className="text-xs">Expiring Soon</span>
                </div>
            )}
        </div>
    );
};