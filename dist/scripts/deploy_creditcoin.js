"use strict";
/**
 * deploy_creditcoin.ts
 *
 * Deploy OwnershipVerifier (ASC) to Creditcoin CC3 Testnet.
 * This contract receives proofs from Attestcoin and verifies ownership.
 */
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
    const wallet = new ethers_1.ethers.Wallet(privateKey, provider);
    console.log("Deploying OwnershipVerifier to Creditcoin CC3 Testnet...");
    console.log(`  Deployer: ${wallet.address}`);
    // Read compiled artifact
    const artifactPath = path.join(__dirname, "../out/OwnershipVerifier.sol/OwnershipVerifier.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    // Constructor args: minValidBlock, maxValidBlock (for time window check)
    // Set to 0 and very high to accept any block for now
    const minValidBlock = 0;
    const maxValidBlock = 999999999;
    const factory = new ethers_1.ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy(minValidBlock, maxValidBlock);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`  ✓ OwnershipVerifier deployed to: ${address}`);
    console.log(`  ✓ Tx: ${contract.deploymentTransaction()?.hash}`);
    // Update .env
    const envPath = path.join(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
        let env = fs.readFileSync(envPath, "utf8");
        env = env.replace(/CREDITCOIN_ASC_CONTRACT=.*/, `CREDITCOIN_ASC_CONTRACT=${address}`);
        fs.writeFileSync(envPath, env);
        console.log("  ✓ Updated .env with contract address");
    }
    return address;
}
main().catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
});
