/**
 * deploy_all.ts
 *
 * Deploy to Creditcoin CC3 Testnet:
 * 1. VerifiedShare receipt token (ERC-721)
 * 2. OwnershipVerifier ASC (linked to receipt token)
 */
import "dotenv/config";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const rpcUrl = process.env.CREDITCOIN_RPC_URL!;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY!;

  if (!rpcUrl || !privateKey) {
    console.error("Set CREDITCOIN_RPC_URL and DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log("═══════════════════════════════════════════════");
  console.log("  Deploying to Creditcoin CC3 Testnet");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Deployer: ${signer.address}\n`);

  // ── Deploy VerifiedShare ──
  console.log("[1/2] Deploying VerifiedShare receipt token...");
  const vrsArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../out/VerifiedShare.sol/VerifiedShare.json"), "utf8")
  );
  const vrsFactory = new ethers.ContractFactory(vrsArtifact.abi, vrsArtifact.bytecode, signer);
  const vrs = await vrsFactory.deploy();
  await vrs.waitForDeployment();
  const vrsAddress = await vrs.getAddress();
  console.log(`  ✓ VerifiedShare deployed to: ${vrsAddress}`);

  // ── Deploy OwnershipVerifier ──
  console.log("\n[2/2] Deploying OwnershipVerifier ASC...");
  const ascArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../out/OwnershipVerifier.sol/OwnershipVerifier.json"), "utf8")
  );
  const ascFactory = new ethers.ContractFactory(ascArtifact.abi, ascArtifact.bytecode, signer);
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
