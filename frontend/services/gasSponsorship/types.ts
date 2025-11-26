import { Transaction } from '@mysten/sui/transactions';

// Core provider interface for gas sponsorship
export interface GasSponsorProvider {
  // Provider identification
  id: string;
  name: string;
  type: 'enoki' | 'custom-backend';

  // Core sponsorship methods
  sponsorTransaction(tx: Transaction, authInfo?: AuthInfo): Promise<SponsoredTransaction>;
  isAvailable(): Promise<boolean>;
  estimateGas(tx: Transaction): Promise<GasEstimate>;

  // Configuration and status
  configure(config: ProviderConfig): Promise<void>;
  getStatus(): Promise<ProviderStatus>;
}

// Authentication information structure for different provider types
export interface AuthInfo {
  type: 'invitation' | 'oauth' | 'whitelist' | 'api-key';
  token: string;
  metadata?: Record<string, any>;
}

// Result of successful transaction sponsorship
export interface SponsoredTransaction {
  sponsoredTx: Transaction;
  sponsorSignature: string;
  gasUsed: number;
  gasBudget: number;
  providerId: string;
}

// Provider configuration options
export interface ProviderConfig {
  enabled: boolean;
  priority: number;
  endpoint?: string;
  timeout: number;
  retryAttempts: number;
  customSettings?: Record<string, any>;
}

// Current provider status information
export interface ProviderStatus {
  available: boolean;
  lastChecked: number;
  errorCount: number;
  lastError?: string;
  quotaRemaining?: number;
}

// Gas estimation result from provider
export interface GasEstimate {
  gasUnits: number;
  cost: string; // In SUI
  canSponsor: boolean;
  reason?: string;
}

// Transaction routing decision
export interface TransactionRoute {
  paymentMethod: 'sessioncap' | 'gas-sponsor' | 'direct-wallet';
  providerId?: string;
  requiresAuth?: boolean;
  reason: string;
}

// Error classification for sponsorship failures
export interface SponsorshipError extends Error {
  code: 'AUTHENTICATION_FAILED' | 'INSUFFICIENT_QUOTA' | 'INVALID_OPERATION' | 'PROVIDER_ERROR';
  message: string;
  providerId?: string;
  details?: any;
}

// Gas sponsorship system configuration
export interface GasSponsorSystemConfig {
  providers: {
    [providerId: string]: {
      type: 'enoki' | 'custom-backend';
      enabled: boolean;
      priority: number;
      config: ProviderConfig;
    };
  };
  defaultProvider?: string;
  fallbackToWallet: boolean;
  enableCaching: boolean;
  cacheTimeout: number;
}

// Eligible gas sponsored operations from design document
export enum GasSponsoredOperation {
  DELETE_NOTE = 'delete_note',
  CREATE_FOLDER = 'create_folder',
  UPDATE_FOLDER = 'update_folder',
  DELETE_FOLDER = 'delete_folder',
  MOVE_NOTE = 'move_note',
  UPDATE_NOTE_METADATA = 'update_note_metadata'
}

// Helper function to create sponsorship errors
export function createSponsorshipError(
  code: SponsorshipError['code'],
  message: string,
  providerId?: string,
  details?: any
): SponsorshipError {
  const error = new Error(message) as SponsorshipError;
  error.code = code;
  error.message = message;
  error.providerId = providerId;
  error.details = details;
  return error;
}

// Provider availability cache entry
export interface ProviderCache {
  providerId: string;
  status: 'available' | 'unavailable' | 'error';
  lastChecked: number;
  cacheExpiry: number;
  errorCount: number;
  error?: string;
}

// Custom backend specific types
export interface CustomBackendAuthRequest {
  invitationCode: string;
  userAddress: string;
  operation: string;
}

export interface CustomBackendAuthResponse {
  authorized: boolean;
  sponsorshipAvailable: boolean;
  remainingQuota?: number;
  expiresAt?: string;
  sponsorshipSignature?: string;
}

export interface CustomBackendConfig {
  endpoint: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
}

// Enoki specific types (for Phase 2)
export interface EnokiAuthRequest {
  oauthToken: string;
  userAddress: string;
  operation: string;
}

export interface EnokiAuthResponse {
  authorized: boolean;
  sponsorshipAvailable: boolean;
  sponsorSignature?: string;
  gasBudget?: number;
}

export interface EnokiConfig {
  endpoint: string;
  clientId: string;
  scope: string[];
  timeout: number;
  retryAttempts: number;
}