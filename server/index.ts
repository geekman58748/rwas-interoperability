/**
 * server/index.ts
 *
 * Backend API for the RWA Ownership Proof platform.
 * Handles: property listings, USD purchases, proof generation, receipt minting.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import {
  proofProvider,
  blockProver,
} from "@gluwa/usc-sdk";

const ProofBuilder = proofProvider.service.ProofBuilder;
const PrecompileBlockProver = blockProver.PrecompileBlockProver;

const app = express();
app.use(cors());
app.use(express.json());

// ── Config ──
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const CREDITCOIN_RPC = process.env.CREDITCOIN_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network";
const PROOF_BUILDER_URL = process.env.CREDITCOIN_PROOF_BUILDER_URL || "https://proof-gen-api.cc3-testnet.creditcoin.network/";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const ASC_ADDRESS = process.env.CREDITCOIN_ASC_CONTRACT;
const VRS_ADDRESS = process.env.CREDITCOIN_RECEIPT_TOKEN;
const ASSET_ADDRESS = process.env.SEPOLIA_ASSET_CONTRACT;
const USD_ADDRESS = process.env.SEPOLIA_USD_TOKEN;
const CUSD_ADDRESS = process.env.SEPLIA_CUSD_TOKEN || process.env.SEPOLIA_CUSD_TOKEN;
const SEPOLIA_CHAIN_KEY = 1;

// ── Purchases log (lightweight index, blockchain is source of truth) ──
const PURCHASES_FILE = path.join(__dirname, "../purchases.json");
function loadPurchases(): any[] {
  try { return JSON.parse(fs.readFileSync(PURCHASES_FILE, "utf8")); } catch { return []; }
}
function savePurchase(p: any) {
  const purchases = loadPurchases();
  purchases.push(p);
  fs.writeFileSync(PURCHASES_FILE, JSON.stringify(purchases, null, 2));
}

// Lazy providers
let sourceProvider: ethers.JsonRpcProvider;
let creditcoinProvider: ethers.JsonRpcProvider;
let signer: ethers.Wallet | null = null;

let sepoliaSigner: ethers.Wallet | null = null;

function getProviders() {
  if (!sourceProvider) {
    sourceProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    creditcoinProvider = new ethers.JsonRpcProvider(CREDITCOIN_RPC);
    if (PRIVATE_KEY) {
      signer = new ethers.Wallet(PRIVATE_KEY, creditcoinProvider);
      sepoliaSigner = new ethers.Wallet(PRIVATE_KEY, sourceProvider);
      console.log(`  Signer: ${signer.address}`);
    }
  }
  return { sourceProvider, creditcoinProvider, signer, sepoliaSigner };
}

// ── ABIs ──
const USD_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function faucet(uint256) external",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const ASSET_ABI = [
  "event AssetMinted(uint256 indexed tokenId, address indexed owner, uint256 tier, uint256 price, string description)",
  "function buyShare(uint256 tier) returns (uint256)",
  "function mint(address,uint256) returns (uint256)",
  "function getTiers() view returns (uint256[],uint256[],uint256[],uint256[])",
  "function propertyName() view returns (string)",
  "function propertyValue() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenTier(uint256) view returns (uint256)",
  "function tierPrice(uint256) view returns (uint256)",
];
const ASC_ABI = [
  "function isVerified(address,uint256) view returns (bool)",
  "function getProofDetails(address,uint256) view returns (tuple(bool owned,bool mintTimeValid,bool fromApprovedMinter,uint64 chainKey,uint64 blockHeight,bytes32 txHash))",
  "function getReceiptTokenId(address,uint256) view returns (uint256)",
  "function verifyAndMintReceipt(uint64,uint64,address,uint256,bytes32,bool) external",
  "function resyncOwnership(uint64,uint64,address,uint256,bytes32,bool,bool) external",
];
const VRS_ABI = [
  "function isValid(uint256) view returns (bool)",
  "function ownerOf(uint256) view returns (address)",
  "function sourceChainKey(uint256) view returns (uint64)",
  "function sourceBlockHeight(uint256) view returns (uint64)",
  "function isStale(uint256) view returns (bool)",
];

// ══════════════════════════════════════════════
//  Health
// ══════════════════════════════════════════════
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ══════════════════════════════════════════════
//  Config
// ══════════════════════════════════════════════
app.get("/api/config", (_req, res) => {
  res.json({
    sepoliaAsset: ASSET_ADDRESS,
    ascContract: ASC_ADDRESS,
    receiptToken: VRS_ADDRESS,
    usdToken: USD_ADDRESS,
    creditcoinRpc: CREDITCOIN_RPC,
    sepoliaRpc: SEPOLIA_RPC,
  });
});

// ══════════════════════════════════════════════
//  Get property info + tiers
// ══════════════════════════════════════════════
app.get("/api/property", async (_req, res) => {
  try {
    const { sourceProvider: sp } = getProviders();
    if (!ASSET_ADDRESS) return res.json({ name: "The Meridian Tower", value: "240000", tiers: [] });

    const asset = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI, sp);
    const name = await asset.propertyName();
    const value = await asset.propertyValue();
    const [tiers, prices, supplies, maxs] = await asset.getTiers();

    res.json({
      name,
      value: ethers.formatEther(value),
      tiers: tiers.map((t: any, i: number) => ({
        tier: Number(t),
        price: ethers.formatEther(prices[i]),
        supply: Number(supplies[i]),
        max: Number(maxs[i]),
      })),
    });
  } catch (err: any) {
    res.json({ name: "The Meridian Tower", value: "240000", tiers: [] });
  }
});

// ══════════════════════════════════════════════
//  Get USD balance
// ══════════════════════════════════════════════
app.get("/api/usd-balance/:wallet", async (req, res) => {
  try {
    const { sourceProvider: sp } = getProviders();
    if (!USD_ADDRESS) return res.json({ balance: "0" });

    const usd = new ethers.Contract(USD_ADDRESS, USD_ABI, sp);
    const balance = await usd.balanceOf(req.params.wallet);
    res.json({ balance: ethers.formatEther(balance) });
  } catch (err: any) {
    res.json({ balance: "0" });
  }
});

// ══════════════════════════════════════════════
//  Faucet USD
// ══════════════════════════════════════════════
app.post("/api/faucet", async (req, res) => {
  try {
    const { sourceProvider: sp, sepoliaSigner: s } = getProviders();
    if (!s || !USD_ADDRESS) return res.status(500).json({ error: "Server not configured" });

    const usd = new ethers.Contract(USD_ADDRESS, USD_ABI, s);
    const amount = ethers.parseEther("100000"); // 100k USD
    const tx = await usd.faucet(amount, { gasLimit: 100000 });
    const receipt = await tx.wait();
    res.json({ success: true, txHash: receipt.hash, amount: "100000" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ══════════════════════════════════════════════
//  Buy share (mint with USD payment)
// ══════════════════════════════════════════════
app.post("/api/buy", async (req, res) => {
  try {
    const { wallet, tier, propertyName: frontendPropertyName } = req.body;
    if (!wallet || !tier) return res.status(400).json({ error: "wallet and tier required" });

    const { sourceProvider: sp, sepoliaSigner: s } = getProviders();
    if (!s || !ASSET_ADDRESS || !USD_ADDRESS) return res.status(500).json({ error: "Server not configured" });

    // Get price (read-only)
    const assetRead = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI, sp);
    const price = await assetRead.tierPrice(tier);

    // Approve USD spending
    const usd = new ethers.Contract(USD_ADDRESS, USD_ABI, s);
    const approveTx = await usd.approve(ASSET_ADDRESS, price, { gasLimit: 100000 });
    await approveTx.wait();

    // Buy share (needs signer)
    const asset = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI, s);
    const buyTx = await asset.buyShare(tier, { gasLimit: 500000 });
    const receipt = await buyTx.wait();

    // Parse event
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = asset.interface.parseLog(log);
        if (parsed?.name === "AssetMinted") {
          tokenId = parsed.args.tokenId.toString();
        }
      } catch {}
    }

    // Get property value from contract
    let propertyValue = "0";
    try {
      propertyValue = ethers.formatEther(await assetRead.propertyValue());
    } catch {}

    // Use frontend-provided property name (what user actually clicked), fallback to contract
    let contractName = "The Meridian Tower";
    try { contractName = await assetRead.propertyName(); } catch {}
    const propertyName = frontendPropertyName || contractName;

    // Log purchase for fast lookup
    savePurchase({ wallet, tokenId, tier, propertyName, propertyValue, txHash: receipt.hash, blockNumber: receipt.blockNumber, timestamp: Date.now() });

    res.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      tokenId,
      tier,
      price: ethers.formatEther(price),
      propertyName,
    });
  } catch (err: any) {
    console.error("  Buy error:", err.message);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ══════════════════════════════════════════════
//  Check attestation status (for progress tracking)
// ══════════════════════════════════════════════
app.get("/api/attestation-status/:txHash", async (req, res) => {
  try {
    const { creditcoinProvider: cp } = getProviders();
    const proofBuilder = new ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL);

    // Get current Creditcoin block height
    const currentBlock = await cp.getBlockNumber();

    // Try to get proof (will fail if not yet attested)
    const result = await proofBuilder.getProof(req.params.txHash);

    if (result.success && result.data) {
      const attestedBlock = Number(result.data.headerNumber);
      // Confidence is based on proof readiness, not block delta (different chains)
      res.json({
        attested: true,
        proofReady: true,
        attestedBlock,
        currentBlock,
        confidence: result.data.cached ? 100 : 95,
        cached: result.data.cached,
      });
    } else {
      // Not attested yet — estimate based on time since tx
      res.json({
        attested: false,
        proofReady: false,
        currentBlock,
        message: result.error || "Block not yet attested",
      });
    }
  } catch (err: any) {
    res.json({ attested: false, proofReady: false, error: err.message });
  }
});

// ══════════════════════════════════════════════
//  Generate proof
// ══════════════════════════════════════════════
app.get("/api/proof/:txHash", async (req, res) => {
  try {
    const proofBuilder = new ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL);
    const result = await proofBuilder.getProof(req.params.txHash);
    if (!result.success) return res.status(500).json({ error: result.error });
    res.json({
      success: true,
      data: {
        chainKey: result.data!.chainKey,
        headerNumber: result.data!.headerNumber,
        txIndex: result.data!.txIndex,
        txHash: result.data!.txHash,
        cached: result.data!.cached,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
//  Full flow: prove + mint receipt
// ══════════════════════════════════════════════
app.post("/api/prove-and-mint", async (req, res) => {
  try {
    const { txHash, wallet, assetId } = req.body;
    if (!txHash || !wallet) return res.status(400).json({ error: "txHash and wallet required" });

    const { creditcoinProvider: cp, signer: s } = getProviders();
    if (!s || !ASC_ADDRESS || !VRS_ADDRESS) return res.status(500).json({ error: "Server not configured" });

    const assetIdNum = BigInt(assetId || 0);

    // 1. Fetch proof
    const proofBuilder = new ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL);
    const result = await proofBuilder.getProof(txHash);
    if (!result.success) return res.status(500).json({ error: result.error });
    const proofData = result.data!;

    // 2. Verify via precompile
    const bp = new PrecompileBlockProver(cp);
    const isValid = await bp.verifySingle(proofData.chainKey, proofData.headerNumber, proofData.txBytes, proofData.merkleProof, proofData.continuityProof);
    if (!isValid) return res.status(500).json({ error: "Proof verification failed" });

    // 3. Check before
    const asc = new ethers.Contract(ASC_ADDRESS, ASC_ABI, cp);
    const beforeVerified = await asc.isVerified(wallet, assetIdNum);

    // 4. Mint receipt
    const ascW = new ethers.Contract(ASC_ADDRESS, ASC_ABI, s);
    const tx = await ascW.verifyAndMintReceipt(proofData.chainKey, proofData.headerNumber, wallet, assetIdNum, txHash, true);
    const receipt = await tx.wait();

    // 5. Check after
    const afterVerified = await asc.isVerified(wallet, assetIdNum);
    const details = await asc.getProofDetails(wallet, assetIdNum);
    const receiptId = await asc.getReceiptTokenId(wallet, assetIdNum);

    let receiptDetails: any = {};
    if (receiptId > 0n) {
      const vrs = new ethers.Contract(VRS_ADDRESS, VRS_ABI, cp);
      receiptDetails = {
        valid: await vrs.isValid(receiptId),
        owner: await vrs.ownerOf(receiptId),
        chainKey: (await vrs.sourceChainKey(receiptId)).toString(),
        blockHeight: (await vrs.sourceBlockHeight(receiptId)).toString(),
        isStale: await vrs.isStale(receiptId),
      };
    }

    res.json({
      success: true,
      before: { verified: beforeVerified },
      after: {
        verified: afterVerified,
        receiptId: receiptId.toString(),
        proof: {
          owned: details.owned,
          mintTimeValid: details.mintTimeValid,
          fromApprovedMinter: details.fromApprovedMinter,
        },
      },
      receipt: receiptDetails,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ══════════════════════════════════════════════
//  State query
// ══════════════════════════════════════════════
app.get("/api/state/:wallet/:assetId", async (req, res) => {
  try {
    const { creditcoinProvider: cp } = getProviders();
    if (!ASC_ADDRESS || !VRS_ADDRESS) return res.json({ verified: false, receipt: null });

    const { wallet, assetId } = req.params;
    const asc = new ethers.Contract(ASC_ADDRESS, ASC_ABI, cp);
    const vrs = new ethers.Contract(VRS_ADDRESS, VRS_ABI, cp);

    const verified = await asc.isVerified(wallet, BigInt(assetId));
    const details = await asc.getProofDetails(wallet, BigInt(assetId));
    const receiptId = await asc.getReceiptTokenId(wallet, BigInt(assetId));

    let receipt: any = null;
    if (receiptId > 0n) {
      receipt = {
        id: receiptId.toString(),
        valid: await vrs.isValid(receiptId),
        owner: await vrs.ownerOf(receiptId),
        chainKey: (await vrs.sourceChainKey(receiptId)).toString(),
        blockHeight: (await vrs.sourceBlockHeight(receiptId)).toString(),
        isStale: await vrs.isStale(receiptId),
      };
    }

    res.json({ verified, proof: { owned: details.owned, mintTimeValid: details.mintTimeValid, fromApprovedMinter: details.fromApprovedMinter, chainKey: details.chainKey.toString(), blockHeight: details.blockHeight.toString(), txHash: details.txHash }, receipt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
//  Get user's purchased assets (on-chain)
// ══════════════════════════════════════════════
app.get("/api/my-assets/:wallet", async (req, res) => {
  try {
    const { sourceProvider: sp, creditcoinProvider: cp } = getProviders();
    const wallet = req.params.wallet.toLowerCase();

    // Read from purchases log (fast, no RPC calls)
    const purchases = loadPurchases().filter(p => p.wallet.toLowerCase() === wallet);

    if (purchases.length === 0) return res.json({ assets: [] });

    // Get property info from the contract (source of truth for name/value)
    let contractName = "The Meridian Tower";
    let contractValue = "2400000";
    if (ASSET_ADDRESS) {
      try {
        const assetRead = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI, sp);
        contractName = await assetRead.propertyName();
        contractValue = ethers.formatEther(await assetRead.propertyValue());
      } catch {}
    }

    // Enrich with on-chain verification status
    const asc = ASC_ADDRESS ? new ethers.Contract(ASC_ADDRESS, [
      "function isVerified(address,uint256) view returns (bool)",
      "function getReceiptTokenId(address,uint256) view returns (uint256)",
    ], cp) : null;
    const vrs = VRS_ADDRESS ? new ethers.Contract(VRS_ADDRESS, [
      "function isValid(uint256) view returns (bool)",
    ], cp) : null;

    const assets = [];
    for (const p of purchases) {
      let verified = false, receiptValid = false, receiptId = null;
      if (asc) {
        try {
          verified = await asc.isVerified(wallet, BigInt(p.tokenId));
          if (verified && vrs) {
            receiptId = (await asc.getReceiptTokenId(wallet, BigInt(p.tokenId))).toString();
            receiptValid = await vrs.isValid(BigInt(receiptId));
          }
        } catch {}
      }

      // Use property from purchase log if available, otherwise contract's name
      const propName = p.propertyName || contractName;
      const propValue = p.propertyValue || contractValue;
      const numValue = Number(propValue);

      assets.push({
        tokenId: p.tokenId,
        tier: p.tier,
        property: propName,
        value: String(numValue),
        tierValue: String(numValue * p.tier / 100),
        verified,
        receiptId,
        receiptValid,
        txHash: p.txHash,
        blockNumber: p.blockNumber,
        timestamp: p.timestamp,
      });
    }

    res.json({ assets });
  } catch (err: any) {
    res.json({ assets: [] });
  }
});

// ══════════════════════════════════════════════
//  Borrow against verified ownership
// ══════════════════════════════════════════════
app.post("/api/borrow", async (req, res) => {
  try {
    const { wallet, assetId, receiptId } = req.body;
    if (!wallet || !assetId) return res.status(400).json({ error: "wallet and assetId required" });

    const { sourceProvider: sp, creditcoinProvider: cp, sepoliaSigner: s } = getProviders();
    if (!s || !ASC_ADDRESS || !CUSD_ADDRESS) return res.status(500).json({ error: "Server not configured" });

    // 1. Check ownership is verified on Creditcoin
    const asc = new ethers.Contract(ASC_ADDRESS, ASC_ABI, cp);
    const verified = await asc.isVerified(wallet, BigInt(assetId));
    if (!verified) return res.status(400).json({ error: "Ownership not verified on Creditcoin. Verify first." });

    // 2. Check receipt is valid
    const rid = await asc.getReceiptTokenId(wallet, BigInt(assetId));
    if (rid === 0n) return res.status(400).json({ error: "No receipt found. Verify first." });

    const VRS_ABI = ["function isValid(uint256) view returns (bool)"];
    const vrs = new ethers.Contract(VRS_ADDRESS, VRS_ABI, cp);
    const receiptValid = await vrs.isValid(rid);
    if (!receiptValid) return res.status(400).json({ error: "Receipt is not valid (stale or superseded)" });

    // 3. Calculate loan amount based on tier (read from Sepolia contract)
    const ASSET_ABI_LOCAL = ["function tokenTier(uint256) view returns (uint256)", "function propertyValue() view returns (uint256)"];
    const asset = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI_LOCAL, sp);
    const tier = await asset.tokenTier(BigInt(assetId));
    const propertyValue = await asset.propertyValue();
    // Loan = 50% of tier value (conservative LTV)
    const loanAmount = (BigInt(propertyValue) * BigInt(tier) * 50n) / (100n * 100n);

    // 4. Mint CUSD to borrower
    const CUSD_ABI = ["function issueLoan(address,uint256,bytes32) external"];
    const cusd = new ethers.Contract(CUSD_ADDRESS, CUSD_ABI, s);
    const tx = await cusd.issueLoan(wallet, loanAmount, ethers.encodeBytes32String(rid.toString()), { gasLimit: 200000 });
    const receipt = await tx.wait();

    res.json({
      success: true,
      loanAmount: ethers.formatEther(loanAmount),
      tier: Number(tier),
      collateralValue: ethers.formatEther((BigInt(propertyValue) * BigInt(tier)) / 100n),
      ltv: "50%",
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ══════════════════════════════════════════════
//  One-Click Demo (no wallet needed)
// ══════════════════════════════════════════════
app.get("/api/demo/status", (_req, res) => {
  res.json({
    status: "ready",
    message: "Click to run full demo: buy → verify → receipt",
    deployerWallet: "0xe1223a9E37810F33049714cd607A71CAda34dDEC",
  });
});

// Quick demo: buy only (returns fast)
app.post("/api/demo/buy", async (_req, res) => {
  try {
    const { sourceProvider: sp, sepoliaSigner: ss } = getProviders();
    if (!ss || !ASSET_ADDRESS || !USD_ADDRESS) {
      return res.status(500).json({ error: "Server not configured" });
    }
    const WALLET = ss.address;
    const assetRead = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI, sp);
    const price = await assetRead.tierPrice(25);
    const usd = new ethers.Contract(USD_ADDRESS, USD_ABI, ss);
    const approveTx = await usd.approve(ASSET_ADDRESS, price, { gasLimit: 100000 });
    await approveTx.wait();
    const asset = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI, ss);
    const buyTx = await asset.buyShare(25, { gasLimit: 500000 });
    const buyReceipt = await buyTx.wait();
    let tokenId = "0";
    for (const log of buyReceipt.logs) {
      try {
        const parsed = asset.interface.parseLog(log);
        if (parsed?.name === "AssetMinted") tokenId = parsed.args.tokenId.toString();
      } catch {}
    }
    const propertyName = await assetRead.propertyName();
    savePurchase({ wallet: WALLET.toLowerCase(), tokenId, tier: 25, propertyName, propertyValue: "2400000", txHash: buyReceipt.hash, blockNumber: buyReceipt.blockNumber, timestamp: Date.now() });
    res.json({ success: true, tokenId, txHash: buyReceipt.hash, blockNumber: buyReceipt.blockNumber, etherscan: `https://sepolia.etherscan.io/tx/${buyReceipt.hash}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Quick demo: verify only (proof + receipt)
app.post("/api/demo/verify", async (req, res) => {
  try {
    const { txHash, tokenId } = req.body;
    if (!txHash) return res.status(400).json({ error: "txHash required" });
    const { creditcoinProvider: cp, sepoliaSigner: ss, signer: cs } = getProviders();
    if (!cs || !ASC_ADDRESS || !VRS_ADDRESS) return res.status(500).json({ error: "Server not configured" });
    const WALLET = ss?.address || "0xe1223a9E37810F33049714cd607A71CAda34dDEC";
    const assetId = BigInt(tokenId || 0);
    // 1. Check attestation
    const pb = new ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL);
    const result = await pb.getProof(txHash);
    if (!result.success) return res.json({ attested: false, message: result.error || "Not yet attested" });
    // 2. Verify via precompile
    const bp = new PrecompileBlockProver(cp);
    const isValid = await bp.verifySingle(result.data!.chainKey, result.data!.headerNumber, result.data!.txBytes, result.data!.merkleProof, result.data!.continuityProof);
    if (!isValid) return res.status(500).json({ error: "Proof verification failed" });
    // 3. Mint receipt
    const asc = new ethers.Contract(ASC_ADDRESS, ASC_ABI, cs);
    const beforeVerified = await asc.isVerified(WALLET, assetId);
    const tx = await asc.verifyAndMintReceipt(result.data!.chainKey, result.data!.headerNumber, WALLET, assetId, txHash, true);
    const vReceipt = await tx.wait();
    const afterVerified = await asc.isVerified(WALLET, assetId);
    const receiptId = await asc.getReceiptTokenId(WALLET, assetId);
    res.json({ success: true, beforeVerified, afterVerified, receiptId: receiptId.toString(), txHash: vReceipt.hash, blockscout: `https://creditcoin-testnet.blockscout.com/tx/${vReceipt.hash}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
//  Static frontend
// ══════════════════════════════════════════════
app.use(express.static("frontend"));
app.get("/{*splat}", (_req, res) => res.sendFile("index.html", { root: "frontend" }));

// ══════════════════════════════════════════════
//  Start
// ══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🏠 RWA Ownership Proof API`);
  console.log(`  ─────────────────────────`);
  console.log(`  Server:    http://localhost:${PORT}`);
  console.log(`  Sepolia:   ${ASSET_ADDRESS || "not set"}`);
  console.log(`  USD:       ${USD_ADDRESS || "not set"}`);
  console.log(`  ASC:       ${ASC_ADDRESS || "not set"}`);
  console.log(`  Receipt:   ${VRS_ADDRESS || "not set"}\n`);
});
