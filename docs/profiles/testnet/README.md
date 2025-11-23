# InkBlob Testnet Deployment

## Overview

This directory contains the deployment artifacts and configuration for the InkBlob smart contracts on SUI Testnet.

## Deployment Details

- **Network**: SUI Testnet
- **Deployed**: 2025-11-23 (Epoch 927)
- **Transaction Digest**: `9SQQCGgrA63qW8M873hDCDhS6KnQcVfFHEtrdCzcL5K4`
- **Status**: ✅ Successful

## Contract Information

### Package Details
- **Package ID**: `0x2efc857109bc6ae765eae9bdf03760487455133678ad796e24042ab0884b91e4`
- **Modules**: `notebook`
- **Upgrade Capability**: `0xf0931cc8d5ea46c715061ba74285614c759bc718c57b8b7010953ec63cf673a6`

### Deployer
- **Address**: `0x59f0fbaaea0b2c89588239fff7f1ab581d0f72e11e6a0c5f8cd6a5a38531a631`

### Gas Costs
- **Total Cost**: 62,288,680 MIST (~0.062 SUI)
- **Storage Cost**: 62,266,800 MIST
- **Computation Cost**: 1,000,000 MIST
- **Storage Rebate**: 978,120 MIST
- **Non-refundable Fee**: 9,880 MIST

## Files

### Configuration Files
- `deployment.json` - Structured deployment data for programmatic access
- `.env.testnet` - Environment variables for frontend integration
- `deploy_output.md` - Raw deployment transaction output

## Frontend Integration

### Using the Environment Configuration

Copy the testnet configuration to your frontend environment:

```bash
# Copy testnet environment file
cp docs/profiles/testnet/.env.testnet frontend/.env.local

# Or manually update your frontend/.env.local with:
VITE_SUI_PACKAGE_ID=0x2efc857109bc6ae765eae9bdf03760487455133678ad796e24042ab0884b91e4
VITE_SUI_NETWORK=testnet
```

### TypeScript Configuration

```typescript
// config/contracts.ts
export const TESTNET_CONFIG = {
  packageId: "0x2efc857109bc6ae765eae9bdf03760487455133678ad796e24042ab0884b91e4",
  network: "testnet",
  modules: ["notebook"]
};
```

## Verification

### Verify Deployment with SUI CLI

```bash
# Query the package
sui client object 0x2efc857109bc6ae765eae9bdf03760487455133678ad796e24042ab0884b91e4

# Check transaction details
sui client transaction-block 9SQQCGgrA63qW8M873hDCDhS6KnQcVfFHEtrdCzcL5K4
```

### Verify on SUI Explorer

- **Package**: [View on Sui Explorer](https://suiexplorer.com/object/0x2efc857109bc6ae765eae9bdf03760487455133678ad796e24042ab0884b91e4?network=testnet)
- **Transaction**: [View Transaction](https://suiexplorer.com/txblock/9SQQCGgrA63qW8M873hDCDhS6KnQcVfFHEtrdCzcL5K4?network=testnet)

## Contract Modules

### Notebook Module

The deployed package contains the `notebook` module with the following main components:

- **Notebook**: Main storage for user's notes and folders
- **Note**: Individual note objects with encrypted content
- **Folder**: Hierarchical organization (max 5 levels deep)
- **SessionCap**: Device-specific session capabilities

For detailed API documentation, see `../../tech/design.md`.

## Development Setup

### Local Development with Testnet Contracts

1. Update your frontend environment:
   ```bash
   cd frontend
   cp ../docs/profiles/testnet/.env.testnet .env.local
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start development server:
   ```bash
   pnpm dev
   ```

### Testing Contract Interaction

```bash
# Test contract functions via CLI
sui client call --package 0x2efc857109bc6ae765eae9bdf03760487455133678ad796e24042ab0884b91e4 \
  --module notebook \
  --function initialize_notebook \
  --args "My Notebook" \
  --gas-budget 10000000
```

## Security Considerations

- ✅ contracts audited and approved (Grade B+)
- ✅ All critical security fixes applied
- ✅ Balance verification implemented
- ✅ Input validation for all external data
- ✅ Folder depth limits enforced (max 5 levels)
- ✅ Circular reference prevention in place

For detailed security analysis, see `../../tech/security/review-20251123.md`.

## Next Steps

1. **Frontend Integration**: Use the provided environment configuration
2. **Testing**: Verify contract functionality with frontend
3. **Monitoring**: Set up contract event monitoring
4. **Mainnet Preparation**: Plan for mainnet deployment after testing

## Support

For deployment issues or questions:
- Check the deployment output in `deploy_output.md`
- Review the technical design in `../../tech/design.md`
- Consult the security review in `../../tech/security/review-20251123.md`