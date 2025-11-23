# Destiny Development Experience - Complete Index

> 3,264 lines of production-ready Sui DAPP development guidance

## 📖 Documentation Files

### Main Guides (Read in Order)

1. **[README.md](./README.md)** (252 lines)
   - Overview and purpose
   - Target audience
   - Documentation structure
   - Quick start for new projects
   - Key architectural decisions

2. **[01-project-setup.md](./01-project-setup.md)** (673 lines)
   - Monorepo architecture with pnpm workspaces
   - Prerequisites and tool installation
   - Initial project scaffolding
   - Makefile automation
   - Git and environment configuration

3. **[02-smart-contract-development.md](./02-smart-contract-development.md)** (693 lines)
   - Sui Move language fundamentals
   - Dual package architecture (foundation + business)
   - Common patterns (Witness, Capability, Hot Potato)
   - Gas optimization techniques
   - Security best practices
   - Testing strategies

4. **[03-typescript-sdk.md](./03-typescript-sdk.md)** (670 lines)
   - Auto-generated contract bindings with @mysten/codegen
   - BCS encoding/decoding patterns
   - Browser compatibility (ES6 imports, BigInt JSON)
   - Query patterns with devInspectTransactionBlock
   - Advanced patterns (dynamic discovery, batch queries)

5. **[04-go-sdk-patterns.md](./04-go-sdk-patterns.md)** (588 lines)
   - **CRITICAL**: Transaction signing with TransactionDataIntentScope
   - Interceptor pattern for transaction customization
   - Oracle integration architecture
   - BootstrapState dynamic object discovery
   - Best practices and common gotchas

### Reference Documents

6. **[SUMMARY.md](./SUMMARY.md)** (388 lines)
   - Quick reference for key patterns
   - Common pitfalls and solutions
   - Performance benchmarks
   - Security checklist
   - Deployment workflow

## 📊 Documentation Statistics

- **Total Lines**: 3,264 lines
- **Total Files**: 6 files
- **Total Size**: ~100 KB
- **Topics Covered**: 50+
- **Code Examples**: 100+
- **Best Practices**: 30+

## 🎯 Quick Navigation

### By Topic

**Smart Contracts**
- [Move Language Fundamentals](./02-smart-contract-development.md#sui-move-language-fundamentals)
- [Dual Package Architecture](./02-smart-contract-development.md#dual-package-architecture)
- [Gas Optimization](./02-smart-contract-development.md#gas-optimization-techniques)
- [Security Best Practices](./02-smart-contract-development.md#security-best-practices)

**TypeScript SDK**
- [Auto-Generated Bindings](./03-typescript-sdk.md#auto-generated-contract-bindings)
- [BCS Parsing](./03-typescript-sdk.md#bcs-encoding-and-decoding)
- [Browser Compatibility](./03-typescript-sdk.md#browser-compatibility)
- [Query Patterns](./03-typescript-sdk.md#query-pattern-devinspecttransactionblock)

**Go SDK**
- [Transaction Signing (CRITICAL)](./04-go-sdk-patterns.md#critical-transaction-signing)
- [Interceptor Pattern](./04-go-sdk-patterns.md#interceptor-pattern)
- [Oracle Integration](./04-go-sdk-patterns.md#oracle-integration)
- [Dynamic Object Discovery](./04-go-sdk-patterns.md#bootstrapstate-dynamic-discovery)

**Project Setup**
- [Monorepo Structure](./01-project-setup.md#monorepo-architecture)
- [Prerequisites](./01-project-setup.md#prerequisites)
- [Build Automation](./01-project-setup.md#step-6-create-build-automation)
- [Environment Configuration](./01-project-setup.md#environment-configuration)

### By Development Phase

**Phase 1: Initial Setup**
1. [Prerequisites](./01-project-setup.md#prerequisites)
2. [Create Project](./01-project-setup.md#step-1-create-project-directory)
3. [Initialize Workspace](./01-project-setup.md#step-2-initialize-pnpm-workspace)
4. [Configure Build](./01-project-setup.md#step-6-create-build-automation)

**Phase 2: Smart Contracts**
1. [Initialize Packages](./01-project-setup.md#step-3-initialize-smart-contracts)
2. [Learn Move Patterns](./02-smart-contract-development.md#common-patterns)
3. [Implement Foundation](./02-smart-contract-development.md#dual-package-architecture)
4. [Write Tests](./02-smart-contract-development.md#testing-strategies)

**Phase 3: TypeScript SDK**
1. [Setup Codegen](./03-typescript-sdk.md#setting-up-code-generation)
2. [Generate Bindings](./03-typescript-sdk.md#generate-bindings)
3. [Implement Queries](./03-typescript-sdk.md#query-pattern-devinspecttransactionblock)
4. [Add BCS Parsing](./03-typescript-sdk.md#bcs-encoding-and-decoding)

**Phase 4: Go SDK (Optional)**
1. [Learn Signing](./04-go-sdk-patterns.md#the-intent-scope-issue)
2. [Implement Client](./04-go-sdk-patterns.md#transaction-submission-flow)
3. [Add Interceptors](./04-go-sdk-patterns.md#interceptor-pattern)
4. [Integrate Oracle](./04-go-sdk-patterns.md#oracle-integration)

**Phase 5: Frontend & Deployment**
- Frontend guide (to be created)
- Testing & QA guide (to be created)
- DevOps & Deployment guide (to be created)

## 🔥 Critical Insights

### Transaction Signing (Go SDK)

```go
// ✅ ALWAYS use TransactionDataIntentScope for blockchain transactions
signedMsg, _ := signer.SignMessage(txBase64, constant.TransactionDataIntentScope)

// ❌ NEVER use PersonalMessageIntentScope for transactions
// signedMsg, _ := signer.SignMessage(txBase64, constant.PersonalMessageIntentScope)
```

**Why**: Sui validates `Blake2b([0x00, 0x00, 0x00] + TxBytes)` for transactions, where the first 3 bytes are the Intent prefix. TransactionDataIntentScope uses `[0x00, 0x00, 0x00]`, while PersonalMessageIntentScope uses `[0x00, 0x03, 0x00]`.

### Browser Compatibility (TypeScript SDK)

```typescript
// ✅ ES6 imports only
import { config } from './config';

// ❌ NO require() - breaks in browser
const config = require('./config');

// ✅ BigInt JSON serialization
const replacer = (k: string, v: any) => typeof v === 'bigint' ? v.toString() : v;
JSON.stringify(data, replacer);
```

### Oracle Integration Order

```
PreBuild Hook:
  1. update_price_feeds      → Updates Pyth PriceInfoObjects
  2. record_pyth_price_update → Writes to oracle_manager.pyth_cache

SDK Build:
  3. place_order             → Reads from oracle_manager.pyth_cache ✅

PostBuild Hook:
  4. (No-op for oracle)
```

**Critical**: `record_pyth_price_update` MUST be called in PreBuild, BEFORE trading operations, to ensure fresh prices.

## 📚 Additional Resources

### Destiny Project References
- **Smart Contracts**: `contracts/foundation/`, `contracts/perp/`
- **TypeScript SDK**: `sdks/typescript/perp/`
- **Go SDK**: `sdks/golang/perp/`
- **Frontend**: `frontend/`
- **CI/CD**: `.github/workflows/`
- **Memory Bank**: `memory-bank/`

### Official Documentation
- [Sui Documentation](https://docs.sui.io/)
- [Sui Move Book](https://move-book.com/sui)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)
- [Block-Vision Go SDK](https://github.com/block-vision/sui-go-sdk)

### Community
- [Sui Discord](https://discord.gg/sui)
- [Sui Forum](https://forums.sui.io/)
- [Sui GitHub](https://github.com/MystenLabs/sui)

## 🎓 How to Use This Documentation

### For New Projects

1. Start with [README.md](./README.md) for overview
2. Follow [01-project-setup.md](./01-project-setup.md) step-by-step
3. Implement contracts using [02-smart-contract-development.md](./02-smart-contract-development.md)
4. Build SDK with [03-typescript-sdk.md](./03-typescript-sdk.md)
5. If using Go, study [04-go-sdk-patterns.md](./04-go-sdk-patterns.md)
6. Reference [SUMMARY.md](./SUMMARY.md) for quick lookups

### For Troubleshooting

1. Check [SUMMARY.md#Common Pitfalls](./SUMMARY.md#common-pitfalls-and-solutions)
2. Search specific guides for error patterns
3. Review Destiny source code in respective directories
4. Ask in Sui community channels

### For Code Reviews

1. [Security Checklist](./SUMMARY.md#security-checklist)
2. [Best Practices](./02-smart-contract-development.md#best-practices)
3. [Performance Optimization](./02-smart-contract-development.md#gas-optimization-techniques)

## 📝 Document Status

- **Version**: 1.0.0
- **Last Updated**: 2025-01-23
- **Based On**: Destiny DAPP v1.0 (Production Ready, 397+ tests)
- **Maintenance**: Actively Maintained
- **License**: MIT

## 🤝 Contributing

Found improvements or discovered new patterns? Please contribute:

1. Document your findings
2. Add code examples
3. Update relevant sections
4. Submit pull request

---

**Total Documentation**: 3,264 lines across 6 files
**Coverage**: Project setup → Smart contracts → TypeScript SDK → Go SDK → Production deployment
**Quality**: Production-tested patterns with 397+ tests passing
