import {
  GasSponsorProvider,
  AuthInfo,
  SponsoredTransaction,
  GasEstimate,
  ProviderStatus,
  ProviderCache,
  GasSponsorSystemConfig,
  createSponsorshipError
} from './types';
import { getCurrentGasSponsorConfig, getEnabledProviders } from './config';
import { CustomBackendProvider } from './customBackendProvider';
import { EnokiProvider } from './enokiProvider';

export class ProviderManager {
  private providers: Map<string, GasSponsorProvider> = new Map();
  private availabilityCache: Map<string, ProviderCache> = new Map();
  private config: GasSponsorSystemConfig;

  constructor() {
    this.config = getCurrentGasSponsorConfig();
    this.initializeProviders();
  }

  private async initializeProviders(): Promise<void> {
    const enabledProviders = getEnabledProviders(this.config);

    for (const { id, config: providerConfig } of enabledProviders) {
      try {
        let provider: GasSponsorProvider;

        switch (providerConfig.type) {
          case 'custom-backend':
            provider = new CustomBackendProvider();
            break;
          case 'enoki':
            provider = new EnokiProvider();
            break;
          default:
            throw new Error(`Unknown provider type: ${providerConfig.type}`);
        }

        await provider.configure(providerConfig.config);
        this.providers.set(id, provider);

        console.log(`[ProviderManager] Initialized provider: ${id} (${providerConfig.type})`);
      } catch (error) {
        console.error(`[ProviderManager] Failed to initialize provider ${id}:`, error);
      }
    }
  }

  /**
   * Get the best available provider for gas sponsorship
   */
  async getAvailableProvider(): Promise<GasSponsorProvider | null> {
    const enabledProviders = getEnabledProviders(this.config);

    // Check providers in priority order
    for (const { id } of enabledProviders) {
      const provider = this.providers.get(id);
      if (!provider) {
        console.warn(`[ProviderManager] Provider ${id} not initialized`);
        continue;
      }

      try {
        // Check availability (with caching)
        const isAvailable = await this.isProviderAvailable(id);
        if (isAvailable) {
          console.log(`[ProviderManager] Selected provider: ${id}`);
          return provider;
        } else {
          console.log(`[ProviderManager] Provider ${id} not available, trying next`);
        }
      } catch (error) {
        console.error(`[ProviderManager] Error checking provider ${id} availability:`, error);
      }
    }

    console.log('[ProviderManager] No available providers found');
    return null;
  }

  /**
   * Check if a specific provider is available (with caching)
   */
  async isProviderAvailable(providerId: string): Promise<boolean> {
    const cached = this.availabilityCache.get(providerId);
    const now = Date.now();

    // Return cached result if still valid
    if (cached && cached.status !== 'error' && cached.cacheExpiry > now) {
      return cached.status === 'available';
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      console.warn(`[ProviderManager] Provider ${providerId} not found`);
      return false;
    }

    try {
      const isAvailable = await provider.isAvailable();

      // Cache the result
      this.availabilityCache.set(providerId, {
        providerId,
        status: isAvailable ? 'available' : 'unavailable',
        lastChecked: now,
        cacheExpiry: now + this.config.cacheTimeout,
        errorCount: 0
      });

      return isAvailable;
    } catch (error) {
      console.error(`[ProviderManager] Error checking availability for provider ${providerId}:`, error);

      // Cache error status
      this.availabilityCache.set(providerId, {
        providerId,
        status: 'error',
        lastChecked: now,
        cacheExpiry: now + this.config.cacheTimeout,
        errorCount: (cached?.errorCount || 0) + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return false;
    }
  }

  /**
   * Sponsor a transaction using the best available provider
   */
  async sponsorTransaction(
    tx: any, // Transaction type from @mysten/sui
    authInfo?: AuthInfo
  ): Promise<SponsoredTransaction> {
    const provider = await this.getAvailableProvider();

    if (!provider) {
      throw createSponsorshipError(
        'PROVIDER_ERROR',
        'No available gas sponsorship providers',
        undefined,
        { availableProviders: Array.from(this.providers.keys()) }
      );
    }

    try {
      console.log(`[ProviderManager] Sponsoring transaction with provider: ${provider.id}`);
      const result = await provider.sponsorTransaction(tx, authInfo);
      console.log(`[ProviderManager] Transaction sponsored successfully by: ${provider.id}`);
      return result;
    } catch (error) {
      console.error(`[ProviderManager] Transaction sponsorship failed with provider ${provider.id}:`, error);

      // Mark provider as temporarily unavailable
      this.availabilityCache.set(provider.id, {
        providerId: provider.id,
        status: 'error',
        lastChecked: Date.now(),
        cacheExpiry: Date.now() + this.config.cacheTimeout,
        errorCount: (this.availabilityCache.get(provider.id)?.errorCount || 0) + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Try with next available provider if this one failed
      const nextProvider = await this.getAvailableProvider();
      if (nextProvider && nextProvider.id !== provider.id) {
        console.log(`[ProviderManager] Retrying with next provider: ${nextProvider.id}`);
        return this.sponsorTransaction(tx, authInfo);
      }

      // If this was the last provider, re-throw the error
      if (error instanceof Error && 'code' in error) {
        throw error;
      }

      throw createSponsorshipError(
        'PROVIDER_ERROR',
        `Transaction sponsorship failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider.id,
        { originalError: error }
      );
    }
  }

  /**
   * Get gas estimate from the best available provider
   */
  async estimateGas(tx: any): Promise<GasEstimate> {
    const provider = await this.getAvailableProvider();

    if (!provider) {
      // Return a default estimate if no providers available
      return {
        gasUnits: 5000,
        cost: '0.001',
        canSponsor: false,
        reason: 'No available gas sponsorship providers'
      };
    }

    try {
      return await provider.estimateGas(tx);
    } catch (error) {
      console.error(`[ProviderManager] Gas estimation failed with provider ${provider.id}:`, error);

      // Return fallback estimate
      return {
        gasUnits: 5000,
        cost: '0.001',
        canSponsor: false,
        reason: `Estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get status of all providers
   */
  async getAllProviderStatuses(): Promise<Map<string, ProviderStatus>> {
    const statuses = new Map<string, ProviderStatus>();

    for (const [id, provider] of this.providers) {
      try {
        const status = await provider.getStatus();
        const cache = this.availabilityCache.get(id);

        statuses.set(id, {
          ...status,
          lastChecked: cache?.lastChecked || Date.now(),
          errorCount: cache?.errorCount || 0
        });
      } catch (error) {
        console.error(`[ProviderManager] Error getting status for provider ${id}:`, error);
        statuses.set(id, {
          available: false,
          lastChecked: Date.now(),
          errorCount: (this.availabilityCache.get(id)?.errorCount || 0) + 1,
          lastError: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return statuses;
  }

  /**
   * Get a specific provider by ID
   */
  getProvider(id: string): GasSponsorProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all configured providers
   */
  getAllProviders(): Map<string, GasSponsorProvider> {
    return new Map(this.providers);
  }

  /**
   * Clear availability cache for a specific provider or all providers
   */
  clearAvailabilityCache(providerId?: string): void {
    if (providerId) {
      this.availabilityCache.delete(providerId);
      console.log(`[ProviderManager] Cleared cache for provider: ${providerId}`);
    } else {
      this.availabilityCache.clear();
      console.log(`[ProviderManager] Cleared all provider caches`);
    }
  }

  /**
   * Update configuration and reinitialize providers
   */
  async updateConfig(newConfig: GasSponsorSystemConfig): Promise<void> {
    this.config = newConfig;

    // Clear existing providers
    this.providers.clear();
    this.availabilityCache.clear();

    // Reinitialize with new config
    await this.initializeProviders();
  }

  /**
   * Check if gas sponsorship is enabled and available
   */
  async isGasSponsorshipAvailable(): Promise<boolean> {
    if (!getEnabledProviders(this.config).length) {
      return false;
    }

    const provider = await this.getAvailableProvider();
    return provider !== null;
  }

  /**
   * Get default provider ID
   */
  getDefaultProviderId(): string | undefined {
    return this.config.defaultProvider;
  }

  /**
   * Set default provider ID
   */
  setDefaultProviderId(providerId: string): void {
    if (this.providers.has(providerId)) {
      this.config.defaultProvider = providerId;
      console.log(`[ProviderManager] Set default provider to: ${providerId}`);
    } else {
      throw new Error(`Provider ${providerId} not available`);
    }
  }
}

// Singleton instance for the application
let providerManagerInstance: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!providerManagerInstance) {
    providerManagerInstance = new ProviderManager();
  }
  return providerManagerInstance;
}

export function resetProviderManager(): void {
  providerManagerInstance = null;
}