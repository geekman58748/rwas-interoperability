/**
 * full_proof_flow_v2.ts
 *
 * Complete v2 flow:
 * 1. Mint asset on Sepolia (or use existing)
 * 2. Fetch proof via SDK
 * 3. Verify proof via BlockProver precompile
 * 4. Store verified ownership + mint VerifiedShare receipt
 * 5. Show before/after state change
 * 6. Demo receipt validity check
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
  const receiptAddress = process.env.CREDITCOIN_RECEIPT_TOKEN!;

  const creditcoinProvider = new ethers.JsonRpcProvider(creditcoinRpc);
  const signer = new ethers.Wallet(privateKey, creditcoinProvider);
  const walletAddress = await signer.getAddress();

  const SEPOLIA_CHAIN_KEY = 1;
  const mintTxHash =
    "0xd5ce04f7a1ffc4db3b5e8fe5db1f39eb97a7243e8af36e3f63a3eca3afe4ef93";

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Attestcoin RWA — Full Proof Flow v2 (with Receipt)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Wallet:          ${walletAddress}`);
  console.log(`  ASC:             ${ascAddress}`);
  console.log(`  Receipt Token:   ${receiptAddress}`);
  console.log(`  Mint TX:         ${mintTxHash}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Step 1: Fetch proof ──
  console.log("[1/6] Fetching proof from Proof Builder...");
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
  console.log("\n[2/6] Verifying proof via BlockProver precompile...");
  const blockProverInstance = new PrecompileBlockProver(creditcoinProvider);
  const isValid = await blockProverInstance.verifySingle(
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
  console.log("\n[3/6] Checking before state...");
  const ASC_ABI = [
    "function isVerified(address wallet, uint256 assetId) view returns (bool)",
    "function getProofDetails(address wallet, uint256 assetId) view returns (tuple(bool owned, bool mintTimeValid, bool fromApprovedMinter, uint64 chainKey, uint64 blockHeight, bytes32 txHash))",
    "function getReceiptTokenId(address wallet, uint256 assetId) view returns (uint256)",
    "function verifyAndMintReceipt(uint64 chainKey, uint64 height, address wallet, uint256 assetId, bytes32 sourceTxHash, bool sourceTxSuccessful) external",
  ];
  const asc = new ethers.Contract(ascAddress, ASC_ABI, creditcoinProvider);
  const ascWrite = new ethers.Contract(ascAddress, ASC_ABI, signer);

  const beforeVerified = await asc.isVerified(walletAddress, 0n);
  const beforeReceiptId = await asc.getReceiptTokenId(walletAddress, 0n);
  console.log(`  BEFORE: verified = ${beforeVerified}, receiptId = ${beforeReceiptId}`);

  // ── Step 4: Verify + Mint Receipt ──
  console.log("\n[4/6] Verifying ownership and minting VerifiedShare receipt...");
  const tx = await ascWrite.verifyAndMintReceipt(
    proofData.chainKey,
    proofData.headerNumber,
    walletAddress,
    0n, // assetId
    mintTxHash,
    true // source tx was successful
  );
  console.log(`  ⏳ TX sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);
  console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);

  // ── Step 5: Check after state ──
  console.log("\n[5/6] Checking after state...");
  const afterVerified = await asc.isVerified(walletAddress, 0n);
  const afterReceiptId = await asc.getReceiptTokenId(walletAddress, 0n);
  const details = await asc.getProofDetails(walletAddress, 0n);

  console.log(`  AFTER: verified = ${afterVerified}, receiptId = ${afterReceiptId}`);

  // Check receipt validity
  const VRS_ABI = [
    "function isValid(uint256 tokenId) view returns (bool)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function sourceChainKey(uint256 tokenId) view returns (uint64)",
    "function sourceBlockHeight(uint256 tokenId) view returns (uint64)",
    "function sourceTxHash(uint256 tokenId) view returns (bytes32)",
    "function mintedAt(uint256 tokenId) view returns (uint256)",
  ];
  const vrs = new ethers.Contract(receiptAddress, VRS_ABI, creditcoinProvider);
  const receiptValid = await vrs.isValid(afterReceiptId);
  const receiptOwner = await vrs.ownerOf(afterReceiptId);
  const receiptChainKey = await vrs.sourceChainKey(afterReceiptId);
  const receiptBlockHeight = await vrs.sourceBlockHeight(afterReceiptId);

  console.log(`  Receipt valid: ${receiptValid ? "✅" : "❌"}`);
  console.log(`  Receipt owner: ${receiptOwner}`);

  // ── Step 6: Output ──
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ✅ OWNERSHIP PROOF + RECEIPT MINT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  BEFORE: verified = ${beforeVerified}, receipt = ${beforeReceiptId}`);
  console.log(`  AFTER:  verified = ${afterVerified ? "✅ YES" : "❌ NO"}, receipt = ${afterReceiptId}`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Multi-Condition Verification:`);
  console.log(`    Owned:             ${details.owned ? "✅" : "❌"}`);
  console.log(`    Mint Time Valid:   ${details.mintTimeValid ? "✅" : "❌"}`);
  console.log(`    Approved Minter:   ${details.fromApprovedMinter ? "✅" : "❌"}`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Receipt Details:`);
  console.log(`    Valid:             ${receiptValid ? "✅" : "❌"}`);
  console.log(`    Chain Key:         ${receiptChainKey}`);
  console.log(`    Block Height:      ${receiptBlockHeight}`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Direction: Ethereum → Creditcoin (one-way resync)`);
  console.log(`  Ethereum remains the source of truth at all times.`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Creditcoin TX: https://creditcoin-testnet.blockscout.com/tx/${receipt.hash}`);
  console.log(`  Sepolia TX:    https://sepolia.etherscan.io/tx/${mintTxHash}`);
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
