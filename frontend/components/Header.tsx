import React from 'react';
import { ConnectButton } from '@mysten/dapp-kit';
import { Sidebar as SidebarIcon, Edit } from 'lucide-react';

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
                <div className="flex items-center gap-2">
                    <img src="/logo.png" alt="Inkblob Logo" className="w-6 h-6 object-contain" />
                    <span className="text-sm font-semibold text-web3-text">
                        {folderName}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <ConnectButton className="!bg-web3-primary !text-black !font-bold !rounded-full !px-6 !py-2 !text-sm hover:!bg-web3-primary/90 hover:!scale-105 transition-all shadow-[0_0_15px_rgba(167,139,250,0.5)]" />

                <button
                    onClick={onCreateNote}
                    className="p-2 text-web3-textMuted hover:text-web3-accent transition-colors hover:bg-web3-cardHover rounded-lg"
                    title="New Note"
                >
                    <Edit size={20} />
                </button>
            </div>
        </div>
    );
};
