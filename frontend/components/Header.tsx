import { ConnectButton } from '@mysten/dapp-kit';
import { Sidebar as SidebarIcon, Coins } from 'lucide-react';
import React from 'react';
import { SessionStatus } from './SessionStatus';

interface HeaderProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    folderName?: string;
    onCreateNote: () => void;
    /**
     * Whether the most recent note save actually attached a real WAL storage-fee payment on-chain
     * (see App.tsx's handleSaveNote): true = paid, false = skipped (e.g. insufficient WAL
     * balance), null = no save has completed yet this session, nothing to report. An honest,
     * read-only signal - not a toggle - so the user isn't left assuming storage fees are being
     * tracked when they silently aren't.
     */
    walPaymentActive?: boolean | null;
    /**
     * True while the app is viewing a notebook someone else shared with this wallet (either
     * permission level). Hides the SessionStatus widget: session caps are owner-only on-chain,
     * so showing the user's OWN session state while inside someone else's notebook would be
     * misleading (that session cannot sign anything for the shared notebook). The WAL-payment
     * indicator deliberately stays - it honestly reflects shared write saves too.
     */
    isSharedMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
    sidebarOpen,
    setSidebarOpen,
    folderName,
    onCreateNote,
    walPaymentActive,
    isSharedMode = false
}) => {
    return (
        <div className="h-14 bg-web3-card/50 backdrop-blur-md border-b border-web3-border flex items-center justify-between px-4 select-none">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={`p-2 rounded-lg hover:bg-web3-cardHover transition-colors ${!sidebarOpen ? 'text-web3-textMuted' : 'text-web3-primary'}`}
                    title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                    aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                    <SidebarIcon size={20} />
                </button>

                {/* Session Status - Leftmost position after sidebar toggle. Hidden in shared
                    mode (see isSharedMode's doc comment). */}
                {!isSharedMode && <SessionStatus className="hidden md:flex" />}

                {walPaymentActive !== null && walPaymentActive !== undefined && (
                    <div
                        className={`hidden md:flex items-center gap-1 text-xs ${walPaymentActive ? 'text-web3-accent' : 'text-web3-textMuted'}`}
                        title={walPaymentActive
                            ? 'Last save included a real WAL storage-fee payment, recorded on-chain.'
                            : 'Last save skipped WAL storage-fee payment (e.g. insufficient WAL balance) - content was still saved.'}
                    >
                        <Coins size={12} />
                        <span>{walPaymentActive ? 'Storage fee paid' : 'Storage fee skipped'}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4">
                <ConnectButton className="!bg-web3-primary !text-black !font-bold !rounded-full !px-6 !py-2 !text-sm hover:!bg-web3-primary/90 hover:!scale-105 transition-all shadow-[0_0_15px_rgba(167,139,250,0.5)]" />
            </div>
        </div>
    );
};
