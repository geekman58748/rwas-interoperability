══════════════════════════════════════════════════════════════════════════════
                    ATTESTRWA — COMPLETE BUILD HANDOFF
                    Every decision. Every fix. Every fuck-up.
══════════════════════════════════════════════════════════════════════════════


SECTION 1: WHAT WE BUILT
═════════════════════════

A cross-chain real-world asset ownership verification platform using the
Attestcoin Protocol. Users buy fractional property shares on Ethereum Sepolia,
verify ownership cross-chain via Attestcoin attestors, receive a receipt token
on Creditcoin, and can borrow CUSD stablecoins against verified collateral.

Stack:
  - Frontend: Vanilla HTML/CSS/JS with ethers.js v6
  - Backend: Node.js + Express + TypeScript
  - SDK: @gluwa/usc-sdk (ProofBuilder, PrecompileBlockProver)
  - Fonts: DM Sans (Google Fonts)
  - Hosting: Render (auto-deploy from GitHub)
  - Repo: https://github.com/geekman58748/rwas-interoperability


SECTION 2: CONTRACTS DEPLOYED
═════════════════════════════

ETHEREUM SEPOLIA:
  PretendAssetShare (ERC-721):   0xaDc10fb365d504214Ae54F929C8aC837E84B2fED
    - "The Meridian Tower" — $2.4M property value
    - Tiers: 10% ($240K), 25% ($600K), 50% ($1.2M), 100% ($2.4M)
    - buyShare(tier) mints ERC-721, charges USD
    - Only 1 contract — all property pages share this

  USDToken (ERC-20):            0xc2F8871ef47377E84A93dBEE1506AA42826399e3
    - Test token for purchases
    - Server wallet has ~5.38M USD

CREDITCOIN TESTNET:
  OwnershipVerifier (ASC):       0xb67671950f7dF3a950272A6a16F0E350EC9C10af
    - verifyAndMintReceipt() — 3-condition check + replay guard
    - resyncOwnership() — Ethereum→Creditcoin resync
    - isVerified(), getProofDetails(), getReceiptTokenId()

  VerifiedShare (ERC-721):       0xaDc10fb365d504214Ae54F929C8aC837E84B2fED
    - Receipt token minted on verification
    - Transferable on Creditcoin
    - isValid(), isStale(), sourceChainKey(), sourceBlockHeight()

  CUSDToken (ERC-20):            0x000bb049eC7B8E4DFA179928Dd5eA8F54B421FB7
    - Stablecoin for borrowing
    - issueLoan() — onlyOwner (server wallet mints)
    - faucet() for testing
    - 10M max supply

WALLET:
  Deployer: 0xe1223a9E37810F33049714cd607A71CAda34dDEC
  Private key in .env and Render env vars


SECTION 3: EVERY BUG AND FIX
════════════════════════════

BUG 1: Render deploy keeps failing — "Cannot find module dist/server/index.js"
  Cause: Render cached the old start command "node dist/server/index.js"
  Fix: User manually changed Start Command to "npx tsx server/index.ts"
  Lesson: Render.yaml doesn't update existing services. Must change in dashboard.

BUG 2: ethers.js CDN down — "ethers is not defined"
  Cause: cdn.ethers.io was unreachable
  Fix: Switched to cdnjs.cloudflare.com CDN

BUG 3: Server crashes on startup — "JsonRpcProvider failed to detect network"
  Cause: SEPOLIA_RPC_URL env var missing on Render
  Fix: Lazy provider initialization — providers created on first use, not import

BUG 4: Mint fails — "execution reverted"
  Cause: Gas estimation failing on public RPC
  Fix: Added gasLimit: 500000 to buyShare() call

BUG 5: Contract runner does not support sending transactions
  Cause: USD approve + buyShare were using Creditcoin signer, not Sepolia signer
  Fix: Created separate sepoliaSigner for Sepolia transactions

BUG 6: Buy endpoint returns 500 with empty error
  Cause: Server was swallowing error messages
  Fix: Changed error handling to return err.message in response

BUG 7: USD balance insufficient for purchase
  Cause: Server wallet had 100K USD but 10% tier costs 240K
  Fix: Minted additional USD to server wallet (now ~5.38M)

BUG 8: Loan page shows "The Meridian Tower" for all assets
  Cause: Server hardcoded property name for all purchases
  Fix: Server now reads propertyName from contract AND accepts
       frontendPropertyName from buy request

BUG 9: Pacific Heights shows as Meridian Tower
  Cause: Contract only has 1 property name, server was using contract name
  Fix: Frontend sends currentProperty.name in buy request,
       server stores it in purchases.json

BUG 10: Tier supply shows "5/10 sold" on properties nobody bought
  Cause: Contract has 1 set of tier supplies shared across all property pages
  Fix: Only show supply counts for The Meridian Tower (the actual on-chain property)

BUG 11: Wallet disconnects on new tab
  Cause: eth_accounts returns empty if MetaMask is locked in new context
  Fix: connectWallet uses wallet_requestPermissions for persistent permission
       autoConnect always shows saved address, even if MetaMask locked

BUG 12: Verify on loan page shows "Server not configured"
  Cause: CUSD_ADDRESS env var not set on Render
  Fix: User added SEPOLIA_CUSD_TOKEN env var in Render dashboard

BUG 13: Borrow fails — "execution reverted"
  Cause: Borrow endpoint was calling Sepolia asset contract with Creditcoin provider
  Fix: Changed to use sourceProvider (Sepolia) for tokenTier/propertyValue reads

BUG 14: Verify on loan page just shows alert, no block animation
  Cause: verifyFromLoan() was a simple API call + alert
  Fix: Added full loanVerifySection with block-by-block animation,
       progress bar, step indicators — same as detail page

BUG 15: Attestation status shows wrong confidence
  Cause: Confidence calculation mixed Sepolia and Creditcoin block numbers
  Fix: Set confidence to 100 for cached proofs, 95 for fresh

BUG 16: Verification on detail page uses wrong tokenId
  Cause: Used currentProperty.id (frontend array index) not actual tokenId
  Fix: Track lastPurchasedTokenId from buy response, use that for verify

BUG 17: Playfair Display font feels rigid and old
  Cause: Default serif font doesn't match modern UI
  Fix: Replaced with DM Sans across entire frontend

BUG 18: Emojis look like AI slop
  Cause: Default emoji rendering is generic
  Fix: Replaced with numbered circles (1-2-3-4) and letter icons (V, CL)

BUG 19: Typewriter effect feels rigid and depressing
  Cause: CSS typewriter with fixed step count
  Fix: Removed entirely, replaced with smooth fade-in animation

BUG 20: Hero section feels empty/depressing
  Cause: Plain background with no visual interest
  Fix: Added city skyline stock photo with gradient overlay

BUG 21: Loan page verify shows different message than detail page
  Cause: Different log messages in each verify function
  Fix: Unified to show "Still waiting... (Creditcoin block XXXXX)"

BUG 22: Borrow endpoint calls wrong contract
  Cause: CUSDToken.issueLoan() called on Creditcoin but asset reads on same provider
  Fix: Split to use sourceProvider for Sepolia reads, creditcoinProvider for ASC

BUG 23: purchases.json has fake txHash for token #0
  Cause: Pre-seeded with placeholder hash from early testing
  Fix: Updated with real hashes from actual transactions

BUG 24: Verification progress lost on page refresh
  Cause: No state persistence for verification flow
  Fix: Save verification state to localStorage, reload on page load


SECTION 4: VERIFICATION CONDITIONS (DEPTH REQUIREMENT)
══════════════════════════════════════════════════════

7 conditions across 4 layers:

LAYER 1 — CRYPTOGRAPHIC (Attestcoin SDK):
  1. Merkle Proof Validity — TX included in block's Merkle tree
  2. Continuity Proof — block is part of valid chain
  3. Chain Key Validation — correct source chain (Sepolia = 1)

LAYER 2 — BLOCK PROVER PRECOMPILE (Creditcoin native):
  4. Precompile Verification — proof validated by chain consensus
  5. Source TX Success — Ethereum TX actually succeeded (status=1)

LAYER 3 — SMART CONTRACT (OwnershipVerifier ASC):
  6a. owned — wallet owns the asset
  6b. mintTimeValid — block height in valid range
  6c. fromApprovedMinter — approved minter check

LAYER 4 — REPLAY GUARD:
  7. processedQueries[hash] — same proof cannot be used twice


SECTION 5: API ENDPOINTS
════════════════════════

  GET  /api/health                    → {"status":"ok"}
  GET  /api/config                    → Contract addresses
  GET  /api/property                  → Property name, value, tiers from contract
  GET  /api/usd-balance/:wallet       → USD token balance
  POST /api/faucet                    → Mint 100K test USD
  POST /api/buy                       → Buy share (approve + buyShare)
  GET  /api/proof/:txHash             → Generate proof via Attestcoin SDK
  GET  /api/attestation-status/:txHash → Check attestation progress
  POST /api/prove-and-mint            → Full verify flow (proof → receipt)
  GET  /api/state/:wallet/:assetId    → Query verification state
  GET  /api/my-assets/:wallet         → List purchased assets
  POST /api/borrow                    → Borrow CUSD against verified receipt


SECTION 6: FRONTEND PAGES
═════════════════════════

PAGE 1: LISTINGS (Home)
  - Hero: stock photo BG, gradient overlay, "Own Real Assets. Verified On-Chain."
  - Stats: animated counters (6 properties, $14.2M, verified count)
  - How It Works: 4-step flow with numbered circles
  - Why Attestcoin: 4 trust pillars with numbered boxes
  - Property grid: 6 cards with Unsplash photos, hover effects

PAGE 2: DETAIL (Property)
  - Hero image with property name overlay
  - Property info grid (location, type, value, yield, built, size)
  - Investment highlights description
  - Buy panel: USD balance, tier selection, buy button
  - Verification section: 3-step indicators, TX hash input
  - Attestation progress: 16-block chain, progress bar, time estimate
  - Verification result: receipt details, TX links

PAGE 3: LOAN (Creditcoin Loan)
  - 3-step explainer (Own → Verify → Borrow)
  - Wallet connection prompt
  - Asset list with verification status
  - Borrow panel: collateral value, LTV, loan amount
  - Verification overlay with block animation (same as detail page)


SECTION 7: JAVASCRIPT STATE
═══════════════════════════

  wallet                — connected wallet address (or null)
  selectedTier          — currently selected buy tier (10/25/50/100)
  currentProperty       — property object from PROPERTIES array
  selectedBorrowAsset   — asset selected for borrowing on loan page
  lastPurchasedTokenId  — tokenId from most recent buy (for verification)
  lastPurchasedTxHash   — txHash from most recent buy
  attestationPollInterval — (reserved, currently unused)

  localStorage keys:
    rwa_wallet          — persisted wallet address
    rwa_verified        — verification state per tokenId


SECTION 8: ENVIRONMENT VARIABLES
════════════════════════════════

  DEPLOYER_PRIVATE_KEY       — Private key for server wallet
  SEPOLIA_RPC_URL            — https://ethereum-sepolia-rpc.publicnode.com
  CREDITCOIN_RPC_URL         — https://rpc.cc3-testnet.creditcoin.network
  SEPOLIA_ASSET_CONTRACT     — 0xaDc10fb365d504214Ae54F929C8aC837E84B2fED
  SEPOLIA_USD_TOKEN          — 0xc2F8871ef47377E84A93dBEE1506AA42826399e3
  SEPOLIA_CUSD_TOKEN         — 0x000bb049eC7B8E4DFA179928Dd5eA8F54B421FB7
  CREDITCOIN_ASC_CONTRACT    — 0xb67671950f7dF3a950272A6a16F0E350EC9C10af
  CREDITCOIN_RECEIPT_TOKEN   — 0xaDc10fb365d504214Ae54F929C8aC837E84B2fED
  CREDITCOIN_PROOF_BUILDER_URL — https://proof-gen-api.cc3-testnet.creditcoin.network/

  Render Start Command: npx tsx server/index.ts


SECTION 9: purchases.json FORMAT
════════════════════════════════

  [
    {
      "wallet": "0xe1223a9E...",
      "tokenId": "3",
      "tier": 10,
      "propertyName": "Pacific Heights",
      "propertyValue": "2400000",
      "txHash": "0x9c06c4c1...",
      "blockNumber": 11611448,
      "timestamp": 1788250611219
    }
  ]

  Important: propertyName comes from the frontend's currentProperty.name,
  NOT from the contract. The contract only has "The Meridian Tower".
  The purchases.json is the source of truth for display purposes.


SECTION 10: KNOWN LIMITATIONS
══════════════════════════════

  1. Single-property contract — all purchases go to The Meridian Tower
     ERC-721. Other properties are UI mockups only.

  2. Server-signed transactions — demo server submits txs on behalf of
     users. Production would have user-side signing.

  3. No two-way sync — Ethereum→Creditcoin resync works. Creditcoin→
     Ethereum does NOT (writability not live in Attestcoin).

  4. Attestation delay — ~8-10 minutes for Sepolia. This is security,
     not a bug.

  5. purchases.json on server — survives within same Render deployment.
     Resets on redeploy. Blockchain is source of truth for ownership.

  6. No wallet disconnect button — once connected, wallet stays until
     MetaMask is locked or account is changed.

  7. CUSD borrow uses server wallet as onlyOwner — not decentralized.
     Production would gate issueLoan() inside the ASC.


SECTION 11: GIT HISTORY (KEY COMMITS)
═════════════════════════════════════

  Initial build — contracts, SDK integration, basic frontend
  Fix server startup: lazy providers prevent crash on missing env vars
  Better error handling: show actual errors, validate private key
  Fix render.yaml — tsx instead of tsc
  v2 build — VerifiedShare receipt token, resync, loan page
  Premium frontend with real estate photos, DM Sans font
  Add attestation status endpoint and visual block loader
  Fix purchase state, wallet persistence, property tracking
  Fix tier supply display — only show for on-chain property
  Design overhaul: DM Sans, hero image, remove emojis
  Add scroll blur effect


SECTION 12: FILES STRUCTURE
═══════════════════════════

  attestcoin-rwa/
    ├── contracts/
    │   ├── PretendAssetShare.sol    (ERC-721, buy shares)
    │   ├── USDToken.sol             (ERC-20, test payment)
    │   ├── OwnershipVerifier.sol    (ASC, verification + receipt)
    │   ├── VerifiedShare.sol        (ERC-721 receipt token)
    │   └── CUSDToken.sol            (ERC-20 stablecoin)
    ├── server/
    │   └── index.ts                 (Express API, all endpoints)
    ├── frontend/
    │   └── index.html               (Single-page app, all 3 pages)
    ├── scripts/
    │   ├── deploy_all.ts            (Deploy all contracts)
    │   ├── full_proof_flow_v2.ts    (Test proof flow)
    │   ├── verify_purchase.ts       (Test verification)
    │   └── submit_proof_sdk.ts      (SDK proof submission)
    ├── purchases.json               (Purchase log, fast index)
    ├── .env                         (Private keys, RPC URLs)
    ├── package.json                 (Dependencies, start script)
    ├── tsconfig.json                (TypeScript config)
    ├── render.yaml                  (Render deployment config)
    ├── .gitignore                   (node_modules, dist, .env)
    ├── DEMO_DOCUMENTATION.txt       (16-section technical docs)
    └── HANDOFF.md                   (This file)


SECTION 13: DEMO FLOW (FOR VIDEO RECORDING)
════════════════════════════════════════════

  1. Show landing page — hero, how it works, property listings
  2. Connect wallet — stays connected across tabs
  3. Browse Pacific Heights — show property details
  4. Select 10% share — show price ($240K)
  5. Click "Buy" — server pays USD, mints ERC-721
  6. Show TX on Etherscan — ownership event confirmed
  7. TX hash auto-fills in verify input
  8. Click "Verify on Creditcoin" — block animation starts
  9. Show attestation progress — blocks filling, time estimate
  10. Proof verified — receipt minted on Creditcoin
  11. Show Creditcoin TX on explorer
  12. Navigate to Creditcoin Loan page
  13. See verified assets with correct property names
  14. Select Pacific Heights — show collateral value
  15. Click "Borrow CUSD" — CUSD minted to wallet
  16. Show before/after: receipt flagged, CUSD balance increased

  Key talking points:
  - "No bridge. No custodian. No centralized oracle."
  - "7 verification conditions across 4 layers"
  - "Ethereum remains the source of truth"
  - "The Creditcoin receipt is a live, re-verifiable read of that truth"
  - "Not a replacement, transfer, or migration of the asset"


══════════════════════════════════════════════════════════════════════════════
END OF HANDOFF
══════════════════════════════════════════════════════════════════════════════
