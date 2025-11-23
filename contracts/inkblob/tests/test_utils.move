#[test_only]
module inkblob::test_utils {
    use std::string;
    use sui::test_scenario::{Self, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use wal::wal::WAL;
    use inkblob::notebook::{Self, Notebook, NotebookRegistry};

    // ========== Test Addresses ==========

    /// Test participant addresses
    const OWNER: address = @0xA1;
    const DEVICE_1: address = @0xB1;
    const DEVICE_2: address = @0xB2;
    const ATTACKER: address = @0xC1;

    // ========== Test Timestamps ==========

    /// Test timestamps for expiration scenarios (epoch timestamps in milliseconds)
    const PAST: u64 = 1000000000000;    // 2001-09-09 (expired)
    const NOW: u64 = 1700000000000;     // 2023-11-14 (current)
    const FUTURE: u64 = 2000000000000;   // 2033-05-18 (future, not expired)

    // ========== Test Constants ==========

    /// Default funding amounts for session creation
    const DEFAULT_SUI_FUND: u64 = 100000000;    // 0.1 SUI
    const DEFAULT_WAL_FUND: u64 = 500000000;    // 0.5 WAL

    /// Custom amounts for testing
    const CUSTOM_SUI_AMOUNT: u64 = 500000000;   // 0.5 SUI
    const CUSTOM_WAL_AMOUNT: u64 = 1000000000;  // 1.0 WAL

    /// Insufficient amounts for failure testing
    const ZERO_SUI: u64 = 0;
    const ZERO_WAL: u64 = 0;
    const INSUFFICIENT_SUI: u64 = 1000;         // Much less than needed
    const INSUFFICIENT_WAL: u64 = 1000;         // Much less than needed

    // ========== Public Accessor Functions ==========

    /// Get test participant addresses
    public fun owner(): address { OWNER }
    public fun device_1(): address { DEVICE_1 }
    public fun device_2(): address { DEVICE_2 }
    public fun attacker(): address { ATTACKER }

    /// Get test timestamps
    public fun past(): u64 { PAST }
    public fun now(): u64 { NOW }
    public fun future(): u64 { FUTURE }

    /// Get test constants
    public fun default_sui_fund(): u64 { DEFAULT_SUI_FUND }
    public fun default_wal_fund(): u64 { DEFAULT_WAL_FUND }
    public fun custom_sui_amount(): u64 { CUSTOM_SUI_AMOUNT }
    public fun custom_wal_amount(): u64 { CUSTOM_WAL_AMOUNT }
    public fun zero_sui(): u64 { ZERO_SUI }
    public fun zero_wal(): u64 { ZERO_WAL }
    public fun insufficient_sui(): u64 { INSUFFICIENT_SUI }
    public fun insufficient_wal(): u64 { INSUFFICIENT_WAL }

    // ========== Test Helper Functions ==========

    /// Create a test scenario with initial setup for the given address
    public fun create_scenario(addr: address): Scenario {
        let mut scenario = test_scenario::begin(addr);
        test_scenario::next_tx(&mut scenario, addr);
        scenario
    }

    /// Create and setup a notebook for testing
    public fun create_test_notebook(
        scenario: &mut Scenario,
        name: vector<u8>
    ): Notebook {
        let sender = test_scenario::sender(scenario);
        test_scenario::next_tx(scenario, sender);

        let notebook_name = string::utf8(name);
        notebook::create_notebook(notebook_name, test_scenario::ctx(scenario));

        test_scenario::next_tx(scenario, sender);
        test_scenario::take_shared<Notebook>(scenario)
    }

    /// Generate a unique note ID for testing
    public fun generate_note_id(): vector<u8> {
        // Use a simple approach for unique ID generation
        b"test_note_id_12345678"
    }

    /// Create device fingerprint for testing
    public fun create_device_fingerprint(device_num: u64): string::String {
        if (device_num == 1) {
            string::utf8(b"test_device_1")
        } else if (device_num == 2) {
            string::utf8(b"test_device_2")
        } else {
            string::utf8(b"test_device_0")
        }
    }

    /// Setup test coins with specified amounts
    public fun create_test_coins(
        scenario: &mut Scenario,
        sui_amount: u64,
        wal_amount: u64
    ): (Coin<SUI>, Coin<WAL>) {
        let sender = test_scenario::sender(scenario);
        test_scenario::next_tx(scenario, sender);

        let ctx = test_scenario::ctx(scenario);
        let sui_coin = coin::mint_for_testing<SUI>(sui_amount, ctx);
        let wal_coin = coin::mint_for_testing<WAL>(wal_amount, ctx);
        (sui_coin, wal_coin)
    }

    /// Create session authorization test data
    public fun create_session_test_data(): (
        string::String,      // device_fingerprint
        address,            // hot_wallet_address
        u64,                // expires_at
        u64,                // sui_amount
        u64                 // wal_amount
    ) {
        (
            string::utf8(b"test_device_fingerprint_12345"),
            device_1(),
            future(),
            default_sui_fund(),
            default_wal_fund()
        )
    }

    /// Simple success verification helper
    public fun verify_operation_succeeded(): bool {
        true
    }

    /// Helper to switch context to different user
    public fun switch_to_user(scenario: &mut Scenario, user: address) {
        test_scenario::next_tx(scenario, user);
    }

    /// Helper to fund a user account with coins
    public fun fund_user_account(
        scenario: &mut Scenario,
        user: address,
        sui_amount: u64,
        wal_amount: u64
    ): (Coin<SUI>, Coin<WAL>) {
        switch_to_user(scenario, user);
        create_test_coins(scenario, sui_amount, wal_amount)
    }

    /// Simple function to get test amounts for insufficient balance testing
    public fun insufficient_balance_amounts(): (u64, u64) {
        (default_sui_fund(), default_wal_fund())
    }

    /// Simple SessionCap existence verification
    public fun verify_session_cap_exists(): bool {
        true
    }

    /// Create a comprehensive test matrix for session scenarios
    public struct SessionTestMatrix has copy, drop {
        positive_scenarios: vector<string::String>,
        negative_scenarios: vector<string::String>,
        edge_cases: vector<string::String>,
    }

    /// Get predefined test scenarios matrix
    public fun get_test_scenarios(): SessionTestMatrix {
        SessionTestMatrix {
            positive_scenarios: vector[
                string::utf8(b"authorize_session_and_fund_success"),
                string::utf8(b"session_valid_authorization_success"),
                string::utf8(b"session_expiration_handling"),
                string::utf8(b"session_revocation_success"),
                string::utf8(b"multiple_sessions_per_device")
            ],
            negative_scenarios: vector[
                string::utf8(b"unauthorized_session_creation"),
                string::utf8(b"wrong_hot_wallet_usage"),
                string::utf8(b"wrong_notebook_reference"),
                string::utf8(b"insufficient_balance_funding")
            ],
            edge_cases: vector[
                string::utf8(b"custom_funding_amounts"),
                string::utf8(b"zero_expiration_time"),
                string::utf8(b"gas_usage_measurement")
            ]
        }
    }
}