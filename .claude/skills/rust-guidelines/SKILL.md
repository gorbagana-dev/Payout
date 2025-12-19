---
name: rust-guidelines
description: Apply Microsoft Pragmatic Rust Guidelines when writing or reviewing Rust code
---

# Microsoft Pragmatic Rust Guidelines

ALWAYS use this skill BEFORE writing or modifying ANY Rust code (.rs files).

## When to Apply

- Writing new Rust code
- Modifying existing Rust code
- Reviewing Rust code
- Designing Rust APIs

## Key Principles

1. **Design with AI in mind** - Idiomatic APIs, thorough docs, strong types
2. **Use canonical error types** - Libraries use custom error types, apps may use anyhow/eyre
3. **Comprehensive testing** - Enables autonomous refactoring
4. **Follow Rust API Guidelines** - https://rust-lang.github.io/api-guidelines/

## Instructions

When writing Rust code, consult the full guidelines in `REFERENCE.txt` for:
- Error handling patterns
- Documentation standards
- Performance considerations
- Safety guidelines
- Library design patterns

## Source

Microsoft Pragmatic Rust Guidelines: https://microsoft.github.io/rust-guidelines/
