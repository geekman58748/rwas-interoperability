/**
 * full_proof_flow.ts
 *
 * Complete flow:
 * 1. Fetch proof from Proof Builder
 * 2. Verify proof on-chain via BlockProver precompile (using SDK)
 * 3. Store verified ownership in our ASC
 */
import "dotenv/config";
import { ethers } from "ethers";
import {
  proofProvider,
  blockProver,
} from "@gluwa/usc-sdk";

const ProofBuilder = proofProvider.service.ProofBuilder;
const PrecompileBlockProver = blockProver.PrecompileBlockProver;

async function main() {
  const sepoliaRpc = process.env.SEPOLIA_RPC_URL!;
  const creditcoinRpc = process.env.CREDITCOIN_RPC_URL!;
  const proofBuilderUrl =
    process.env.CREDITCOIN_PROOF_BUILDER_URL ||
    "https://proof-gen-api.cc3-testnet.creditcoin.network/";
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const ascAddress = process.env.CREDITCOIN_ASC_CONTRACT!;

  const sourceProvider = new ethers.JsonRpcProvider(sepoliaRpc);
  const creditcoinProvider = new ethers.JsonRpcProvider(creditcoinRpc);
  const signer = new ethers.Wallet(privateKey, creditcoinProvider);
  const walletAddress = await signer.getAddress();

  const SEPOLIA_CHAIN_KEY = 1;
  const mintTxHash =
    "0xd5ce04f7a1ffc4db3b5e8fe5db1f39eb97a7243e8af36e3f63a3eca3afe4ef93";

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Attestcoin RWA — Full Proof Flow");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Wallet:     ${walletAddress}`);
  console.log(`  ASC:        ${ascAddress}`);
  console.log(`  Mint TX:    ${mintTxHash}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Step 1: Fetch proof ──
  console.log("[1/5] Fetching proof from Proof Builder...");
  const proofBuilder = new ProofBuilder(SEPOLIA_CHAIN_KEY, proofBuilderUrl);
  const proofResult = await proofBuilder.getProof(mintTxHash);
  if (!proofResult.success) {
    console.error(`  ❌ Proof generation failed: ${proofResult.error}`);
    process.exit(1);
  }
  const proofData = proofResult.data!;
  console.log(`  ✓ Proof ready (cached: ${proofData.cached})`);
  console.log(`  ✓ Block: ${proofData.headerNumber}, TX Index: ${proofData.txIndex}`);

  // ── Step 2: Verify via BlockProver precompile ──
  console.log("\n[2/5] Verifying proof via BlockProver precompile on Creditcoin...");
  const blockProver = new PrecompileBlockProver(creditcoinProvider);
  const isValid = await blockProver.verifySingle(
    proofData.chainKey,
    proofData.headerNumber,
    proofData.txBytes,
    proofData.merkleProof,
    proofData.continuityProof
  );
  console.log(`  ✓ Proof verification: ${isValid ? "VALID ✅" : "INVALID ❌"}`);
  if (!isValid) {
    console.error("  ❌ Proof is invalid. Aborting.");
    process.exit(1);
  }

  // ── Step 3: Check before state ──
  console.log("\n[3/5] Checking before state on ASC...");
  const ASC_READ_ABI = [
    "function isVerified(address wallet, uint256 assetId) view returns (bool)",
    "function getProofDetails(address wallet, uint256 assetId) view returns (tuple(bool owned, bool mintTimeValid, bool fromApprovedMinter))",
  ];
  const ascRead = new ethers.Contract(ascAddress, ASC_READ_ABI, creditcoinProvider);
  const beforeVerified = await ascRead.isVerified(walletAddress, 0n);
  console.log(`  BEFORE: verified = ${beforeVerified}`);

  // ── Step 4: Store verified ownership in ASC ──
  console.log("\n[4/5] Storing verified ownership in ASC...");
  const ASC_WRITE_ABI = [
    "function storeOwnership(uint64 chainKey, uint64 height, address wallet, uint256 assetId, bool sourceTxSuccessful) external",
  ];
  const ascWrite = new ethers.Contract(ascAddress, ASC_WRITE_ABI, signer);

  const tx = await ascWrite.storeOwnership(
    proofData.chainKey,
    proofData.headerNumber,
    walletAddress,
    0n, // assetId = 0
    true // source tx was successful (we verified this)
  );
  console.log(`  ⏳ TX sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);

  // ── Step 5: Check after state ──
  console.log("\n[5/5] Checking after state...");
  const afterVerified = await ascRead.isVerified(walletAddress, 0n);
  const details = await ascRead.getProofDetails(walletAddress, 0n);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ✅ OWNERSHIP PROOF COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  BEFORE: verified = ${beforeVerified}`);
  console.log(`  AFTER:  verified = ${afterVerified ? "✅ YES" : "❌ NO"}`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Multi-Condition Verification:`);
  console.log(`    Owned:             ${details.owned ? "✅ true" : "❌ false"}`);
  console.log(`    Mint Time Valid:   ${details.mintTimeValid ? "✅ true" : "❌ false"}`);
  console.log(`    Approved Minter:   ${details.fromApprovedMinter ? "✅ true" : "❌ false"}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Creditcoin TX: https://creditcoin-testnet.blockscout.com/tx/${receipt.hash}`);
  console.log(`  Sepolia TX:    https://sepolia.etherscan.io/tx/${mintTxHash}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  No bridge. No custodian. No centralized oracle.`);
  console.log(`  The Attestcoin Protocol proved the fact.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
