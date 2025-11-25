import { ConnectButton } from '@mysten/dapp-kit';
import { Sidebar as SidebarIcon } from 'lucide-react';
import React from 'react';
import { SessionStatus } from './SessionStatus';

interface HeaderProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    folderName?: string;
    onCreateNote: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    sidebarOpen,
    setSidebarOpen,
    folderName,
    onCreateNote
}) => {
    return (
        <div className="h-14 bg-web3-card/50 backdrop-blur-md border-b border-web3-border flex items-center justify-between px-4 select-none">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={`p-2 rounded-lg hover:bg-web3-cardHover transition-colors ${!sidebarOpen ? 'text-web3-textMuted' : 'text-web3-primary'}`}
                >
                    <SidebarIcon size={20} />
                </button>

                {/* Session Status - Leftmost position after sidebar toggle */}
                <SessionStatus className="hidden md:flex" />
            </div>

            <div className="flex items-center gap-4">
                <ConnectButton className="!bg-web3-primary !text-black !font-bold !rounded-full !px-6 !py-2 !text-sm hover:!bg-web3-primary/90 hover:!scale-105 transition-all shadow-[0_0_15px_rgba(167,139,250,0.5)]" />
            </div>
        </div>
    );
};
