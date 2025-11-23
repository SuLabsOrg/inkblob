# TypeScript SDK Development Guide

> Building type-safe SDKs for Sui Move contracts

## Overview

This guide covers TypeScript SDK development patterns from Destiny, focusing on auto-generated contract bindings, BCS encoding/decoding, and browser compatibility.

## Auto-Generated Contract Bindings

### Why Auto-Generation?

**Manual Contract Calls (❌ Don't Do This)**:
```typescript
// ❌ Bad: Manual transaction building - error-prone, no type safety
const tx = new Transaction();
tx.moveCall({
    package: '0xabc...',
    module: 'orderbook',
    function: 'place_order',
    arguments: [
        tx.object('0xdef...'),  // Is this correct?
        tx.pure(100),           // What type should this be?
        tx.pure(10),            // u64? u128?
    ],
    typeArguments: ['0x2::sui::SUI'],  // Easy to make mistakes
});
```

**Auto-Generated Bindings (✅ Correct Approach)**:
```typescript
// ✅ Good: Type-safe auto-generated bindings
import * as orderbook from './contracts/my_business/orderbook';

const tx = new Transaction();
const placeOrderCall = orderbook.placeOrder({
    arguments: {
        orderbook: orderbookId,      // TypeScript ensures correct types
        price: 100n,                  // bigint enforced by types
        size: 10n,
    },
    typeArguments: [baseAsset, quoteAsset],  // Type-checked
    package: packageId,
});
placeOrderCall(tx);  // Adds correctly formatted MoveCall to transaction
```

### Setting Up Code Generation

#### Install Dependencies

```json
{
  "devDependencies": {
    "@mysten/codegen": "^0.5.0",
    "@mysten/sui": "^1.38.0"
  }
}
```

#### Create Configuration

Create `sui-codegen.config.ts`:

```typescript
import type { CodegenConfig } from '@mysten/codegen';

const config: CodegenConfig = {
    // Path to compiled Move package
    package: '../../contracts/business/build/my_business',

    // Output directory for generated TypeScript code
    output: './src/contracts',

    // BCS package location
    bcsPackage: '@mysten/sui/bcs',
};

export default config;
```

#### Add Build Script

```json
{
  "scripts": {
    "codegen": "sui-ts-codegen generate",
    "build": "pnpm run codegen && tsc"
  }
}
```

#### Generate Bindings

```bash
# 1. Build Move contracts first
cd contracts/business
sui move build

# 2. Generate TypeScript bindings
cd ../../sdks/typescript
pnpm run codegen

# Generated files in src/contracts/:
# my_business/
#   orderbook/index.ts
#   position/index.ts
#   market/index.ts
```

### Generated Code Structure

```typescript
// src/contracts/my_business/orderbook.ts (auto-generated)

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

// Auto-generated function wrapper
export function placeOrder(options: PlaceOrderOptions) {
    return (tx: Transaction) => tx.moveCall({
        package: options.package,
        module: 'orderbook',
        function: 'place_order',
        arguments: normalizeMoveArguments(
            'placeOrder',
            [
                options.arguments.orderbook,
                options.arguments.price,
                options.arguments.size,
            ]
        ),
        typeArguments: options.typeArguments
    });
}

// Auto-generated BCS struct
export const Order = new MoveStruct({
    name: 'my_business::orderbook::Order',
    fields: {
        id: bcs.Address,
        owner: bcs.Address,
        price: bcs.u64(),
        size: bcs.u64(),
        side: bcs.bool(),
    }
});
```

## Using Generated Bindings

### Transaction Building Pattern

```typescript
import { Transaction } from '@mysten/sui/transactions';
import * as orderbook from '../contracts/my_business/orderbook';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });

// Build transaction
const tx = new Transaction();

// Add MoveCall using generated binding
const placeOrderCall = orderbook.placeOrder({
    arguments: {
        orderbook: '0x123...',
        price: 1500000n,  // $1.50 with 6 decimals
        size: 1000n,
    },
    typeArguments: ['0x2::sui::SUI', '0xabc::usdc::USDC'],
    package: '0xdef...',
});
placeOrderCall(tx);  // Adds MoveCall to transaction

// Execute transaction
const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
});
```

### Query Pattern (devInspectTransactionBlock)

```typescript
// Build read-only transaction
const tx = new Transaction();
const getUserOrdersCall = orderbook.getUserOrders({
    arguments: {
        orderbook: orderbookId,
        user: userAddress,
    },
    typeArguments: [baseAsset, quoteAsset],
    package: packageId,
});
getUserOrdersCall(tx);

// Execute as read-only query
const result = await client.devInspectTransactionBlock({
    sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    transactionBlock: tx,
});

// Parse return values using BCS
const returnValue = result.results[0].returnValues[0];
const orderIds = bcs.vector(bcs.Address).parse(new Uint8Array(returnValue[0]));

console.log('Order IDs:', orderIds);
```

## BCS Encoding and Decoding

### Understanding BCS

BCS (Binary Canonical Serialization) is the encoding format used by Move/Sui for all data. The TypeScript SDK provides helpers for encoding/decoding.

### Common Patterns

#### 1. Vector Parsing

```typescript
import { bcs } from '@mysten/sui/bcs';

// Vector of addresses
const addressesBytes = result.results[0].returnValues[0][0];
const addresses = bcs.vector(bcs.Address).parse(new Uint8Array(addressesBytes));

// Vector of u64
const pricesBytes = result.results[0].returnValues[1][0];
const prices = bcs.vector(bcs.u64()).parse(new Uint8Array(pricesBytes));

// Vector of structs (use auto-generated BCS struct)
import { Order } from '../contracts/my_business/orderbook';
const ordersBytes = result.results[0].returnValues[2][0];
const orders = bcs.vector(Order).parse(new Uint8Array(ordersBytes));
```

#### 2. Primitive Parsing

```typescript
// Parse u64
const priceBytes = result.results[0].returnValues[0][0];
const price = bcs.u64().parse(new Uint8Array(priceBytes));

// Parse u8
const leverageBytes = result.results[0].returnValues[1][0];
const leverage = bcs.u8().parse(new Uint8Array(leverageBytes));

// Parse bool
const isActiveBytes = result.results[0].returnValues[2][0];
const isActive = bcs.bool().parse(new Uint8Array(isActiveBytes));

// Parse string (vector<u8>)
const nameBytes = result.results[0].returnValues[3][0];
const name = bcs.string().parse(new Uint8Array(nameBytes));
```

#### 3. Tuple Return Values (Multiple Return Values)

```move
// Move function returns multiple values
public fun get_order_details(order: &Order): (u64, u64, u64, u8, bool) {
    (order.price, order.size, order.filled_size, order.leverage, order.is_active)
}
```

```typescript
// Parse multiple return values in TypeScript
const result = await client.devInspectTransactionBlock({
    sender: '0x0',
    transactionBlock: tx,
});

const returnValues = result.results[0].returnValues;

// Each return value is a separate array element
const price = bcs.u64().parse(new Uint8Array(returnValues[0][0]));
const size = bcs.u64().parse(new Uint8Array(returnValues[1][0]));
const filledSize = bcs.u64().parse(new Uint8Array(returnValues[2][0]));
const leverage = bcs.u8().parse(new Uint8Array(returnValues[3][0]));
const isActive = bcs.bool().parse(new Uint8Array(returnValues[4][0]));
```

#### 4. Nested Structures

```move
public struct Position has store {
    id: ID,
    owner: address,
    size: u64,
    entry_price: u64,
    leverage: u8,
}
```

```typescript
// Use auto-generated BCS struct
import { Position } from '../contracts/my_business/position';

const positionBytes = result.results[0].returnValues[0][0];
const position = Position.parse(new Uint8Array(positionBytes));

console.log({
    id: position.id,
    owner: position.owner,
    size: position.size,
    entryPrice: position.entry_price,  // Note: snake_case from Move
    leverage: position.leverage,
});
```

## Browser Compatibility

### Critical Rules

#### 1. ES6 Imports Only (No CommonJS)

```typescript
// ❌ WRONG: CommonJS require() breaks in browser
const { getMarketConfigs } = require('../config/markets');

// ✅ CORRECT: ES6 imports work in browser
import { getMarketConfigs } from '../config/markets';
```

#### 2. BigInt JSON Serialization

```typescript
// ❌ WRONG: JSON.stringify throws error on BigInt
const data = { price: 1500000n, size: 1000n };
console.log(JSON.stringify(data));  // Error: Do not know how to serialize a BigInt

// ✅ CORRECT: Custom replacer for BigInt
const bigIntReplacer = (key: string, value: any) =>
    typeof value === 'bigint' ? value.toString() : value;

console.log(JSON.stringify(data, bigIntReplacer, 2));
// Output: { "price": "1500000", "size": "1000" }
```

#### 3. Package Type Configuration

```json
{
  "type": "commonjs",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js"
    }
  }
}
```

### Build Configuration

#### Dual Build (CJS + ESM)

**tsconfig.json** (CommonJS):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "outDir": "./dist/cjs",
    "declaration": true
  }
}
```

**tsconfig.esm.json** (ESM):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "outDir": "./dist/esm"
  }
}
```

**Build Script**:
```json
{
  "scripts": {
    "build": "tsc && tsc -p tsconfig.esm.json && node fix-esm-imports.js"
  }
}
```

**fix-esm-imports.js**:
```javascript
// Add .js extensions to ESM imports for browser compatibility
const fs = require('fs');
const path = require('path');

function fixImports(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            fixImports(fullPath);
        } else if (file.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            content = content.replace(/from ['"](\.\.?\/[^'"]+)['"]/g, (match, p1) => {
                return `from '${p1}.js'`;
            });
            fs.writeFileSync(fullPath, content);
        }
    });
}

fixImports('./dist/esm');
```

## Advanced Patterns

### 1. Dynamic Object Discovery (BootstrapState Pattern)

```typescript
// Query BootstrapState for market infrastructure object IDs
interface MarketRecord {
    marketId: string;
    orderbookId: string;
    tradingPoolId: string;
    insuranceManagerId: string;
}

async function getMarketRecord(
    client: SuiClient,
    bootstrapStateId: string,
    marketSymbol: string
): Promise<MarketRecord> {
    // 1. Get BootstrapState object
    const bootstrap = await client.getObject({
        id: bootstrapStateId,
        options: { showContent: true },
    });

    // 2. Extract markets table ID
    const content = bootstrap.data.content as any;
    const tableId = content.fields.markets.fields.id.id;

    // 3. Query dynamic field for market symbol
    const marketRecord = await client.getDynamicFieldObject({
        parentId: tableId,
        name: {
            type: 'vector<u8>',  // Key type is vector<u8>
            value: marketSymbol,
        },
    });

    // 4. Parse MarketRecord
    const fields = marketRecord.data.content.fields.value.fields;
    return {
        marketId: fields.market_id,
        orderbookId: fields.orderbook_id,
        tradingPoolId: fields.trading_pool_id,
        insuranceManagerId: fields.insurance_manager_id,
    };
}
```

### 2. Batch Queries

```typescript
// Query multiple objects in parallel
async function getMultipleObjects(
    client: SuiClient,
    objectIds: string[]
): Promise<Map<string, any>> {
    const results = await client.multiGetObjects({
        ids: objectIds,
        options: { showContent: true, showType: true },
    });

    const objectMap = new Map();
    results.forEach((result, index) => {
        if (result.data) {
            objectMap.set(objectIds[index], result.data.content);
        }
    });

    return objectMap;
}
```

### 3. Event Subscription

```typescript
import { SuiEvent } from '@mysten/sui/client';

// Subscribe to contract events
async function subscribeToOrders(
    client: SuiClient,
    packageId: string,
    callback: (event: SuiEvent) => void
) {
    const unsubscribe = await client.subscribeEvent({
        filter: {
            MoveEventType: `${packageId}::orderbook::OrderPlaced`,
        },
        onMessage(event) {
            callback(event);
        },
    });

    return unsubscribe;
}

// Usage
const unsubscribe = await subscribeToOrders(client, packageId, (event) => {
    console.log('New order:', event.parsedJson);
});

// Later: unsubscribe()
```

### 4. Gas Coin Management

```typescript
// Split gas coins for parallel transactions
async function splitGasCoins(
    client: SuiClient,
    signer: Keypair,
    amounts: bigint[]
): Promise<string[]> {
    const tx = new Transaction();

    // Split gas coin
    const coins = tx.splitCoins(tx.gas, amounts.map(amt => tx.pure.u64(amt)));

    // Transfer split coins to sender
    amounts.forEach((_, i) => {
        tx.transferObjects([coins[i]], signer.toSuiAddress());
    });

    const result = await client.signAndExecuteTransaction({
        signer,
        transaction: tx,
    });

    // Extract created coin IDs from result
    const createdCoins = result.objectChanges
        .filter(change => change.type === 'created')
        .map(change => change.objectId);

    return createdCoins;
}
```

## Error Handling

### Parse Contract Errors

```typescript
try {
    const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
    });
} catch (error: any) {
    // Parse Move abort code
    if (error.message?.includes('MoveAbort')) {
        const abortCode = extractAbortCode(error.message);

        // Map to user-friendly error
        const errorMessages = {
            1001: 'Invalid price: must be greater than 0',
            1002: 'Invalid size: must be greater than minimum',
            1003: 'Insufficient balance',
        };

        throw new Error(errorMessages[abortCode] || `Contract error: ${abortCode}`);
    }

    throw error;
}

function extractAbortCode(message: string): number {
    const match = message.match(/abort_code: (\d+)/);
    return match ? parseInt(match[1]) : 0;
}
```

## Testing

### Unit Tests (Jest)

```typescript
import { describe, it, expect } from '@jest/globals';
import { bcs } from '@mysten/sui/bcs';
import { Order } from '../src/contracts/my_business/orderbook';

describe('BCS Parsing', () => {
    it('should parse order struct correctly', () => {
        // Mock BCS bytes (would come from contract in real scenario)
        const mockOrderBytes = new Uint8Array([/* ... */]);

        const order = Order.parse(mockOrderBytes);

        expect(order.price).toBe(1500000n);
        expect(order.size).toBe(1000n);
    });
});
```

### Integration Tests

```typescript
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

describe('Contract Integration', () => {
    let client: SuiClient;
    let signer: Ed25519Keypair;

    beforeAll(() => {
        client = new SuiClient({ url: getFullnodeUrl('testnet') });
        signer = Ed25519Keypair.fromSecretKey(/* test key */);
    });

    it('should place order successfully', async () => {
        const tx = new Transaction();

        const placeOrderCall = orderbook.placeOrder({
            arguments: {
                orderbook: testOrderbookId,
                price: 1500000n,
                size: 1000n,
            },
            typeArguments: [baseAsset, quoteAsset],
            package: packageId,
        });
        placeOrderCall(tx);

        const result = await client.signAndExecuteTransaction({
            signer,
            transaction: tx,
        });

        expect(result.effects.status.status).toBe('success');
    });
});
```

## Best Practices Summary

1. ✅ **Always use auto-generated bindings** - never manual MoveCall construction
2. ✅ **Use ES6 imports only** - no `require()` for browser compatibility
3. ✅ **Handle BigInt serialization** - custom JSON replacer for logging
4. ✅ **Parse BCS correctly** - use `bcs.vector(bcs.Address).parse(new Uint8Array(bytes))`
5. ✅ **Type everything** - leverage TypeScript's type safety
6. ✅ **Batch queries when possible** - use `multiGetObjects` for efficiency
7. ✅ **Handle errors gracefully** - parse Move abort codes to user-friendly messages
8. ✅ **Test thoroughly** - unit tests for parsing, integration tests for contracts

## Next Steps

1. **Read [Frontend Development](./05-frontend-development.md)** to integrate SDK with React
2. **Read [Testing & QA](./06-testing-qa.md)** for comprehensive testing strategies
3. **Review TypeScript SDK examples** in `sdks/typescript/perp/tests/`

## Resources

- [Sui TypeScript SDK Docs](https://sdk.mystenlabs.com/typescript)
- [BCS Specification](https://github.com/diem/bcs)
- [Sui Codegen Tool](https://www.npmjs.com/package/@mysten/codegen)
