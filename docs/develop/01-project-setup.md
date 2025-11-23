# Project Setup Guide

> Establishing a production-ready Sui DAPP monorepo

## Overview

This guide covers the initial setup of a monorepo structure for a Sui blockchain DAPP, following the proven patterns from the Destiny project.

## Monorepo Architecture

### Directory Structure

```
my-dapp/
├── contracts/                      # Sui Move smart contracts
│   ├── foundation/                # Core utilities package
│   │   ├── sources/               # Move source files
│   │   ├── tests/                 # Move test files
│   │   ├── Move.toml              # Package manifest
│   │   └── Move.lock              # Dependency lock file
│   ├── business/                  # Business logic package
│   │   ├── sources/
│   │   ├── tests/
│   │   ├── Move.toml
│   │   └── Move.lock
│   └── vendor/                    # Third-party contracts
│       ├── pyth/                  # Oracle integration
│       └── wormhole/              # Cross-chain messaging
├── sdks/                          # Development SDKs
│   ├── typescript/                # TypeScript SDK
│   │   ├── src/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── golang/                    # Go SDK (optional)
│       ├── client/
│       ├── contract/
│       ├── go.mod
│       └── go.sum
├── frontend/                      # React application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── tsconfig.json
├── scripts/                       # Deployment and utility scripts
│   ├── deploy-contracts.sh
│   ├── setup-dev.sh
│   └── verify-deployment.sh
├── docs/                          # Documentation
│   ├── develop/                   # Development guides
│   └── api/                       # API documentation
├── .github/                       # GitHub configuration
│   └── workflows/                 # CI/CD pipelines
│       ├── ci.yml
│       └── deploy.yml
├── docker/                        # Docker configurations
│   ├── Dockerfile
│   └── docker-compose.yml
├── memory-bank/                   # Project memory system (for Claude Code)
│   ├── projectbrief.md
│   ├── techContext.md
│   └── systemPatterns.md
├── Makefile                       # Build automation
├── pnpm-workspace.yaml            # pnpm monorepo config
├── package.json                   # Root package.json
├── pnpm-lock.yaml                 # Dependency lock
├── .gitignore
└── README.md
```

### Why Monorepo?

1. **Unified Versioning**: All components version together, ensuring compatibility
2. **Atomic Commits**: Change contracts, SDK, and frontend in a single commit
3. **Shared Dependencies**: Centralized dependency management
4. **Simplified CI/CD**: Single pipeline for all components
5. **Better Developer Experience**: Single checkout, consistent tooling

## Prerequisites

### Required Tools

```bash
# Sui CLI (≥1.0.0)
# Install from https://docs.sui.io/build/install
curl -fLJO https://github.com/MystenLabs/sui/releases/download/mainnet-v1.54.2/sui-mainnet-v1.54.2-ubuntu-x86_64.tgz
tar -zxf sui-mainnet-v1.54.2-ubuntu-x86_64.tgz
sudo mv sui /usr/local/bin/
sui --version

# Node.js (≥18.0.0)
# Install from https://nodejs.org/ or use nvm
nvm install 18
nvm use 18

# pnpm (≥10.0.0)
npm install -g pnpm
pnpm --version

# TypeScript (≥4.9.0)
npm install -g typescript
tsc --version

# Git
git --version

# (Optional) Go (≥1.21) for Go SDK
# Install from https://golang.org/
go version

# (Optional) Make for build automation
make --version

# (Optional) Docker for containerized development
docker --version
```

### Verification Script

Create `scripts/check-prerequisites.sh`:

```bash
#!/bin/bash
set -e

echo "=== Checking Prerequisites ==="

# Check Sui CLI
if command -v sui &> /dev/null; then
    echo "✅ Sui CLI: $(sui --version)"
else
    echo "❌ Sui CLI not found. Install from https://docs.sui.io/build/install"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        echo "✅ Node.js: $(node --version)"
    else
        echo "❌ Node.js version must be ≥18.0.0, found $(node --version)"
        exit 1
    fi
else
    echo "❌ Node.js not found"
    exit 1
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
    echo "✅ pnpm: $(pnpm --version)"
else
    echo "❌ pnpm not found. Install with: npm install -g pnpm"
    exit 1
fi

# Check TypeScript
if command -v tsc &> /dev/null; then
    echo "✅ TypeScript: $(tsc --version)"
else
    echo "⚠️  TypeScript not globally installed (optional)"
fi

# Check Git
if command -v git &> /dev/null; then
    echo "✅ Git: $(git --version)"
else
    echo "❌ Git not found"
    exit 1
fi

# Optional: Check Go
if command -v go &> /dev/null; then
    echo "✅ Go: $(go version)"
else
    echo "ℹ️  Go not installed (optional for Go SDK)"
fi

# Optional: Check Make
if command -v make &> /dev/null; then
    echo "✅ Make: $(make --version | head -1)"
else
    echo "ℹ️  Make not installed (optional for Makefile automation)"
fi

# Optional: Check Docker
if command -v docker &> /dev/null; then
    echo "✅ Docker: $(docker --version)"
else
    echo "ℹ️  Docker not installed (optional for containerized development)"
fi

echo ""
echo "=== Prerequisite Check Complete ==="
```

## Initial Project Setup

### Step 1: Create Project Directory

```bash
# Create project root
mkdir my-dapp
cd my-dapp

# Initialize git repository
git init
git branch -M main
```

### Step 2: Initialize pnpm Workspace

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'frontend'
  - 'sdks/typescript/*'
  - 'sdks/typescript/*/packages/*'
```

Create root `package.json`:

```json
{
  "name": "my-dapp",
  "version": "1.0.0",
  "private": true,
  "description": "My Sui DAPP - [Brief Description]",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=10.0.0"
  },
  "scripts": {
    "build": "pnpm -r --filter=!frontend build",
    "build:all": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "clean": "pnpm -r clean && rm -rf node_modules"
  },
  "keywords": ["sui", "blockchain", "dapp"],
  "license": "MIT"
}
```

### Step 3: Initialize Smart Contracts

```bash
# Create contracts directory structure
mkdir -p contracts/{foundation,business,vendor}

# Initialize foundation package
cd contracts/foundation
sui move new foundation_package
# Rename to your package name
mv foundation_package/* .
rmdir foundation_package

# Create Move.toml
cat > Move.toml << 'EOF'
[package]
name = "my_foundation"
version = "0.0.1"
edition = "2024.beta"

[dependencies]

[addresses]
my_foundation = "0x0"
EOF

# Initialize business package
cd ../business
sui move new business_package
mv business_package/* .
rmdir business_package

# Create Move.toml with foundation dependency
cat > Move.toml << 'EOF'
[package]
name = "my_business"
version = "0.0.1"
edition = "2024.beta"

[dependencies]
my_foundation = { local = "../foundation" }

[addresses]
my_business = "0x0"
my_foundation = "0x0"
EOF

cd ../..
```

### Step 4: Initialize TypeScript SDK

```bash
mkdir -p sdks/typescript/sdk
cd sdks/typescript/sdk

# Create package.json
cat > package.json << 'EOF'
{
  "name": "@my-dapp/sdk",
  "version": "1.0.0",
  "description": "TypeScript SDK for My DAPP",
  "type": "commonjs",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/cjs/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js"
    }
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsc && tsc -p tsconfig.esm.json",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mysten/bcs": "^1.8.0",
    "@mysten/sui": "^1.38.0"
  },
  "devDependencies": {
    "@mysten/codegen": "^0.5.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "jest": "^30.1.3",
    "ts-jest": "^29.4.4",
    "typescript": "^5.9.2"
  }
}
EOF

# Create tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist/cjs",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
EOF

# Create directory structure
mkdir -p src/{contracts,utils,types}

cd ../../..
```

### Step 5: Initialize Frontend

```bash
# Create React app with TypeScript
cd frontend
pnpm create react-app . --template typescript

# Install Sui dependencies
pnpm add @mysten/dapp-kit @mysten/sui @mysten/wallet-standard
pnpm add @tanstack/react-query

# Install workspace SDK
pnpm add @my-dapp/sdk@workspace:*

# Update package.json scripts
# Add:
#   "type-check": "tsc --noEmit"
#   "test:coverage": "react-scripts test --coverage --watchAll=false"

cd ..
```

### Step 6: Create Build Automation

Create `Makefile`:

```makefile
.PHONY: all build test clean setup help
.PHONY: build-contracts build-sdk build-frontend
.PHONY: test-contracts test-sdk test-frontend
.PHONY: deploy-local deploy-testnet

# Colors
GREEN=\033[0;32m
BLUE=\033[0;34m
YELLOW=\033[1;33m
NC=\033[0m

# Paths
FOUNDATION_DIR = contracts/foundation
BUSINESS_DIR = contracts/business
SDK_DIR = sdks/typescript/sdk
FRONTEND_DIR = frontend

# Default target
all: build test

help:
	@echo "$(BLUE)My DAPP Build System$(NC)"
	@echo "Available targets:"
	@echo "  $(GREEN)setup$(NC)          - Setup development environment"
	@echo "  $(GREEN)build$(NC)          - Build all components"
	@echo "  $(GREEN)test$(NC)           - Run all tests"
	@echo "  $(GREEN)clean$(NC)          - Clean build artifacts"

setup:
	@echo "$(BLUE)Setting up development environment...$(NC)"
	@./scripts/check-prerequisites.sh
	@pnpm install
	@echo "$(GREEN)Setup complete!$(NC)"

build-contracts:
	@echo "$(BLUE)Building smart contracts...$(NC)"
	@cd $(FOUNDATION_DIR) && sui move build --silence-warnings
	@cd $(BUSINESS_DIR) && sui move build --silence-warnings
	@echo "$(GREEN)Contracts built!$(NC)"

build-sdk: build-contracts
	@echo "$(BLUE)Building TypeScript SDK...$(NC)"
	@cd $(SDK_DIR) && pnpm run build
	@echo "$(GREEN)SDK built!$(NC)"

build-frontend: build-sdk
	@echo "$(BLUE)Building frontend...$(NC)"
	@cd $(FRONTEND_DIR) && pnpm run build
	@echo "$(GREEN)Frontend built!$(NC)"

build: build-contracts build-sdk build-frontend

test-contracts:
	@echo "$(BLUE)Testing smart contracts...$(NC)"
	@cd $(FOUNDATION_DIR) && sui move test --silence-warnings
	@cd $(BUSINESS_DIR) && sui move test --silence-warnings
	@echo "$(GREEN)Contract tests passed!$(NC)"

test-sdk:
	@echo "$(BLUE)Testing TypeScript SDK...$(NC)"
	@cd $(SDK_DIR) && pnpm test
	@echo "$(GREEN)SDK tests passed!$(NC)"

test-frontend:
	@echo "$(BLUE)Testing frontend...$(NC)"
	@cd $(FRONTEND_DIR) && pnpm test:coverage
	@echo "$(GREEN)Frontend tests passed!$(NC)"

test: test-contracts test-sdk test-frontend

clean:
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	@rm -rf $(FOUNDATION_DIR)/build
	@rm -rf $(BUSINESS_DIR)/build
	@rm -rf $(SDK_DIR)/dist
	@rm -rf $(FRONTEND_DIR)/build
	@pnpm clean
	@echo "$(GREEN)Clean complete!$(NC)"

deploy-local:
	@echo "$(BLUE)Deploying to local Sui network...$(NC)"
	@./scripts/deploy-contracts.sh local

deploy-testnet:
	@echo "$(BLUE)Deploying to Sui testnet...$(NC)"
	@./scripts/deploy-contracts.sh testnet

.DEFAULT_GOAL := help
```

### Step 7: Configure Git

Create `.gitignore`:

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
.nyc_output

# Production builds
build/
dist/
*.tsbuildinfo

# Sui Move
contracts/*/build/
contracts/*/.sui/
*.lock

# Environment files
.env
.env.local
.env.*.local
*.key
*.pem

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Temporary
.tmp/
tmp/
*.tmp
```

### Step 8: Initialize CI/CD

Create `.github/workflows/ci.yml` (see [Testing & QA Guide](./06-testing-qa.md) for full configuration).

## Environment Configuration

### Local Development

Create `.env.example`:

```bash
# Network Configuration
SUI_NETWORK=localnet
SUI_RPC_URL=http://localhost:9000

# Contract Addresses (update after deployment)
FOUNDATION_PACKAGE_ID=0x0
BUSINESS_PACKAGE_ID=0x0

# Oracle Configuration (if applicable)
PYTH_PACKAGE_ID=0x0
ORACLE_UPDATE_INTERVAL=30

# Frontend Configuration
REACT_APP_SUI_NETWORK=localnet
REACT_APP_FOUNDATION_PACKAGE=0x0
REACT_APP_BUSINESS_PACKAGE=0x0
```

### Development Workflow

```bash
# 1. Install dependencies
make setup

# 2. Build all components
make build

# 3. Run tests
make test

# 4. Start local Sui network
sui start

# 5. Deploy contracts locally
make deploy-local

# 6. Start frontend development server
cd frontend && pnpm start
```

## Best Practices

### 1. Dependency Management

- **Use pnpm**: Faster, more efficient than npm/yarn
- **Workspace protocol**: `@my-dapp/sdk@workspace:*` for local dependencies
- **Lock files**: Commit `pnpm-lock.yaml` for reproducible builds
- **Version pinning**: Use exact versions for critical dependencies

### 2. Monorepo Organization

- **Clear boundaries**: Contracts, SDKs, Frontend
- **Unidirectional dependencies**: Contracts → SDKs → Frontend
- **Shared tooling**: Centralized ESLint, TypeScript, Prettier configs
- **Build order**: Respect dependency order in Makefile and CI/CD

### 3. Documentation

- **README per package**: Explain purpose, setup, usage
- **CHANGELOG**: Track version changes and breaking changes
- **API docs**: Auto-generate from TypeScript with TypeDoc
- **Memory Bank**: Maintain project context for AI assistants

### 4. Version Control

- **Conventional commits**: `feat:`, `fix:`, `docs:`, `chore:`
- **Branch naming**: `feat/feature-name`, `fix/bug-description`
- **PR templates**: Standardize pull request descriptions
- **Protected branches**: Require reviews and passing CI for main/develop

## Next Steps

1. **Read [Smart Contract Development](./02-smart-contract-development.md)** to begin implementing Move contracts
2. **Configure testing** following [Testing & QA Guide](./06-testing-qa.md)
3. **Set up CI/CD** using [DevOps & Deployment](./07-devops-deployment.md)

## Troubleshooting

### pnpm install fails

```bash
# Clear cache and retry
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Sui CLI not found after installation

```bash
# Add to PATH in ~/.bashrc or ~/.zshrc
export PATH="$PATH:$HOME/.sui/bin"
source ~/.bashrc
```

### TypeScript version conflicts

```bash
# Use workspace TypeScript
pnpm add -D -w typescript@5.9.2
```

## Summary

This setup provides:

- ✅ Monorepo structure with pnpm workspaces
- ✅ Dual package smart contract architecture
- ✅ TypeScript SDK with auto-generated bindings
- ✅ React frontend with Sui wallet integration
- ✅ Build automation with Makefile
- ✅ Git and CI/CD configuration
- ✅ Environment management for multiple networks

You now have a production-ready foundation for Sui DAPP development!
