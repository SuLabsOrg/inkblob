# InkBlob Smart Contracts Makefile
# Provides commands for building, testing, and deploying the InkBlob Move contracts

# Configuration
PACKAGE_NAME := inkblob
NETWORK := testnet
GAS_BUDGET := 1000000000

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

.PHONY: help build test test-unit test-integration clean deploy publish devnet testnet mainnet status check

# Default target
help:
	@echo "$(BLUE)InkBlob Smart Contracts - Available Commands:$(NC)"
	@echo ""
	@echo "$(GREEN)Development Commands:$(NC)"
	@echo "  build        - Build the Move contracts"
	@echo "  test         - Run all tests"
	@echo "  test-unit    - Run unit tests only"
	@echo "  test-integration - Run integration tests only"
	@echo "  clean        - Clean build artifacts"
	@echo "  status       - Show build status"
	@echo ""
	@echo "$(GREEN)Deployment Commands:$(NC)"
	@echo "  publish      - Publish contracts to testnet"
	@echo "  devnet       - Switch to devnet and publish"
	@echo "  testnet      - Switch to testnet and publish (default)"
	@echo "  mainnet      - Switch to mainnet and publish"
	@echo ""
	@echo "$(GREEN)Utility Commands:$(NC)"
	@echo "  check        - Run code quality checks"
	@echo "  format       - Format Move code"

# Build commands
build:
	@echo "$(BLUE)Building Move contracts...$(NC)"
	sui move build --silence-warnings --skip-fetch-latest-git-deps
	@echo "$(GREEN)Build completed successfully!$(NC)"

# Test commands
test:
	@echo "$(BLUE)Running tests...$(NC)"
	sui move test --silence-warnings --skip-fetch-latest-git-deps
	@echo "$(GREEN)Tests completed!$(NC)"

# Code quality and formatting
check:
	@echo "$(BLUE)Running code quality checks...$(NC)"
	@if sui move build 2>&1 | grep -q "error\|Error"; then \
		echo "$(RED)❌ Build failed - check compilation errors$(NC)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Code quality check passed$(NC)"; \
	fi

format:
	@echo "$(BLUE)Formatting Move code...$(NC)"
	@if command -v move-fmt >/dev/null 2>&1; then \
		move-fmt ./sources; \
		echo "$(GREEN)Code formatted successfully!$(NC)"; \
	else \
		echo "$(YELLOW)move-fmt not found. Install with: cargo install move-fmt$(NC)"; \
	fi

# Network management
devnet:
	@echo "$(BLUE)Switching to devnet...$(NC)"
	sui client new-env --alias devnet --rpc https://fullnode.devnet.sui.io:443
	sui client switch --env devnet
	@echo "$(GREEN)Switched to devnet$(NC)"

testnet:
	@echo "$(BLUE)Switching to testnet...$(NC)"
	sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
	sui client switch --env testnet
	@echo "$(GREEN)Switched to testnet$(NC)"

mainnet:
	@echo "$(BLUE)Switching to mainnet...$(NC)"
	sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443
	sui client switch --env mainnet
	@echo "$(GREEN)Switched to mainnet$(NC)"

# Status and information
status:
	@echo "$(BLUE)Build Status:$(NC)"
	@if [ -d "build" ]; then \
		echo "$(GREEN)✅ Build artifacts exist$(NC)"; \
		ls -la build/ | head -10; \
	else \
		echo "$(RED)❌ No build artifacts found$(NC)"; \
	fi
	@echo ""
	@echo "$(BLUE)Network Status:$(NC)"
	@sui client active-env
	@echo ""
	@echo "$(BLUE)Package Information:$(NC)"
	@if [ -f "Move.toml" ]; then \
		grep -A 10 "\[package\]" Move.toml; \
	fi

# Deployment commands
publish: build
	@echo "$(BLUE)Publishing contracts to $(NETWORK)...$(NC)"
	sui client publish --gas-budget $(GAS_BUDGET)
	@echo "$(GREEN)Contracts published successfully!$(NC)"

deploy-devnet: devnet publish
	@echo "$(GREEN)Deployed to devnet!$(NC)"

deploy-testnet: testnet publish
	@echo "$(GREEN)Deployed to testnet!$(NC)"

deploy-mainnet: mainnet publish
	@echo "$(RED)⚠️  DEPLOYING TO MAINNET - This will cost real SUI!$(NC)"
	@echo "Are you sure? Press Enter to continue or Ctrl+C to cancel..."
	@read _ && \
	sui client publish --gas-budget $(GAS_BUDGET)
	@echo "$(GREEN)Deployed to mainnet!$(NC)"

# Utility commands
clean:
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	rm -rf build/
	rm -f .move-build-cache
	@echo "$(GREEN)Clean completed!$(NC)"

reset:
	@echo "$(RED)Resetting project (clean + git clean)...$(NC)"
	make clean
	git clean -fd
	@echo "$(GREEN)Reset completed!$(NC)"

# Development workflow
dev: clean build test
	@echo "$(GREEN)Development workflow completed!$(NC)"

# CI/CD workflow
ci: clean build test check
	@echo "$(GREEN)CI/CD workflow completed!$(NC)"

# Show package info
info:
	@echo "$(BLUE)Package Information:$(NC)"
	@if [ -f "Move.toml" ]; then \
		cat Move.toml; \
	else \
		echo "$(RED)Move.toml not found$(NC)"; \
	fi

# List all available targets
targets:
	@echo "$(BLUE)Available Makefile targets:$(NC)"
	@$(MAKE) -pRrq : 2>/dev/null | awk -v RS= -F: '/^# File/,/^# Finished/ {if ($$1 !~ "^[#.]") {print $$1}}' | sort | grep -E -v -e '^[^[:alnum:]]' -e '^$@$$'

# Watch for changes and rebuild (requires inotify-tools)
watch:
	@echo "$(BLUE)Watching for changes...$(NC)"
	@if command -v inotifywait >/dev/null 2>&1; then \
		while inotifywait -r -e modify,create,delete --include='\.move$$' ./sources; do \
			echo "$(YELLOW)Change detected, rebuilding...$(NC)"; \
			make build; \
		done; \
	else \
		echo "$(RED)inotifywait not found. Install with: sudo apt-get install inotify-tools$(NC)"; \
	fi

# Gas estimation
gas-estimate:
	@echo "$(BLUE)Estimating gas costs...$(NC)"
	sui move build --gas-report
	@echo "$(GREEN)Gas estimation completed!$(NC)"

# Verify published package
verify:
	@echo "$(BLUE)Verifying published package...$(NC)"
	@read -p "Enter package ID: " pkg_id; \
	sui client object $$pkg_id
	@echo "$(GREEN)Verification completed!$(NC)"