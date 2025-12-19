# Payout

Per-block fee distribution system for a single-node Solana fork.

## Tech Stack

- **Language**: Rust
- **Platform**: Solana/Agave fork (gorchain)
- **Build**: cargo
- **Formatter**: rustfmt
- **Linter**: clippy

## Project Structure

| Repo | Purpose |
|------|---------|
| **Payout** (this repo) | Config, docs, planning |
| **gorchain** | Validator with sweep implementation (~400 lines) |
| **jito-restaking fork** | Vault for VRT-based distribution |

See `PLAN.md` for detailed architecture and implementation plan.

## Code Conventions

- Follow Microsoft Rust Guidelines (loaded via `.claude/skills/rust-guidelines/`)
- Run `cargo fmt` before committing
- Run `cargo clippy` and fix warnings
- Prefer explicit error handling over `.unwrap()`
- Use `thiserror` for custom error types

## Commands

```bash
cargo build          # Build
cargo test           # Run tests
cargo fmt            # Format code
cargo clippy         # Lint
```

## Development Workflow

1. Create feature branch from `rebase-on-3.x`
2. Make changes, ensure `cargo clippy` passes
3. Run `cargo fmt`
4. Commit with descriptive message
5. Push and create PR

## Key Files (gorchain)

When implementing sweep functionality:

| File | Purpose |
|------|---------|
| `core/src/sweep_manager.rs` | New - sweep logic |
| `core/src/banking_stage.rs` | Modify - wire SweepManager |
| `core/src/banking_stage/consume_worker.rs` | Modify - slot boundary hook |
| `validator/src/main.rs` | Modify - init SweepManager |

## Testing

- Unit tests alongside implementation
- Integration tests for sweep transaction execution
- Test with `cargo test --workspace`

## References

- [PLAN.md](./PLAN.md) - Detailed implementation plan
- [gorchain](https://github.com/gorbagana-dev/gorchain) - Validator fork
- [jito-restaking](https://github.com/jito-foundation/restaking) - Vault reference
