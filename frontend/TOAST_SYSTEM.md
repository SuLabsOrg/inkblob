# Toast Notification System

InkBlob features a custom-built toast notification system that provides user-friendly feedback for all asynchronous operations. The system is designed to match the Mac OS Notes aesthetic with glass morphism styling and provides comprehensive Web3-specific error handling.

## Features

- **Glass morphism design** - Matches the existing UI theme
- **Multiple toast types** - Success, error, loading, and info notifications
- **Promise handling** - Automatic loading and completion toasts for async operations
- **Web3 error sanitization** - User-friendly messages for blockchain operations
- **Auto-dismissal** - Configurable duration for different toast types
- **Manual control** - Dismiss, clear, and manage individual toasts

## Usage

### Basic Toast API

```typescript
import { useToast } from './context/ToastContext';

const toast = useToast();

// Success notification
toast.success('Note Created', 'Your note has been created successfully!');

// Error notification
toast.error('Operation Failed', 'Could not complete the operation. Please try again.');

// Info notification
toast.info('Session Expiring', 'Your session will expire in less than an hour.');

// Loading notification (auto-dismisses after 30s)
toast.loading('Processing...', 'Please wait while we process your request.');

// Custom toast
toast.toast({
  type: 'success',
  title: 'Custom Success',
  description: 'This is a custom message',
  duration: 5000, // 5 seconds
  action: {
    label: 'View Details',
    onClick: () => console.log('Action clicked')
  }
});
```

### Promise Handling

```typescript
const saveNote = async () => {
  const loadingToastId = toast.loading('Saving Note', 'Encrypting content...');

  try {
    await performSaveOperation();

    // Dismiss loading and show success
    if (loadingToastId) toast.dismiss(loadingToastId);
    toast.success('Note Saved', 'Your changes have been saved!');

  } catch (error) {
    // Dismiss loading and show error
    if (loadingToastId) toast.dismiss(loadingToastId);
    const errorInfo = sanitizeWeb3Error(error);
    toast.error(errorInfo.title, errorInfo.description);
  }
};
```

### Web3 Error Sanitization

The `sanitizeWeb3Error` utility provides user-friendly messages for common Web3 errors:

```typescript
import { sanitizeWeb3Error } from './utils/toastUtils';

try {
  await blockchainOperation();
} catch (error) {
  const errorInfo = sanitizeWeb3Error(error);
  toast.error(errorInfo.title, errorInfo.description);
}
```

## Web3 Error Patterns

The system automatically handles common Web3 error patterns:

- **Insufficient funds** - Shows helpful message about SUI/WAL tokens
- **User rejected** - Indicates user cancelled the transaction
- **Network errors** - Provides connection troubleshooting tips
- **Wallet issues** - Sanitizes wallet-related errors
- **Encryption failures** - Handles decryption errors gracefully
- **Storage errors** - Manages Walrus upload/download issues

## Toast Templates

Pre-built templates for common operations:

```typescript
import { ToastTemplates } from './utils/toastUtils';

// Note operations
ToastTemplates.creatingNote();
ToastTemplates.savingNote();
ToastTemplates.noteSaved();
ToastTemplates.deletingNote();

// Session operations
ToastTemplates.authorizingSession();
ToastTemplates.sessionAuthorized();

// Wallet operations
ToastTemplates.connectingWallet();
ToastTemplates.walletConnected(address);

// Storage operations
ToastTemplates.uploadingToWalrus();
```

## Styling

The toast system uses existing CSS variables from the glass morphism design:

- **Success**: Green theme (`text-green-400`, `border-green-500/20`)
- **Error**: Red theme (`text-red-400`, `border-red-500/20`)
- **Loading**: Blue theme (`text-blue-400`, `border-blue-500/20`)
- **Info**: Cyan theme (`text-cyan-400`, `border-cyan-500/20`)

## Integration

The toast system is integrated into the main App component:

```typescript
// App.tsx
import { ToastProvider } from './context/ToastContext';

export default function App() {
  return (
    <ThemeProvider>
      <EncryptionProvider>
        <SessionProvider>
          <ToastProvider>
            <SyncProvider>
              <AppContent />
            </SyncProvider>
          </ToastProvider>
        </SessionProvider>
      </EncryptionProvider>
    </ThemeProvider>
  );
}
```

## Implementation Details

### Context Structure

- **ToastContext**: React context providing toast functionality
- **ToastProvider**: Context provider with toast state management
- **useToast**: Custom hook for accessing toast methods
- **ToastContainer**: Renders all active toasts
- **ToastItem**: Individual toast component with glass morphism styling

### Key Components

- **Automatic timeout management** - Configurable durations per toast type
- **Queue system** - Multiple toasts displayed simultaneously
- **Animation support** - Smooth slide-in/out transitions
- **Click handlers** - Dismiss on click, optional action buttons
- **Accessibility** - Keyboard navigation and screen reader support

### Error Handling

- **Input sanitization** - Prevents sensitive data exposure
- **Message classification** - Categorizes errors for better UX
- **Fallback messages** - Generic messages for unknown errors
- **Action suggestions** - Provides recovery options when possible

This toast system enhances the user experience by providing clear, consistent feedback for all operations while maintaining the Mac OS Notes aesthetic of the InkBlob application.