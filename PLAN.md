# Payout: Per-Block Fee Distribution System

## Overview

A single-node Solana fork (gorchain, based on **stock Agave**) that automatically distributes validator fees/rewards to designated accounts on a per-block basis.

**Key Facts**:
- gorchain is a fork of stock Agave, NOT jito-solana
- No jito infrastructure exists in gorchain
- Distribution requires a vault program (Jito Restaking fork)

---

## System Components

| Component | Repo | Purpose |
|-----------|------|---------|
| **Sweep** | gorchain (this repo) | Moves SOL from validator → vault each slot |
| **Vault** | jito-restaking fork (separate) | Tracks VRT shares, enables proportional claims |

Both are required. System transfer alone cannot distribute to multiple recipients.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              PART 1: VALIDATOR (gorchain) ~400 lines            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Banking Stage                                            │   │
│  │  └─ End of Slot → SweepManager.sweep()                  │   │
│  │       └─ System Transfer: validator → vault              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              PART 2: VAULT (jito-restaking fork)                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ - Receives swept SOL                                     │   │
│  │ - Admin allocates VRT to recipients                      │   │
│  │ - VRT holders claim proportional share                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Validator Sweep (This Plan)

**Approach**: System Transfer at end of each slot

- No custom sweep program needed on validator side
- Validator creates system transfer to vault address
- ~400 lines total in gorchain

---

## Part 1 File Changes (~400 lines in gorchain)

### 1. New: `gorchain/core/src/sweep_manager.rs` (~150 lines)

```rust
//! Manages per-slot sweep of validator fees to vault

use solana_pubkey::Pubkey;
use solana_keypair::Keypair;
use solana_runtime::bank::Bank;
use solana_transaction::Transaction;

/// Hardcoded vault address (deployed at genesis)
pub const VAULT_ADDRESS: Pubkey = solana_pubkey::pubkey!("...");

/// Minimum lamports to retain in validator account
pub const RENT_EXEMPT_MINIMUM: u64 = 890_880;

pub struct SweepManager {
    validator_identity: Arc<Keypair>,
    last_sweep_slot: AtomicU64,
}

impl SweepManager {
    pub fn new(validator_identity: Arc<Keypair>) -> Self { ... }

    /// Check if sweep needed for current slot, create tx if so
    pub fn maybe_create_sweep_transaction(
        &self,
        bank: &Bank,
    ) -> Option<SanitizedTransaction> { ... }

    /// Execute sweep transaction on the bank
    pub fn execute_sweep(
        &self,
        bank: &Arc<Bank>,
        transaction: SanitizedTransaction,
    ) -> Result<(), SweepError> { ... }
}
```

### 2. Modify: `gorchain/core/src/lib.rs` (~5 lines)

```rust
// Add module export
pub mod sweep_manager;
```

### 3. Modify: `gorchain/core/src/banking_stage/consume_worker.rs` (~50 lines)

Add sweep hook in the consume loop when slot changes:

```rust
// In consume_loop(), after bank change detection:
if bank.slot() != self.last_sweep_slot {
    if let Some(sweep_tx) = self.sweep_manager.maybe_create_sweep_transaction(&bank) {
        self.execute_sweep(&bank, sweep_tx);
    }
    self.last_sweep_slot = bank.slot();
}
```

### 4. Modify: `gorchain/core/src/banking_stage.rs` (~30 lines)

Wire SweepManager into BankingStage initialization.

### 5. Modify: `gorchain/validator/src/main.rs` (~20 lines)

Initialize SweepManager with validator identity keypair.

### 6. Modify: `gorchain/core/Cargo.toml` (~5 lines)

Add any needed dependencies.

---

## Transaction Flow

```
Slot N (validator producing block)
    ↓
Slot N+1 detected (bank.slot() changes)
    ↓
SweepManager.maybe_create_sweep_transaction()
    ├─ Check: balance > RENT_EXEMPT_MINIMUM?
    ├─ Calculate: sweep_amount = balance - RENT_EXEMPT_MINIMUM
    └─ Build: SystemProgram::transfer(validator → vault)
    ↓
Execute sweep tx (included in block N+1)
    ↓
Vault receives SOL
```

---

## Existing Infrastructure (No Changes Needed)

Stock Agave already has:
- `SLOT_BOUNDARY_CHECK_PERIOD` (10ms) in banking_stage.rs:90
- `check_leader_slot_boundary()` in leader_slot_metrics.rs
- `bank.is_complete()` checks in consume_worker.rs
- Transaction execution via `Consumer.process_and_record_aged_transactions()`

We hook into these existing patterns.

---

## Part 2: Vault (Separate Repo)

The Jito Restaking fork is **required** for distribution but implemented separately:

| Jito Restaking (standard) | Payout Vault (fork) |
|---------------------------|---------------------|
| Anyone deposits SOL | Only sweep deposits (from validator) |
| Depositor receives VRT | Admin allocates VRT to recipients |
| Open market | Controlled distribution |

Key vault functions needed:
- Accept deposits from sweep
- Admin-controlled VRT allocation
- Proportional claim mechanism for VRT holders

---

## File Summary

| File | Change | Lines |
|------|--------|-------|
| `gorchain/core/src/sweep_manager.rs` | New | ~150 |
| `gorchain/core/src/lib.rs` | Add module | ~5 |
| `gorchain/core/src/banking_stage/consume_worker.rs` | Add sweep hook | ~50 |
| `gorchain/core/src/banking_stage.rs` | Wire SweepManager | ~30 |
| `gorchain/validator/src/main.rs` | Init SweepManager | ~20 |
| `gorchain/core/Cargo.toml` | Dependencies | ~5 |
| **Total** | | **~260** |

Plus tests: ~100-150 lines

**Grand Total: ~400 lines**

---

## Design Decisions

1. **Sweep timing**: End of slot (before slot completes)
2. **Implementation**: System Transfer (no custom program needed on validator side)
3. **Vault address**: TBD (coordinate with restaking fork)

---

## References

- **gorchain**: https://github.com/gorbagana-dev/gorchain (branch: `rebase-on-3.x`)
- **Jito Restaking**: https://github.com/jito-foundation/restaking (to be forked)
