import React, { useState, useEffect } from 'react';
import { getProviderManager } from '../services/gasSponsorship/providerManager';
import { getCurrentGasSponsorConfig } from '../services/gasSponsorship/config';
import { ProviderStatus } from '../services/gasSponsorship/types';

interface GasSponsorSettingsContentProps {
  // No isOpen/onClose props needed since it's embedded directly
}

export const GasSponsorSettingsContent: React.FC<GasSponsorSettingsContentProps> = () => {
  const [providerStatuses, setProviderStatuses] = useState<Map<string, ProviderStatus>>(new Map());
  const [invitationCode, setInvitationCode] = useState('');
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const config = getCurrentGasSponsorConfig();
  const providerManager = getProviderManager();

  // Check provider status when component mounts
  useEffect(() => {
    const checkProviderStatuses = async () => {
      try {
        const statuses = await providerManager.getAllProviderStatuses();
        setProviderStatuses(statuses);
      } catch (error) {
        console.error('[GasSponsorSettingsContent] Error checking provider statuses:', error);
      }
    };

    checkProviderStatuses();
  }, []);

  const handleTestInvitationCode = async () => {
    if (!invitationCode.trim()) {
      setCodeMessage({ type: 'error', text: 'Please enter an invitation code' });
      return;
    }

    setIsCheckingCode(true);
    setCodeMessage(null);

    try {
      // For now, we'll just validate format (basic check)
      const codeRegex = /^[A-Z0-9]{8,16}$/; // 8-16 character alphanumeric codes
      if (codeRegex.test(invitationCode.trim())) {
        setCodeMessage({
          type: 'success',
          text: 'Invitation code format appears valid. Save to use for gas sponsorship.'
        });
      } else {
        setCodeMessage({
          type: 'error',
          text: 'Invalid invitation code format. Please check and try again.'
        });
      }
    } catch (error) {
      setCodeMessage({
        type: 'error',
        text: 'Error validating invitation code. Please try again.'
      });
    } finally {
      setIsCheckingCode(false);
    }
  };

  const handleSaveInvitationCode = () => {
    if (!invitationCode.trim()) {
      setCodeMessage({ type: 'error', text: 'Please enter an invitation code' });
      return;
    }

    // Save to localStorage (in production, this would be more secure)
    localStorage.setItem('gasSponsorInvitationCode', invitationCode.trim());
    setCodeMessage({
      type: 'success',
      text: 'Invitation code saved! It will be used for eligible transactions.'
    });

    // Clear input after saving
    setTimeout(() => {
      setInvitationCode('');
      setCodeMessage(null);
    }, 2000);
  };

  const handleClearInvitationCode = () => {
    localStorage.removeItem('gasSponsorInvitationCode');
    setInvitationCode('');
    setCodeMessage({ type: 'info', text: 'Invitation code cleared' });

    setTimeout(() => {
      setCodeMessage(null);
    }, 2000);
  };

  const getStatusColor = (status: ProviderStatus) => {
    if (status.available) return 'text-green-600';
    if (status.errorCount > 3) return 'text-red-600';
    return 'text-yellow-600';
  };

  const getStatusText = (status: ProviderStatus) => {
    if (status.available) return 'Available';
    if (status.lastError) return status.lastError;
    return 'Unavailable';
  };

  // Load saved invitation code on mount
  useEffect(() => {
    const savedCode = localStorage.getItem('gasSponsorInvitationCode');
    if (savedCode) {
      setInvitationCode(savedCode);
      setCodeMessage({
        type: 'info',
        text: 'Invitation code loaded from saved settings'
      });
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Provider Status */}
      <div>
        <h3 className="text-lg font-medium text-web3-text mb-3">Provider Status</h3>
        <div className="space-y-2">
          {providerStatuses.size === 0 ? (
            <p className="text-web3-textMuted text-sm">No gas sponsorship providers configured</p>
          ) : (
            Array.from(providerStatuses.entries()).map(([providerId, status]) => (
              <div key={providerId} className="flex items-center justify-between p-3 bg-web3-card/30 rounded">
                <div>
                  <span className="font-medium text-web3-text capitalize">
                    {providerId.replace('-', ' ')} Provider
                  </span>
                  <div className={`text-sm ${getStatusColor(status)}`}>
                    {getStatusText(status)}
                  </div>
                </div>
                <div className="text-right">
                  {status.lastChecked && (
                    <div className="text-xs text-web3-textMuted">
                      Last checked: {new Date(status.lastChecked).toLocaleTimeString()}
                    </div>
                  )}
                  {status.errorCount > 0 && (
                    <div className="text-xs text-red-600">
                      Errors: {status.errorCount}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Eligible Operations */}
      <div>
        <h3 className="text-lg font-medium text-web3-text mb-3">Eligible Operations</h3>
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-800 mb-2">
            The following operations are eligible for gas sponsorship:
          </p>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Delete notes</li>
            <li>• Create folders</li>
            <li>• Delete folders</li>
            <li>• Move notes between folders</li>
            <li>• Update note metadata (without content changes)</li>
          </ul>
          <p className="text-sm text-blue-800 mt-3 font-medium">
            Note: Content creation/modification requires WAL storage fees and uses the existing SessionCap system.
          </p>
        </div>
      </div>

      {/* Invitation Code */}
      <div>
        <h3 className="text-lg font-medium text-web3-text mb-3">Invitation Code</h3>
        <div className="space-y-3">
          <p className="text-sm text-web3-textMuted">
            Enter your invitation code to enable gas sponsorship for eligible transactions.
          </p>

          <div className="flex space-x-2">
            <input
              type="text"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              placeholder="Enter invitation code"
              className="flex-1 px-3 py-2 border border-web3-border rounded focus:outline-none focus:ring-2 focus:ring-web3-primary bg-web3-card text-web3-text"
              disabled={isCheckingCode}
            />
            <button
              onClick={handleTestInvitationCode}
              disabled={isCheckingCode}
              className="px-4 py-2 bg-web3-muted text-web3-text rounded hover:bg-web3-cardHover disabled:bg-web3-border/50 transition-colors"
            >
              {isCheckingCode ? 'Checking...' : 'Validate'}
            </button>
          </div>

          {codeMessage && (
            <div className={`text-sm p-2 rounded ${
              codeMessage.type === 'success' ? 'bg-green-50 text-green-700' :
              codeMessage.type === 'error' ? 'bg-red-50 text-red-700' :
              'bg-blue-50 text-blue-700'
            }`}>
              {codeMessage.text}
            </div>
          )}

          <div className="flex space-x-2">
            <button
              onClick={handleSaveInvitationCode}
              disabled={!invitationCode.trim()}
              className="px-4 py-2 bg-web3-primary text-white rounded hover:bg-web3-primary/90 disabled:bg-web3-border/50 transition-colors"
            >
              Save Code
            </button>
            <button
              onClick={handleClearInvitationCode}
              className="px-4 py-2 bg-web3-muted text-web3-text rounded hover:bg-web3-cardHover transition-colors"
            >
              Clear Code
            </button>
          </div>
        </div>
      </div>

      {/* Configuration Info */}
      <div>
        <h3 className="text-lg font-medium text-web3-text mb-3">Configuration</h3>
        <div className="bg-web3-card/30 p-4 rounded">
          <p className="text-sm text-web3-text mb-2">
            <strong>Fallback to Wallet:</strong> {config.fallbackToWallet ? 'Enabled' : 'Disabled'}
          </p>
          <p className="text-sm text-web3-text mb-2">
            <strong>Cache Timeout:</strong> {config.cacheTimeout / 1000}s
          </p>
          <p className="text-sm text-web3-text">
            <strong>Enabled Providers:</strong> {Object.values(config.providers).filter(p => p.enabled).length}
          </p>
        </div>
      </div>
    </div>
  );
};

// Keep the original modal-based component for backward compatibility, but mark as deprecated
interface GasSponsorSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GasSponsorSettings: React.FC<GasSponsorSettingsProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Gas Sponsorship Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <GasSponsorSettingsContent />
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};