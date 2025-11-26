import { Transaction } from '@mysten/sui/transactions';
import {
  TransactionRoute,
  GasSponsoredOperation,
  AuthInfo,
  SponsoredTransaction
} from './types';
import { getProviderManager } from './providerManager';

export class GasSponsorRouter {
  private providerManager = getProviderManager();

  /**
   * Determine if a transaction requires SessionCap (WAL storage fees)
   */
  private requiresSessionCap(tx: Transaction): boolean {
    try {
      const txData = tx.getData();

      if (!txData.commands) {
        return false;
      }

      // Check for operations that require WAL storage
      for (const command of txData.commands) {
        if (command.MoveCall && command.MoveCall.target) {
          const target = command.MoveCall.target;

          // Operations that require WAL storage (content upload/download)
          if (target.includes('create_note') || target.includes('update_note')) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error('[GasSponsorRouter] Error determining SessionCap requirement:', error);
      // Default to SessionCap if we can't determine
      return true;
    }
  }

  /**
   * Extract the operation type from a transaction
   */
  private extractOperation(tx: Transaction): GasSponsoredOperation | null {
    try {
      const txData = tx.getData();

      if (!txData.commands) {
        return null;
      }

      for (const command of txData.commands) {
        if (command.MoveCall && command.MoveCall.target) {
          const target = command.MoveCall.target;
          const parts = target.split('::');

          if (parts.length >= 3) {
            const functionName = parts[2];

            switch (functionName) {
              case 'delete_note':
                return GasSponsoredOperation.DELETE_NOTE;
              case 'create_folder':
                return GasSponsoredOperation.CREATE_FOLDER;
              case 'update_folder':
                return GasSponsoredOperation.UPDATE_FOLDER;
              case 'delete_folder':
                return GasSponsoredOperation.DELETE_FOLDER;
              case 'move_note':
                return GasSponsoredOperation.MOVE_NOTE;
              case 'update_note_metadata':
                return GasSponsoredOperation.UPDATE_NOTE_METADATA;
              default:
                console.log(`[GasSponsorRouter] Not a sponsored operation: ${functionName}`);
                return null;
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[GasSponsorRouter] Error extracting operation from transaction:', error);
      return null;
    }
  }

  /**
   * Determine if an operation is eligible for gas sponsorship
   */
  private isEligibleForSponsorship(operation: GasSponsoredOperation | null): boolean {
    if (!operation) {
      return false;
    }

    return Object.values(GasSponsoredOperation).includes(operation);
  }

  /**
   * Route transaction to the appropriate payment method
   */
  async routeTransaction(
    tx: Transaction,
    authInfo?: AuthInfo
  ): Promise<TransactionRoute> {
    // Check if transaction requires SessionCap (WAL storage)
    if (this.requiresSessionCap(tx)) {
      console.log('[GasSponsorRouter] Transaction requires SessionCap (WAL storage)');
      return {
        paymentMethod: 'sessioncap',
        reason: 'Transaction requires WAL storage fees'
      };
    }

    // Check if transaction is eligible for gas sponsorship
    const operation = this.extractOperation(tx);
    if (!this.isEligibleForSponsorship(operation)) {
      console.log('[GasSponsorRouter] Transaction not eligible for gas sponsorship');
      return {
        paymentMethod: 'direct-wallet',
        reason: 'Operation not eligible for gas sponsorship'
      };
    }

    // Check if gas sponsorship is available
    const isSponsorshipAvailable = await this.providerManager.isGasSponsorshipAvailable();
    if (!isSponsorshipAvailable) {
      console.log('[GasSponsorRouter] Gas sponsorship not available');
      return {
        paymentMethod: 'direct-wallet',
        reason: 'No gas sponsorship providers available'
      };
    }

    // Try to get an available provider
    const provider = await this.providerManager.getAvailableProvider();
    if (!provider) {
      console.log('[GasSponsorRouter] No available gas sponsorship provider');
      return {
        paymentMethod: 'direct-wallet',
        reason: 'All gas sponsorship providers unavailable'
      };
    }

    console.log(`[GasSponsorRouter] Routing to gas sponsorship provider: ${provider.id}`);
    return {
      paymentMethod: 'gas-sponsor',
      providerId: provider.id,
      requiresAuth: true,
      reason: `Gas sponsorship available via ${provider.name}`
    };
  }

  /**
   * Sponsor a transaction using the determined route
   */
  async sponsorTransaction(
    tx: Transaction,
    authInfo?: AuthInfo
  ): Promise<{ tx: Transaction; route: TransactionRoute; sponsored?: SponsoredTransaction }> {
    const route = await this.routeTransaction(tx, authInfo);

    switch (route.paymentMethod) {
      case 'sessioncap':
        console.log('[GasSponsorRouter] Using SessionCap for transaction');
        return { tx, route };

      case 'gas-sponsor':
        console.log('[GasSponsorRouter] Using gas sponsorship for transaction');
        try {
          const sponsored = await this.providerManager.sponsorTransaction(tx, authInfo);
          return { tx: sponsored.sponsoredTx, route, sponsored };
        } catch (error) {
          console.error('[GasSponsorRouter] Gas sponsorship failed, falling back to wallet:', error);

          // Fallback to direct wallet
          const fallbackRoute: TransactionRoute = {
            paymentMethod: 'direct-wallet',
            reason: `Gas sponsorship failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          };

          return { tx, route: fallbackRoute };
        }

      case 'direct-wallet':
        console.log('[GasSponsorRouter] Using direct wallet payment for transaction');
        return { tx, route };

      default:
        throw new Error(`Unknown transaction route: ${route}`);
    }
  }

  /**
   * Get gas estimate for a transaction
   */
  async estimateGas(tx: Transaction): Promise<{ canSponsor: boolean; estimate: any }> {
    const route = await this.routeTransaction(tx);

    if (route.paymentMethod === 'gas-sponsor') {
      try {
        const estimate = await this.providerManager.estimateGas(tx);
        return { canSponsor: true, estimate };
      } catch (error) {
        console.error('[GasSponsorRouter] Gas estimation failed:', error);
        return {
          canSponsor: false,
          estimate: {
            gasUnits: 5000,
            cost: '0.001',
            reason: `Estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        };
      }
    }

    // Default wallet estimate
    return {
      canSponsor: false,
      estimate: {
        gasUnits: 5000,
        cost: '0.001',
        reason: route.reason
      }
    };
  }

  /**
   * Check if a specific operation type is eligible for sponsorship
   */
  isOperationEligible(operationName: string): boolean {
    const operation = this.getOperationFromName(operationName);
    return this.isEligibleForSponsorship(operation);
  }

  /**
   * Get operation enum from function name
   */
  private getOperationFromName(functionName: string): GasSponsoredOperation | null {
    switch (functionName) {
      case 'delete_note':
        return GasSponsoredOperation.DELETE_NOTE;
      case 'create_folder':
        return GasSponsoredOperation.CREATE_FOLDER;
      case 'update_folder':
        return GasSponsoredOperation.UPDATE_FOLDER;
      case 'delete_folder':
        return GasSponsoredOperation.DELETE_FOLDER;
      case 'move_note':
        return GasSponsoredOperation.MOVE_NOTE;
      case 'update_note_metadata':
        return GasSponsoredOperation.UPDATE_NOTE_METADATA;
      default:
        return null;
    }
  }

  /**
   * Get all eligible operations for sponsorship
   */
  getEligibleOperations(): GasSponsoredOperation[] {
    return Object.values(GasSponsoredOperation);
  }

  /**
   * Check if gas sponsorship is available
   */
  async isGasSponsorshipAvailable(): Promise<boolean> {
    return await this.providerManager.isGasSponsorshipAvailable();
  }

  /**
   * Get operation display name
   */
  getOperationDisplayName(operation: GasSponsoredOperation): string {
    switch (operation) {
      case GasSponsoredOperation.DELETE_NOTE:
        return 'Delete Note';
      case GasSponsoredOperation.CREATE_FOLDER:
        return 'Create Folder';
      case GasSponsoredOperation.UPDATE_FOLDER:
        return 'Update Folder';
      case GasSponsoredOperation.DELETE_FOLDER:
        return 'Delete Folder';
      case GasSponsoredOperation.MOVE_NOTE:
        return 'Move Note';
      case GasSponsoredOperation.UPDATE_NOTE_METADATA:
        return 'Update Note Metadata';
      default:
        return 'Unknown Operation';
    }
  }
}

// Singleton instance for the application
let routerInstance: GasSponsorRouter | null = null;

export function getGasSponsorRouter(): GasSponsorRouter {
  if (!routerInstance) {
    routerInstance = new GasSponsorRouter();
  }
  return routerInstance;
}

export function resetGasSponsorRouter(): void {
  routerInstance = null;
}

// Re-export types for convenience
export type { TransactionRoute, AuthInfo, SponsoredTransaction } from './types';