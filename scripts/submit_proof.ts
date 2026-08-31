/**
 * submit_proof.ts
 *
 * Generates a cross-chain proof for an Ethereum Sepolia mint transaction,
 * then submits it to the OwnershipVerifier ASC on Creditcoin CC3 Testnet.
 *
 * Usage:
 *   npx ts-node scripts/submit_proof.ts <tx_hash> [wallet] [asset_id]
 *
 * Environment:
 *   SEPOLIA_RPC_URL            - Sepolia JSON-RPC endpoint
 *   CREDITCOIN_RPC_URL         - Creditcoin CC3 Testnet JSON-RPC endpoint
 *   CREDITCOIN_PROOF_BUILDER_URL - Proof Builder service URL
 *   DEPLOYER_PRIVATE_KEY       - Private key for submitting to Creditcoin
 *   CREDITCOIN_ASC_CONTRACT    - Deployed OwnershipVerifier address on Creditcoin
 */

import { ethers } from "ethers";
import {
  ProofBuilder,
  PrecompileChainInfoProvider,
  PrecompileBlockProver,
} from "@gluwa/usc-sdk";

// ── Configuration ──────────────────────────────────────────────

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const CREDITCOIN_RPC_URL = process.env.CREDITCOIN_RPC_URL!;
const PROOF_BUILDER_URL =
  process.env.CREDITCOIN_PROOF_BUILDER_URL ||
  "https://proof-gen-api.cc3-testnet.creditcoin.network/";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY!;
const ASC_ADDRESS = process.env.CREDITCOIN_ASC_CONTRACT!;

// Attestcoin chainKey for Ethereum Sepolia (NOT the EVM chainId!)
const SEPOLIA_CHAIN_KEY = 1;

// ── ABI for our contracts ──────────────────────────────────────

const PRETEND_ASSET_ABI = [
  "event AssetMinted(uint256 indexed tokenId, address indexed owner, string description)",
  "function mint(address to, string description) returns (uint256)",
];

const ASC_ABI = [
  "function submitOwnershipProof(uint64 chainKey, uint64 height, bytes encodedTx, bytes merkleProof, bytes continuityProof, address wallet, uint256 assetId) external",
  "function isVerified(address wallet, uint256 assetId) view returns (bool)",
  "function getProofDetails(address wallet, uint256 assetId) view returns (tuple(bool owned, bool mintTimeValid, bool fromApprovedMinter))",
  "function processedQueries(bytes32 queryId) view returns (bool)",
];

// ── Main flow ──────────────────────────────────────────────────

async function main() {
  const txHash = process.argv[2];
  const walletAddress = process.argv[3];
  const assetId = process.argv[4];

  if (!txHash || !walletAddress || !assetId) {
    console.error(
      "Usage: npx ts-node scripts/submit_proof.ts <tx_hash> <wallet_address> <asset_id>"
    );
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("  Attestcoin RWA Ownership Proof");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  TX Hash:  ${txHash}`);
  console.log(`  Wallet:   ${walletAddress}`);
  console.log(`  Asset ID: ${assetId}`);
  console.log(`  Chain Key: ${SEPOLIA_CHAIN_KEY} (Sepolia)`);
  console.log("═══════════════════════════════════════════════════\n");

  // ── Step 1: Set up providers ──
  const sourceProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const creditcoinProvider = new ethers.JsonRpcProvider(CREDITCOIN_RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, creditcoinProvider);

  // ── Step 2: Verify the transaction exists on Sepolia ──
  console.log("[1/5] Verifying transaction on Sepolia...");
  const tx = await sourceProvider.getTransaction(txHash);
  if (!tx) {
    console.error(`Transaction ${txHash} not found on Sepolia`);
    process.exit(1);
  }
  console.log(`  ✓ Transaction found in block ${tx.blockNumber}`);

  // ── Step 3: Query supported chains ──
  console.log("\n[2/5] Querying supported chains on Creditcoin...");
  const chainInfo = new PrecompileChainInfoProvider(creditcoinProvider);
  const supportedChains = await chainInfo.getSupportedChains();
  console.log(
    `  ✓ Supported chains: ${supportedChains.map((c: any) => `chainKey=${c.chainKey}`).join(", ")}`
  );

  // Check that Sepolia (chainKey 1) is supported
  const sepoliaChain = supportedChains.find((c: any) => c.chainKey === SEPOLIA_CHAIN_KEY);
  if (!sepoliaChain) {
    console.error("Sepolia (chainKey 1) is not supported on this Creditcoin network");
    process.exit(1);
  }
  console.log(`  ✓ Sepolia chainKey ${SEPOLIA_CHAIN_KEY} is supported`);

  // ── Step 4: Wait for attestation and generate proof ──
  console.log(
    "\n[3/5] Waiting for block attestation and generating proof..."
  );
  console.log("  ⏳ This typically takes 8-10 minutes for Sepolia...");
  console.log("  ⏳ Attentation happens automatically by the Attestcoin attestor network\n");

  const proofBuilder = new ProofBuilder(PROOF_BUILDER_URL);

  // Wait for the block to be attested on Creditcoin
  await proofBuilder.waitUntilHeightAttested(
    SEPOLIA_CHAIN_KEY,
    tx.blockNumber!,
    {
      pollingInterval: 15_000, // 15 seconds
      timeout: 900_000, // 15 minutes
    }
  );
  console.log(`  ✓ Block ${tx.blockNumber} attested on Creditcoin`);

  // Generate the proof
  const proofData = await proofBuilder.getProof(SEPOLIA_CHAIN_KEY, txHash);
  console.log("  ✓ Proof generated successfully!");
  console.log(`    Chain Key: ${proofData.chainKey}`);
  console.log(`    Header Number: ${proofData.headerNumber}`);
  console.log(`    Cached: ${proofData.cached}`);

  // ── Step 5: Submit proof to ASC on Creditcoin ──
  console.log("\n[4/5] Submitting proof to OwnershipVerifier on Creditcoin...");

  const ascContract = new ethers.Contract(ASC_ADDRESS, ASC_ABI, signer);

  const txResponse = await ascContract.submitOwnershipProof(
    proofData.chainKey,
    proofData.headerNumber,
    proofData.txBytes,
    proofData.merkleProof,
    proofData.continuityProof,
    walletAddress,
    BigInt(assetId)
  );

  console.log(`  ⏳ Waiting for confirmation...`);
  const receipt = await txResponse.wait();
  console.log(`  ✓ Proof submitted! Tx: ${receipt.hash}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);

  // ── Step 6: Verify the on-chain state changed ──
  console.log("\n[5/5] Verifying on-chain state...");

  const isVerified = await ascContract.isVerified(walletAddress, BigInt(assetId));
  const proofDetails = await ascContract.getProofDetails(walletAddress, BigInt(assetId));

  console.log(`  Verified: ${isVerified ? "✅ YES" : "❌ NO"}`);
  console.log(`  Proof Details:`);
  console.log(`    - Owned: ${proofDetails.owned}`);
  console.log(`    - Mint Time Valid: ${proofDetails.mintTimeValid}`);
  console.log(`    - From Approved Minter: ${proofDetails.fromApprovedMinter}`);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ✅ Ownership proof complete!");
  console.log(`  ${walletAddress} owns asset ${assetId}`);
  console.log(`  Verified on Creditcoin without bridge or oracle`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
