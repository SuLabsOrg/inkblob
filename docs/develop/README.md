# Destiny DAPP Development Guide

> Comprehensive development experience and best practices for building Sui blockchain DAPPs

## 📖 Purpose

This guide documents the development experience from the Destiny project - a production-ready decentralized perpetual trading protocol built on Sui blockchain. It serves as a reference for teams starting new Sui DAPP projects, covering smart contract development, SDK implementation, frontend integration, and DevOps practices.

## 🎯 Target Audience

- Teams building new Sui blockchain DAPPs
- Developers transitioning to Sui Move development
- Projects looking for production-ready patterns and best practices
- Teams setting up CI/CD for Sui smart contract projects

## 📚 Documentation Structure

### Core Development Guides

1. **[Project Setup](./01-project-setup.md)**
   - Monorepo architecture with pnpm workspaces
   - Development environment configuration
   - Tool installation and prerequisites
   - Initial project scaffolding

2. **[Smart Contract Development](./02-smart-contract-development.md)**
   - Sui Move language patterns and best practices
   - Dual package architecture (foundation + business logic)
   - Testing strategies with 397+ tests
   - Gas optimization techniques
   - Security considerations

3. **[TypeScript SDK Development](./03-typescript-sdk.md)**
   - Auto-generated contract bindings from Move code
   - BCS encoding/decoding patterns
   - Query optimization strategies
   - Transaction building and signing
   - Browser compatibility guidelines

4. **[Go SDK Development](./04-go-sdk.md)**
   - block-vision SDK integration patterns
   - Transaction signing with correct Intent scopes
   - Interceptor pattern for transaction customization
   - Oracle integration architecture
   - BootstrapState dynamic object discovery

5. **[Frontend Development](./05-frontend-development.md)**
   - React + TypeScript architecture
   - Sui wallet integration (@mysten/dapp-kit)
   - Real-time data synchronization
   - State management patterns
   - Performance optimization

6. **[Testing & Quality Assurance](./06-testing-qa.md)**
   - 397+ test structure across all layers
   - Sui Move testing framework
   - TypeScript SDK testing (unit + integration)
   - Go SDK testing with mocks
   - Frontend testing with React Testing Library
   - CI/CD pipeline configuration

7. **[DevOps & Deployment](./07-devops-deployment.md)**
   - Multi-environment configuration (local/testnet/mainnet)
   - GitHub Actions CI/CD pipelines
   - Makefile automation
   - Deployment scripts and verification
   - Environment variable management

8. **[Development Workflows](./08-development-workflows.md)**
   - Feature development process
   - Git workflow and branching strategy
   - Code review checklist
   - Release management
   - Debugging techniques

## 🚀 Quick Start for New Projects

### 1. Initial Setup
```bash
# Create project structure based on Destiny pattern
mkdir -p my-dapp/{contracts/{foundation,business},frontend,sdks/{typescript,golang}}
cd my-dapp

# Initialize monorepo
pnpm init
# Add pnpm-workspace.yaml
```

### 2. Smart Contract Setup
```bash
# Initialize Move packages
cd contracts/foundation
sui move new foundation_package

cd ../business
sui move new business_package
```

### 3. SDK Setup
```bash
# TypeScript SDK
cd sdks/typescript
pnpm init
# Set up auto-codegen from Move contracts

# Go SDK
cd sdks/golang
go mod init github.com/yourorg/my-dapp-sdk
go get github.com/block-vision/sui-go-sdk@v1.1.2
```

### 4. Frontend Setup
```bash
cd frontend
pnpm create react-app . --template typescript
pnpm add @mysten/dapp-kit @mysten/sui
```

## 📋 Key Architectural Decisions

### Monorepo Structure
- **Why**: Unified versioning, shared dependencies, atomic commits across layers
- **Tool**: pnpm workspaces for efficient node_modules management
- **Pattern**: Contracts → SDKs → Frontend dependency flow

### Dual Package Design (Move Contracts)
- **Foundation Package**: Reusable utilities, account management, oracle integration
- **Business Package**: Domain-specific logic (trading, orderbook, positions)
- **Why**: Separation of concerns, reusability, easier testing

### Auto-Generated Contract Bindings
- **TypeScript**: Use @mysten/codegen for type-safe contract calls
- **Go**: Manual implementation with block-vision SDK
- **Why**: Type safety, reduced manual errors, automatic updates with contract changes

### Testing Strategy
- **397+ tests** across all layers ensure production readiness
- **Move**: Unit tests with `sui move test`
- **TypeScript SDK**: Jest unit + integration tests
- **Go SDK**: Standard Go testing with table-driven tests
- **Frontend**: React Testing Library + Jest
- **CI/CD**: Automated testing on every commit

## 🔑 Critical Learnings

### Smart Contract Development

1. **Gas Optimization is Critical**
   - Use `&` references instead of owned objects when possible
   - Batch operations to reduce transaction count
   - Profile gas costs with `sui move test --gas-limit`

2. **Move Language Patterns**
   - Resource-oriented programming: no copy, no drop unless specified
   - Capabilities pattern for access control
   - Witness pattern for one-time initialization
   - Event emission for off-chain indexing

3. **Testing Coverage**
   - Aim for 100% coverage on critical paths (liquidation, position management)
   - Test edge cases: overflow, underflow, division by zero
   - Use `#[test_only]` functions for test utilities

### SDK Development

1. **TypeScript SDK**
   - Always use auto-generated bindings, never manual BCS encoding
   - Handle BigInt JSON serialization with custom replacer
   - Never use `require()` - ES6 imports only for browser compatibility
   - Parse BCS return values correctly: `bcs.vector(bcs.Address).parse(new Uint8Array(bytes))`

2. **Go SDK**
   - **CRITICAL**: Use `TransactionDataIntentScope` for signing transactions (not `PersonalMessageIntentScope`)
   - Sui validates signatures against `Blake2b([0x00, 0x00, 0x00] + TxBytes)`
   - Use block-vision SDK directly, avoid unnecessary abstraction layers
   - Interceptor pattern for transaction customization (gas sponsorship, analytics)

3. **Oracle Integration**
   - Call `record_pyth_price_update` BEFORE trading operations in PreBuild hook
   - Trading operations read from `oracle_manager.pyth_cache` which must be fresh
   - CREATE vs UPDATE mode workflow for Pyth price feeds

### Frontend Development

1. **Wallet Integration**
   - Use @mysten/dapp-kit for standardized wallet connection
   - Handle wallet disconnection gracefully
   - Support multiple wallets (Sui Wallet, Suiet, etc.)

2. **Real-time Updates**
   - Use `@tanstack/react-query` for data caching and invalidation
   - Subscribe to blockchain events for instant UI updates
   - Implement optimistic updates for better UX

3. **Performance**
   - Code-split heavy components (trading charts, orderbook)
   - Lazy load routes with React.lazy
   - Memoize expensive computations with useMemo

## 🛠️ Development Tools

### Required
- **Sui CLI** (≥1.0.0): Smart contract development
- **Node.js** (≥18.0): Frontend and TypeScript SDK
- **pnpm** (≥10.0): Monorepo package management
- **Go** (≥1.21): Go SDK development
- **Git**: Version control

### Recommended
- **VS Code** with Move Analyzer extension
- **Docker**: Containerized development
- **Make**: Build automation
- **GitHub CLI**: PR management

## 📊 Project Metrics (Destiny Reference)

- **397+ tests** across all components
- **Dual package architecture** with clear separation of concerns
- **100% TypeScript** type coverage in SDK and frontend
- **Multi-language SDK** support (TypeScript + Go)
- **Production-ready** CI/CD with automated testing and deployment
- **Comprehensive documentation** with memory bank system

## 🔗 Related Resources

- [Sui Documentation](https://docs.sui.io/)
- [Sui Move Book](https://move-book.com/sui)
- [Block-Vision SDK](https://github.com/block-vision/sui-go-sdk)
- [Mysten TypeScript SDK](https://sdk.mystenlabs.com/typescript)
- [Pyth Network Integration](https://docs.pyth.network/)

## 📝 Contributing to This Guide

This guide is a living document based on real production experience. If you discover new patterns, best practices, or encounter challenges not covered here, please contribute:

1. Document your findings
2. Add examples and code snippets
3. Update relevant sections
4. Submit for review

## 🎓 Using This Guide

1. **Read sequentially** for comprehensive understanding
2. **Reference as needed** during development
3. **Adapt patterns** to your specific use case
4. **Share learnings** back to improve this guide

---

**Last Updated**: 2025-01-23
**Based on**: Destiny v1.0.0 (Production Ready)
**Status**: Actively Maintained
