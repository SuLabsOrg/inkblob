import { Transaction } from '@mysten/sui/transactions';
import {
  GasSponsorProvider,
  AuthInfo,
  SponsoredTransaction,
  GasEstimate,
  ProviderStatus,
  createSponsorshipError,
  EnokiAuthRequest,
  EnokiAuthResponse,
  EnokiConfig
} from './types';

export class EnokiProvider implements GasSponsorProvider {
  public readonly id = 'enoki';
  public readonly name = 'Enoki';
  public readonly type = 'enoki' as const;

  private config: EnokiConfig | null = null;
  private availabilityCache: {
    status: boolean;
    lastChecked: number;
    cacheExpiry: number;
  } | null = null;

  async configure(config: EnokiConfig): Promise<void> {
    if (!config.clientId) {
      throw createSponsorshipError(
        'PROVIDER_ERROR',
        'Enoki provider requires clientId configuration'
      );
    }

    this.config = {
      endpoint: config.endpoint || 'https://api.enoki.mystenlabs.com',
      clientId: config.clientId,
      scope: config.scope || ['gas_sponsor'],
      timeout: config.timeout || 10000,
      retryAttempts: config.retryAttempts || 3
    };

    console.log('[EnokiProvider] Configured with endpoint:', this.config.endpoint);
  }

  async isAvailable(): Promise<boolean> {
    // Check cache first
    if (this.availabilityCache && Date.now() < this.availabilityCache.cacheExpiry) {
      return this.availabilityCache.status;
    }

    if (!this.config) {
      return false;
    }

    try {
      // Simple health check - Enoki API doesn't require auth for basic availability
      const response = await fetch(`${this.config.endpoint}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const isAvailable = response.ok;

      // Cache the result for 30 seconds
      this.availabilityCache = {
        status: isAvailable,
        lastChecked: Date.now(),
        cacheExpiry: Date.now() + 30000
      };

      console.log('[EnokiProvider] Availability check:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('[EnokiProvider] Availability check failed:', error);

      // Cache failure for 30 seconds
      this.availabilityCache = {
        status: false,
        lastChecked: Date.now(),
        cacheExpiry: Date.now() + 30000
      };

      return false;
    }
  }

  async sponsorTransaction(tx: Transaction, authInfo?: AuthInfo): Promise<SponsoredTransaction> {
    if (!this.config) {
      throw createSponsorshipError(
        'PROVIDER_ERROR',
        'Enoki provider not configured'
      );
    }

    try {
      // Extract transaction data for Enoki API
      const txBytes = await tx.build({ client: null });

      // Note: Enoki authentication is handled backend-side
      // Frontend just sends the transaction for sponsorship
      const sponsorRequest = {
        transactionBytes: Array.from(txBytes),
        operation: this.extractOperationType(tx),
        userAddress: this.extractUserAddress(tx)
      };

      console.log('[EnokiProvider] Sponsoring transaction:', {
        operation: sponsorRequest.operation,
        userAddress: sponsorRequest.userAddress
      });

      const response = await fetch(`${this.config.endpoint}/sponsor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this.config.clientId,
        },
        body: JSON.stringify(sponsorRequest),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createSponsorshipError(
          'PROVIDER_ERROR',
          `Enoki sponsorship failed: ${errorData.message || response.statusText}`,
          this.id,
          errorData
        );
      }

      const sponsorData = await response.json();

      // Create sponsored transaction
      const sponsoredTx = Transaction.from(sponsorData.sponsoredTransactionBytes);

      console.log('[EnokiProvider] Transaction sponsored successfully:', {
        gasUsed: sponsorData.gasUsed,
        gasBudget: sponsorData.gasBudget
      });

      return {
        sponsoredTx,
        sponsorSignature: sponsorData.signature,
        gasUsed: sponsorData.gasUsed,
        gasBudget: sponsorData.gasBudget,
        providerId: this.id
      };

    } catch (error) {
      console.error('[EnokiProvider] Sponsorship failed:', error);

      if (error instanceof Error && error.message.includes('INSUFFICIENT_QUOTA')) {
        throw createSponsorshipError(
          'INSUFFICIENT_QUOTA',
          'Enoki quota exceeded',
          this.id,
          error
        );
      }

      throw createSponsorshipError(
        'PROVIDER_ERROR',
        `Enoki sponsorship failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.id,
        error
      );
    }
  }

  async estimateGas(tx: Transaction): Promise<GasEstimate> {
    if (!this.config) {
      return {
        gasUnits: 5000,
        cost: '0.001',
        canSponsor: false,
        reason: 'Enoki provider not configured'
      };
    }

    try {
      const txBytes = await tx.build({ client: null });

      const estimateRequest = {
        transactionBytes: Array.from(txBytes),
        operation: this.extractOperationType(tx)
      };

      const response = await fetch(`${this.config.endpoint}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this.config.clientId,
        },
        body: JSON.stringify(estimateRequest),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        return {
          gasUnits: 5000,
          cost: '0.001',
          canSponsor: false,
          reason: `Estimation failed: ${response.statusText}`
        };
      }

      const estimate = await response.json();

      return {
        gasUnits: estimate.gasUnits || 5000,
        cost: estimate.cost || '0.001',
        canSponsor: estimate.canSponsor || false,
        reason: estimate.reason
      };

    } catch (error) {
      console.error('[EnokiProvider] Gas estimation failed:', error);
      return {
        gasUnits: 5000,
        cost: '0.001',
        canSponsor: false,
        reason: `Estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const isAvailable = await this.isAvailable();

    return {
      available: isAvailable,
      lastChecked: this.availabilityCache?.lastChecked || Date.now(),
      errorCount: isAvailable ? 0 : (this.availabilityCache?.errorCount || 0) + 1,
      lastError: isAvailable ? undefined : 'Provider unavailable',
      quotaRemaining: undefined // Enoki handles quota internally
    };
  }

  /**
   * Extract operation type from transaction for Enoki API
   */
  private extractOperationType(tx: Transaction): string {
    try {
      const txData = tx.getData();

      if (!txData.commands) {
        return 'unknown';
      }

      for (const command of txData.commands) {
        if (command.MoveCall && command.MoveCall.target) {
          const target = command.MoveCall.target;
          const parts = target.split('::');

          if (parts.length >= 3) {
            const functionName = parts[2];

            // Map to Enoki operation types
            switch (functionName) {
              case 'create_notebook':
                return 'create_notebook';
              case 'create_note':
                return 'create_note';
              case 'update_note':
                return 'update_note';
              case 'delete_note':
                return 'delete_note';
              case 'create_folder':
                return 'create_folder';
              case 'update_folder':
                return 'update_folder';
              case 'delete_folder':
                return 'delete_folder';
              case 'move_note':
                return 'move_note';
              default:
                return functionName;
            }
          }
        }
      }

      return 'unknown';
    } catch (error) {
      console.error('[EnokiProvider] Error extracting operation type:', error);
      return 'unknown';
    }
  }

  /**
   * Extract user address from transaction for Enoki API
   */
  private extractUserAddress(tx: Transaction): string {
    try {
      const txData = tx.getData();

      // Try to get sender address from transaction data
      // This is a simplified extraction - in a real implementation,
      // you might need more sophisticated address extraction
      if (txData.sender) {
        return txData.sender;
      }

      // Fallback to empty string - Enoki will handle it
      return '';
    } catch (error) {
      console.error('[EnokiProvider] Error extracting user address:', error);
      return '';
    }
  }
}