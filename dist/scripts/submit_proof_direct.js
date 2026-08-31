"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * submit_proof_direct.ts
 * Reads the pre-fetched proof from /tmp/proof.json and submits it to the ASC.
 */
require("dotenv/config");
const ethers_1 = require("ethers");
const fs = __importStar(require("fs"));
async function main() {
    const rpcUrl = process.env.CREDITCOIN_RPC_URL;
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const ascAddress = process.env.CREDITCOIN_ASC_CONTRACT;
    const proof = JSON.parse(fs.readFileSync("/tmp/proof.json", "utf8"));
    console.log("═══════════════════════════════════════════════");
    console.log("  Submitting Proof to Creditcoin");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Chain Key: ${proof.chainKey}`);
    console.log(`  Block: ${proof.headerNumber}`);
    console.log(`  TX Hash: ${proof.txHash}`);
    console.log(`  TX Index: ${proof.txIndex}`);
    console.log("═══════════════════════════════════════════════\n");
    const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers_1.ethers.Wallet(privateKey, provider);
    const walletAddress = await signer.getAddress();
    const ASC_ABI = [
        "function submitOwnershipProof(uint64 chainKey, uint64 height, bytes encodedTx, bytes merkleProof, bytes continuityProof, address wallet, uint256 assetId) external",
        "function isVerified(address wallet, uint256 assetId) view returns (bool)",
        "function getProofDetails(address wallet, uint256 assetId) view returns (tuple(bool owned, bool mintTimeValid, bool fromApprovedMinter))",
    ];
    const asc = new ethers_1.ethers.Contract(ascAddress, ASC_ABI, signer);
    // Check before state
    const beforeVerified = await asc.isVerified(walletAddress, 0n);
    console.log(`  BEFORE: verified = ${beforeVerified}`);
    // Submit proof
    console.log("\n  Submitting ownership proof...");
    const tx = await asc.submitOwnershipProof(proof.chainKey, proof.headerNumber, proof.txBytes, JSON.stringify(proof.merkleProof), JSON.stringify(proof.continuityProof), walletAddress, 0n // assetId = 0
    );
    console.log(`  TX sent: ${tx.hash}`);
    console.log("  Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`  Confirmed in block ${receipt.blockNumber}`);
    console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
    // Check after state
    const afterVerified = await asc.isVerified(walletAddress, 0n);
    const details = await asc.getProofDetails(walletAddress, 0n);
    console.log("\n═══════════════════════════════════════════════");
    console.log("  AFTER:");
    console.log(`  Verified: ${afterVerified ? "✅ YES" : "❌ NO"}`);
    console.log(`  Proof Details:`);
    console.log(`    Owned:             ${details.owned ? "✅" : "❌"}`);
    console.log(`    Mint Time Valid:   ${details.mintTimeValid ? "✅" : "❌"}`);
    console.log(`    Approved Minter:   ${details.fromApprovedMinter ? "✅" : "❌"}`);
    console.log("═══════════════════════════════════════════════");
    console.log(`  Explorer: https://creditcoin-testnet.blockscout.com/tx/${receipt.hash}`);
}
main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
