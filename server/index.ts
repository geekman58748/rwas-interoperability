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
    const { wallet, tier } = req.body;
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

    res.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      tokenId,
      tier,
      price: ethers.formatEther(price),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
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
    if (!ASSET_ADDRESS || !ASC_ADDRESS || !VRS_ADDRESS) return res.json({ assets: [] });

    const wallet = req.params.wallet;
    const asset = new ethers.Contract(ASSET_ADDRESS, [
      "function balanceOf(address) view returns (uint256)",
      "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
      "function tokenTier(uint256) view returns (uint256)",
      "function propertyName() view returns (string)",
      "function propertyValue() view returns (uint256)",
    ], sp);
    const asc = new ethers.Contract(ASC_ADDRESS, [
      "function isVerified(address,uint256) view returns (bool)",
      "function getReceiptTokenId(address,uint256) view returns (uint256)",
    ], cp);
    const vrs = new ethers.Contract(VRS_ADDRESS, [
      "function isValid(uint256) view returns (bool)",
    ], cp);

    const name = await asset.propertyName();
    const value = await asset.propertyValue();
    const balance = await asset.balanceOf(wallet);

    const assets = [];
    for (let i = 0; i < Number(balance); i++) {
      try {
        const tokenId = await asset.tokenOfOwnerByIndex(wallet, i);
        const tier = await asset.tokenTier(tokenId);
        const verified = await asc.isVerified(wallet, tokenId);
        let receiptValid = false;
        let receiptId = null;
        if (verified) {
          receiptId = (await asc.getReceiptTokenId(wallet, tokenId)).toString();
          receiptValid = await vrs.isValid(BigInt(receiptId));
        }
        assets.push({
          tokenId: tokenId.toString(),
          tier: Number(tier),
          property: name,
          value: ethers.formatEther(value),
          tierValue: ethers.formatEther((BigInt(value) * BigInt(tier)) / 100n),
          verified,
          receiptId,
          receiptValid,
        });
      } catch {}
    }

    res.json({ assets, propertyName: name, propertyValue: ethers.formatEther(value) });
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

    const { creditcoinProvider: cp, sepoliaSigner: s } = getProviders();
    if (!s || !ASC_ADDRESS || !CUSD_ADDRESS) return res.status(500).json({ error: "Server not configured" });

    // 1. Check ownership is verified on Creditcoin
    const asc = new ethers.Contract(ASC_ADDRESS, ASC_ABI, cp);
    const verified = await asc.isVerified(wallet, BigInt(assetId));
    if (!verified) return res.status(400).json({ error: "Ownership not verified on Creditcoin. Verify first." });

    // 2. Check receipt is valid
    const rid = await asc.getReceiptTokenId(wallet, BigInt(assetId));
    if (rid === 0n) return res.status(400).json({ error: "No receipt found. Verify first." });

    const VRS_ABI = ["function isValid(uint256) view returns (bool)", "function tokenTier(uint256) view returns (uint256)"];
    const vrs = new ethers.Contract(VRS_ADDRESS, VRS_ABI, cp);
    const receiptValid = await vrs.isValid(rid);
    if (!receiptValid) return res.status(400).json({ error: "Receipt is not valid (stale or superseded)" });

    // 3. Calculate loan amount based on tier
    const ASSET_ABI_LOCAL = ["function tokenTier(uint256) view returns (uint256)", "function propertyValue() view returns (uint256)"];
    const asset = new ethers.Contract(ASSET_ADDRESS, ASSET_ABI_LOCAL, cp);
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
