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

interface ToastContextValue {
  toasts: Toast[];
  toast: (options: Omit<Toast, 'id'>) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  loading: (title: string, promise?: Promise<any>) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
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
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const promiseTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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

  const loading = useCallback((title: string, promise?: Promise<any>) => {
    return toast({ type: 'loading', title, promise });
  }, [toast]);

  const info = useCallback((title: string, description?: string) => {
    return toast({ type: 'info', title, description });
  }, [toast]);

  const value: ToastContextValue = {
    toasts,
    toast,
    success,
    error,
    loading,
    info,
    dismiss,
    clear,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
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