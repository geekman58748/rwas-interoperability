# AttestRWA: Borrow against your real-world assets on any chain, proven, not bridged.

> **BUIDL CTC 2026 Fall | RWA Track**

Prove real-world asset ownership occurred on Ethereum, using Attestcoin's decentralized attestor network, then let a Creditcoin contract trustlessly act on that proof, minting a transferable receipt token. No bridge, no custodian, no centralized oracle.

---

## The Problem

**Meet Mr. John.**

Mr. John is a DeFi user who loves the concept of real estate tokenization. He's seen the hype, fractional property ownership, on-chain yields, the promise of liquid real-world assets. But he's scared of bridges. Several high-profile bridge hacks have made headlines, and he's not willing to lock his assets in a custodian that could be drained overnight.

He purchases a property on Ethereum via the AttestRWA platform, excited about the 8.2% yield and the idea of owning a piece of Manhattan. But soon, he finds himself short of liquidity. He doesn't want to sell his asset or liquidate his position. And even if he wanted to borrow against it, the bridging process is impossible, Ethereum and Creditcoin are different chains with no native way to talk to each other.

**Luckily for him, AttestRWA exists.**

AttestRWA allows blockchain interoperability between Ethereum and Creditcoin using Attestcoin's attestation mechanism. Instead of bridging his asset (which would expose it to bridge risk), the platform **proves** his Ethereum ownership to a Creditcoin smart contract using cryptographic attestations. His asset stays on Ethereum, only the proof moves.

On Creditcoin, a VerifiedShare receipt is minted representing his verified claim. He can now borrow CUSD stablecoins against that receipt, his Ethereum asset never left Ethereum, and his liquidity need is solved. No bridge. No custodian. No trust assumption beyond mathematics.

**This is what AttestRWA solves: cross-chain proof of ownership without cross-chain risk.**

---

## What This Project Does

We deploy a **mock ERC-721** on Ethereum Sepolia representing fractional ownership of real-world properties. When someone purchases a share, that ownership event is **proven cross-chain** to Creditcoin using the Attestcoin Protocol. Our ASC verifies the proof and mints a **VerifiedShare receipt token** on Creditcoin, a transferable, re-verifiable claim to the Ethereum asset.

**The receipt is NOT the original asset.** Ethereum remains the source of truth. The Creditcoin receipt is a live, re-verifiable read of that truth.

### One-Sentence Pitch

> "We prove that a real-world asset ownership event occurred on Ethereum, using Attestcoin's decentralized attestor network, then let a Creditcoin contract trustlessly act on that proof, minting a transferable receipt. No bridge, no custodian, no centralized oracle."

---

## Live Demo

**No wallet needed. No gas needed. No setup needed.**

Open [rwas-interoperability.onrender.com](https://rwas-interoperability.onrender.com) in any browser, click **"Try Live Demo"** or click any property and hit **"Buy"**, the full flow executes server-side: buy → attest → verify → receipt minted.

---

## Architecture

```
ETHEREUM SEPOLIA                          CREDITCOIN TESTNET
┌──────────────────────────┐              ┌──────────────────────────────────┐
│ PretendAssetShare (ERC721)│              │ BlockProver Precompile (0x0FD2)  │
│ USDToken (ERC-20)         │              │ verify(merkle + continuity proof) │
│ buyShare(tier) → mint     │              │         ▲                        │
└───────────┬──────────────┘              │         │                        │
            │ ownership event              │ OwnershipVerifier (ASC)         │
            ▼                              │ ├─ 3-condition check            │
┌──────────────────────────┐   proofs      │ ├─ replay guard                 │
│ Attestcoin Attestors      │────────────▶ │ ├─ mint VerifiedShare receipt   │
│ (distributed network)     │              │ └─ emit OwnershipVerified       │
└──────────────────────────┘              │                                  │
                                          │ VerifiedShare (ERC-721 receipt) │
                                          │ CUSDToken (ERC-20 stablecoin)   │
                                          └──────────────────────────────────┘
```

### Flow

```
1. User buys share on Ethereum → ERC-721 minted
2. Attestcoin attestors observe Ethereum, reach consensus
3. Proof posted to Creditcoin → BlockProver precompile verifies
4. ASC checks 3 conditions → mints VerifiedShare receipt
5. User borrows CUSD against receipt collateral
```

**Ethereum remains the source of truth.** The Creditcoin receipt is a live, re-verifiable read of that truth, not a replacement, transfer, or migration of the asset.

---

## Multi-Layered Verification (7 Conditions Across 4 Layers)

| Layer | Condition | What It Proves |
|---|---|---|
| 1. Cryptographic | Merkle Proof Validity | TX is included in the block's Merkle tree |
| 1. Cryptographic | Continuity Proof | Block is part of a valid, unbroken chain |
| 1. Cryptographic | Chain Key Validation | Correct source chain (Sepolia = 1) |
| 2. Precompile | BlockProver Verification | Proof validated by chain-level consensus |
| 2. Precompile | Source TX Success | Ethereum TX actually succeeded (status=1) |
| 3. ASC | 3-Condition Check | owned + mintTimeValid + fromApprovedMinter |
| 4. Replay Guard | Query Deduplication | Same proof cannot be used twice |

**This exceeds the hackathon requirement of "at least one condition beyond a single flag check."**

---

## Deployed Contracts

| Contract | Chain | Address |
|---|---|---|
| PretendAssetShare (ERC-721) | Ethereum Sepolia | `0xaDc10fb365d504214Ae54F929C8aC837E84B2fED` |
| USDToken (ERC-20) | Ethereum Sepolia | `0xc2F8871ef47377E84A93dBEE1506AA42826399e3` |
| OwnershipVerifier (ASC) | Creditcoin Testnet | `0xb67671950f7dF3a950272A6a16F0E350EC9C10af` |
| VerifiedShare (Receipt) | Creditcoin Testnet | `0xaDc10fb365d504214Ae54F929C8aC837E84B2fED` |
| CUSDToken (Stablecoin) | Creditcoin Testnet | `0x000bb049eC7B8E4DFA179928Dd5eA8F54B421FB7` |

| Transaction | Chain | Hash |
|---|---|---|
| Asset Mint (10%) | Sepolia | `0xd5ce04f7a1ffc4db3b5e8fe5db1f39eb97a7243e8af36e3f63a3eca3afe4ef93` |
| Proof Verified + Receipt | Creditcoin | `0xe825787f8eb5c59082cdedffbc7edb4cc5c0d901180db35b9d96ae1655304a21` |
| Pacific Heights Purchase | Sepolia | `0x9c06c4c1b23e036dbb7187cc7db76df512928d16a080d321f7a3cda179295027` |
| Verification (Token #3) | Creditcoin | `0x5886a912...` |

---

## Tech Stack

| Component | Technology |
|---|---|
| Source Chain | Solidity 0.8.20, ERC-721, Sepolia |
| Destination Chain | Solidity, Creditcoin CC3 Testnet |
| Attestcoin SDK | `@gluwa/usc-sdk` (ProofBuilder, PrecompileBlockProver) |
| Block Prover | Native precompile at `0x0000...0FD2` |
| Backend | Node.js + Express + TypeScript |
| Frontend | Vanilla HTML/CSS/JS, ethers.js v6, DM Sans |
| Hosting | Render (auto-deploy from GitHub) |
| Build Tools | Foundry, npm, tsx |


---

## Why Safer Than Bridges/Oracles

| Bridge Risk | Attestcoin Proof |
|---|---|
| Asset locked in bridge | Asset stays on Ethereum |
| Bridge holds custody | No custody, only proof |
| Bridge hack = asset safe | Hack = invalid proof (asset safe) |
| Single point of failure | Distributed attestors |
| Centralized relayer | Decentralized consensus |
| Smart contract bridge | Native precompile verification |

---
## What I'd Build Next (Proposed Extension)
 
Right now the sync only goes one way: Ethereum to Creditcoin. If John sells or transfers his property share on Ethereum, we can re-run the attestation and flag his VerifiedShare receipt as stale, that part works today. But if John repays or transfers the receipt itself on Creditcoin, there's no way for that to reach back and touch the original asset on Ethereum. That's not a bug I missed, it's a hard boundary of what Attestcoin currently supports. Writability, meaning Creditcoin contracts triggering real state changes on Ethereum, is still in development on their roadmap, not live yet.
 
The moment it ships, here's exactly what I'd wire up:
 
**Bidirectional settlement.** Right now `releaseCollateral()` only updates state on Creditcoin. Once writability exists, repaying a loan on Creditcoin should be able to fire a verified instruction back to Ethereum, unlocking or transferring the original asset directly, not just flipping a flag on our side. That closes the loop instead of leaving it as a one-way mirror.
 
**Multi-chain source support.** The whole verification pipeline, Merkle proof, continuity proof, chain key check, replay guard, isn't Ethereum-specific in principle. `chainKey` is already a parameter in the proof, not a hardcoded constant. The moment Attestcoin adds a new source chain, `OwnershipVerifier` should be able to accept proofs from it with zero changes to the core verification logic, just a new allowlisted chain key. That's the whole point of building the check around a chain key parameter instead of assuming Sepolia everywhere.
 
**Batch verification for real portfolios.** Attestcoin supports batch queries sharing one continuity proof, up to 10 at a time. Right now I verify one asset at a time because that's all the demo needed. A real version of this should let someone prove ownership of an entire basket of assets across multiple source transactions in a single call, one continuity proof, multiple Merkle proofs, one mint transaction on Creditcoin instead of one per asset.
 
**Enforce the conditions I'm already computing.** I'll be straight about this one: `mintTimeValid` and `fromApprovedMinter` are computed and stored in the current contract, but nothing reverts if they come back false. That's fine for a hackathon demo where every path is a happy path, but it's the first thing I'd lock down, add the `require()` so the multi-condition check is actually a gate, not just a record.
 
None of this needs a new idea. It's the same proof-first pattern, prove it once, use it anywhere, just extended in the three directions the protocol itself is already headed: writable, multi-chain, and batched. I'm not trying to build a better bridge. I'm trying to make bridges unnecessary for this entire category of asset.

 ---
## License

MIT
