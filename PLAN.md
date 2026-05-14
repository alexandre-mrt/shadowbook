# ShadowBook — Build Plan

MEV-resistant prediction markets on DeepBook Predict using SEAL time-lock encryption.

**Track:** DeepBook $70K (primary), DeFi & Payments $30K (fallback)
**Deadline:** 2026-05-23T23:59:00Z (9 days from 2026-05-14)
**Solo developer**

---

## Day-by-Day Plan

### Day 1: GO/NO-GO Spike — DeepBook Predict Integration
- Read `/tmp/deepbookv3/packages/predict/sources/` (predict.move, predict_manager.move, vault.move, registry.move)
- Read `/tmp/deepbookv3/packages/predict/simulations/src/sim.ts` for SDK usage
- Read predict-cli (https://github.com/SeventhOdyssey71/predict-cli) for API patterns
- Try: create PredictManager, deposit DUSDC, mint binary position on testnet
- **GO:** Option B — SEAL + DeepBook Predict minimal but real
- **NO-GO:** Option A — standalone commit-reveal + DeFi track $30K

### Day 2-3: Smart Contracts (Move 2024)
Files to create:
- `move/sources/shadowbook.move` — round management, commit-reveal, escrow, settlement
- `move/sources/seal_policy.move` — time-lock SEAL policy (copy from MystenLabs/seal tle.move)
- `move/sources/deepbook_integration.move` — PredictManager wrapper (if GO)
- `move/Move.toml` — dependencies: sui, deepbook (if GO)

Critical fixes from critics (all blockers):
1. Add `Coin<DUSDC>` escrow to `commit_order` (not just hash)
2. Parimutuel settlement: `resolve_round(actual_outcome)` + `claim_payout()`
3. Fix state machine: status transitions in each function
4. Fix double-reveal: `round.commitments.remove(sender)` after reveal
5. Fix execute_round guard: `assert!(status != Execute && status != Settled)`
6. Fix hash: use `sui::address::to_bytes(sender)` not `bcs::to_bytes(&sender)`
7. Include round_id in SEAL identity: `bcs::to_bytes(round_id, commit_deadline_ms)`
8. Add `cancel_round` admin function for failed rounds
9. Add basic validation in `create_round` (durations > 0)

Deploy on testnet. Verify package ID on Explorer.

### Day 4-5: SEAL Integration + Frontend Start
SEAL encrypt/decrypt (fix API from critic):
- Encrypt: `sealClient.encrypt({ threshold: 2, packageId: fromHEX(...), id: fromHEX(sealId), data })`
- Decrypt: requires SessionKey + txBytes (calling seal_approve with onlyTransactionKind)
- Store order data in localStorage (NOT Walrus on critical path)
- Walrus for audit trail only (optional)

Frontend scaffold:
- Next.js 15 + React 19 + Tailwind
- `@mysten/dapp-kit-react` v2 for wallet
- `@mysten/seal` for encryption
- `SuiGrpcClient` for queries

### Day 6-7: Frontend Complete + Integration Test
Pages:
- Home: active rounds list
- Round detail: commit form (encrypted) → reveal button → results
- Connect wallet → deposit DUSDC → commit → wait → reveal → claim

Full flow test on testnet with 2 wallets.
Pre-record demo video (30s commit window, 30s reveal window).

### Day 8: Polish + Deploy Final
- Deploy final contracts on testnet
- Verify all package IDs on Sui Explorer
- Final full-flow test
- Record backup video (3-4 min)

### Day 9: Submit
- README.md (problem, solution, stack, deployed URL, package IDs)
- Submit to HackerEarth 2+ hours before deadline
- Verify all links work

---

## Architecture Summary

### Round Lifecycle
```
OPEN ──(commit_deadline)──> REVEAL ──(reveal_deadline)──> EXECUTE ──> SETTLED
  │                           │                            │
  │ Encrypt order (SEAL)      │ SEAL keys released         │ Resolve outcome
  │ Deposit Coin<DUSDC>       │ Decrypt + verify hash      │ Distribute funds
  │ Store commitment hash     │ Remove commitment          │ (+ DeepBook if GO)
```

### Modules
1. `shadowbook.move` — Round, Commitment, RevealedOrder, escrow, settlement
2. `seal_policy.move` — `seal_approve(id, clock)` time-lock (round_id + timestamp)
3. `deepbook_integration.move` — PredictManager wrapper (optional, depends on spike)

### Settlement (Parimutuel)
- Losers' escrowed funds distributed to winners proportionally
- `resolve_round(round, actual_outcome: bool)` — admin sets oracle result
- `claim_payout(round)` — winners withdraw their share
- If no winners: refund all. If no losers: refund all.

---

## Critical Reference Code

### SEAL Time-Lock (from MystenLabs/seal)
```
/tmp/seal/move/patterns/sources/tle.move — copy this for seal_policy.move
/tmp/seal/move/patterns/sources/voting.move — blueprint for sealed-bid pattern
/tmp/seal/examples/frontend/src/utils.ts — SealClient encrypt/decrypt flow
```

### DeepBook Predict
```
/tmp/deepbookv3/packages/predict/sources/predict.move — main protocol
/tmp/deepbookv3/packages/predict/sources/predict_manager.move — per-user accounts
/tmp/deepbookv3/packages/predict/sources/vault/vault.move — liquidity
/tmp/deepbookv3/packages/predict/simulations/src/sim.ts — TS SDK usage
```

### Sealed Bid References
```
clownfish2023/SealBid — auction.move + seal_integration.move (adapt for orders)
Typus-Lab/typus-dov — sealed.move (production commit-reveal)
bomba-atomica/atomica — timelock + auction separation
```

### Testnet Contract IDs (DeepBook Predict)
- Package: 0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138
- Registry: 0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64
- Predict Object: 0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a
- DUSDC: 0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC
- Server: https://predict-server.testnet.mystenlabs.com

---

## Narrative (for judges)

**NOT:** "Zero MEV" (false claim)
**YES:** "Pre-execution privacy for DeepBook Predict"

Pitch: "Prediction markets leak trader intent. When Alice bets $10K on BTC going up, bots copy her before execution. ShadowBook encrypts every order with SEAL time-lock encryption. Nobody — not bots, not validators, not key servers — can see orders until the round closes. Then all orders reveal simultaneously and settle atomically on DeepBook Predict."

Magic moment: Alice commits an encrypted bet → time passes → all bets reveal at once → money moves → Alice wins.

---

## Tech Stack

| Layer | Technology | Package |
|-------|-----------|---------|
| Smart Contracts | Move 2024 | sui testnet |
| Encryption | SEAL | @mysten/seal |
| Storage | Walrus (optional) | @mysten/walrus |
| Predictions | DeepBook Predict | @mysten/deepbook |
| Frontend | Next.js 15 | next |
| Wallet | dApp-kit | @mysten/dapp-kit-react |
| Client | gRPC | SuiGrpcClient |
| Styling | Tailwind CSS | tailwindcss |
| Package Mgr | bun | - |
| Linter | Biome | @biomejs/biome |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| DeepBook Predict API too complex | Day 1 spike. Fallback: standalone + DeFi track |
| SEAL decrypt fails in demo | Pre-record video. Generous time windows (30s) |
| Tab close = lost order | localStorage + user warning |
| SEAL key servers down | 10+ min reveal window + cancel_round path |
| Shared object contention | Fine for demo (2-3 wallets) |
| Time pressure | MoSCoW strict. Only M1-M3. Drop Walrus, admin UI, leaderboard |
