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
 * deploy_all.ts
 *
 * Deploy to Creditcoin CC3 Testnet:
 * 1. VerifiedShare receipt token (ERC-721)
 * 2. OwnershipVerifier ASC (linked to receipt token)
 */
require("dotenv/config");
const ethers_1 = require("ethers");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function main() {
    const rpcUrl = process.env.CREDITCOIN_RPC_URL;
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!rpcUrl || !privateKey) {
        console.error("Set CREDITCOIN_RPC_URL and DEPLOYER_PRIVATE_KEY in .env");
        process.exit(1);
    }
    const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers_1.ethers.Wallet(privateKey, provider);
    console.log("═══════════════════════════════════════════════");
    console.log("  Deploying to Creditcoin CC3 Testnet");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Deployer: ${signer.address}\n`);
    // ── Deploy VerifiedShare ──
    console.log("[1/2] Deploying VerifiedShare receipt token...");
    const vrsArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../out/VerifiedShare.sol/VerifiedShare.json"), "utf8"));
    const vrsFactory = new ethers_1.ethers.ContractFactory(vrsArtifact.abi, vrsArtifact.bytecode, signer);
    const vrs = await vrsFactory.deploy();
    await vrs.waitForDeployment();
    const vrsAddress = await vrs.getAddress();
    console.log(`  ✓ VerifiedShare deployed to: ${vrsAddress}`);
    // ── Deploy OwnershipVerifier ──
    console.log("\n[2/2] Deploying OwnershipVerifier ASC...");
    const ascArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../out/OwnershipVerifier.sol/OwnershipVerifier.json"), "utf8"));
    const ascFactory = new ethers_1.ethers.ContractFactory(ascArtifact.abi, ascArtifact.bytecode, signer);
    // Constructor: receiptToken, minValidBlock, maxValidBlock
    const asc = await ascFactory.deploy(vrsAddress, 0, 999999999);
    await asc.waitForDeployment();
    const ascAddress = await asc.getAddress();
    console.log(`  ✓ OwnershipVerifier deployed to: ${ascAddress}`);
    // ── Update .env ──
    const envPath = path.join(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
        let env = fs.readFileSync(envPath, "utf8");
        env = env.replace(/CREDITCOIN_ASC_CONTRACT=.*/, `CREDITCOIN_ASC_CONTRACT=${ascAddress}`);
        env = env.replace(/CREDITCOIN_RECEIPT_TOKEN=.*/, `CREDITCOIN_RECEIPT_TOKEN=${vrsAddress}`);
        if (!env.includes("CREDITCOIN_RECEIPT_TOKEN=")) {
            env += `\nCREDITCOIN_RECEIPT_TOKEN=${vrsAddress}`;
        }
        fs.writeFileSync(envPath, env);
        console.log("\n  ✓ Updated .env");
    }
    console.log("\n═══════════════════════════════════════════════");
    console.log("  ✅ Deployed!");
    console.log(`  VerifiedShare:    ${vrsAddress}`);
    console.log(`  OwnershipVerifier: ${ascAddress}`);
    console.log("═══════════════════════════════════════════════");
}
main().catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
});
