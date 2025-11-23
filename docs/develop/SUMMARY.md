# Destiny Development Experience Summary

> Quick reference for building production-ready Sui blockchain DAPPs

## 🎯 Key Achievements from Destiny Project

- **397+ tests** across all components (Move, TypeScript, Go, Frontend)
- **Dual package architecture** (foundation + business logic)
- **Production-ready** CI/CD with automated testing and deployment
- **Multi-language SDK** support (TypeScript + Go)
- **Pure on-chain CLOB** with instant order matching
- **Comprehensive documentation** with memory bank system

## 📚 Documentation Index

### Essential Reading (Start Here)

1. **[README](./README.md)** - Overview and navigation
2. **[Project Setup](./01-project-setup.md)** - Monorepo initialization
3. **[Smart Contract Development](./02-smart-contract-development.md)** - Sui Move patterns
4. **[TypeScript SDK](./03-typescript-sdk.md)** - Auto-generated bindings and BCS

### Additional Guides (Created as Needed)

5. **Go SDK Development** - Transaction signing, interceptors, oracle integration
6. **Frontend Development** - React integration, wallet connection, real-time updates
7. **Testing & QA** - 397+ test structure, CI/CD configuration
8. **DevOps & Deployment** - Multi-environment setup, deployment scripts
9. **Development Workflows** - Git workflow, code review, debugging

## 🚀 Quick Start Checklist

### Day 1: Project Setup

- [ ] Install prerequisites (Sui CLI ≥1.0, Node.js ≥18, pnpm ≥10)
- [ ] Create monorepo structure
- [ ] Initialize pnpm workspace
- [ ] Set up dual package Move contracts (foundation + business)
- [ ] Configure Makefile for build automation
- [ ] Initialize Git repository with .gitignore

### Day 2: Smart Contracts

- [ ] Design dual package architecture
- [ ] Implement foundation package (utilities, accounts, oracle)
- [ ] Implement business package (core logic)
- [ ] Write Move unit tests (aim for 100% coverage on critical paths)
- [ ] Test locally with `sui move test`
- [ ] Profile gas usage with `--gas-report`

### Day 3: TypeScript SDK

- [ ] Install @mysten/codegen
- [ ] Configure sui-codegen.config.ts
- [ ] Generate contract bindings
- [ ] Implement query functions using devInspectTransactionBlock
- [ ] Add BCS parsing utilities
- [ ] Write SDK unit tests

### Day 4: Frontend

- [ ] Initialize React app with TypeScript
- [ ] Install @mysten/dapp-kit for wallet integration
- [ ] Connect to TypeScript SDK
- [ ] Implement trading UI components
- [ ] Add real-time data synchronization
- [ ] Write component tests

### Day 5: Testing & CI/CD

- [ ] Set up GitHub Actions workflow
- [ ] Configure contract testing in CI
- [ ] Add TypeScript SDK tests
- [ ] Add frontend tests
- [ ] Implement deployment scripts
- [ ] Test deployment to testnet

## 💡 Critical Learnings

### Smart Contract Development

```move
// ✅ Use references to save gas
public fun process(data: &LargeStruct): u64 {
    data.field
}

// ✅ Validate all inputs
assert!(price > 0 && price < MAX_PRICE, ERROR_INVALID_PRICE);

// ✅ Emit events for off-chain indexing
event::emit(OrderPlaced { order_id, price, size, timestamp });

// ✅ Use capabilities for access control
public entry fun admin_action(_admin: &AdminCap, config: &mut Config) {
    // Only AdminCap holder can call this
}
```

### TypeScript SDK

```typescript
// ✅ Always use auto-generated bindings
import * as orderbook from './contracts/my_business/orderbook';

const placeOrderCall = orderbook.placeOrder({
    arguments: { orderbook: id, price: 1000n, size: 10n },
    typeArguments: [baseAsset, quoteAsset],
    package: packageId,
});
placeOrderCall(tx);

// ✅ Parse BCS correctly
const addresses = bcs.vector(bcs.Address).parse(new Uint8Array(bytes));

// ✅ ES6 imports only (no require() for browser compatibility)
import { config } from './config';  // ✅
const config = require('./config'); // ❌

// ✅ Handle BigInt in JSON
const bigIntReplacer = (k: string, v: any) =>
    typeof v === 'bigint' ? v.toString() : v;
console.log(JSON.stringify(data, bigIntReplacer));
```

### Go SDK (Key Insight)

```go
// ✅ CRITICAL: Use TransactionDataIntentScope for transactions
signedMsg, _ := signer.SignMessage(txBase64, constant.TransactionDataIntentScope)

// ❌ WRONG: PersonalMessageIntentScope fails on-chain validation
// signedMsg, _ := signer.SignMessage(txBase64, constant.PersonalMessageIntentScope)

// Sui validates: Blake2b([0x00, 0x00, 0x00] + TxBytes)
// TransactionDataIntentScope uses 0x00, PersonalMessage uses 0x03
```

### Frontend Development

```typescript
// ✅ Use @mysten/dapp-kit for wallet integration
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';

// ✅ Use @tanstack/react-query for data caching
const { data } = useQuery({
    queryKey: ['orders', userAddress],
    queryFn: () => fetchUserOrders(userAddress),
    refetchInterval: 5000,  // Real-time updates every 5s
});
```

## 📊 Architecture Patterns

### Monorepo Structure

```
my-dapp/
├── contracts/          # Sui Move smart contracts
│   ├── foundation/    # Reusable utilities
│   └── business/      # Domain logic
├── sdks/              # Development SDKs
│   ├── typescript/    # Frontend integration
│   └── golang/        # Backend services (optional)
├── frontend/          # React application
├── scripts/           # Deployment scripts
├── docs/              # Documentation
├── .github/           # CI/CD workflows
└── Makefile           # Build automation
```

### Dependency Flow

```
Move Contracts
    ↓
TypeScript SDK (auto-generated bindings)
    ↓
React Frontend
```

### Testing Pyramid

```
                    E2E Tests
                   /         \
              Integration     \
             /       |         \
        Unit Tests (Move, TS, React)
       /            |            \
  Move Tests    SDK Tests    Component Tests
  (397+ total tests across all layers)
```

## 🔧 Development Tools

### Required

- **Sui CLI** (≥1.0.0) - Contract development
- **Node.js** (≥18.0) - Frontend and TypeScript SDK
- **pnpm** (≥10.0) - Monorepo package manager
- **TypeScript** (≥4.9) - Type safety
- **Git** - Version control

### Recommended

- **VS Code** with Move Analyzer extension
- **Make** - Build automation
- **Docker** - Containerized development
- **GitHub CLI** - PR management
- **Go** (≥1.21) - Optional for Go SDK

## 🎓 Common Pitfalls and Solutions

### Issue #1: Transaction Signing Fails

**Problem**: Sui rejects transaction with signature validation error

**Solution**: Use correct Intent scope in Go SDK
```go
// ✅ Correct
signedMsg, _ := signer.SignMessage(txBase64, constant.TransactionDataIntentScope)
```

### Issue #2: Browser Build Fails

**Problem**: "require is not defined" in browser

**Solution**: Use ES6 imports only
```typescript
// ❌ Wrong
const { config } = require('./config');

// ✅ Correct
import { config } from './config';
```

### Issue #3: BigInt JSON Error

**Problem**: "Do not know how to serialize a BigInt"

**Solution**: Custom JSON replacer
```typescript
const replacer = (k: string, v: any) =>
    typeof v === 'bigint' ? v.toString() : v;
JSON.stringify(data, replacer);
```

### Issue #4: BCS Parsing Returns Garbage

**Problem**: Incorrect data when parsing BCS bytes

**Solution**: Ensure correct BCS type
```typescript
// ✅ Correct
const addresses = bcs.vector(bcs.Address).parse(new Uint8Array(bytes));

// ❌ Wrong
const addresses = bcs.vector(bcs.u64()).parse(new Uint8Array(bytes));
```

### Issue #5: Gas Costs Too High

**Problem**: Transactions consume excessive gas

**Solutions**:
- Use references (`&`, `&mut`) instead of owned values
- Minimize storage operations
- Batch operations when possible
- Profile with `sui move test --gas-report`

## 📈 Performance Benchmarks (Destiny Reference)

| Metric | Destiny Achievement | Target |
|--------|-------------------|--------|
| Order Submission | ~400ms | <500ms |
| Position Updates | ~200ms | <300ms |
| Liquidation Speed | ~500ms | <1000ms |
| Test Coverage | 397 tests | >90% |
| Build Time | ~2min | <5min |

## 🔐 Security Checklist

### Smart Contracts

- [ ] Input validation on all entry functions
- [ ] Authorization checks (verify `tx_context::sender()`)
- [ ] Safe math (overflow/underflow protection)
- [ ] Proper capability usage for admin functions
- [ ] Event emission for state changes
- [ ] No reentrancy vulnerabilities
- [ ] Edge cases tested (zero, max values)

### SDK

- [ ] Type safety with TypeScript
- [ ] Error handling for all RPC calls
- [ ] Retry logic for transient failures
- [ ] Rate limiting for API calls
- [ ] Secure key management (never hardcode keys)
- [ ] Input sanitization

### Frontend

- [ ] Wallet connection security
- [ ] Transaction confirmation before signing
- [ ] Display transaction details to user
- [ ] Handle wallet disconnection gracefully
- [ ] XSS protection (sanitize user input)
- [ ] HTTPS only in production

## 🚀 Deployment Workflow

### 1. Local Testing

```bash
make build
make test
sui start  # Local network
make deploy-local
```

### 2. TestNet Deployment

```bash
# Update Move.toml with testnet addresses
sui client switch --env testnet
./scripts/deploy-contracts.sh testnet
./scripts/verify-deployment.sh testnet
```

### 3. MainNet Preparation

- [ ] Security audit completed
- [ ] All tests passing
- [ ] Gas optimization verified
- [ ] Documentation complete
- [ ] Emergency procedures defined
- [ ] Monitoring and alerting set up

## 📚 Additional Resources

### Official Documentation

- [Sui Documentation](https://docs.sui.io/)
- [Sui Move Book](https://move-book.com/sui)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)
- [Block-Vision Go SDK](https://github.com/block-vision/sui-go-sdk)

### Destiny Project References

- **Memory Bank**: `memory-bank/` - Project context and patterns
- **Smart Contracts**: `contracts/` - Production Move code
- **TypeScript SDK**: `sdks/typescript/perp/` - Auto-generated bindings
- **Go SDK**: `sdks/golang/perp/` - Transaction signing patterns
- **Frontend**: `frontend/` - React integration examples
- **CI/CD**: `.github/workflows/` - GitHub Actions configuration

### Community

- [Sui Discord](https://discord.gg/sui)
- [Sui Forum](https://forums.sui.io/)
- [Sui GitHub](https://github.com/MystenLabs/sui)

## 🎯 Next Steps

1. **Start with Project Setup**: Follow [01-project-setup.md](./01-project-setup.md)
2. **Implement Smart Contracts**: Use [02-smart-contract-development.md](./02-smart-contract-development.md)
3. **Build TypeScript SDK**: Reference [03-typescript-sdk.md](./03-typescript-sdk.md)
4. **Study Destiny Code**: Explore contracts/, sdks/, and frontend/ directories
5. **Join Community**: Ask questions, share learnings

## 📝 Contributing

This documentation is based on real production experience from the Destiny project. If you discover new patterns or encounter challenges not covered here:

1. Document your findings
2. Add code examples
3. Update relevant sections
4. Submit pull request

---

**Version**: 1.0.0
**Last Updated**: 2025-01-23
**Based On**: Destiny DAPP v1.0 (Production Ready)
**Status**: Actively Maintained
**License**: MIT
