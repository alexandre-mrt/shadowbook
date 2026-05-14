# ShadowBook Architecture

MEV-resistant prediction markets on DeepBook Predict using SEAL time-lock encryption.

## Problem

Prediction markets suffer from front-running and MEV: when a large bet is visible before execution, bots sandwich it or copy it. On Sui, shared object ordering is gas-price-based — creating predictable MEV opportunities. DeepBook Predict (testnet May 5 2026) has no built-in order privacy.

## Solution

ShadowBook wraps DeepBook Predict with a commit-reveal layer powered by SEAL time-lock encryption:

1. **Commit phase**: Trader encrypts their prediction order (oracle, expiry, strike, direction, amount) using SEAL with a time-lock policy (unlock at round end)
2. **Store**: Encrypted order stored on Walrus, commitment hash stored on-chain
3. **Reveal phase**: After time-lock expires, anyone can request SEAL decryption keys. Orders are revealed and batch-executed on DeepBook Predict
4. **Settlement**: DeepBook Predict handles settlement natively via OracleSVI

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│  Next.js + @mysten/dapp-kit-react + @mysten/seal        │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Connect  │  │ Place Order  │  │ View Rounds  │       │
│  │ Wallet   │  │ (encrypted)  │  │ & Results    │       │
│  └──────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────┐
│                SMART CONTRACTS (Move 2024)               │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ shadowbook.move                               │       │
│  │                                               │       │
│  │ Round { id, oracle_id, expiry, strike,        │       │
│  │         commit_deadline_ms, reveal_deadline_ms,│       │
│  │         commitments: vector<Commitment>,       │       │
│  │         revealed_orders: vector<RevealedOrder>,│       │
│  │         status: RoundStatus }                 │       │
│  │                                               │       │
│  │ Commitment { trader, walrus_blob_id,          │       │
│  │              order_hash, timestamp }           │       │
│  │                                               │       │
│  │ RevealedOrder { trader, is_up, amount }       │       │
│  │                                               │       │
│  │ create_round()      — admin creates a round   │       │
│  │ commit_order()      — store commitment hash   │       │
│  │ reveal_order()      — verify & record reveal  │       │
│  │ execute_round()     — batch into DeepBook     │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ seal_policy.move                              │       │
│  │                                               │       │
│  │ entry fun seal_approve(id, c: &Clock)         │       │
│  │   — time-lock: decrypt after round deadline   │       │
│  │   — uses patterns::tle pattern from MystenLabs│       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────┐
│              EXTERNAL SERVICES                          │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐       │
│  │ SEAL Key │  │ Walrus   │  │ DeepBook Predict │       │
│  │ Servers  │  │ Storage  │  │ (testnet)        │       │
│  └──────────┘  └──────────┘  └──────────────────┘       │
│                                                         │
│  SEAL: t-of-n threshold decryption                      │
│  Walrus: encrypted order blob storage                   │
│  DeepBook: binary prediction execution & settlement     │
└─────────────────────────────────────────────────────────┘
```

## Round Lifecycle

```
OPEN ──(commit_deadline_ms)──> REVEAL ──(reveal_deadline_ms)──> EXECUTE ──> SETTLED
  │                              │                                │
  │ Traders encrypt orders       │ SEAL keys released            │ Batch into DeepBook
  │ with SEAL time-lock          │ Traders reveal orders         │ Predict via PTB
  │ Store on Walrus              │ Verify hash matches           │ Settlement by oracle
  │ Submit commitment hash       │ commitment                    │
```

### Phase durations (configurable per round):
- OPEN → REVEAL: 5-30 minutes (commit window)
- REVEAL → EXECUTE: 2-5 minutes (reveal window)
- EXECUTE → SETTLED: instant (PTB batch)

## Move Contracts

### Module: shadowbook

```move
module shadowbook::shadowbook;

use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};

// === Constants ===
const E_ROUND_NOT_OPEN: u64 = 1;
const E_ROUND_NOT_REVEAL: u64 = 2;
const E_ROUND_NOT_EXECUTE: u64 = 3;
const E_INVALID_HASH: u64 = 4;
const E_ALREADY_COMMITTED: u64 = 5;
const E_ALREADY_REVEALED: u64 = 6;
const E_COMMITMENT_NOT_FOUND: u64 = 7;

// === Types ===
public enum RoundStatus has copy, drop, store {
    Open,
    Reveal,
    Execute,
    Settled,
}

public struct AdminCap has key {
    id: UID,
}

public struct Round has key, store {
    id: UID,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    commit_deadline_ms: u64,
    reveal_deadline_ms: u64,
    commitments: Table<address, Commitment>,
    revealed_orders: vector<RevealedOrder>,
    status: RoundStatus,
}

public struct Commitment has store {
    order_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    timestamp_ms: u64,
}

public struct RevealedOrder has store, copy, drop {
    trader: address,
    is_up: bool,
    amount: u64,
}

// === Events ===
public struct RoundCreated has copy, drop {
    round_id: ID,
    oracle_id: ID,
    commit_deadline_ms: u64,
    reveal_deadline_ms: u64,
}

public struct OrderCommitted has copy, drop {
    round_id: ID,
    trader: address,
    order_hash: vector<u8>,
}

public struct OrderRevealed has copy, drop {
    round_id: ID,
    trader: address,
    is_up: bool,
    amount: u64,
}

public struct RoundExecuted has copy, drop {
    round_id: ID,
    total_up: u64,
    total_down: u64,
    num_orders: u64,
}

// === Init ===
fun init(ctx: &mut TxContext) {
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

// === Admin ===
public fun create_round(
    _cap: &AdminCap,
    oracle_id: ID,
    expiry_ms: u64,
    strike: u64,
    commit_duration_ms: u64,
    reveal_duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let now = clock.timestamp_ms();
    let round = Round {
        id: object::new(ctx),
        oracle_id,
        expiry_ms,
        strike,
        commit_deadline_ms: now + commit_duration_ms,
        reveal_deadline_ms: now + commit_duration_ms + reveal_duration_ms,
        commitments: table::new(ctx),
        revealed_orders: vector[],
        status: RoundStatus::Open,
    };
    let round_id = object::id(&round);
    event::emit(RoundCreated {
        round_id,
        oracle_id,
        commit_deadline_ms: round.commit_deadline_ms,
        reveal_deadline_ms: round.reveal_deadline_ms,
    });
    transfer::share_object(round);
    round_id
}

// === Trader: Commit ===
public fun commit_order(
    round: &mut Round,
    order_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let now = clock.timestamp_ms();
    assert!(now < round.commit_deadline_ms, E_ROUND_NOT_OPEN);
    let sender = ctx.sender();
    assert!(!round.commitments.contains(sender), E_ALREADY_COMMITTED);

    round.commitments.add(sender, Commitment {
        order_hash,
        walrus_blob_id,
        timestamp_ms: now,
    });
    event::emit(OrderCommitted {
        round_id: object::id(round),
        trader: sender,
        order_hash,
    });
}

// === Trader: Reveal ===
public fun reveal_order(
    round: &mut Round,
    is_up: bool,
    amount: u64,
    salt: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let now = clock.timestamp_ms();
    assert!(now >= round.commit_deadline_ms && now < round.reveal_deadline_ms, E_ROUND_NOT_REVEAL);
    let sender = ctx.sender();
    assert!(round.commitments.contains(sender), E_COMMITMENT_NOT_FOUND);

    // Verify hash: keccak256(is_up || amount || salt || sender)
    let mut data = vector[];
    data.push_back(if (is_up) 1u8 else 0u8);
    // amount as 8 bytes little-endian
    let mut amt = amount;
    let mut i = 0;
    while (i < 8) {
        data.push_back((amt & 0xFF) as u8);
        amt = amt >> 8;
        i = i + 1;
    };
    data.append(salt);
    data.append(sui::bcs::to_bytes(&sender));
    let hash = sui::hash::keccak256(&data);
    let commitment = round.commitments.borrow(sender);
    assert!(hash == commitment.order_hash, E_INVALID_HASH);

    round.revealed_orders.push_back(RevealedOrder { trader: sender, is_up, amount });
    event::emit(OrderRevealed {
        round_id: object::id(round),
        trader: sender,
        is_up,
        amount,
    });
}

// === Execute (anyone can call after reveal deadline) ===
public fun execute_round(
    round: &mut Round,
    clock: &Clock,
) {
    let now = clock.timestamp_ms();
    assert!(now >= round.reveal_deadline_ms, E_ROUND_NOT_EXECUTE);

    let mut total_up = 0u64;
    let mut total_down = 0u64;
    let len = round.revealed_orders.length();
    let mut i = 0;
    while (i < len) {
        let order = &round.revealed_orders[i];
        if (order.is_up) { total_up = total_up + order.amount }
        else { total_down = total_down + order.amount };
        i = i + 1;
    };

    round.status = RoundStatus::Execute;
    event::emit(RoundExecuted {
        round_id: object::id(round),
        total_up,
        total_down,
        num_orders: len,
    });
    // Integration point: call DeepBook Predict to place aggregated positions
    // This requires PredictManager setup — see deepbook_integration module
}
```

### Module: seal_policy

```move
module shadowbook::seal_policy;

use sui::{bcs::{Self, BCS}, clock};

const ENoAccess: u64 = 77;

/// Time-lock policy: decrypt after round's commit_deadline_ms
/// id = bcs::to_bytes(commit_deadline_ms)
entry fun seal_approve(id: vector<u8>, c: &clock::Clock) {
    let mut prepared: BCS = bcs::new(id);
    let unlock_time = prepared.peel_u64();
    let leftovers = prepared.into_remainder_bytes();
    assert!(leftovers.length() == 0 && c.timestamp_ms() >= unlock_time, ENoAccess);
}
```

## Frontend Flow

### 1. Place Encrypted Order (Commit Phase)

```typescript
import { SealClient } from "@mysten/seal";
import { WalrusClient } from "@mysten/walrus";
import { bcs } from "@mysten/sui/bcs";
import { toHex, fromHex } from "@mysten/sui/utils";

async function placeEncryptedOrder(
    round: Round,
    isUp: boolean,
    amount: bigint,
    suiClient: SuiGrpcClient,
    walrusClient: WalrusClient,
    sealClient: SealClient,
) {
    // 1. Generate salt
    const salt = crypto.getRandomValues(new Uint8Array(32));

    // 2. Build order data
    const orderData = bcs.struct("Order", {
        is_up: bcs.bool(),
        amount: bcs.u64(),
        salt: bcs.vector(bcs.u8()),
    }).serialize({ is_up: isUp, amount, salt: Array.from(salt) }).toBytes();

    // 3. Build SEAL identity (time-lock = commit_deadline_ms)
    const sealId = toHex(bcs.u64().serialize(round.commitDeadlineMs).toBytes());

    // 4. Encrypt with SEAL (time-locked)
    const { encryptedObject } = await sealClient.encrypt({
        packageId: SEAL_POLICY_PACKAGE_ID,
        id: sealId,
        data: orderData,
    });

    // 5. Store encrypted blob on Walrus
    const blobId = await walrusClient.writeBlob(encryptedObject);

    // 6. Compute commitment hash (keccak256 of plaintext order)
    const commitData = new Uint8Array([
        isUp ? 1 : 0,
        ...numberToLE(amount, 8),
        ...salt,
        ...fromHex(walletAddress),
    ]);
    const orderHash = keccak256(commitData);

    // 7. Submit commitment on-chain
    const tx = new Transaction();
    tx.moveCall({
        target: `${PACKAGE_ID}::shadowbook::commit_order`,
        arguments: [
            tx.object(round.objectId),
            tx.pure.vector("u8", Array.from(orderHash)),
            tx.pure.vector("u8", Array.from(fromHex(blobId))),
            tx.object("0x6"), // Clock
        ],
    });

    return { tx, salt, blobId };
}
```

### 2. Reveal Order (After Time-Lock Expires)

```typescript
async function revealOrder(
    round: Round,
    isUp: boolean,
    amount: bigint,
    salt: Uint8Array,
    blobId: string,
    sealClient: SealClient,
    walrusClient: WalrusClient,
) {
    // 1. Fetch encrypted blob from Walrus
    const encryptedBlob = await walrusClient.readBlob(blobId);

    // 2. Decrypt with SEAL (time-lock has expired, key servers will release keys)
    const decryptedData = await sealClient.decrypt({
        data: encryptedBlob,
    });

    // 3. Submit reveal on-chain
    const tx = new Transaction();
    tx.moveCall({
        target: `${PACKAGE_ID}::shadowbook::reveal_order`,
        arguments: [
            tx.object(round.objectId),
            tx.pure.bool(isUp),
            tx.pure.u64(amount),
            tx.pure.vector("u8", Array.from(salt)),
            tx.object("0x6"), // Clock
        ],
    });

    return tx;
}
```

## DeepBook Predict Integration

### Testnet Contract Info
- Predict Package: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`
- Predict Registry: `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64`
- Predict Object: `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a`
- Quote (DUSDC): `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`
- Server: `https://predict-server.testnet.mystenlabs.com`

### Integration Strategy
After reveal phase, `execute_round` aggregates orders and calls DeepBook Predict to:
1. Mint binary positions for each revealed order
2. Use PredictManager for each trader's position tracking
3. Settlement handled by DeepBook Predict's OracleSVI mechanism

### Simplification for MVP
For the hackathon MVP, we can:
- Start with a standalone commit-reveal prediction system (not composing with DeepBook Predict directly)
- The commit-reveal + SEAL encryption is the core innovation
- DeepBook Predict composition can be a v2 feature or demo enhancement
- This reduces complexity while preserving the core value proposition

## Must-Have Features (MoSCoW)

### M1: Round Management Contract
- Create rounds with oracle/strike/timing
- Commit encrypted order hashes
- Reveal and verify orders
- Execute round (aggregate results)
- Deploy on testnet

### M2: SEAL Time-Lock Encryption
- seal_policy.move with time-lock pattern
- Frontend encrypt/decrypt flow
- Walrus storage for encrypted blobs
- Session key management

### M3: Trader Frontend
- Connect wallet (dApp-kit-react)
- View active rounds
- Place encrypted prediction (commit)
- Reveal after time-lock expires
- View round results

### Should-Have
- S1: DeepBook Predict direct integration (mint positions via PTB)
- S2: Round creation UI (admin panel)
- S3: Historical rounds display

### Could-Have
- C1: Multiple oracle support
- C2: Leaderboard / stats
- C3: Auto-reveal bot (watches for time-lock expiry)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Move 2024 (Sui testnet) |
| Encryption | SEAL (`@mysten/seal`) |
| Storage | Walrus (`@mysten/walrus`) |
| Prediction Engine | DeepBook Predict (`@mysten/deepbook`) |
| Frontend | Next.js 15 + React 19 |
| Wallet | `@mysten/dapp-kit-react` v2 |
| Client | `SuiGrpcClient` |
| Styling | Tailwind CSS |
| Package Manager | bun |
| Linter | Biome |

## Security Considerations

- Orders are encrypted client-side — server never sees plaintext
- SEAL time-lock ensures nobody (not even key servers) can decrypt before deadline
- Commitment hash prevents order modification after commit
- Salt prevents rainbow table attacks on order hashes
- Walrus blob IDs are public but content is encrypted
- seal_approve is `entry` (not `public`) — upgradeable policy
