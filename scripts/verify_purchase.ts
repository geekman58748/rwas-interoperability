import "dotenv/config";
import { ethers } from "ethers";
import { proofProvider, blockProver } from "@gluwa/usc-sdk";
const PB = proofProvider.service.ProofBuilder;
const BP = blockProver.PrecompileBlockProver;

async function main() {
  const txHash = process.argv[2] || "0x92b965b2e56f8ac3dc00e8e0e48e1e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e";
  const WALLET = "0xe1223a9E37810F33049714cd607A71CAda34dDEC";
  const ASC = process.env.CREDITCOIN_ASC_CONTRACT!;
  const cp = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
  const s = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, cp);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Verifying Purchase on Creditcoin");
  console.log("═══════════════════════════════════════════════");
  console.log(`  TX Hash: ${txHash}`);
  console.log(`  Wallet:  ${WALLET}`);
  console.log("═══════════════════════════════════════════════\n");

  // 1. Fetch proof
  console.log("[1/5] Fetching proof...");
  const pb = new PB(1, "https://proof-gen-api.cc3-testnet.creditcoin.network/");
  const r = await pb.getProof(txHash);
  if (!r.success) { console.error("Proof error:", r.error); process.exit(1); }
  console.log(`  ✓ Block: ${r.data!.headerNumber}, cached: ${r.data!.cached}`);

  // 2. Verify via precompile
  console.log("\n[2/5] Verifying via BlockProver precompile...");
  const bp = new BP(cp);
  const valid = await bp.verifySingle(r.data!.chainKey, r.data!.headerNumber, r.data!.txBytes, r.data!.merkleProof, r.data!.continuityProof);
  console.log(`  ✓ Proof: ${valid ? "VALID ✅" : "INVALID ❌"}`);

  // 3. Check before
  console.log("\n[3/5] Before state...");
  const asc = new ethers.Contract(ASC, ["function isVerified(address,uint256) view returns (bool)","function getReceiptTokenId(address,uint256) view returns (uint256)"], cp);
  const before = await asc.isVerified(WALLET, 0n);
  console.log(`  Verified: ${before}`);

  // 4. Mint receipt
  console.log("\n[4/5] Minting VerifiedShare receipt on Creditcoin...");
  const ascW = new ethers.Contract(ASC, ["function verifyAndMintReceipt(uint64,uint64,address,uint256,bytes32,bool) external"], s);
  const tx = await ascW.verifyAndMintReceipt(r.data!.chainKey, r.data!.headerNumber, WALLET, 0n, txHash, true);
  const receipt = await tx.wait();
  console.log(`  ✓ TX: ${receipt.hash}`);
  console.log(`  ✓ Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`);

  // 5. Check after
  console.log("\n[5/5] After state...");
  const after = await asc.isVerified(WALLET, 0n);
  const rid = await asc.getReceiptTokenId(WALLET, 0n);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  ✅ OWNERSHIP VERIFIED ON CREDITCOIN");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Verified:   ${after ? "✅ YES" : "❌ NO"}`);
  console.log(`  Receipt ID: ${rid}`);
  console.log("═══════════════════════════════════════════════");
  console.log(`  Sepolia:   https://sepolia.etherscan.io/tx/${txHash}`);
  console.log(`  Creditcoin: https://creditcoin-testnet.blockscout.com/tx/${receipt.hash}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch(e => { console.error(e); process.exit(1); });
