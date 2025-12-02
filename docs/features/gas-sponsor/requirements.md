# Gas Sponsorship Provider System Requirements

## Feature Overview
Implement a configurable gas sponsorship system that allows users to execute gas-free transactions through various providers while maintaining separation from the existing SessionCap system (which handles WAL storage fees).

## Requirements

### 1. Provider Interface Requirements

**1.1** The system SHALL define a standardized `GasSponsorProvider` interface that all sponsorship providers implement.

**1.2** WHEN a provider implements the interface THEN it SHALL provide methods for:
- Transaction sponsorship with authentication
- Provider availability checking
- Gas estimation
- Configuration management

**1.3** IF a provider is unavailable THEN the system SHALL gracefully fallback to direct wallet payment.

### 2. Authentication Requirements

**2.1** The system SHALL support multiple authentication types through a simple `AuthInfo` interface.

**2.2** WHEN authentication is required THEN the system SHALL pass authentication information to providers without interpreting the content.

**2.3** IF authentication fails THEN the provider SHALL return a clear error with specific error codes.

**2.4** The system SHALL support these authentication types:
- `invitation`: Invitation code based authentication
- `oauth`: OAuth token based authentication (e.g., Enoki)
- `whitelist`: Address-based whitelist authentication
- `api-key`: API key based authentication

### 3. Transaction Routing Requirements

**3.1** The system SHALL distinguish between transactions that require SessionCap and transactions eligible for gas sponsorship.

**3.2** WHEN a transaction requires only gas fees (no WAL storage) THEN the system SHALL route it to gas sponsorship providers.

**3.3** WHEN a transaction requires WAL storage THEN the system SHALL use the existing SessionCap system.

**3.4** The system SHALL support gas sponsorship for these transaction types:
- Deleting notes
- Creating, updating, and deleting folders
- Moving notes between folders
- Updating note metadata without content changes

### 4. Configuration Management Requirements

**4.1** The system SHALL support provider configuration through environment variables and runtime settings.

**4.2** WHEN configuring providers THEN the system SHALL validate configuration before activation.

**4.3** IF a provider configuration is invalid THEN the system SHALL disable the provider and log appropriate errors.

**4.4** The system SHALL support multiple active providers with priority-based selection.

### 5. Error Handling Requirements

**5.1** WHEN sponsorship fails THEN the system SHALL provide specific error codes:
- `AUTHENTICATION_FAILED`: Invalid or expired authentication
- `INSUFFICIENT_QUOTA`: User has exceeded usage limits
- `INVALID_OPERATION`: Operation not supported by provider
- `PROVIDER_ERROR`: Provider service unavailable or error

**5.2** The system SHALL implement automatic fallback to direct wallet payment when sponsorship fails.

**5.3** IF all providers fail THEN the system SHALL allow users to complete transactions with their own gas.

### 6. Performance Requirements

**6.1** Transaction sponsorship SHALL complete within 3 seconds for successful cases.

**6.2** WHEN checking provider availability THEN the system SHALL complete checks within 1 second.

**6.3** The system SHALL cache provider availability status for 30 seconds to reduce overhead.

### 7. Security Requirements

**7.1** Authentication tokens SHALL be transmitted securely to providers.

**7.2** The system SHALL not store sensitive authentication information in localStorage.

**7.3** Provider configurations SHALL not expose sensitive API keys in client-side code.

**7.4** WHEN authentication fails THEN error messages SHALL not expose sensitive information.

### 8. Integration Requirements

**8.1** The system SHALL integrate with existing SuiService without breaking current functionality.

**8.2** The system SHALL maintain backward compatibility with existing SessionCap operations.

**8.3** WHEN adding gas sponsorship THEN existing wallet-based transactions SHALL continue to work.

**8.4** The system SHALL integrate with existing Settings UI for provider configuration.

### 9. Provider Implementation Requirements

**9.1** The system SHALL include implementations for:
- Enoki provider (OAuth-based sponsorship)
- Custom backend provider (invitation code support)

**9.2** Each provider implementation SHALL handle its own authentication logic and API integration.

**9.3** Providers SHALL implement proper error handling and status reporting.

**9.4** WHEN implementing providers THEN they SHALL follow consistent error code patterns.

### 10. User Experience Requirements

**10.1** WHEN sponsorship is available THEN the system SHALL provide clear indicators to users.

**10.2** WHEN authentication is required THEN the system SHALL prompt users for necessary information.

**10.3** IF sponsorship fails THEN users SHALL see clear error messages with suggested actions.

**10.4** The system SHALL maintain consistent transaction flow regardless of sponsorship availability.

## Out of Scope

- SessionCap system modifications (WAL storage fee management remains unchanged)
- Invitation code generation and management system (handled by external system)
- Complex multi-factor authentication schemes
- Real-time provider monitoring dashboards
- Advanced rate limiting beyond basic quota checking