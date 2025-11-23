# Go SDK Development Patterns

> Critical patterns for Sui blockchain integration in Go

## Overview

This guide covers essential Go SDK patterns from the Destiny project, with special focus on transaction signing, the interceptor pattern, and oracle integration using the block-vision/sui-go-sdk.

## Critical: Transaction Signing

### The Intent Scope Issue

**THE MOST IMPORTANT THING TO KNOW** when developing a Go SDK for Sui:

Sui validates transaction signatures against `Blake2b(Intent || TransactionBytes)`, where `Intent` is a 3-byte prefix that indicates the type of message being signed.

```go
// ✅ CORRECT: Use TransactionDataIntentScope for transactions
import (
    "github.com/block-vision/sui-go-sdk/constant"
    "github.com/block-vision/sui-go-sdk/signer"
)

// Sign transaction with correct Intent scope
txBase64 := base64.StdEncoding.EncodeToString(txBytes)
signedMsg, err := signer.SignMessage(
    txBase64,
    constant.TransactionDataIntentScope,  // ✅ Value: 0 ([0x00, 0x00, 0x00])
)

// ❌ WRONG: PersonalMessageIntentScope fails validation
signedMsg, err := signer.SignMessage(
    txBase64,
    constant.PersonalMessageIntentScope,  // ❌ Value: 3 ([0x00, 0x03, 0x00])
)
```

### Why This Matters

Sui's blockchain validates signatures differently based on the Intent scope:

- **TransactionDataIntentScope (0)**: For blockchain transactions
  - Intent bytes: `[0x00, 0x00, 0x00]`
  - Used for: MoveCall, TransferObjects, etc.

- **PersonalMessageIntentScope (3)**: For off-chain messages
  - Intent bytes: `[0x00, 0x03, 0x00]`
  - Used for: Signing authentication messages, NOT transactions

### Common Mistake in block-vision SDK

The block-vision SDK has a misleadingly named `SignTransaction()` method that actually uses `PersonalMessageIntentScope`:

```go
// ❌ MISLEADING: This method name suggests it's for transactions,
// but it uses PersonalMessageIntentScope internally!
func (s *Signer) SignTransaction(txBytes []byte) (*SignedMessage, error) {
    // Internally uses PersonalMessageIntentScope - WRONG for blockchain!
    return s.SignMessage(base64.StdEncoding.EncodeToString(txBytes), constant.PersonalMessageIntentScope)
}

// ✅ CORRECT: Always use SignMessage with explicit TransactionDataIntentScope
func (s *Signer) SignBlockchainTransaction(txBytes []byte) (*SignedMessage, error) {
    return s.SignMessage(base64.StdEncoding.EncodeToString(txBytes), constant.TransactionDataIntentScope)
}
```

### Transaction Submission Flow

```go
package client

import (
    "context"
    "encoding/base64"

    "github.com/block-vision/sui-go-sdk/constant"
    "github.com/block-vision/sui-go-sdk/models"
    "github.com/block-vision/sui-go-sdk/signer"
    "github.com/block-vision/sui-go-sdk/sui"
)

func ExecuteTransaction(
    ctx context.Context,
    client *sui.Client,
    signer *signer.Signer,
    txBytes []byte,
) (*models.SuiTransactionBlockResponse, error) {
    // 1. Encode transaction bytes to base64
    txBase64 := base64.StdEncoding.EncodeToString(txBytes)

    // 2. Sign with CORRECT Intent scope
    signedMsg, err := signer.SignMessage(txBase64, constant.TransactionDataIntentScope)
    if err != nil {
        return nil, fmt.Errorf("failed to sign transaction: %w", err)
    }

    // 3. Submit to blockchain
    resp, err := client.SuiExecuteTransactionBlock(ctx, models.SuiExecuteTransactionBlockRequest{
        TxBytes:     signedMsg.Message,      // Base64 transaction bytes
        Signature:   []string{signedMsg.Signature},  // Signature with correct Intent
        RequestType: "WaitForLocalExecution",
    })
    if err != nil {
        return nil, fmt.Errorf("failed to execute transaction: %w", err)
    }

    // 4. Check execution status
    if resp.Effects.Status.Status != "success" {
        return nil, fmt.Errorf("transaction failed: %s", resp.Effects.Status.Error)
    }

    return &resp, nil
}
```

## Interceptor Pattern

### Architecture

The Destiny Go SDK implements a hook-based interceptor system for transaction customization:

```
User Call (PlaceOrder)
    ↓
Global Interceptors (PreBuild)
    ↓
Per-Call Interceptors (PreBuild)
    ↓
SDK Build Function (Add*Commands)
    ↓
Global Interceptors (PostBuild)
    ↓
Per-Call Interceptors (PostBuild)
    ↓
Transaction Serialization
    ↓
Sign & Execute
```

### Interface Definition

```go
package interceptor

import (
    "context"

    "github.com/block-vision/sui-go-sdk/transaction"
)

// Operation type for identifying the operation being performed
type Operation string

const (
    OperationPlaceOrder    Operation = "PlaceOrder"
    OperationCancelOrder   Operation = "CancelOrder"
    OperationSettleFunding Operation = "SettleFunding"
    // ... other operations
)

// Payload contains context for interceptor hooks
type Payload struct {
    Operation Operation               // Which operation is being performed
    Request   interface{}             // Operation-specific request struct
    Tx        *transaction.Transaction // Transaction being built
    Metadata  map[string]string       // For passing data between hooks
}

// IInterceptor interface for transaction customization
type IInterceptor interface {
    PreBuild(ctx context.Context, payload *Payload) error  // Before SDK commands
    PostBuild(ctx context.Context, payload *Payload) error // After SDK commands
}
```

### Functional Adapter

```go
// Func allows functional-style interceptors
type Func struct {
    Pre  func(context.Context, *Payload) error  // Optional PreBuild
    Post func(context.Context, *Payload) error  // Optional PostBuild
}

func (f Func) PreBuild(ctx context.Context, p *Payload) error {
    if f.Pre != nil {
        return f.Pre(ctx, p)
    }
    return nil
}

func (f Func) PostBuild(ctx context.Context, p *Payload) error {
    if f.Post != nil {
        return f.Post(ctx, p)
    }
    return nil
}
```

### Usage Example: Gas Sponsorship

```go
// Global interceptor for gas sponsorship
gasSponsorInterceptor := interceptor.Func{
    Pre: func(ctx context.Context, p *interceptor.Payload) error {
        // Inject gas sponsorship MoveCall BEFORE SDK commands
        p.Tx.MoveCall(
            sponsorPackageID,
            "gas_sponsor",
            "register",
            []any{p.Tx.Pure(sponsorAddress)},
            []transaction.TypeTag{},
        )
        return nil
    },
}

// Create client with global interceptor
client := perp.NewPerpClient(
    config,
    perp.WithGlobalTransactionInterceptors(gasSponsorInterceptor),
)

// All operations will now include gas sponsorship automatically
```

### Usage Example: Analytics

```go
// Per-call interceptor for analytics
analyticsInterceptor := interceptor.Func{
    Post: func(ctx context.Context, p *interceptor.Payload) error {
        // Log operation completion
        log.Printf("Operation %s completed", p.Operation)

        // Store metadata from PreBuild
        if marketID, ok := p.Metadata["market_id"]; ok {
            metrics.RecordOperation(string(p.Operation), marketID)
        }

        return nil
    },
}

// Use for specific operations only
result, err := client.PlaceOrder(
    ctx,
    orderReq,
    interceptor.WithInterceptors(analyticsInterceptor),
)
```

### Client Integration

```go
package client

type PerpClient struct {
    config              *config.NetworkConfig
    rpcClient           *sui.Client
    signer              *signer.Signer
    globalInterceptors  []interceptor.IInterceptor
}

// Functional option for global interceptors
func WithGlobalTransactionInterceptors(interceptors ...interceptor.IInterceptor) Option {
    return func(c *PerpClient) {
        c.globalInterceptors = interceptors
    }
}

// Build transaction with interceptor support
func (c *PerpClient) buildTransactionWithInterceptors(
    ctx context.Context,
    operation interceptor.Operation,
    request interface{},
    buildFunc func(context.Context, *transaction.Transaction) error,
    options ...interceptor.Option,
) ([]byte, error) {
    // 1. Merge global and per-call interceptors
    cfg := interceptor.NewConfig(options...)
    allInterceptors := append(c.globalInterceptors, cfg.Interceptors...)

    // 2. Create transaction and payload
    tx := transaction.NewTransaction()
    payload := &interceptor.Payload{
        Operation: operation,
        Request:   request,
        Tx:        tx,
        Metadata:  make(map[string]string),
    }

    // 3. Run PreBuild hooks (global first, then per-call)
    for _, i := range allInterceptors {
        if err := i.PreBuild(ctx, payload); err != nil {
            return nil, fmt.Errorf("pre-build hook failed: %w", err)
        }
    }

    // 4. Execute SDK build function
    if err := buildFunc(ctx, tx); err != nil {
        return nil, fmt.Errorf("build function failed: %w", err)
    }

    // 5. Run PostBuild hooks
    for _, i := range allInterceptors {
        if err := i.PostBuild(ctx, payload); err != nil {
            return nil, fmt.Errorf("post-build hook failed: %w", err)
        }
    }

    // 6. Serialize transaction
    txBytes, err := tx.Data.Marshal()
    if err != nil {
        return nil, fmt.Errorf("failed to marshal transaction: %w", err)
    }

    return txBytes, nil
}
```

## Oracle Integration

### OracleInterceptor Pattern

The Destiny project uses an `OracleInterceptor` as a global interceptor to automatically inject price updates:

```go
package oracle

type OracleInterceptor struct {
    manager       *Manager
    networkConfig NetworkConfig  // Interface to avoid circular imports
    rpcURL        string
}

// NetworkConfig interface contains only methods needed by oracle package
type NetworkConfig interface {
    IsOracleEnabled() bool
    GetPythFeedIDs(marketSymbol string) []string
    GetPythStateID() string
    GetWormholeStateID() string
    GetPerpPackageID() string
    GetOracleManagerID() string
}

func (i *OracleInterceptor) PreBuild(
    ctx context.Context,
    payload *interceptor.Payload,
) error {
    if !i.networkConfig.IsOracleEnabled() {
        return nil  // Oracle disabled, skip
    }

    // Extract market symbol from request
    marketSymbol, err := extractMarketSymbol(payload.Request)
    if err != nil {
        return nil  // Not a market operation, skip
    }

    // 1. Add oracle update commands to transaction
    metadata, err := i.manager.AddUpdateCommands(ctx, payload.Tx, UpdateParams{
        MarketSymbol: marketSymbol,
        FeedIDs:      i.networkConfig.GetPythFeedIDs(marketSymbol),
    })
    if err != nil {
        return fmt.Errorf("failed to add oracle update commands: %w", err)
    }

    // 2. Add record commands BEFORE SDK commands
    if err := i.manager.AddRecordCommands(ctx, payload.Tx, RecordParams{
        PriceObjectIDs:  metadata.PriceObjectIDs,
        OracleManagerID: i.networkConfig.GetOracleManagerID(),
        PackageID:       i.networkConfig.GetPerpPackageID(),
    }); err != nil {
        return fmt.Errorf("failed to add record commands: %w", err)
    }

    // Store price object IDs in metadata for PostBuild if needed
    payload.Metadata["price_object_ids"] = strings.Join(metadata.PriceObjectIDs, ",")

    return nil
}

func (i *OracleInterceptor) PostBuild(ctx context.Context, payload *interceptor.Payload) error {
    // No-op: All oracle operations happen in PreBuild
    return nil
}
```

### Critical Fix: PreBuild vs PostBuild

**Original Issue (2025-11-21)**: `record_pyth_price_update` was called in `PostBuild`, AFTER the `place_order` command. This caused `place_order` to read STALE prices from `oracle_manager.pyth_cache`.

**Fix**: Move `record_pyth_price_update` to `PreBuild`, ensuring fresh prices are written to cache BEFORE trading operations read from it.

```
On-Chain Execution Order:
1. update_price_feeds      → Updates Pyth PriceInfoObjects
2. record_pyth_price_update → Writes to oracle_manager.pyth_cache
3. place_order             → Reads from oracle_manager.pyth_cache ✅
```

### Provider Interface

```go
package oracle

type Provider interface {
    Name() string
    FetchPriceUpdates(ctx context.Context, feedIDs []string) ([]PriceUpdate, error)
    GetFeedInfo(ctx context.Context, feedID string) (*FeedInfo, error)
    HealthCheck(ctx context.Context) error
    Close() error

    // Directly modifies transaction with oracle commands
    AddUpdateCommands(
        ctx context.Context,
        tx *transaction.Transaction,
        params UpdateParams,
    ) (*UpdateMetadata, error)
}

type UpdateParams struct {
    MarketSymbol string
    FeedIDs      []string
}

type UpdateMetadata struct {
    PriceObjectIDs []string
    CreatedNew     bool
}
```

## BootstrapState Dynamic Discovery

### Pattern

Use `BootstrapState` as the authoritative registry for market infrastructure object IDs:

```go
package queries

func (q *Querier) GetMarketRecord(
    ctx context.Context,
    marketSymbol string,
) (*contract.MarketRecord, error) {
    // 1. Get BootstrapState object
    bootstrapResp, err := q.client.SuiGetObject(ctx, models.SuiGetObjectRequest{
        ObjectId: q.bootstrapStateID,
        Options: models.SuiObjectDataOptions{
            ShowContent: true,
        },
    })
    if err != nil {
        return nil, fmt.Errorf("failed to get BootstrapState: %w", err)
    }

    // 2. Extract markets table ID
    content := bootstrapResp.Data.Content.(map[string]interface{})
    fields := content["fields"].(map[string]interface{})
    marketsTable := fields["markets"].(map[string]interface{})
    tableFields := marketsTable["fields"].(map[string]interface{})
    tableID := tableFields["id"].(map[string]interface{})["id"].(string)

    // 3. Query dynamic field for market symbol
    dynamicFieldResp, err := q.client.SuiXGetDynamicFieldObject(ctx, models.SuiXGetDynamicFieldObjectRequest{
        ObjectId: tableID,
        DynamicFieldName: models.DynamicFieldObjectName{
            Type:  "vector<u8>",  // ⚠️ Key type is vector<u8>, NOT String
            Value: marketSymbol,
        },
    })
    if err != nil {
        return nil, fmt.Errorf("failed to get market record: %w", err)
    }

    // 4. Parse MarketRecord
    valueFields := dynamicFieldResp.Data.Content.(map[string]interface{})["fields"].(map[string]interface{})
    value := valueFields["value"].(map[string]interface{})["fields"].(map[string]interface{})

    return &contract.MarketRecord{
        MarketID:           value["market_id"].(string),
        OrderbookID:        value["orderbook_id"].(string),
        TradingPoolID:      value["trading_pool_id"].(string),
        InsuranceManagerID: value["insurance_manager_id"].(string),
        ADLRankingID:       value["adl_ranking_id"].(string),
        ADLStatsID:         value["adl_stats_id"].(string),
    }, nil
}
```

### Critical Details

1. **Table Key Type**: `vector<u8>`, NOT `0x1::string::String`
2. **Field Values**: Direct strings, not wrapped in ID objects
3. **Different from FundingManager**: FundingManager uses `Table<String, FundingState>`

## Best Practices

### 1. Error Handling

```go
// Wrap errors with context
if err != nil {
    return nil, fmt.Errorf("failed to place order: %w", err)
}

// Parse contract errors
if strings.Contains(err.Error(), "MoveAbort") {
    abortCode := extractAbortCode(err.Error())
    return nil, fmt.Errorf("contract error %d: %s", abortCode, errorMessage(abortCode))
}
```

### 2. Context Propagation

```go
// Always accept and propagate context
func (c *PerpClient) PlaceOrder(
    ctx context.Context,  // ✅ First parameter
    req *PlaceOrderRequest,
    options ...interceptor.Option,
) (*PlaceOrderResult, error) {
    // Use ctx for all downstream calls
    txBytes, err := c.buildTransactionWithInterceptors(ctx, ...)
}
```

### 3. Testing

```go
// Use table-driven tests
func TestTransactionSigning(t *testing.T) {
    tests := []struct {
        name      string
        txBytes   []byte
        wantError bool
    }{
        {"valid transaction", []byte{/* ... */}, false},
        {"empty transaction", []byte{}, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            signed, err := signer.SignMessage(
                base64.StdEncoding.EncodeToString(tt.txBytes),
                constant.TransactionDataIntentScope,
            )
            if (err != nil) != tt.wantError {
                t.Errorf("SignMessage() error = %v, wantError %v", err, tt.wantError)
            }
        })
    }
}
```

## Summary

### Must-Know Patterns

1. ✅ **Transaction Signing**: Always use `TransactionDataIntentScope` (value 0)
2. ✅ **Interceptor Pattern**: Hook-based transaction customization
3. ✅ **Oracle Integration**: PreBuild injection for fresh price updates
4. ✅ **Dynamic Discovery**: Query BootstrapState for market object IDs
5. ✅ **Error Handling**: Wrap errors with context, parse contract aborts
6. ✅ **Testing**: Table-driven tests with comprehensive coverage

### Critical Gotchas

- ❌ Don't use `PersonalMessageIntentScope` for transactions
- ❌ Don't call `signer.SignTransaction()` - it uses wrong Intent scope
- ❌ Don't put oracle updates in PostBuild - trading ops will read stale data
- ❌ Don't hardcode market object IDs - use BootstrapState discovery
- ❌ Don't ignore errors - always wrap with context

## Next Steps

1. **Read [Testing & QA Guide](./06-testing-qa.md)** for comprehensive testing
2. **Review Go SDK examples** in `sdks/golang/perp/examples/`
3. **Study interceptor tests** in `sdks/golang/perp/interceptor/*_test.go`

## Resources

- [Block-Vision SDK GitHub](https://github.com/block-vision/sui-go-sdk)
- [Sui Programmability](https://docs.sui.io/concepts/sui-move-concepts)
- [Destiny Go SDK Source](../../sdks/golang/perp/)
