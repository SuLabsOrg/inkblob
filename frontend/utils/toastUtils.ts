import { Toast } from '../context/ToastContext';

// Move contract abort codes (notebook.move error constants)
const MOVE_ABORT_CODE_REGEX = /MoveAbort\([^)]*\)?,?\s*(\d+)\)/;
const GENERIC_ABORT_CODE_REGEX = /abort code[:\s]+(\d+)/i;

/**
 * Extracts the numeric Move abort code from an error's message, if present. Reused by both
 * sanitizeWeb3Error (for generic user-facing messaging) and callers that need to branch on a
 * *specific* abort code (e.g. E_VERSION_MISMATCH) rather than just getting a sanitized string -
 * keeps both use sites parsing the exact same pattern instead of drifting apart.
 */
export const getMoveAbortCode = (error: any): number | null => {
  const errorMessage = error?.message || error || '';
  const match = errorMessage.match(MOVE_ABORT_CODE_REGEX) || errorMessage.match(GENERIC_ABORT_CODE_REGEX);
  return match ? parseInt(match[1], 10) : null;
};

// Web3-specific error message sanitization
export const sanitizeWeb3Error = (error: any): { title: string; description: string } => {
  const errorMessage = error?.message || error || 'Unknown error';

  // Handle common Web3 error patterns
  if (errorMessage.includes('insufficient funds') || errorMessage.includes('not enough')) {
    return {
      title: 'Insufficient Funds',
      description: 'You don\'t have enough SUI or WAL tokens for this transaction. Please add funds to your wallet.'
    };
  }

  if (errorMessage.includes('User rejected') || errorMessage.includes('User denied')) {
    return {
      title: 'Transaction Cancelled',
      description: 'You cancelled the transaction. No changes were made.'
    };
  }

  if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
    return {
      title: 'Network Error',
      description: 'Unable to connect to the network. Please check your internet connection and try again.'
    };
  }

  if (errorMessage.includes('WAL')) {
    return {
      title: 'WAL Token Error',
      description: ' WAL tokens are required for session authorization. Get tokens from the testnet faucet.'
    };
  }

  if (errorMessage.includes('gas') || errorMessage.includes('budget')) {
    return {
      title: 'Gas Limit Exceeded',
      description: 'Transaction requires more gas than allowed. Please try a smaller operation or increase gas limit.'
    };
  }

  if (errorMessage.includes('nonce') || errorMessage.includes('sequence')) {
    return {
      title: 'Transaction Sequence Error',
      description: 'Please wait for your previous transaction to complete and try again.'
    };
  }

  if (errorMessage.includes('encrypted') || errorMessage.includes('decrypt')) {
    return {
      title: 'Encryption Error',
      description: 'Failed to encrypt or decrypt note content. Please ensure you\'re using the correct wallet.'
    };
  }

  if (errorMessage.includes('blob') || errorMessage.includes('Walrus')) {
    return {
      title: 'Storage Error',
      description: 'Failed to store note content. Please check your connection and try again.'
    };
  }

  // Move contract abort codes (notebook.move error constants)
  const abortMatch = errorMessage.match(/MoveAbort\([^)]*\)?,?\s*(\d+)\)/) || errorMessage.match(/abort code[:\s]+(\d+)/i);
  if (abortMatch) {
    const code = parseInt(abortMatch[1], 10);
    const abortMessages: Record<number, { title: string; description: string }> = {
      7: { title: 'Note Not Found', description: 'This note no longer exists on-chain. It may have been moved or removed elsewhere.' },
      8: { title: 'Folder Not Found', description: 'This folder no longer exists on-chain. Try refreshing your workspace.' },
      9: { title: 'Parent Folder Not Found', description: 'The destination folder no longer exists. Try refreshing your workspace.' },
      15: { title: 'Invalid Batch Size', description: 'The reorder request was malformed. Please try the drag-and-drop again.' },
      16: { title: 'Sort Order Conflict', description: 'Another change updated this folder\'s order first. Please try again.' },
      17: { title: 'Folder Nesting Too Deep', description: 'Folders can only be nested 5 levels deep. Choose a shallower location.' },
      18: { title: 'Circular Folder Reference', description: 'You can\'t move a folder inside one of its own subfolders.' },
      19: { title: 'Parent Folder Deleted', description: 'The destination folder has been deleted and can\'t accept new items.' },
      24: { title: 'Note Changed Elsewhere', description: 'This note was updated from another device or session. Reload the note to see the latest version before saving again.' },
      25: { title: 'Nesting Too Deep', description: 'Sub-pages can only be nested 5 levels deep. Choose a shallower parent page.' },
      26: { title: 'Circular Page Reference', description: 'You can\'t nest a page inside one of its own sub-pages.' },
      27: { title: 'Parent Page Not Found', description: 'The parent page no longer exists on-chain. Try refreshing your workspace.' },
      28: { title: 'Parent Page Deleted', description: 'The parent page has been moved to Trash and can\'t accept new sub-pages.' },
    };
    if (abortMessages[code]) return abortMessages[code];
  }

  // Generic fallback with sanitized message
  const cleanMessage = errorMessage
    .replace(/0x[a-fA-F0-9]{64}/g, '...wallet_address...') // Hide addresses
    .replace(/\b\d{10,}\b/g, '...large_number...') // Hide large numbers
    .substring(0, 100); // Limit length

  return {
    title: 'Operation Failed',
    description: cleanMessage || 'An unexpected error occurred. Please try again.'
  };
};

// Web3-specific success messages
export const createWeb3SuccessToast = (operation: string, details?: string): Omit<Toast, 'id'> => ({
  type: 'success',
  title: `${operation} Successful`,
  description: details || 'Operation completed successfully.'
});

// Web3-specific loading toasts with progress tracking
export const createWeb3LoadingToast = (operation: string, step?: string): Omit<Toast, 'id'> => ({
  type: 'loading',
  title: `${operation}...`,
  description: step || 'Processing transaction...'
});

// Specific operation templates
export const ToastTemplates = {
  // Note operations
  creatingNote: () => ({
    type: 'loading' as const,
    title: 'Creating Note',
    description: 'Encrypting and saving your note...'
  }),

  savingNote: () => ({
    type: 'loading' as const,
    title: 'Saving Note',
    description: 'Encrypting content and updating blockchain...'
  }),

  noteSaved: () => ({
    type: 'success' as const,
    title: 'Note Saved',
    description: 'Your note has been saved successfully.'
  }),

  deletingNote: () => ({
    type: 'loading' as const,
    title: 'Deleting Note',
    description: 'Removing note from blockchain...'
  }),

  // Session operations
  authorizingSession: () => ({
    type: 'loading' as const,
    title: 'Authorizing Session',
    description: 'Creating frictionless saving experience...'
  }),

  sessionAuthorized: () => ({
    type: 'success' as const,
    title: 'Session Authorized',
    description: 'You can now save notes without signing each time!'
  }),

  // Wallet operations
  connectingWallet: () => ({
    type: 'loading' as const,
    title: 'Connecting Wallet',
    description: 'Establishing secure connection...'
  }),

  walletConnected: (address: string) => ({
    type: 'success' as const,
    title: 'Wallet Connected',
    description: `Connected to ${address.slice(0, 6)}...${address.slice(-4)}`
  }),

  // Storage operations
  uploadingToWalrus: () => ({
    type: 'loading' as const,
    title: 'Uploading Content',
    description: 'Encrypting and storing to decentralized storage...'
  }),

  // Folder operations
  creatingFolder: () => ({
    type: 'loading' as const,
    title: 'Creating Folder',
    description: 'Setting up your new folder...'
  }),

  // Error recovery
  retryWithWallet: (operation: string, retryFn: () => void) => ({
    type: 'error' as const,
    title: `${operation} Failed`,
    description: 'Would you like to try again?',
    action: {
      label: 'Retry',
      onClick: retryFn
    }
  }),

  // Info messages
  sessionExpiring: () => ({
    type: 'info' as const,
    title: 'Session Expiring Soon',
    description: 'Your session will expire in less than an hour. Consider refreshing it.'
  }),

  // Network status
  networkStatus: (status: 'connecting' | 'connected' | 'disconnected') => {
    switch (status) {
      case 'connecting':
        return {
          type: 'loading' as const,
          title: 'Connecting to Network',
          description: 'Establishing connection to SUI blockchain...'
        };
      case 'connected':
        return {
          type: 'success' as const,
          title: 'Network Connected',
          description: 'Connected to SUI testnet'
        };
      case 'disconnected':
        return {
          type: 'error' as const,
          title: 'Network Disconnected',
          description: 'Please check your connection and refresh'
        };
    }
  }
};