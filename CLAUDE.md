# ShadowBook

MEV-resistant prediction markets on DeepBook Predict using SEAL time-lock encryption.

## Stack
- **Smart Contracts:** Move 2024 (Sui testnet)
- **Encryption:** SEAL (`@mysten/seal`) — time-lock pattern
- **Predictions:** DeepBook Predict (`@mysten/deepbook`) — binary options
- **Frontend:** Next.js 15 + `@mysten/dapp-kit-react` v2 + `SuiGrpcClient`
- **Storage:** Walrus (`@mysten/walrus`) — optional audit trail
- **Package manager:** bun | **Linter:** Biome

## Structure
```
move/                    — Sui Move contracts
  sources/
    shadowbook.move      — round management, commit-reveal, escrow, settlement
    seal_policy.move     — SEAL time-lock policy (seal_approve)
    deepbook_integration.move — DeepBook Predict wrapper (optional)
  Move.toml
src/                     — Next.js frontend
  app/                   — pages
  components/            — UI components
  lib/                   — SDK wrappers, utils
  hooks/                 — React hooks
```

## Dev Commands
| Command | Description |
|---------|-------------|
| `sui move build` | Build Move contracts (from `move/`) |
| `sui move test` | Run Move tests |
| `sui client publish --gas-budget 100000000` | Deploy to testnet |
| `bun install` | Install frontend deps |
| `bun run dev` | Start frontend dev server |
| `bunx biome check --write .` | Lint + format |

## Key Files
- `PLAN.md` — detailed day-by-day build plan + architecture
- `HACKATHON_BRIEF.md` — hackathon context, tracks, strategy
- `ARCHITECTURE.md` — technical architecture (pre-critic, needs revision)

## Skills
- `/sui-move`, `/sui-security`, `/sui-defi`, `/sui-frontend`
- `/sui-seal`, `/sui-walrus`, `/sui-cryptography`
- `/sui-audit-orchestrator` (pre-submission security gate)
- `/blockchain-dev`, `/frontend-design`

## Critical Rules
1. **SEAL encrypt API:** `sealClient.encrypt({ threshold: 2, packageId: fromHEX(...), id: fromHEX(sealId), data })`
2. **SEAL decrypt API:** requires SessionKey + txBytes (calling seal_approve with onlyTransactionKind)
3. **Hash matching:** use `sui::address::to_bytes(sender)` in Move, NOT `bcs::to_bytes(&sender)`
4. **Status transitions:** every function must check AND update `round.status`
5. **Remove commitment after reveal:** `round.commitments.remove(sender)`
6. **SEAL identity:** include round_id + timestamp, not just timestamp
7. **Narrative:** "pre-execution privacy" NOT "zero MEV"
