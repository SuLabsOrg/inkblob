import React, { useState } from 'react';
import { X, Eye, EyeOff, Sun, Moon, Settings as SettingsIcon } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../context/ThemeContext';
import { Modal } from './Modal';
import { GasSponsorSettings } from './GasSponsorSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { showSessionStatus, toggleSessionStatus } = useSettings();
    const { theme, toggleTheme } = useTheme();
    const { isSessionValid, sessionExpiresAt, hotWalletAddress } = useSession();
    const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'gas-sponsor'>('general');
    const [isGasSponsorModalOpen, setIsGasSponsorModalOpen] = useState(false);

    return (
        <>
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Settings"
        >
            <div className="flex h-[32rem]">
                {/* Vertical Tab Navigation */}
                <div className="w-32 border-r border-web3-border/30 p-3">
                    <nav className="space-y-1">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${
                                activeTab === 'general'
                                    ? 'bg-web3-primary/10 text-web3-primary border border-web3-primary/30'
                                    : 'text-web3-textMuted hover:bg-web3-card hover:text-web3-text border border-transparent'
                            }`}
                        >
                            <SettingsIcon size={16} />
                            <span>General</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('appearance')}
                            className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${
                                activeTab === 'appearance'
                                    ? 'bg-web3-primary/10 text-web3-primary border border-web3-primary/30'
                                    : 'text-web3-textMuted hover:bg-web3-card hover:text-web3-text border border-transparent'
                            }`}
                        >
                            <Moon size={16} />
                            <span>Appearance</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('gas-sponsor')}
                            className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${
                                activeTab === 'gas-sponsor'
                                    ? 'bg-web3-primary/10 text-web3-primary border border-web3-primary/30'
                                    : 'text-web3-textMuted hover:bg-web3-card hover:text-web3-text border border-transparent'
                            }`}
                        >
                            <SettingsIcon size={16} />
                            <span>Gas Sponsor</span>
                        </button>
                    </nav>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-6">
                        {activeTab === 'general' && (
                            <div className="space-y-8">
                                {/* Session Status Display Setting */}
                                <div>
                                    <h3 className="text-lg font-semibold text-web3-text mb-3">
                                        Session Status Display
                                    </h3>
                                    <p className="text-sm text-web3-textMuted mb-4">
                                        Show session key status, expiration time, and SUI/WAL balances in the top bar
                                    </p>

                                    <div className="flex items-center justify-between p-4 bg-web3-card/30 rounded-lg border border-web3-border/30">
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-web3-text">Show Session Status</h4>
                                                <p className="text-xs text-web3-textMuted mt-1">
                                                    Current: {showSessionStatus ? 'Visible' : 'Hidden'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={toggleSessionStatus}
                                                className={`p-3 rounded-lg border transition-all ${
                                                    showSessionStatus
                                                        ? 'bg-web3-primary/10 border-web3-primary/30 text-web3-primary hover:bg-web3-primary/20'
                                                        : 'bg-web3-card border-web3-border text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-text'
                                                }`}
                                                title={showSessionStatus ? 'Hide session status' : 'Show session status'}
                                            >
                                                {showSessionStatus ? <Eye size={18} /> : <EyeOff size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Session Information (shown when session is active) */}
                                {isSessionValid && (
                                    <div>
                                        <h3 className="text-lg font-semibold text-web3-text mb-3">
                                            Current Session
                                        </h3>
                                        <div className="space-y-3 p-4 bg-web3-card/30 rounded-lg border border-web3-border/30">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-web3-textMuted">Status</span>
                                                <span className="text-sm text-green-500 font-medium">Active</span>
                                            </div>

                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-web3-textMuted">Expires</span>
                                                <span className="text-sm text-web3-text">
                                                    {sessionExpiresAt
                                                        ? new Date(sessionExpiresAt).toLocaleString()
                                                        : 'Unknown'
                                                    }
                                                </span>
                                            </div>

                                            {hotWalletAddress && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-web3-textMuted">Hot Wallet</span>
                                                    <span className="text-sm text-web3-text font-mono">
                                                        {hotWalletAddress.slice(0, 6)}...{hotWalletAddress.slice(-4)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Help Section */}
                                <div className="pt-8 border-t border-web3-border/30">
                                    <h4 className="text-sm font-semibold text-web3-text mb-4">About Session Status</h4>
                                    <div className="space-y-3 text-xs text-web3-textMuted leading-relaxed">
                                        <p>
                                            <strong>Session Status:</strong> Shows whether your session key is active for frictionless note saving.
                                        </p>
                                        <p>
                                            <strong>Expiration Time:</strong> Displays when your current session will expire.
                                        </p>
                                        <p>
                                            <strong>Balances:</strong> Shows SUI and WAL token balances in your session's hot wallet.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'appearance' && (
                            <div className="space-y-8">
                                {/* Theme Setting */}
                                <div>
                                    <h3 className="text-lg font-semibold text-web3-text mb-3">
                                        Theme
                                    </h3>
                                    <p className="text-sm text-web3-textMuted mb-4">
                                        Choose your preferred color theme for the application
                                    </p>

                                    <div className="flex items-center justify-between p-4 bg-web3-card/30 rounded-lg border border-web3-border/30">
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-web3-text">Current Theme</h4>
                                                <p className="text-xs text-web3-textMuted mt-1">
                                                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={toggleTheme}
                                                className={`p-3 rounded-lg border transition-all ${
                                                    theme === 'dark'
                                                        ? 'bg-web3-card/50 border-web3-border/30 text-web3-text hover:bg-web3-cardHover'
                                                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                                                }`}
                                                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                                            >
                                                {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Theme Comparison */}
                                    <div className="grid grid-cols-1 gap-4 mt-4">
                                        <div className={`p-4 rounded-lg border ${
                                            theme === 'dark'
                                                ? 'border-web3-primary/30 bg-web3-primary/5'
                                                : 'border-blue-500/30 bg-blue-500/5'
                                        }`}>
                                            <div className="flex items-center gap-3 mb-3">
                                                {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                                                <span className="font-medium text-web3-text">
                                                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-web3-textMuted leading-relaxed">
                                                {theme === 'dark'
                                                    ? 'Dark interface with reduced eye strain in low-light environments. Perfect for extended use.'
                                                    : 'Light interface with enhanced readability in bright environments. Great for daytime use.'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Help Section */}
                                <div className="pt-8 border-t border-web3-border/30">
                                    <h4 className="text-sm font-semibold text-web3-text mb-4">About Themes</h4>
                                    <div className="space-y-3 text-xs text-web3-textMuted leading-relaxed">
                                        <p>
                                            <strong>Theme Selection:</strong> Choose between Dark and Light modes for better visibility and comfort.
                                        </p>
                                        <p>
                                            <strong>Your Preference:</strong> Your theme choice is automatically saved and applied on future visits.
                                        </p>
                                        <p>
                                            <strong>Quick Toggle:</strong> Click the theme button to instantly switch between modes.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Gas Sponsorship Tab */}
                        {activeTab === 'gas-sponsor' && (
                            <div className="space-y-8">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <h3 className="text-lg font-semibold text-slate-900 mb-3">
                                        Gas Sponsorship
                                    </h3>
                                    <p className="text-sm text-slate-600 mb-4">
                                        Configure gas sponsorship settings and manage your invitation codes.
                                    </p>
                                    <div className="flex justify-center">
                                        <button
                                            onClick={() => setIsGasSponsorModalOpen(true)}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                        >
                                            Open Gas Sponsor Settings
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-web3-border/30">
                <button
                    onClick={onClose}
                    className="px-6 py-2 rounded-lg bg-web3-primary text-white hover:bg-web3-primary/90 transition-colors font-medium"
                >
                    Done
                </button>
            </div>
        </Modal>
        <GasSponsorSettings
            isOpen={isGasSponsorModalOpen}
            onClose={() => setIsGasSponsorModalOpen(false)}
        />
        </>
    );
};