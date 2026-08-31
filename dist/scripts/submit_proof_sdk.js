"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * submit_proof_sdk.ts
 *
 * Full flow using the @gluwa/usc-sdk:
 * 1. Fetch proof from Proof Builder service
 * 2. Verify proof on-chain via BlockProver precompile (using SDK)
 * 3. Submit ownership verification to our ASC contract
 */
require("dotenv/config");
const ethers_1 = require("ethers");
const usc_sdk_1 = require("@gluwa/usc-sdk");
async function main() {
    const sepoliaRpc = process.env.SEPOLIA_RPC_URL;
    const creditcoinRpc = process.env.CREDITCOIN_RPC_URL;
    const proofBuilderUrl = process.env.CREDITCOIN_PROOF_BUILDER_URL ||
        "https://proof-gen-api.cc3-testnet.creditcoin.network/";
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const ascAddress = process.env.CREDITCOIN_ASC_CONTRACT;
    const assetAddress = process.env.SEPOLIA_ASSET_CONTRACT;
    const sourceProvider = new ethers_1.ethers.JsonRpcProvider(sepoliaRpc);
    const creditcoinProvider = new ethers_1.ethers.JsonRpcProvider(creditcoinRpc);
    const signer = new ethers_1.ethers.Wallet(privateKey, creditcoinProvider);
    const walletAddress = await signer.getAddress();
    const SEPOLIA_CHAIN_KEY = 1;
    const mintTxHash = "0xd5ce04f7a1ffc4db3b5e8fe5db1f39eb97a7243e8af36e3f63a3eca3afe4ef93";
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Attestcoin RWA — Full Proof Flow (SDK)");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Wallet:    ${walletAddress}`);
    console.log(`  Asset:     ${assetAddress}`);
    console.log(`  ASC:       ${ascAddress}`);
    console.log(`  Mint TX:   ${mintTxHash}`);
    console.log("═══════════════════════════════════════════════════════════\n");
    // ── Step 1: Check supported chains ──
    console.log("[1/6] Querying supported chains...");
    const chainInfo = new usc_sdk_1.PrecompileChainInfoProvider(creditcoinProvider);
    const chains = await chainInfo.getSupportedChains();
    const sepoliaChain = chains.find((c) => c.chainKey === SEPOLIA_CHAIN_KEY);
    console.log(`  ✓ Sepolia (chainKey ${SEPOLIA_CHAIN_KEY}): latest attested = ${sepoliaChain?.latestAttestedHeight}`);
    // ── Step 2: Fetch proof ──
    console.log("\n[2/6] Fetching proof from Proof Builder...");
    const proofBuilder = new usc_sdk_1.ProofBuilder(proofBuilderUrl);
    const proofData = await proofBuilder.getProof(SEPOLIA_CHAIN_KEY, mintTxHash);
    console.log(`  ✓ Proof generated (cached: ${proofData.cached})`);
    console.log(`  ✓ Block: ${proofData.headerNumber}, TX Index: ${proofData.txIndex}`);
    // ── Step 3: Verify proof via BlockProver precompile ──
    console.log("\n[3/6] Verifying proof on Creditcoin via BlockProver precompile...");
    const blockProver = new usc_sdk_1.PrecompileBlockProver(creditcoinProvider);
    const isValid = await blockProver.verifySingle(proofData.chainKey, proofData.headerNumber, proofData.txBytes, proofData.merkleProof, proofData.continuityProof);
    console.log(`  ✓ Proof verified: ${isValid ? "VALID ✅" : "INVALID ❌"}`);
    // ── Step 4: Check before state ──
    console.log("\n[4/6] Checking before state...");
    const ASC_ABI = [
        "function isVerified(address wallet, uint256 assetId) view returns (bool)",
        "function getProofDetails(address wallet, uint256 assetId) view returns (tuple(bool owned, bool mintTimeValid, bool fromApprovedMinter))",
        "function processedQueries(bytes32 queryId) view returns (bool)",
    ];
    const asc = new ethers_1.ethers.Contract(ascAddress, ASC_ABI, creditcoinProvider);
    const beforeVerified = await asc.isVerified(walletAddress, 0n);
    console.log(`  BEFORE: verified = ${beforeVerified}`);
    // ── Step 5: Submit to our ASC ──
    // Our ASC calls the precompile directly, so we need to ABI-encode the proof data
    // We use the SDK's ABI to encode merkleProof and continuityProof
    console.log("\n[5/6] Submitting to OwnershipVerifier ASC...");
    console.log("  ⏳ Encoding proof data and submitting transaction...");
    // Encode the proof data as bytes for our ASC's submitOwnershipProof function
    // The ASC will call the precompile internally with this data
    const merkleProofBytes = ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings)"], [proofData.merkleProof]);
    const continuityProofBytes = ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["tuple(bytes32[] blockHashes, bytes32 startHash)"], [proofData.continuityProof]);
    // Instead of submitting through our ASC (which re-encodes and calls precompile),
    // let's directly verify and store the result. This is cleaner for the demo.
    // We'll call verifyAndEmit on the precompile to get the TransactionVerified event,
    // then parse it and store in our ASC.
    // For simplicity and to ensure the demo works, let's directly call the precompile
    // via our ASC. But first, let's try the direct approach.
    // Actually, let's just use a simpler contract call approach:
    // We'll encode the proof and call our ASC
    const ASC_WRITE_ABI = [
        "function submitOwnershipProof(uint64 chainKey, uint64 height, bytes encodedTx, bytes merkleProof, bytes continuityProof, address wallet, uint256 assetId) external",
    ];
    const ascWrite = new ethers_1.ethers.Contract(ascAddress, ASC_WRITE_ABI, signer);
    const tx = await ascWrite.submitOwnershipProof(proofData.chainKey, proofData.headerNumber, proofData.txBytes, merkleProofBytes, continuityProofBytes, walletAddress, 0n);
    console.log(`  ⏳ TX sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);
    console.log(`  ✓ Gas used: ${receipt.gasUsed.toString()}`);
    // ── Step 6: Check after state ──
    console.log("\n[6/6] Checking after state...");
    const afterVerified = await asc.isVerified(walletAddress, 0n);
    const details = await asc.getProofDetails(walletAddress, 0n);
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  RESULTS");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  BEFORE: verified = ${beforeVerified}`);
    console.log(`  AFTER:  verified = ${afterVerified ? "✅ YES" : "❌ NO"}`);
    console.log(`  ─────────────────────────────────────────────────────`);
    console.log(`  Proof Details:`);
    console.log(`    Owned:             ${details.owned ? "✅ true" : "❌ false"}`);
    console.log(`    Mint Time Valid:   ${details.mintTimeValid ? "✅ true" : "❌ false"}`);
    console.log(`    Approved Minter:   ${details.fromApprovedMinter ? "✅ true" : "❌ false"}`);
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Creditcoin TX: https://creditcoin-testnet.blockscout.com/tx/${receipt.hash}`);
    console.log(`  Sepolia TX:    https://sepolia.etherscan.io/tx/${mintTxHash}`);
    console.log("═══════════════════════════════════════════════════════════");
}
main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
