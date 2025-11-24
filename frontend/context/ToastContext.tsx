import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'loading' | 'info';
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  promise?: Promise<any>;
  onResolve?: (result: any) => void;
  onReject?: (error: any) => void;
}

export interface ConfirmDialog {
  id: string;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ToastContextValue {
  toasts: Toast[];
  confirmDialogs: ConfirmDialog[];
  toast: (options: Omit<Toast, 'id'>) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  loading: (title: string, promise?: Promise<any>) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
  confirm: (options: Omit<ConfirmDialog, 'id'>) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialogs, setConfirmDialogs] = useState<ConfirmDialog[]>([]);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const promiseTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const confirmResolversRef = useRef<Map<string, (value: boolean) => void>>(new Map());

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      promiseTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));

    // Clean up any associated timeouts
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }

    const promiseTimeout = promiseTimeoutsRef.current.get(id);
    if (promiseTimeout) {
      clearTimeout(promiseTimeout);
      promiseTimeoutsRef.current.delete(id);
    }
  }, []);

  const clear = useCallback(() => {
    setToasts([]);

    // Clear all timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();

    promiseTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    promiseTimeoutsRef.current.clear();
  }, []);

  const handlePromiseToast = useCallback((toast: Toast) => {
    if (!toast.promise) return;

    const promiseTimeout = setTimeout(() => {
      setToasts(prev =>
        prev.map(t =>
          t.id === toast.id
            ? { ...t, type: 'error', title: 'Operation timed out', description: 'The operation took too long to complete' }
            : t
        )
      );
      promiseTimeoutsRef.current.delete(toast.id);
    }, 30000); // 30 second timeout for promises

    promiseTimeoutsRef.current.set(toast.id, promiseTimeout);

    toast.promise
      .then((result) => {
        setToasts(prev =>
          prev.map(t =>
            t.id === toast.id
              ? { ...t, type: 'success', title: toast.title, description: toast.description || 'Operation completed successfully' }
              : t
          )
        );
        toast.onResolve?.(result);

        const timeout = setTimeout(() => dismiss(toast.id), 4000);
        timeoutsRef.current.set(toast.id, timeout);
      })
      .catch((error) => {
        setToasts(prev =>
          prev.map(t =>
            t.id === toast.id
              ? { ...t, type: 'error', title: toast.title, description: error?.message || 'Operation failed' }
              : t
          )
        );
        toast.onReject?.(error);

        const timeout = setTimeout(() => dismiss(toast.id), 6000);
        timeoutsRef.current.set(toast.id, timeout);
      })
      .finally(() => {
        const promiseTimeout = promiseTimeoutsRef.current.get(toast.id);
        if (promiseTimeout) {
          clearTimeout(promiseTimeout);
          promiseTimeoutsRef.current.delete(toast.id);
        }
      });
  }, [dismiss]);

  const toast = useCallback((options: Omit<Toast, 'id'>): string => {
    const id = generateId();
    const newToast: Toast = { ...options, id };

    setToasts(prev => [...prev, newToast]);

    // Auto-dismiss for non-loading toasts without promises
    if (options.type !== 'loading' && !options.promise) {
      const duration = options.duration ?? (options.type === 'error' ? 6000 : 4000);
      const timeout = setTimeout(() => dismiss(id), duration);
      timeoutsRef.current.set(id, timeout);
    }

    // Handle promise toasts
    if (options.promise) {
      handlePromiseToast(newToast);
    }

    return id;
  }, [dismiss, handlePromiseToast]);

  const success = useCallback((title: string, description?: string) => {
    return toast({ type: 'success', title, description });
  }, [toast]);

  const error = useCallback((title: string, description?: string) => {
    return toast({ type: 'error', title, description });
  }, [toast]);

  const loading = useCallback((title: string, description?: string | Promise<any>) => {
    // If second parameter is a Promise, treat it as a promise toast
    // If it's a string, treat it as a description
    if (description && typeof description !== 'string') {
      return toast({ type: 'loading', title, promise: description });
    } else {
      return toast({ type: 'loading', title, description });
    }
  }, [toast]);

  const info = useCallback((title: string, description?: string) => {
    return toast({ type: 'info', title, description });
  }, [toast]);

  const removeConfirmDialog = useCallback((id: string) => {
    setConfirmDialogs(prev => prev.filter(dialog => dialog.id !== id));
    confirmResolversRef.current.delete(id);
  }, []);

  const confirm = useCallback((options: Omit<ConfirmDialog, 'id'>): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = `confirm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const confirmDialog: ConfirmDialog = {
        ...options,
        id,
        onConfirm: async () => {
          try {
            // If onConfirm callback is provided, execute it
            if (options.onConfirm) {
              await options.onConfirm();
            }
            resolve(true);
          } catch (error) {
            resolve(false);
          } finally {
            removeConfirmDialog(id);
          }
        },
        onCancel: () => {
          options.onCancel?.();
          resolve(false);
          removeConfirmDialog(id);
        }
      };

      confirmResolversRef.current.set(id, resolve);
      setConfirmDialogs(prev => [...prev, confirmDialog]);
    });
  }, [removeConfirmDialog]);

  const value: ToastContextValue = {
    toasts,
    confirmDialogs,
    toast,
    success,
    error,
    loading,
    info,
    dismiss,
    clear,
    confirm,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
      <ConfirmDialogContainer />
    </ToastContext.Provider>
  );
};

// Toast Container Component
const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

// Individual Toast Component
const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const { dismiss } = useToast();

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'loading':
        return (
          <div className="animate-spin rounded-full h-4 w-4 border border-current border-t-transparent" />
        );
      case 'info':
        return 'ℹ';
      default:
        return null;
    }
  };

  const getColors = () => {
    switch (toast.type) {
      case 'success':
        return 'text-green-400 border-green-500/20 bg-green-500/10';
      case 'error':
        return 'text-red-400 border-red-500/20 bg-red-500/10';
      case 'loading':
        return 'text-blue-400 border-blue-500/20 bg-blue-500/10';
      case 'info':
        return 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10';
      default:
        return 'text-text-muted border-border bg-card';
    }
  };

  const handleClick = () => {
    if (toast.action) {
      toast.action.onClick();
    } else {
      dismiss(toast.id);
    }
  };

  return (
    <div
      className={`
        glass border-l-4 p-4 rounded-lg shadow-lg backdrop-blur-md
        max-w-md w-full pointer-events-auto cursor-pointer
        transform transition-all duration-300 ease-out
        animate-in slide-in-from-right-full
        hover:scale-105 hover:shadow-xl
        ${getColors()}
      `}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text">
            {toast.title}
          </p>
          {toast.description && (
            <p className="text-sm text-text-muted mt-1 opacity-90">
              {toast.description}
            </p>
          )}
          {toast.action && (
            <button
              className="text-sm font-medium mt-2 underline underline-offset-2 hover:no-underline"
              onClick={(e) => {
                e.stopPropagation();
                toast.action!.onClick();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          className="flex-shrink-0 ml-4 text-text-muted hover:text-text transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            dismiss(toast.id);
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Confirm Dialog Container Component
const ConfirmDialogContainer: React.FC = () => {
  const { confirmDialogs } = useToast();

  if (confirmDialogs.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" />
      {confirmDialogs.map((dialog) => (
        <ConfirmDialogItem key={dialog.id} dialog={dialog} />
      ))}
    </div>
  );
};

// Individual Confirm Dialog Component
const ConfirmDialogItem: React.FC<{ dialog: ConfirmDialog }> = ({ dialog }) => {
  const handleConfirm = async () => {
    await dialog.onConfirm();
  };

  const handleCancel = () => {
    dialog.onCancel?.();
  };

  return (
    <div className="relative glass border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 backdrop-blur-md animate-in zoom-in-95 fade-in duration-200">
      <div className="flex flex-col space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-text">
            {dialog.title}
          </h3>
          <p className="text-sm text-text-muted mt-2 whitespace-pre-line">
            {dialog.description}
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text transition-colors"
          >
            {dialog.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 rounded-lg transition-colors shadow-sm border border-violet-700/20 dark:border-violet-400/20"
          >
            {dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};