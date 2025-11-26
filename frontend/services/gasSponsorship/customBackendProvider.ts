import { Transaction } from '@mysten/sui/transactions';
import {
  GasSponsorProvider,
  AuthInfo,
  SponsoredTransaction,
  GasEstimate,
  ProviderStatus,
  createSponsorshipError,
  CustomBackendAuthRequest,
  CustomBackendAuthResponse,
  CustomBackendConfig
} from './types';

export class CustomBackendProvider implements GasSponsorProvider {
  public readonly id = 'custom';
  public readonly name = 'Custom Backend';
  public readonly type = 'custom-backend' as const;

  private config: CustomBackendConfig | null = null;
  private availabilityCache: {
    status: boolean;
    lastChecked: number;
    cacheExpiry: number;
  } | null = null;

  async configure(config: ProviderConfig): Promise<void> {
    // Extract API key from custom settings if available
    const apiKey = config.customSettings?.apiKey;
    const endpoint = config.endpoint;
    const timeout = config.timeout || 8000;
    const retryAttempts = config.retryAttempts || 2;

    if (!endpoint && !apiKey) {
      throw createSponsorshipError(
        'PROVIDER_ERROR',
        'Custom backend provider requires either endpoint or API key configuration'
      );
    }

    this.config = {
      endpoint: endpoint || '',
      apiKey: apiKey,
      timeout: timeout,
      retryAttempts: retryAttempts
    };

    console.log('[CustomBackendProvider] Configured with endpoint:', this.config.endpoint);
  }

  async isAvailable(): Promise<boolean> {
    // Check cache first
    if (this.availabilityCache && Date.now() < this.availabilityCache.cacheExpiry) {
      return this.availabilityCache.status;
    }

    if (!this.config) {
      console.warn('[CustomBackendProvider] Not configured, marking as unavailable');
      return false;
    }

    try {
      // Simple health check - ping the endpoint
      const response = await this.makeRequest('/health', 'GET', undefined);

      const isAvailable = response.ok;
      const now = Date.now();

      // Cache for 30 seconds
      this.availabilityCache = {
        status: isAvailable,
        lastChecked: now,
        cacheExpiry: now + 30000
      };

      console.log(`[CustomBackendProvider] Availability check: ${isAvailable}`);
      return isAvailable;
    } catch (error) {
      console.warn('[CustomBackendProvider] Availability check failed:', error);

      const now = Date.now();
      this.availabilityCache = {
        status: false,
        lastChecked: now,
        cacheExpiry: now + 30000
      };

      return false;
    }
  }

  async estimateGas(tx: Transaction): Promise<GasEstimate> {
    if (!this.config) {
      throw createSponsorshipError(
        'PROVIDER_ERROR',
        'Provider not configured',
        this.id
      );
    }

    try {
      // For now, use a standard gas estimate based on transaction complexity
      // In a real implementation, this might call the backend for more accurate estimates
      const gasUnits = 5000; // Default estimate for simple operations
      const cost = '0.001'; // Rough estimate in SUI

      return {
        gasUnits,
        cost,
        canSponsor: true
      };
    } catch (error) {
      throw createSponsorshipError(
        'PROVIDER_ERROR',
        `Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.id,
        { originalError: error }
      );
    }
  }

  async sponsorTransaction(tx: Transaction, authInfo?: AuthInfo): Promise<SponsoredTransaction> {
    if (!this.config) {
      throw createSponsorshipError(
        'PROVIDER_ERROR',
        'Provider not configured',
        this.id
      );
    }

    if (!authInfo || authInfo.type !== 'invitation') {
      throw createSponsorshipError(
        'AUTHENTICATION_FAILED',
        'Custom backend provider requires invitation code authentication',
        this.id
      );
    }

    try {
      // Extract operation from transaction to determine if sponsorship is allowed
      const operation = this.extractOperationFromTransaction(tx);

      if (!operation) {
        throw createSponsorshipError(
          'INVALID_OPERATION',
          'Unable to determine operation type from transaction',
          this.id
        );
      }

      // Validate invitation code with backend
      const authRequest: CustomBackendAuthRequest = {
        invitationCode: authInfo.token,
        userAddress: this.extractSenderAddress(tx),
        operation
      };

      const authResponse = await this.authenticateWithBackend(authRequest);

      if (!authResponse.authorized || !authResponse.sponsorshipAvailable) {
        throw createSponsorshipError(
          authResponse.authorized ? 'INSUFFICIENT_QUOTA' : 'AUTHENTICATION_FAILED',
          authResponse.authorized
            ? 'Invitation code valid but insufficient quota remaining'
            : 'Invalid or expired invitation code',
          this.id,
          authResponse
        );
      }

      // For this implementation, we'll simulate sponsorship by adding a signature
      // In a real implementation, the backend would provide an actual gas sponsorship signature
      const sponsorSignature = authResponse.sponsorshipSignature || `custom-sponsored-${Date.now()}`;

      // Get gas estimate
      const gasEstimate = await this.estimateGas(tx);

      return {
        sponsoredTx: tx,
        sponsorSignature,
        gasUsed: gasEstimate.gasUnits,
        gasBudget: gasEstimate.gasUnits * 2, // Add buffer
        providerId: this.id
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw sponsorship errors
      }

      throw createSponsorshipError(
        'PROVIDER_ERROR',
        `Transaction sponsorship failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.id,
        { originalError: error }
      );
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const isAvailable = await this.isAvailable();

    return {
      available: isAvailable,
      lastChecked: this.availabilityCache?.lastChecked || Date.now(),
      errorCount: isAvailable ? 0 : (this.availabilityCache?.cacheExpiry ? 1 : 0)
    };
  }

  private async makeRequest(
    path: string,
    method: 'GET' | 'POST',
    body?: any,
    timeout?: number
  ): Promise<Response> {
    if (!this.config?.endpoint) {
      throw new Error('No endpoint configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || this.config!.timeout);

    try {
      const url = `${this.config.endpoint}${path}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Add API key if available
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async authenticateWithBackend(request: CustomBackendAuthRequest): Promise<CustomBackendAuthResponse> {
    let lastError: Error | null = null;
    const maxAttempts = this.config?.retryAttempts || 2;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.makeRequest('/auth/sponsor', 'POST', request);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
        }

        const authResponse: CustomBackendAuthResponse = await response.json();
        console.log('[CustomBackendProvider] Authentication successful:', authResponse);
        return authResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown authentication error');

        if (attempt < maxAttempts) {
          console.warn(`[CustomBackendProvider] Authentication attempt ${attempt + 1} failed, retrying...`, lastError);
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        } else {
          console.error('[CustomBackendProvider] All authentication attempts failed:', lastError);
        }
      }
    }

    throw lastError || new Error('Authentication failed after all retries');
  }

  private extractOperationFromTransaction(tx: Transaction): string | null {
    try {
      // Get the transaction data to extract the operation
      const txData = tx.getData();

      // Look for move calls to identify the operation
      if (txData.commands) {
        for (const command of txData.commands) {
          if (command.MoveCall && command.MoveCall.target) {
            const target = command.MoveCall.target;

            // Extract function name from target (e.g., "0x4a43e3b53b4e683a666224e33d0bedf0ede58e983767d706f638ad5716bc02a1::notebook::delete_note")
            const parts = target.split('::');
            if (parts.length >= 3) {
              const functionName = parts[2];

              // Map function names to operations
              switch (functionName) {
                case 'delete_note':
                  return 'delete_note';
                case 'create_folder':
                  return 'create_folder';
                case 'delete_folder':
                  return 'delete_folder';
                case 'move_note':
                  return 'move_note';
                case 'update_note':
                  return 'update_note_metadata';
                default:
                  console.warn(`[CustomBackendProvider] Unknown operation: ${functionName}`);
                  return null;
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[CustomBackendProvider] Error extracting operation from transaction:', error);
      return null;
    }
  }

  private extractSenderAddress(tx: Transaction): string {
    try {
      // Try to get sender from transaction data
      const txData = tx.getData();
      if (txData.sender) {
        return txData.sender;
      }

      // Fallback: this might need to be passed in from the calling context
      console.warn('[CustomBackendProvider] Could not extract sender address from transaction');
      return '0xunknown';
    } catch (error) {
      console.error('[CustomBackendProvider] Error extracting sender address:', error);
      return '0xunknown';
    }
  }
}