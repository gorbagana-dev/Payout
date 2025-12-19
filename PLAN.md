# Payout: Per-Block Fee Distribution System

## Overview

A single-node Solana fork that automatically distributes validator fees/rewards to designated accounts on a per-block basis.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VALIDATOR CLIENT                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Banking Stage                                            │   │
│  │  └─ Slot Boundary Hook → SweepManager.sweep()           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    ON-CHAIN PROGRAMS (Genesis Deployed)         │
│  ┌─────────────────┐      ┌─────────────────────────────────┐  │
│  │ Sweep Program   │ ──→  │ Payout Vault (Jito Restaking    │  │
│  │ (transfer SOL)  │      │ Fork)                           │  │
│  └─────────────────┘      │ - Admin deposits swept SOL      │  │
│                           │ - VRT holders claim shares      │  │
│                           └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Flow

1. **Validator earns fees/rewards** during block production
2. **End of block**: Banking stage detects slot boundary
3. **Sweep transaction**: Automatically transfers validator balance to vault
4. **VRT tokens**: Represent claim percentages on the vault
5. **Distribution**: VRT holders claim their proportional share

## Components

### 1. Base: Jito-Solana Fork

Starting from `gorbagana-dev/gorchain` branch `rebase-on-3.x`.

Jito-Solana adds ~13,000 lines to stock Agave. For this project, we need a minimal subset (~3,000-4,000 lines) focused on:

- Slot boundary detection
- End-of-block transaction injection
- Account locking for sweep transactions

### 2. Genesis-Deployed Programs

Programs deployed at genesis using the existing `program-binaries/` pattern from jito-solana:

| Program | Purpose |
|---------|---------|
| `sweep` | Transfers SOL from validator to vault |
| `payout_vault` | Jito restaking fork for fee distribution |

#### File: `program-binaries/src/lib.rs`

```rust
pub mod sweep {
    solana_pubkey::declare_id!("Sweep111111111111111111111111111111111111111");
}
pub mod payout_vault {
    solana_pubkey::declare_id!("PayoutVault1111111111111111111111111111111");
}

static SPL_PROGRAMS: &[(Pubkey, Pubkey, &[u8])] = &[
    // ... existing entries ...
    (
        sweep::ID,
        solana_sdk_ids::bpf_loader::ID,
        include_bytes!("programs/sweep-0.1.0.so"),
    ),
    (
        payout_vault::ID,
        solana_sdk_ids::bpf_loader::ID,
        include_bytes!("programs/payout_vault-0.1.0.so"),
    ),
];
```

### 3. Validator Client Modifications

#### New: `core/src/sweep_manager.rs` (~150 lines)

```rust
use solana_program_binaries::{sweep, payout_vault};

pub const SWEEP_PROGRAM_ID: Pubkey = sweep::ID;
pub const VAULT_PROGRAM_ID: Pubkey = payout_vault::ID;

pub struct SweepManager {
    pub validator_identity: Keypair,
}

impl SweepManager {
    pub fn create_sweep_transaction(&self, bank: &Bank) -> Option<SanitizedTransaction> {
        let balance = bank.get_balance(&self.validator_identity.pubkey());
        let sweep_amount = balance.saturating_sub(RENT_EXEMPT_MINIMUM);

        if sweep_amount == 0 {
            return None;
        }

        // Build and return sweep transaction
    }
}
```

#### Modify: `core/src/banking_stage.rs`

Add slot boundary hook:

```rust
fn maybe_execute_sweep(&self, bank: &Arc<Bank>) {
    let current_slot = bank.slot();
    let last_slot = self.last_sweep_slot.load(Ordering::Relaxed);

    if current_slot <= last_slot {
        return;
    }

    if let Some(sweep_tx) = self.sweep_manager.create_sweep_transaction(bank) {
        self.execute_sweep_transaction(bank, sweep_tx);
        self.last_sweep_slot.store(current_slot, Ordering::Relaxed);
    }
}
```

### 4. Jito Restaking Fork (Payout Vault)

Modifications to standard Jito restaking:

| Standard Jito Restaking | Payout Fork |
|------------------------|-------------|
| Anyone can deposit SOL | Only sweep program deposits |
| Users receive VRT on deposit | Admin allocates VRT to recipients |
| Open market dynamics | Controlled distribution |

Key functions:
- `process_sweep_deposit()` - Accept deposits from sweep program
- `admin_distribute_vrt()` - Admin allocates VRT to recipients
- `claim_rewards()` - VRT holders claim proportional share

## File Summary

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| **Validator** | | | |
| Sweep Manager | `core/src/sweep_manager.rs` | ~150 | New |
| Banking Stage Hook | `core/src/banking_stage.rs` | ~50 | Modify |
| Consumer Execute | `core/src/banking_stage/consumer.rs` | ~30 | Modify |
| Main Init | `validator/src/main.rs` | ~5 | Modify |
| **Genesis** | | | |
| Program IDs | `program-binaries/src/lib.rs` | ~20 | Modify |
| Program binaries | `program-binaries/src/programs/*.so` | - | Add 2 files |
| **Programs** | | | |
| Sweep Program | `programs/sweep/src/lib.rs` | ~100 | New |
| Vault Program | `programs/payout_vault/...` | Fork | Modify |

**Total: ~535 lines of new/modified validator code**

## Transaction Flow Per Block

```
Block N ends
    ↓
Banking Stage detects slot N+1
    ↓
SweepManager.create_sweep_transaction()
    ├─ Read validator balance: 10 SOL
    ├─ Calculate sweep: 10 - 0.01 (rent) = 9.99 SOL
    └─ Build tx: Transfer 9.99 SOL → Vault
    ↓
Execute sweep tx (first tx of block N+1)
    ↓
Vault receives 9.99 SOL
    ├─ Updates total_sol
    └─ Updates pending_distribution
    ↓
VRT holders can claim proportional share
```

## References

- **Jito-Solana**: https://github.com/jito-foundation/jito-solana
- **Jito Restaking**: https://github.com/jito-foundation/restaking
- **Base fork**: https://github.com/gorbagana-dev/gorchain (branch: `rebase-on-3.x`)
