# Smart Contract Development Guide

> Sui Move development patterns and best practices from production experience

## Overview

This guide documents smart contract development patterns from the Destiny project, which features a production-ready perpetual trading protocol with 397+ passing tests, dual package architecture, and comprehensive testing coverage.

## Sui Move Language Fundamentals

### Resource-Oriented Programming

Move's key innovation is **resource safety** - values cannot be copied or discarded unless explicitly allowed:

```move
// Resources CANNOT be copied or dropped by default
public struct Asset has key {
    id: UID,
    value: u64,
}

// This would fail - cannot copy Asset
// let asset2 = asset1;  // ❌ ERROR

// Must explicitly transfer or destroy
public fun transfer_asset(asset: Asset, recipient: address) {
    transfer::transfer(asset, recipient);  // ✅ OK
}

// Drop capability must be explicit
public struct Config has key, store, drop {
    value: u64,
}
```

### Key Abilities

```move
// key: Can be stored as top-level object with UID
public struct TopLevel has key {
    id: UID,
}

// store: Can be stored inside another struct
public struct Nested has store {
    value: u64,
}

// copy: Can be copied by value
public struct Copyable has copy, drop {
    x: u64,
}

// drop: Can be discarded/destroyed
public struct Droppable has drop {
    x: u64,
}
```

## Dual Package Architecture

### Pattern: Foundation + Business Logic

The Destiny project uses a proven dual-package pattern:

**Foundation Package** (`my_foundation`):
- Reusable utilities (math, validation)
- Core infrastructure (accounts, oracle integration)
- Admin and access control
- Constants and error codes
- Type definitions used across packages

**Business Package** (`my_business`):
- Domain-specific logic (trading, orderbook, positions)
- Entry functions for user interactions
- Business workflow orchestration
- Package-specific data structures

### Benefits

1. **Separation of Concerns**: Clear boundaries between infrastructure and business logic
2. **Reusability**: Foundation can be reused in multiple business packages
3. **Testability**: Test foundation and business logic independently
4. **Upgradeability**: Upgrade business logic without touching foundation
5. **Gas Efficiency**: Smaller business package deployments

### Example Structure

```
contracts/
├── foundation/
│   ├── sources/
│   │   ├── account.move          # User account management
│   │   ├── admin.move            # Admin capabilities
│   │   ├── constants.move        # System constants
│   │   ├── oracle.move           # Price oracle integration
│   │   ├── utils.move            # Math and validation utilities
│   │   └── twap.move             # Time-weighted average price
│   └── Move.toml
└── business/
    ├── sources/
    │   ├── orderbook.move        # Order book implementation
    │   ├── position.move         # Position management
    │   ├── market.move           # Market parameters
    │   ├── liquidation.move      # Liquidation logic
    │   └── entry.move            # Entry functions
    └── Move.toml
```

## Module Organization Patterns

### 1. Entry Functions Module

Create a dedicated `entry.move` module for user-facing functions:

```move
module my_business::entry {
    use my_foundation::account::{Self, Account};
    use my_business::orderbook::{Self, OrderBook};

    // Public entry functions callable from transactions
    public entry fun place_order(
        orderbook: &mut OrderBook,
        account: &Account,
        price: u64,
        size: u64,
        ctx: &mut TxContext
    ) {
        // Validation
        assert!(price > 0, ERROR_INVALID_PRICE);
        assert!(size > 0, ERROR_INVALID_SIZE);

        // Delegate to internal module
        orderbook::place_order_internal(
            orderbook,
            account,
            price,
            size,
            ctx
        );
    }
}
```

### 2. Internal Logic Modules

Keep complex logic in separate modules with public(package) or friend functions:

```move
module my_business::orderbook {
    // Only accessible within same package
    public(package) fun place_order_internal(
        orderbook: &mut OrderBook,
        account: &Account,
        price: u64,
        size: u64,
        ctx: &mut TxContext
    ) {
        // Implementation
    }

    // Accessible by specific friends
    friend my_business::liquidation;

    public(friend) fun force_cancel_order(
        orderbook: &mut OrderBook,
        order_id: ID,
    ) {
        // Only liquidation module can call this
    }
}
```

### 3. Test Modules

Use `#[test_only]` for test utilities:

```move
#[test_only]
module my_business::orderbook_test {
    use my_business::orderbook;
    use sui::test_scenario;

    #[test_only]
    public fun create_test_orderbook(ctx: &mut TxContext): OrderBook {
        orderbook::new(ctx)
    }

    #[test]
    fun test_place_order() {
        let scenario = test_scenario::begin(@0xA);

        // Test implementation

        test_scenario::end(scenario);
    }
}
```

## Common Patterns

### 1. Witness Pattern (One-Time Initialization)

```move
module my_business::market {
    // Witness struct - can only be created once
    public struct MARKET has drop {}

    // One-time initialization
    fun init(witness: MARKET, ctx: &mut TxContext) {
        // Create and share singleton object
        let market_config = MarketConfig {
            id: object::new(ctx),
            // ... configuration
        };
        transfer::share_object(market_config);
    }
}
```

### 2. Capability Pattern (Access Control)

```move
module my_foundation::admin {
    // Admin capability - owner can perform admin actions
    public struct AdminCap has key, store {
        id: UID,
    }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(AdminCap {
            id: object::new(ctx),
        }, tx_context::sender(ctx));
    }

    // Require admin cap to call
    public entry fun set_parameter(
        _admin: &AdminCap,  // Proof of admin rights
        config: &mut Config,
        value: u64,
    ) {
        config.parameter = value;
    }
}
```

### 3. Hot Potato Pattern (Forced Consumption)

```move
// Struct without drop or store abilities - must be consumed
public struct Receipt {
    amount: u64,
}

public fun withdraw(account: &mut Account, amount: u64): Receipt {
    // Deduct from account
    account.balance = account.balance - amount;

    // Return receipt that MUST be consumed
    Receipt { amount }
}

public fun deposit(account: &mut Account, receipt: Receipt) {
    let Receipt { amount } = receipt;  // Unpack and consume
    account.balance = account.balance + amount;
}

// Cannot call withdraw without deposit - Receipt must be consumed!
```

### 4. Shared vs Owned Objects

```move
// Shared object - can be accessed by multiple transactions concurrently
public struct OrderBook has key {
    id: UID,
    orders: Table<ID, Order>,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(OrderBook {
        id: object::new(ctx),
        orders: table::new(ctx),
    });
}

// Owned object - exclusive access, better for parallelism
public struct Account has key {
    id: UID,
    owner: address,
    balance: u64,
}

public fun create_account(ctx: &mut TxContext) {
    transfer::transfer(Account {
        id: object::new(ctx),
        owner: tx_context::sender(ctx),
        balance: 0,
    }, tx_context::sender(ctx));
}
```

## Gas Optimization Techniques

### 1. Use References Instead of Owned Values

```move
// ❌ Bad: Takes ownership, higher gas
public fun process_data(data: LargeStruct): u64 {
    // ...
}

// ✅ Good: Uses reference, lower gas
public fun process_data(data: &LargeStruct): u64 {
    // ...
}

// ✅ Better: Mutable reference when modification needed
public fun update_data(data: &mut LargeStruct) {
    // ...
}
```

### 2. Minimize Storage Operations

```move
// ❌ Bad: Multiple table updates
public fun update_multiple(table: &mut Table<ID, Value>) {
    table::add(table, id1, value1);
    table::add(table, id2, value2);
    table::add(table, id3, value3);
}

// ✅ Good: Batch operations when possible
public fun update_batch(table: &mut Table<ID, Value>, ids: vector<ID>, values: vector<Value>) {
    let len = vector::length(&ids);
    let i = 0;
    while (i < len) {
        table::add(table, *vector::borrow(&ids, i), *vector::borrow(&values, i));
        i = i + 1;
    };
}
```

### 3. Use Native Types

```move
// ❌ Bad: Custom big number implementation
public struct BigNum has store, drop {
    high: u64,
    low: u64,
}

// ✅ Good: Use u64 directly when possible
public struct Amount has store, drop {
    value: u64,  // Sufficient for most cases
}

// ✅ Use u128 or u256 when needed
public struct LargeAmount has store, drop {
    value: u128,  // Native type, efficient
}
```

### 4. Optimize Vector Operations

```move
// ❌ Bad: Frequent vector reallocations
public fun process_items(): vector<u64> {
    let result = vector::empty();
    let i = 0;
    while (i < 1000) {
        vector::push_back(&mut result, i);  // May reallocate
        i = i + 1;
    };
    result
}

// ✅ Good: Pre-allocate when size known
// Note: Sui doesn't have vector::with_capacity yet, but pattern shown for future
public fun process_items_optimized(): vector<u64> {
    let result = vector::empty();
    // Process in chunks if possible
    result
}
```

## Error Handling

### Define Error Constants

```move
module my_business::constants {
    // Error codes with clear naming
    const ERROR_INVALID_PRICE: u64 = 1001;
    const ERROR_INVALID_SIZE: u64 = 1002;
    const ERROR_INSUFFICIENT_BALANCE: u64 = 1003;
    const ERROR_ORDER_NOT_FOUND: u64 = 1004;
    const ERROR_UNAUTHORIZED: u64 = 1005;

    // Helper functions
    public fun error_invalid_price(): u64 { ERROR_INVALID_PRICE }
    public fun error_invalid_size(): u64 { ERROR_INVALID_SIZE }
}
```

### Use Assertions with Descriptive Errors

```move
public fun place_order(
    account: &Account,
    price: u64,
    size: u64,
) {
    // Validate inputs
    assert!(price > 0, ERROR_INVALID_PRICE);
    assert!(size > 0, ERROR_INVALID_SIZE);
    assert!(
        account.balance >= price * size,
        ERROR_INSUFFICIENT_BALANCE
    );

    // Process order
    // ...
}
```

## Testing Strategies

### Test Scenario Pattern

```move
#[test]
fun test_place_and_match_order() {
    use sui::test_scenario;

    let admin = @0xAD;
    let user1 = @0xA1;
    let user2 = @0xA2;

    let scenario_val = test_scenario::begin(admin);
    let scenario = &mut scenario_val;

    // Setup: Create orderbook
    {
        test_scenario::next_tx(scenario, admin);
        init_orderbook(test_scenario::ctx(scenario));
    };

    // User1: Place buy order
    {
        test_scenario::next_tx(scenario, user1);
        let orderbook = test_scenario::take_shared<OrderBook>(scenario);

        place_order(&mut orderbook, 100, 10, true, test_scenario::ctx(scenario));

        test_scenario::return_shared(orderbook);
    };

    // User2: Place sell order (should match)
    {
        test_scenario::next_tx(scenario, user2);
        let orderbook = test_scenario::take_shared<OrderBook>(scenario);

        place_order(&mut orderbook, 100, 10, false, test_scenario::ctx(scenario));

        // Verify match occurred
        assert!(get_order_count(&orderbook) == 0, 0);

        test_scenario::return_shared(orderbook);
    };

    test_scenario::end(scenario_val);
}
```

### Table-Driven Tests

```move
#[test]
fun test_price_calculations() {
    let test_cases = vector[
        // (base_price, size, expected_total)
        (100, 10, 1000),
        (250, 4, 1000),
        (500, 2, 1000),
    ];

    let i = 0;
    while (i < vector::length(&test_cases)) {
        let (base, size, expected) = *vector::borrow(&test_cases, i);
        let actual = calculate_total(base, size);
        assert!(actual == expected, i);
        i = i + 1;
    };
}
```

### Test Edge Cases

```move
#[test]
fun test_overflow_protection() {
    let max_u64 = 18446744073709551615;

    // Should handle maximum values
    let result = safe_multiply(max_u64, 1);
    assert!(result == max_u64, 0);
}

#[test]
#[expected_failure(abort_code = ERROR_DIVISION_BY_ZERO)]
fun test_division_by_zero() {
    divide(100, 0);  // Should abort
}

#[test]
#[expected_failure(abort_code = ERROR_INSUFFICIENT_BALANCE)]
fun test_insufficient_balance() {
    withdraw_from_account(&account, 1000);  // Balance < 1000
}
```

## Event Emission

### Define Events

```move
public struct OrderPlaced has copy, drop {
    order_id: ID,
    user: address,
    price: u64,
    size: u64,
    side: bool,  // true = buy, false = sell
    timestamp: u64,
}

public struct OrderMatched has copy, drop {
    order_id: ID,
    matched_with: ID,
    price: u64,
    size: u64,
    timestamp: u64,
}
```

### Emit Events

```move
use sui::event;

public fun place_order(
    orderbook: &mut OrderBook,
    account: &Account,
    price: u64,
    size: u64,
    side: bool,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let order_id = create_order_internal(orderbook, account, price, size, side, ctx);

    // Emit event for off-chain indexing
    event::emit(OrderPlaced {
        order_id,
        user: tx_context::sender(ctx),
        price,
        size,
        side,
        timestamp: clock::timestamp_ms(clock),
    });
}
```

## Security Best Practices

### 1. Validate All Inputs

```move
public fun place_order(price: u64, size: u64, leverage: u8) {
    // Range validation
    assert!(price > 0 && price < MAX_PRICE, ERROR_INVALID_PRICE);
    assert!(size > MIN_SIZE && size < MAX_SIZE, ERROR_INVALID_SIZE);
    assert!(leverage >= 1 && leverage <= 20, ERROR_INVALID_LEVERAGE);

    // Business logic validation
    assert!(price % TICK_SIZE == 0, ERROR_PRICE_NOT_MULTIPLE_OF_TICK);
}
```

### 2. Check Authorization

```move
public fun cancel_order(
    orderbook: &mut OrderBook,
    order_id: ID,
    ctx: &TxContext
) {
    let order = table::borrow(&orderbook.orders, order_id);

    // Verify sender owns the order
    assert!(order.owner == tx_context::sender(ctx), ERROR_UNAUTHORIZED);

    // Cancel order
    table::remove(&mut orderbook.orders, order_id);
}
```

### 3. Prevent Reentrancy

Sui's object model prevents most reentrancy attacks, but be careful with callbacks:

```move
// ✅ Safe: All state changes before external calls
public fun withdraw_and_transfer(
    account: &mut Account,
    amount: u64,
    coin_object: &mut Coin<USDC>,
) {
    // 1. Update state first
    account.balance = account.balance - amount;

    // 2. Then perform external operations
    let withdrawn = coin::split(coin_object, amount, ctx);
    transfer::public_transfer(withdrawn, account.owner);
}
```

### 4. Use Safe Math

```move
// Prevent overflow in multiplication
public fun safe_multiply(a: u64, b: u64): u64 {
    if (b == 0) return 0;

    assert!(a <= MAX_U64 / b, ERROR_OVERFLOW);
    a * b
}

// Use u128 for intermediate calculations
public fun calculate_fee(amount: u64, fee_bps: u64): u64 {
    let result = (amount as u128) * (fee_bps as u128) / 10000;
    (result as u64)
}
```

## Performance Profiling

### Measure Gas Consumption

```bash
# Run tests with gas reporting
sui move test --gas-limit 100000000 --gas-report

# Test specific function
sui move test test_place_order --gas-limit 100000000 --gas-report
```

### Optimization Checklist

- [ ] Use references (`&`, `&mut`) instead of owned values
- [ ] Minimize storage operations (table/bag operations)
- [ ] Avoid unnecessary cloning
- [ ] Use native types (u64, u128) when possible
- [ ] Batch operations when feasible
- [ ] Profile gas usage with `sui move test --gas-report`

## Deployment Checklist

Before deploying to testnet/mainnet:

- [ ] All tests passing (`sui move test`)
- [ ] No warnings (`sui move build --warnings-are-errors`)
- [ ] Gas usage profiled and optimized
- [ ] Error codes documented
- [ ] Events defined for all state changes
- [ ] Access control verified
- [ ] Edge cases tested (overflow, underflow, zero values)
- [ ] Upgrade strategy defined
- [ ] Package addresses configured for target network

## Next Steps

1. **Read [TypeScript SDK Development](./03-typescript-sdk.md)** to integrate with your contracts
2. **Review [Testing & QA Guide](./06-testing-qa.md)** for comprehensive testing strategies
3. **Study Destiny contracts** in `contracts/` for production examples

## Resources

- [Sui Move Book](https://move-book.com/sui)
- [Sui Move by Example](https://examples.sui.io/)
- [Sui Framework Source](https://github.com/MystenLabs/sui/tree/main/crates/sui-framework/packages)
- [Move Language Reference](https://github.com/move-language/move/blob/main/language/documentation/book/src/SUMMARY.md)
