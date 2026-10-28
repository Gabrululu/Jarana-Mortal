# Entorno listo para el taller: Rust + wasm32v1-none + Stellar CLI (+ Node/pnpm vía features)
FROM mcr.microsoft.com/devcontainers/rust:1-bookworm

ARG STELLAR_CLI_VERSION=28.0.0

# libdbus/libudev: dependencias dinámicas del binario de stellar-cli para Linux
RUN apt-get update \
    && apt-get install -y --no-install-recommends libdbus-1-3 libudev1 \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add wasm32v1-none

RUN case "$(dpkg --print-architecture)" in \
        amd64) arch=x86_64 ;; \
        arm64) arch=aarch64 ;; \
        *) echo "Arquitectura no soportada" && exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/stellar/stellar-cli/releases/download/v${STELLAR_CLI_VERSION}/stellar-cli-${STELLAR_CLI_VERSION}-${arch}-unknown-linux-gnu.tar.gz" \
       | tar -xz -C /usr/local/bin stellar \
    && stellar --version
