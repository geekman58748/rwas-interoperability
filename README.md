# RWA Ownership Proof — Attestcoin Protocol

> **BUIDL CTC 2026 Fall | RWA Track**

Prove real-world asset ownership occurred on Ethereum, using Attestcoin's decentralized attestor network — then let a Creditcoin contract trustlessly act on that proof, minting a transferable receipt token. No bridge, no custodian, no centralized oracle.

---

## What This Project Does

We deploy a **mock ERC-721** on Ethereum Sepolia representing fractional ownership of a fictional real-world asset ("1% of Building #1"). When someone mints a share, that ownership event is **proven cross-chain** to Creditcoin using the Attestcoin Protocol. Our ASC verifies the proof and mints a **VerifiedShare receipt token** on Creditcoin — a transferable, re-verifiable claim to the Ethereum asset.

**This is an ownership proof flow, not a borrow/repay flow.**

### One-Sentence Pitch

> "We prove that a real-world asset ownership event occurred on Ethereum, using Attestcoin's decentralized attestor network — then let a Creditcoin contract trustlessly act on that proof, minting a transferable receipt. No bridge, no custodian, no centralized oracle."

---

## Architecture

```
ETHEREUM SEPOLIA (chainKey 1)                    CREDITCOIN CC3 TESTNET
┌──────────────────────────────┐                ┌──────────────────────────────────┐
│ PretendAssetShare.sol (ERC721)│                │ BlockProver precompile @ 0x0FD2  │
│ mint(owner, description)     │                │ verify(merkle + continuity proof) │
│ → emits AssetMinted event    │                │         ▲                        │
└───────────┬──────────────────┘                │         │                        │
            │ mint tx                           │ OwnershipVerifier.sol (ASC)     │
            │                                   │ ├─ verify proof                 │
            ▼                                   │ ├─ check receipt status == 1    │
┌──────────────────────────────┐                │ ├─ check wallet == tx sender    │
│ Oracle Worker (TS)           │   proofs       │ ├─ multi-condition checks       │
│ @gluwa/usc-sdk               │───────────────▶│ ├─ mint VerifiedShare receipt   │
│ ├─ ProofBuilder              │                │ └─ emit OwnershipVerified       │
│ ├─ waitUntilHeightAttested   │                │                                  │
│ └─ getProof / getBatchProof  │                │ VerifiedShare.sol (ERC-721)     │
└──────────────────────────────┘                │ ├─ receipt token on Creditcoin   │
                                                │ ├─ transferable between holders │
                                                │ ├─ staleness tracking           │
                                                │ └─ validity checks for gating   │
                                                └──────────────────────────────────┘
```

### Flow Direction (One-Way)

```
Ethereum Sepolia → Attestcoin Attestor Network → Creditcoin ASC → VerifiedShare Receipt
      (source)              (proof)                (verify + mint)    (transferable claim)
```

**Ethereum remains the source of truth for the underlying asset at all times.** The Creditcoin receipt is a live, re-verifiable read of that truth — not a replacement, transfer, or migration of the asset. Changes to the asset on Ethereum can be re-proven and reflected on Creditcoin. Changes to the receipt on Creditcoin do not yet flow back to Ethereum — that requires writability, which is Attestcoin's next roadmap phase, not live today.

---

## Core Mechanism

1. **Real-world asset ownership event** happens and lives only on Ethereum (Sepolia). Creditcoin never custodies the original asset.
2. **Attestcoin's attestor network** proves that event (referencing the Ethereum tx hash) to our ASC on Creditcoin.
3. **On successful proof**, the ASC mints a **VerifiedShare receipt token** on Creditcoin — "proven claim to this Ethereum asset at time of verification." This is NOT the original asset.
4. **The receipt token is transferable** on Creditcoin. Holders can trade the verified claim without touching the original Ethereum asset.
5. **Downstream actions** (liquidity release, unlock, payout) are gated behind checks in the ASC, not released automatically on mint alone.

### Ethereum → Creditcoin Resync (Supported)

If the underlying Ethereum asset is sold/transferred/burned, a fresh Attestcoin proof can be submitted and the ASC updates/revokes/reduces the Creditcoin receipt accordingly. This is the **Ethereum → Creditcoin resync** direction.

### Creditcoin → Ethereum Resync (NOT Supported)

Spending, transferring, or burning the receipt on Creditcoin has no mechanism to reach back and alter Ethereum state. This requires writability, which is not live.

---

## How Attestcoin Protocol Works

### The Block Prover Precompile

Attestcoin adds a **native precompile** to the Creditcoin runtime at `0x0000000000000000000000000000000000000FD2`. It answers: **"Did this exact transaction really happen on chain X?"**

| Proof | What It Proves |
|---|---|
| **Merkle Inclusion Proof** | The transaction is included in a specific block's transaction tree |
| **Continuity Proof** | That block is part of a sequence of blocks anchored to an attestation point on Creditcoin |

Verification is **synchronous** — completes in a single Creditcoin block (~15 seconds).

### Attestors (Decentralized, Not Centralized)

A **decentralized network of attestors** reaches consensus on source-chain histories. No single point of failure, no custodian, no operator to trust. The protocol itself enforces correctness.

### Why Safer Than Bridges/Oracles

- **No single point of failure** — if one attestor goes down, others continue
- **No custodian** — the asset never leaves Ethereum; only a proof moves
- **No operator to trust** — the protocol enforces correctness
- **No additional trust** beyond the chain you're already settling on

---

## Multi-Condition Verification (Depth Requirement)

We verify **three conditions** simultaneously, not just a single flag:

| Condition | What It Proves |
|---|---|
| `owned` | The wallet owns the asset |
| `mintTimeValid` | The mint happened in a valid time window |
| `fromApprovedMinter` | The minter is on an approved list |

Plus: replay guard, receipt status check, sender verification, and batch verification support.

---

## Receipt Token (VerifiedShare)

The **VerifiedShare** receipt is an ERC-721 on Creditcoin representing a proven claim to an Ethereum asset.

| Property | Description |
|---|---|
| **Transferable** | Holders can trade the verified claim on Creditcoin |
| **Timestamped** | Records when the proof was verified |
| **Staleness tracking** | Can be flagged stale if Ethereum-side state changes |
| **Gated actions** | Downstream actions check validity before executing |
| **Resyncable** | Fresh proofs can update/revoke the receipt |

**Important:** The receipt is NOT the original asset. It is a timestamped snapshot proof. Ethereum remains the source of truth.

---

## Double-Representation Risk

**Tier 1 (shipped):** Receipt is a timestamped snapshot proof, not a live-synced claim. Documented limitation: the receipt reflects ownership at the time of proof, not continuously.

**Tier 2 (designed):** Re-verification function allowing any holder to resubmit a fresh Attestcoin proof. Stale receipt flagging if Ethereum-side state changed.

---

## Critical Security Notes

1. **The precompile does NOT check transaction success.** It proves inclusion only. We check receipt status ourselves.
2. **ChainKey is NOT the EVM chainId.** Sepolia = chainKey 1 (not 11155111).
3. **Proofs expire.** Fetch fresh and submit promptly.
4. **`verify()` reverts on failure; it never returns false.**

---

## Deployed Contracts

| Contract | Chain | Address |
|---|---|---|
| PretendAssetShare | Sepolia | `0x2733FD9C5D6fBF7d3519a2e36ec530E52cd536c7` |
| OwnershipVerifier (ASC) | Creditcoin Testnet | `0xb67671950f7dF3a950272A6a16F0E350EC9C10af` |
| VerifiedShare (Receipt) | Creditcoin Testnet | `0xaDc10fb365d504214Ae54F929C8aC837E84B2fED` |

| Transaction | Chain | Hash |
|---|---|---|
| Asset Mint | Sepolia | `0xd5ce04f7a1ffc4db3b5e8fe5db1f39eb97a7243e8af36e3f63a3eca3afe4ef93` |
| Proof Verified + Receipt Minted | Creditcoin | `0xe825787f8eb5c59082cdedffbc7edb4cc5c0d901180db35b9d96ae1655304a21` |

---

## Setup & Running

```bash
cd attestcoin-rwa
npm install
cp .env.example .env  # fill in your keys

# Compile
forge build

# Deploy (Creditcoin)
npx tsx scripts/deploy_all.ts

# Full proof flow
npx tsx scripts/full_proof_flow_v2.ts
```

---

## Tech Stack

| Component | Technology |
|---|---|
| Source chain | Solidity, ERC-721, Sepolia |
| Attestcoin SDK | `@gluwa/usc-sdk` v0.18.0, TypeScript |
| Destination contracts | Solidity, Creditcoin CC3 Testnet |
| Block prover | Native precompile at `0x0FD2` |
| Frontend | HTML/JS, ethers.js v6 |
| Build tools | Foundry v1.8.1, npm |

---

## Demo Script (60-90 seconds)

1. **"Here's a wallet that owns a share of an asset on Ethereum."** → Show Sepolia mint TX
2. **"Watch us prove that ownership to Creditcoin — live — using Attestcoin's attestor network."** → Show proof generation
3. **"No bridge held our funds. No oracle we had to trust. The proof itself is the security."** → Show receipt minted on Creditcoin
4. **"The receipt is transferable — trade the verified claim without touching the original asset."** → Show receipt validity
5. **"Ethereum remains the source of truth. Changes on Ethereum can be re-proven and reflected on Creditcoin."** → State the one-way sync direction

---

## Deliverables Checklist

- [x] Working Attestcoin Protocol integration code
- [x] Technical documentation (this file)
- [x] Mock RWA asset contract (PretendAssetShare.sol)
- [x] ASC contract with multi-condition verification + receipt minting
- [x] VerifiedShare receipt token (ERC-721, transferable, staleness tracking)
- [x] Proof generation + submission script (SDK integration)
- [x] Resync support (Ethereum → Creditcoin direction)
- [x] Deployed to testnet (Sepolia + Creditcoin)
- [x] End-to-end verified: mint → prove → receipt mint → state change
- [ ] Frontend wired to live on-chain data
- [ ] Demo video recorded

---

## License

MIT
