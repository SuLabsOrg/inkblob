# InkBlob Smart Contracts

This directory contains the SUI Move smart contracts for the InkBlob decentralized note-taking application.

## Quick Start

### Prerequisites
- Install [SUI CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)
- Have a SUI wallet configured

### Basic Commands

```bash
# Show all available commands
make help

# Build contracts
make build

# Run all tests
make test

# Run only unit tests
make test-unit

# Run only integration tests
make test-integration

# Publish contracts to testnet
make publish

# Switch network
make testnet    # or make devnet / make mainnet
```

## Development Workflow

### Daily Development
```bash
# Clean, build, and test (recommended for development)
make dev

# Watch for changes and rebuild automatically
make watch

# Run code quality checks
make check

# Format code
make format
```

### Testing Strategy

**Unit Tests** (in `sources/notebook.move`):
- Test helper functions: `calculate_folder_depth`, `would_create_cycle`, `is_valid_arweave_tx_id`
- Fast execution, no blockchain transactions needed

**Integration Tests** (in `tests/notebook_tests.move`):
- Test full contract workflows
- Test entry functions and user scenarios
- Requires test transactions

### Deployment

#### Testnet Deployment
```bash
# Switch to testnet and publish
make deploy-testnet

# Or step by step:
make testnet
make publish
```

#### Mainnet Deployment (⚠️ Real SUI)
```bash
# Interactive confirmation required
make deploy-mainnet
```

## Configuration

You can customize the Makefile behavior by modifying these variables:

- `PACKAGE_NAME`: Package name (default: inkblob)
- `NETWORK`: Default network (default: testnet)
- `GAS_BUDGET`: Gas budget for transactions (default: 1000000000)

## Useful Commands

### Development
```bash
make status          # Show build and network status
make clean           # Clean build artifacts
make info             # Show package information
make targets          # List all available targets
```

### Gas Estimation
```bash
make gas-estimate    # Show gas cost report
```

### Package Verification
```bash
make verify          # Verify a published package
```

## Project Structure

```
contracts/inkblob/
├── Move.toml              # Package configuration
├── Makefile               # Build automation
├── README.md              # This file
├── sources/
│   └── notebook.move      # Main contract with unit tests
├── tests/
│   └── notebook_tests.move # Integration tests
└── build/                 # Build artifacts (generated)
```

## Network Configuration

The Makefile supports switching between networks:

- **Devnet**: Development and testing
- **Testnet**: Staging environment
- **Mainnet**: Production (real costs)

## Troubleshooting

### Common Issues

1. **Build fails**:
   ```bash
   make clean
   make check  # Check for compilation errors
   ```

2. **Test fails**:
   ```bash
   make test-unit      # Check unit tests first
   make test-integration # Then check integration tests
   ```

3. **Network issues**:
   ```bash
   make status          # Check current network
   make testnet        # Switch to testnet
   ```

4. **Gas issues**:
   ```bash
   make gas-estimate    # Check gas requirements
   ```

## Security Notes

- Mainnet deployment requires real SUI tokens
- Always test thoroughly on testnet first
- Review transaction costs with `make gas-estimate`
- Verify package before and after deployment with `make verify`