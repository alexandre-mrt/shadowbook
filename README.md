# ShadowBook

**MEV-resistant prediction markets using SEAL time-lock encryption on Sui.**

Prediction markets leak trader intent. When a large bet is placed, bots front-run it before execution. ShadowBook encrypts every prediction order with SEAL time-lock encryption — nobody can see orders until the round closes. Then all orders reveal simultaneously and settle atomically.

## How It Works

```
COMMIT PHASE          REVEAL PHASE          SETTLEMENT
─────────────         ─────────────         ──────────
Encrypt order    →    SEAL keys released →  Parimutuel payout
with SEAL             All orders decrypt    Winners take
time-lock             simultaneously        losers' pool
                      Verify hash match
```

1. **Commit**: Trader picks UP or DOWN, encrypts the order with SEAL time-lock, stores it on Walrus, and deposits SUI escrow on-chain
2. **Reveal**: After the time-lock expires, SEAL key servers release decryption keys. Trader decrypts and submits the plaintext for on-chain hash verification
3. **Settle**: Admin resolves the outcome. Winners claim their stake plus a proportional share of the losers' pool (parimutuel)

## Live Demo

- **Frontend**: [shadowbook.vercel.app](https://shadowbook.vercel.app)
- **Sui Explorer**: [Package on Testnet](https://testnet.suivision.xyz/package/0x2d2290ac963edc2618128f9163c7a2ff7b18b011f15adc191475b6594063db64)

## Deployed Contracts (Testnet)

| Contract | Address |
|----------|---------|
| Package | `0x2d2290ac963edc2618128f9163c7a2ff7b18b011f15adc191475b6594063db64` |
| AdminCap | `0xfe7b26df82facafba11bf184f4807e36ca5d343e96b07fb07ea60e0cafcc0afd` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | **Move 2024** — round management, escrow, parimutuel settlement |
| Encryption | **SEAL** (`@mysten/seal`) — time-lock encryption pattern |
| Blob Storage | **Walrus** — encrypted order storage via HTTP publisher |
| Frontend | **Next.js 15** + **React 19** + **Tailwind CSS v4** |
| Wallet | **@mysten/dapp-kit-react** v2 — wallet connection + tx signing |
| Client | **SuiJsonRpcClient** — testnet queries |
| Package Manager | **bun** |
| Linter | **Biome** |

## Architecture

### Move Contracts (`move/sources/`)

- **`shadowbook.move`** — Round lifecycle (Open → Reveal → Execute → Settled), `Coin<SUI>` escrow at commit time, keccak256 hash verification at reveal, parimutuel settlement
- **`seal_policy.move`** — SEAL time-lock policy: `seal_approve(id, Clock)` allows decryption only after the round's commit deadline

### Frontend (`src/`)

- **SEAL encrypt** (`src/lib/seal.ts`) — encrypts order data with time-locked identity `bcs::to_bytes(commit_deadline_ms)`
- **Walrus storage** (`src/lib/walrus.ts`) — stores encrypted blobs via HTTP publisher
- **Crypto** (`src/lib/crypto.ts`) — keccak256 hash matching the Move contract (uses `address::to_bytes`, not `bcs::to_bytes`)
- **Hooks** — `useSealEncrypt` (commit flow), `useSealDecrypt` (reveal flow)

### Key Design Decisions

1. **Real money at commit** — SUI is escrowed when committing, not just a hash. No commitment without skin in the game.
2. **Parimutuel settlement** — losers' pool distributed to winners proportionally. No counterparty risk, no oracle manipulation incentive.
3. **Auto-advancing status** — the frontend computes the live round status from clock timestamps, so rounds progress even without on-chain transactions.

## Setup

### Prerequisites

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (1.72+)
- [bun](https://bun.sh/) (1.3+)
- Sui Wallet browser extension

### Run Locally

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build Move contracts
cd move && sui move build

# Run Move tests (6/6 pass)
cd move && sui move test

# Deploy contracts (requires testnet SUI)
cd move && sui client publish --gas-budget 200000000
```

### Create a Round

1. Go to `/admin` in the UI
2. Connect the wallet that owns the AdminCap
3. Set oracle, strike, commit window, reveal window
4. Click "CREATE ROUND"

Or via CLI:
```bash
sui client call \
  --package <PACKAGE_ID> \
  --module shadowbook \
  --function create_round \
  --args <ADMIN_CAP> <ORACLE_ID> <EXPIRY_MS> <STRIKE> <COMMIT_DURATION_MS> <REVEAL_DURATION_MS> 0x6 \
  --gas-budget 50000000
```

## Hackathon

**Sui Overflow 2026** — DeepBook Track ($70K) + DeFi & Payments Track

### Why ShadowBook?

- DeepBook Predict launched testnet May 5, 2026 — **first project to combine SEAL + prediction markets**
- CZ publicly advocated for dark pool mechanisms in 2025
- Addresses a real DeFi problem: pre-execution privacy for prediction markets
- Uses 4 Sui-native technologies: Move, SEAL, Walrus, dApp-kit

## License

MIT
