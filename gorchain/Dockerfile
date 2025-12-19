# syntax=docker/dockerfile:1.7-labs
# Build stage with BuildKit cache mounts (requires Docker BuildKit)
FROM ubuntu:24.04 as builder

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH="$PATH:/usr/local/cargo/bin"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libudev-dev \
    pkg-config \
    zlib1g-dev \
    llvm \
    clang \
    cmake \
    make \
    libprotobuf-dev \
    protobuf-compiler \
    libclang-dev \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal \
    && rustup component add rustfmt \
    && rustup component add clippy \
    && chmod -R a+w $CARGO_HOME $RUSTUP_HOME

# Set working directory
WORKDIR /agave

# Copy source code, excluding start-validator.sh 
COPY --exclude=start-validator.sh . .

# Build with cache mounts for cargo registry and target directory
# This persists the cargo registry and build artifacts between builds
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/agave/target \
    cargo build --release --bin agave-validator --bin solana-keygen --bin solana-genesis --bin solana-faucet --bin solana && \
    # Copy binaries out of cache mount to persistent location
    mkdir -p /agave/binaries && \
    cp /agave/target/release/agave-validator /agave/binaries/ && \
    cp /agave/target/release/solana-keygen /agave/binaries/ && \
    cp /agave/target/release/solana-genesis /agave/binaries/ && \
    cp /agave/target/release/solana-faucet /agave/binaries/ && \
    cp /agave/target/release/solana /agave/binaries/


# Runtime stage (unchanged)
FROM ubuntu:24.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl3 \
    libudev1 \
    libprotobuf32 \
    ca-certificates \
    curl \
    sudo \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Create agave user and add to sudo group
RUN useradd -m -s /bin/bash agave \
    && usermod -aG sudo agave \
    && echo "agave ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# Copy binaries from builder stage
COPY --from=builder /agave/binaries/agave-validator /usr/local/bin/
COPY --from=builder /agave/binaries/solana-keygen /usr/local/bin/
COPY --from=builder /agave/binaries/solana-genesis /usr/local/bin/
COPY --from=builder /agave/binaries/solana-faucet /usr/local/bin/
COPY --from=builder /agave/binaries/solana /usr/local/bin/

# Copy our startup script
COPY start-validator.sh /usr/local/bin/
COPY primordial.yml /agave/primordial.yml
# Set permissions
RUN chmod +x /usr/local/bin/*

# Create directories for data
RUN mkdir -p /agave/config /agave/ledger /agave/accounts /agave/programs \
    && chown -R agave:agave /agave \
    && chmod -R 755 /agave

COPY programs/precompiled /agave/programs/precompiled

COPY airdrop.csv /agave/airdrop.csv

USER agave

# Set working directory
WORKDIR /agave

# Expose ports
# RPC JSON
EXPOSE 8899/tcp
# RPC pubsub
EXPOSE 8900/tcp
# Gossip
EXPOSE 8001/udp
# TPU
EXPOSE 8003/udp
# Faucet
EXPOSE 9900/tcp

# Switch to agave user
USER agave

# Default environment variables
ENV RUST_LOG=info
ENV RUST_BACKTRACE=1

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8899/health || exit 1

# Default command - run the validator with our startup script
CMD ["start-validator.sh"]
