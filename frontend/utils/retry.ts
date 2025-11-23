/**
 * Retry Utilities with Exponential Backoff
 *
 * Used for blockchain queries that may need time to propagate
 * Replaces fixed delays with intelligent retry logic
 */

export interface RetryOptions {
    maxAttempts?: number; // Maximum number of retry attempts (default: 5)
    initialDelay?: number; // Initial delay in ms (default: 500)
    maxDelay?: number; // Maximum delay in ms (default: 5000)
    backoffMultiplier?: number; // Delay multiplier per attempt (default: 2)
    shouldRetry?: (error: any) => boolean; // Custom retry condition
    onRetry?: (attempt: number, delay: number, error: any) => void; // Callback on retry
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
};

/**
 * Retry a function with exponential backoff
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => fetchSessionCap(hotWalletAddress),
 *   { maxAttempts: 3, initialDelay: 1000 }
 * );
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: any;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            // Attempt the operation
            const result = await fn();
            return result;
        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (options.shouldRetry && !options.shouldRetry(error)) {
                throw error;
            }

            // If this was the last attempt, throw
            if (attempt === opts.maxAttempts) {
                throw error;
            }

            // Calculate delay with exponential backoff
            const baseDelay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1);
            const delay = Math.min(baseDelay, opts.maxDelay);

            // Add jitter (±20%) to prevent thundering herd
            const jitter = delay * 0.2 * (Math.random() * 2 - 1);
            const finalDelay = Math.max(0, delay + jitter);

            // Log retry
            if (options.onRetry) {
                options.onRetry(attempt, finalDelay, error);
            } else {
                console.log(`[Retry] Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${Math.round(finalDelay)}ms...`);
            }

            // Wait before retry
            await sleep(finalDelay);
        }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError;
}

/**
 * Retry until a condition is met (polling)
 *
 * @example
 * const sessionCap = await retryUntil(
 *   async () => {
 *     const caps = await fetchSessionCaps(address);
 *     return caps.find(cap => !isExpired(cap));
 *   },
 *   (result) => result !== null && result !== undefined,
 *   { maxAttempts: 10, initialDelay: 1000 }
 * );
 */
export async function retryUntil<T>(
    fn: () => Promise<T>,
    condition: (result: T) => boolean,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastResult: T | undefined;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            const result = await fn();
            lastResult = result;

            // Check if condition is met
            if (condition(result)) {
                return result;
            }

            // If this was the last attempt, throw
            if (attempt === opts.maxAttempts) {
                throw new Error('Retry condition not met after maximum attempts');
            }

            // Calculate delay
            const baseDelay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1);
            const delay = Math.min(baseDelay, opts.maxDelay);
            const jitter = delay * 0.2 * (Math.random() * 2 - 1);
            const finalDelay = Math.max(0, delay + jitter);

            // Log retry
            if (options.onRetry) {
                options.onRetry(attempt, finalDelay, null);
            } else {
                console.log(`[Retry] Condition not met (attempt ${attempt}/${opts.maxAttempts}), retrying in ${Math.round(finalDelay)}ms...`);
            }

            // Wait before retry
            await sleep(finalDelay);

        } catch (error) {
            // If shouldRetry says no, throw immediately
            if (options.shouldRetry && !options.shouldRetry(error)) {
                throw error;
            }

            // If this was the last attempt, throw
            if (attempt === opts.maxAttempts) {
                throw error;
            }

            // Calculate delay
            const baseDelay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1);
            const delay = Math.min(baseDelay, opts.maxDelay);
            const jitter = delay * 0.2 * (Math.random() * 2 - 1);
            const finalDelay = Math.max(0, delay + jitter);

            // Log retry
            if (options.onRetry) {
                options.onRetry(attempt, finalDelay, error);
            } else {
                console.log(`[Retry] Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${Math.round(finalDelay)}ms...`, error);
            }

            // Wait before retry
            await sleep(finalDelay);
        }
    }

    throw new Error('Retry condition not met after maximum attempts');
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Common retry conditions
 */
export const RetryConditions = {
    /**
     * Retry on network errors only
     */
    onNetworkError: (error: any) => {
        const message = error?.message || '';
        return (
            message.includes('fetch') ||
            message.includes('network') ||
            message.includes('timeout') ||
            message.includes('ECONNREFUSED')
        );
    },

    /**
     * Retry on not found errors (useful for waiting for blockchain propagation)
     */
    onNotFound: (error: any) => {
        const message = error?.message || '';
        return (
            message.includes('not found') ||
            message.includes('does not exist') ||
            error?.status === 404
        );
    },

    /**
     * Always retry (except on explicit abort)
     */
    always: (error: any) => {
        return error?.name !== 'AbortError';
    },
};
