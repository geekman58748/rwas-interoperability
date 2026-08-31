/**
 * deploy_sepolia.ts
 *
 * Deploy PretendAssetShare ERC-721 to Sepolia testnet.
 * This is our mock RWA asset contract — the source chain event we prove cross-chain.
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.error("Set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deploying PretendAssetShare to Sepolia...");
  console.log(`  Deployer: ${wallet.address}`);

  // Read compiled artifact
  const artifactPath = path.join(__dirname, "../out/PretendAssetShare.sol/PretendAssetShare.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`  ✓ PretendAssetShare deployed to: ${address}`);
  console.log(`  ✓ Tx: ${contract.deploymentTransaction()?.hash}`);

  // Update .env
  const envPath = path.join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    env = env.replace(
      /SEPOLIA_ASSET_CONTRACT=.*/,
      `SEPOLIA_ASSET_CONTRACT=${address}`
    );
    fs.writeFileSync(envPath, env);
    console.log("  ✓ Updated .env with contract address");
  }

  return address;
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
