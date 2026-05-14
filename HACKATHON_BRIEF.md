Hackathon: Sui Overflow 2026
Theme: Build on Sui -- DeFi, AI Agents, Infrastructure, Walrus, DeepBook
Deadline: 2026-05-23T23:59:00Z
Prize tracks:
  - Specialized: DeepBook ($70K pool) -- PRIMARY TARGET
  - Core: DeFi & Payments ($30K/$15K/$10K/$7.5K) -- SECONDARY TARGET
  - Specialized: Walrus ($70K pool) -- tertiary (uses Walrus for blob storage)
Judging rubric:
  - Working demo is PRIMARY verification -- code review is secondary
  - Genuine Sui Stack usage -- SDK, dapp-kit, Walrus, Seal, CLI, on-chain interactions
  - High bar because AI helps everyone now -- working demo + genuine stack usage are minimum
  - Judges check package IDs on Sui Explorer for actual deployment
  - Technical Merit (25%) + Creativity (25%) + Sui Integration (25%) + Demo Quality (15%) + Production Readiness (10%)
Tech stack: Sui Move 2024 + TypeScript + Next.js + @mysten/dapp-kit-react + @mysten/seal + @mysten/walrus + @mysten/deepbook + SuiGrpcClient
Team: solo
Idea: >
  ShadowBook -- MEV-resistant prediction markets on DeepBook Predict.
  Orders are SEAL-encrypted with time-locked policies before submission,
  stored on Walrus during the commit phase. When the round closes,
  SEAL key servers release decryption keys, orders are revealed simultaneously
  and matched atomically on DeepBook Predict. Zero front-running, zero sandwich
  attacks, zero MEV extraction. First project to combine SEAL + DeepBook Predict
  (launched testnet May 5 2026 -- 9 days ago).

Constraints:
  - Solo developer, 9 days remaining
  - DeepBook Predict is testnet only (launched May 5 2026)
  - Need to understand DeepBook Predict SDK (brand new, limited docs)
  - SEAL time-lock policy orchestration adds complexity
  - Must have working demo on testnet

Strategy notes:
  - DeepBook Predict is 9 days old -- extreme first mover advantage
  - SEAL + DeepBook Predict combo never attempted before
  - Narrative: "MEV-resistant prediction markets" is compelling to DeFi judges
  - CZ publicly called for dark pool DEXs in 2025 -- narrative tailwind
  - DeepBook track has $70K pool with likely few serious competitors
  - Demo story: "Trader Alice places a prediction bet. Nobody can front-run her."

Inject skills:
  - sui-move, sui-security, sui-patterns, sui-defi, sui-frontend
  - sui-seal, sui-walrus, sui-cryptography
  - sui-audit-orchestrator (for pre-submission security gate)
  - blockchain-dev, frontend-design

Key technical questions to resolve:
  1. How does DeepBook Predict's PredictManager work? (testnet SDK)
  2. Can SEAL time-lock policies be programmatic? (seal_approve contract)
  3. How to orchestrate commit-reveal rounds on-chain?
  4. What's the minimum viable flow for a demo?

MVP flow (3 Must-Haves max):
  M1: Move contract -- round management (create round, commit encrypted order, reveal, settle)
  M2: SEAL integration -- encrypt/decrypt orders with time-locked policy
  M3: Frontend -- trader UI to place encrypted predictions, watch reveal, see results

References:
  - DeepBook Predict docs: https://docs.sui.io/onchain-finance/deepbook-predict/
  - SEAL docs: https://seal-docs.wal.app/
  - DeepBook SDK: @mysten/deepbook
  - Renegade (Ethereum dark pool reference): https://renegade.fi/
  - Polyhedra on-chain dark pool proposal
