import { GasSponsorSystemConfig, ProviderConfig } from './types';

// Default configuration for gas sponsorship system
export const DEFAULT_GAS_SPONSOR_CONFIG: GasSponsorSystemConfig = {
  providers: {
    custom: {
      type: 'custom-backend',
      enabled: true,
      priority: 2,
      config: {
        enabled: true,
        priority: 2,
        endpoint: import.meta.env.VITE_GAS_SPONSOR_API || '',
        timeout: 8000,
        retryAttempts: 2,
        customSettings: {}
      }
    },
    enoki: {
      type: 'enoki',
      enabled: true,
      priority: 1, // Higher priority than custom
      config: {
        enabled: true,
        priority: 1,
        endpoint: import.meta.env.VITE_ENOKI_ENDPOINT || 'https://api.enoki.mystenlabs.com',
        timeout: 10000,
        retryAttempts: 3,
        customSettings: {
          clientId: import.meta.env.VITE_ENOKI_CLIENT_ID || '',
          scope: ['gas_sponsor']
        }
      }
    }
  },
  defaultProvider: 'enoki', // Default to Enoki for notebook creation
  fallbackToWallet: true,
  enableCaching: true,
  cacheTimeout: 30000 // 30 seconds
};

// Environment variable based configuration
export function loadGasSponsorConfig(): GasSponsorSystemConfig {
  const config = { ...DEFAULT_GAS_SPONSOR_CONFIG };

  // Override with environment variables if available
  if (import.meta.env.VITE_GAS_SPONSOR_ENABLED) {
    const enabled = import.meta.env.VITE_GAS_SPONSOR_ENABLED === 'true';
    Object.keys(config.providers).forEach(key => {
      config.providers[key].enabled = enabled;
    });
  }

  // Custom backend configuration
  if (import.meta.env.VITE_GAS_SPONSOR_API) {
    config.providers.custom.config.endpoint = import.meta.env.VITE_GAS_SPONSOR_API;
  }

  if (import.meta.env.VITE_GAS_SPONSOR_API_KEY) {
    config.providers.custom.config.customSettings = {
      ...config.providers.custom.config.customSettings,
      apiKey: import.meta.env.VITE_GAS_SPONSOR_API_KEY
    };
  }

  // Enoki configuration
  if (import.meta.env.VITE_ENOKI_ENABLED) {
    config.providers.enoki.enabled = import.meta.env.VITE_ENOKI_ENABLED === 'true';
  }

  if (import.meta.env.VITE_ENOKI_ENDPOINT) {
    config.providers.enoki.config.endpoint = import.meta.env.VITE_ENOKI_ENDPOINT;
  }

  if (import.meta.env.VITE_ENOKI_CLIENT_ID) {
    config.providers.enoki.config.customSettings = {
      ...config.providers.enoki.config.customSettings,
      clientId: import.meta.env.VITE_ENOKI_CLIENT_ID
    };
  }

  // Cache timeout override
  if (import.meta.env.VITE_GAS_SPONSOR_CACHE_TIMEOUT) {
    config.cacheTimeout = parseInt(import.meta.env.VITE_GAS_SPONSOR_CACHE_TIMEOUT, 10);
  }

  // Fallback behavior override
  if (import.meta.env.VITE_GAS_SPONSOR_FALLBACK) {
    config.fallbackToWallet = import.meta.env.VITE_GAS_SPONSOR_FALLBACK === 'true';
  }

  return config;
}

// Provider validation
export function validateProviderConfig(config: ProviderConfig): boolean {
  if (!config.enabled) {
    return true; // Disabled configs are valid
  }

  if (!config.endpoint && !config.customSettings?.apiKey) {
    return false; // Must have either endpoint or API key
  }

  if (config.timeout < 1000 || config.timeout > 60000) {
    return false; // Timeout must be between 1s and 60s
  }

  if (config.retryAttempts < 0 || config.retryAttempts > 5) {
    return false; // Retry attempts must be between 0 and 5
  }

  return true;
}

// Configuration validation for the entire system
export function validateGasSponsorConfig(config: GasSponsorSystemConfig): boolean {
  // Validate all provider configs
  for (const [providerId, providerConfig] of Object.entries(config.providers)) {
    if (!validateProviderConfig(providerConfig.config)) {
      console.error(`[GasSponsor] Invalid configuration for provider: ${providerId}`);
      return false;
    }
  }

  // Validate default provider exists and is enabled
  if (config.defaultProvider && !config.providers[config.defaultProvider]) {
    console.error(`[GasSponsor] Default provider ${config.defaultProvider} not found`);
    return false;
  }

  if (config.defaultProvider && !config.providers[config.defaultProvider].enabled) {
    console.error(`[GasSponsor] Default provider ${config.defaultProvider} is disabled`);
    return false;
  }

  // Validate cache timeout
  if (config.cacheTimeout < 5000 || config.cacheTimeout > 300000) {
    console.error(`[GasSponsor] Cache timeout must be between 5s and 5min`);
    return false;
  }

  return true;
}

// Get current configuration
export function getCurrentGasSponsorConfig(): GasSponsorSystemConfig {
  const config = loadGasSponsorConfig();

  if (!validateGasSponsorConfig(config)) {
    console.error('[GasSponsor] Invalid configuration detected, falling back to defaults');
    return DEFAULT_GAS_SPONSOR_CONFIG;
  }

  return config;
}

// Check if any providers are enabled
export function hasEnabledProviders(config: GasSponsorSystemConfig): boolean {
  return Object.values(config.providers).some(provider => provider.enabled);
}

// Get enabled providers sorted by priority
export function getEnabledProviders(config: GasSponsorSystemConfig): Array<{id: string, config: GasSponsorSystemConfig['providers'][string]}> {
  return Object.entries(config.providers)
    .filter(([, provider]) => provider.enabled)
    .map(([id, config]) => ({ id, config }))
    .sort((a, b) => a.config.priority - b.config.priority);
}