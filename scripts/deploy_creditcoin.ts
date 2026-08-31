/**
 * deploy_creditcoin.ts
 *
 * Deploy OwnershipVerifier (ASC) to Creditcoin CC3 Testnet.
 * This contract receives proofs from Attestcoin and verifies ownership.
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const rpcUrl = process.env.CREDITCOIN_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.error("Set CREDITCOIN_RPC_URL and DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deploying OwnershipVerifier to Creditcoin CC3 Testnet...");
  console.log(`  Deployer: ${wallet.address}`);

  // Read compiled artifact
  const artifactPath = path.join(__dirname, "../out/OwnershipVerifier.sol/OwnershipVerifier.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Constructor args: minValidBlock, maxValidBlock (for time window check)
  // Set to 0 and very high to accept any block for now
  const minValidBlock = 0;
  const maxValidBlock = 999999999;

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  const contract = await factory.deploy(minValidBlock, maxValidBlock);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`  ✓ OwnershipVerifier deployed to: ${address}`);
  console.log(`  ✓ Tx: ${contract.deploymentTransaction()?.hash}`);

  // Update .env
  const envPath = path.join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    env = env.replace(
      /CREDITCOIN_ASC_CONTRACT=.*/,
      `CREDITCOIN_ASC_CONTRACT=${address}`
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
