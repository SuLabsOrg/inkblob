import { Eye, LogOut, PenLine, Users } from 'lucide-react';
import React from 'react';
import { PERMISSION_READ } from '../hooks/useSharedAccess';

interface SharedModeBannerProps {
    /** The shared notebook's on-chain object id (truncated for display). */
    notebookId: string;
    /** PERMISSION_READ (0) | PERMISSION_WRITE (1) - drives the Read only / Can edit pill. */
    permission: number;
    /** ms-epoch string from the AccessGrant, or null for no expiry. Display only. */
    expiresAt: string | null;
    /** Exits shared-viewing mode (App.tsx: exitShared + reset selection/search). */
    onExit: () => void;
}

/**
 * Persistent, non-dismissable banner shown above the Header the whole time the app is viewing a
 * notebook someone else shared with this wallet (ActiveNotebookContext kind 'shared'), so it's
 * always obvious the user is NOT in their own notebook, what they're allowed to do, and how to
 * get back. The only way to make it go away is the Exit button (or wallet change / lock, which
 * force-reset shared mode at the provider level).
 */
export const SharedModeBanner: React.FC<SharedModeBannerProps> = ({
    notebookId,
    permission,
    expiresAt,
    onExit,
}) => {
    const isReadOnly = permission === PERMISSION_READ;
    const truncatedId = `${notebookId.slice(0, 6)}...${notebookId.slice(-4)}`;

    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-web3-accent/10 border-b border-web3-accent/30 text-sm select-none">
            <Users size={15} className="shrink-0 text-web3-accent" />
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-web3-text font-medium whitespace-nowrap">Shared notebook</span>
                <span className="font-mono text-xs text-web3-textMuted truncate">{truncatedId}</span>
                <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                        isReadOnly
                            ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
                            : 'border-green-500/40 bg-green-500/10 text-green-300'
                    }`}
                >
                    {isReadOnly ? <Eye size={11} /> : <PenLine size={11} />}
                    {isReadOnly ? 'Read only' : 'Can edit'}
                </span>
                {expiresAt && (
                    <span className="text-xs text-web3-textMuted whitespace-nowrap">
                        expires {new Date(Number(expiresAt)).toLocaleDateString()}
                    </span>
                )}
                {!isReadOnly && (
                    <span className="text-xs text-web3-textMuted">
                        Autosave is disabled in shared notebooks; click Save to persist changes (wallet
                        signature required).
                    </span>
                )}
            </div>
            <button
                onClick={onExit}
                className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border border-web3-border text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-text transition-colors"
            >
                <LogOut size={12} />
                Exit shared notebook
            </button>
        </div>
    );
};
