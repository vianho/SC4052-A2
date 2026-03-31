# ---------------------------------------------------
# STAGE 1: Builder
# ---------------------------------------------------
FROM rust:1-bookworm AS builder

WORKDIR /usr/src/app

# Step 1: Cache dependencies
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/graphrag* 

# Step 2: Build the actual binary
COPY src ./src
RUN cargo build --release

# ---------------------------------------------------
# STAGE 2: Runtime
# ---------------------------------------------------
FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=builder /usr/src/app/target/release/graphrag .
EXPOSE 3000
CMD ["./graphrag"]
