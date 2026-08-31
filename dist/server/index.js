"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * server/index.ts
 *
 * Backend API for the RWA Ownership Proof demo.
 * Handles SDK interactions that can't run in the browser:
 * - Proof generation via Attestcoin SDK
 * - Proof verification via BlockProver precompile
 * - Contract state queries
 */
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ethers_1 = require("ethers");
const usc_sdk_1 = require("@gluwa/usc-sdk");
const ProofBuilder = usc_sdk_1.proofProvider.service.ProofBuilder;
const PrecompileBlockProver = usc_sdk_1.blockProver.PrecompileBlockProver;
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ── Config ──
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const CREDITCOIN_RPC = process.env.CREDITCOIN_RPC_URL;
const PROOF_BUILDER_URL = process.env.CREDITCOIN_PROOF_BUILDER_URL || "https://proof-gen-api.cc3-testnet.creditcoin.network/";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const ASC_ADDRESS = process.env.CREDITCOIN_ASC_CONTRACT;
const VRS_ADDRESS = process.env.CREDITCOIN_RECEIPT_TOKEN;
const ASSET_ADDRESS = process.env.SEPOLIA_ASSET_CONTRACT;
const SEPOLIA_CHAIN_KEY = 1;
const sourceProvider = new ethers_1.ethers.JsonRpcProvider(SEPOLIA_RPC);
const creditcoinProvider = new ethers_1.ethers.JsonRpcProvider(CREDITCOIN_RPC);
const signer = new ethers_1.ethers.Wallet(PRIVATE_KEY, creditcoinProvider);
// ── ABIs ──
const ERC721_ABI = [
    "event AssetMinted(uint256 indexed tokenId, address indexed owner, string description)",
    "function mint(address to, string description) returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function balanceOf(address owner) view returns (uint256)",
];
const ASC_ABI = [
    "function isVerified(address wallet, uint256 assetId) view returns (bool)",
    "function getProofDetails(address wallet, uint256 assetId) view returns (tuple(bool owned, bool mintTimeValid, bool fromApprovedMinter, uint64 chainKey, uint64 blockHeight, bytes32 txHash))",
    "function getReceiptTokenId(address wallet, uint256 assetId) view returns (uint256)",
    "function verifyAndMintReceipt(uint64,uint64,address,uint256,bytes32,bool) external",
    "function resyncOwnership(uint64,uint64,address,uint256,bytes32,bool,bool) external",
    "function owner()(address)",
];
const VRS_ABI = [
    "function isValid(uint256 tokenId) view returns (bool)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function sourceChainKey(uint256 tokenId) view returns (uint64)",
    "function sourceBlockHeight(uint256 tokenId) view returns (uint64)",
    "function sourceTxHash(uint256 tokenId) view returns (bytes32)",
    "function mintedAt(uint256 tokenId) view returns (uint256)",
    "function isStale(uint256 tokenId) view returns (bool)",
    "function totalSupply()(uint256)",
    "function tokenOfOwnerByIndex(address,uint256)(uint256)",
];
// ══════════════════════════════════════════════
//  Health check
// ══════════════════════════════════════════════
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// ══════════════════════════════════════════════
//  Contract addresses
// ══════════════════════════════════════════════
app.get("/api/config", (_req, res) => {
    res.json({
        sepoliaAsset: ASSET_ADDRESS,
        ascContract: ASC_ADDRESS,
        receiptToken: VRS_ADDRESS,
        sepoliaChainKey: SEPOLIA_CHAIN_KEY,
        creditcoinRpc: CREDITCOIN_RPC,
        sepoliaRpc: SEPOLIA_RPC,
    });
});
// ══════════════════════════════════════════════
//  Mint asset on Sepolia
// ══════════════════════════════════════════════
app.post("/api/mint", async (req, res) => {
    try {
        const { wallet, description } = req.body;
        if (!wallet)
            return res.status(400).json({ error: "wallet address required" });
        const assetContract = new ethers_1.ethers.Contract(ASSET_ADDRESS, ERC721_ABI, signer);
        const desc = description || "1% of Building #1";
        const tx = await assetContract.mint(wallet, desc);
        const receipt = await tx.wait();
        // Parse event
        let tokenId = null;
        for (const log of receipt.logs) {
            try {
                const parsed = assetContract.interface.parseLog(log);
                if (parsed?.name === "AssetMinted") {
                    tokenId = parsed.args.tokenId.toString();
                }
            }
            catch { }
        }
        res.json({
            success: true,
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            tokenId,
            gasUsed: receipt.gasUsed.toString(),
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ══════════════════════════════════════════════
//  Check attestation status
// ══════════════════════════════════════════════
app.get("/api/attestation/:chainKey", async (req, res) => {
    try {
        const chainKey = parseInt(req.params.chainKey);
        const resp = await fetch(`${PROOF_BUILDER_URL}/api/v1/attested-height/${chainKey}`);
        const data = await resp.json();
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ══════════════════════════════════════════════
//  Generate proof
// ══════════════════════════════════════════════
app.get("/api/proof/:txHash", async (req, res) => {
    try {
        const { txHash } = req.params;
        const proofBuilder = new ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL);
        const result = await proofBuilder.getProof(txHash);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            data: {
                chainKey: result.data.chainKey,
                headerNumber: result.data.headerNumber,
                txIndex: result.data.txIndex,
                txHash: result.data.txHash,
                cached: result.data.cached,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ══════════════════════════════════════════════
//  Verify proof on-chain via BlockProver precompile
// ══════════════════════════════════════════════
app.post("/api/verify", async (req, res) => {
    try {
        const { txHash } = req.body;
        if (!txHash)
            return res.status(400).json({ error: "txHash required" });
        // Fetch proof
        const proofBuilder = new ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL);
        const result = await proofBuilder.getProof(txHash);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        const proofData = result.data;
        // Verify via precompile
        const blockProverInstance = new PrecompileBlockProver(creditcoinProvider);
        const isValid = await blockProverInstance.verifySingle(proofData.chainKey, proofData.headerNumber, proofData.txBytes, proofData.merkleProof, proofData.continuityProof);
        res.json({
            success: true,
            valid: isValid,
            blockNumber: proofData.headerNumber,
            txIndex: proofData.txIndex,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ══════════════════════════════════════════════
//  Full flow: verify + mint receipt
// ══════════════════════════════════════════════
app.post("/api/prove-and-mint", async (req, res) => {
    try {
        const { txHash, wallet, assetId } = req.body;
        if (!txHash || !wallet) {
            return res.status(400).json({ error: "txHash and wallet required" });
        }
        const assetIdNum = assetId || 0;
        // 1. Fetch proof
        const proofBuilder = new ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL);
        const result = await proofBuilder.getProof(txHash);
        if (!result.success) {
            return res.status(500).json({ error: `Proof generation failed: ${result.error}` });
        }
        const proofData = result.data;
        // 2. Verify via precompile
        const blockProverInstance = new PrecompileBlockProver(creditcoinProvider);
        const isValid = await blockProverInstance.verifySingle(proofData.chainKey, proofData.headerNumber, proofData.txBytes, proofData.merkleProof, proofData.continuityProof);
        if (!isValid) {
            return res.status(500).json({ error: "Proof verification failed" });
        }
        // 3. Check before state
        const asc = new ethers_1.ethers.Contract(ASC_ADDRESS, ASC_ABI, creditcoinProvider);
        const beforeVerified = await asc.isVerified(wallet, assetIdNum);
        // 4. Mint receipt
        const ascWrite = new ethers_1.ethers.Contract(ASC_ADDRESS, ASC_ABI, signer);
        const tx = await ascWrite.verifyAndMintReceipt(proofData.chainKey, proofData.headerNumber, wallet, assetIdNum, txHash, true);
        const receipt = await tx.wait();
        // 5. Check after state
        const afterVerified = await asc.isVerified(wallet, assetIdNum);
        const details = await asc.getProofDetails(wallet, assetIdNum);
        const receiptId = await asc.getReceiptTokenId(wallet, assetIdNum);
        // 6. Get receipt details
        const vrs = new ethers_1.ethers.Contract(VRS_ADDRESS, VRS_ABI, creditcoinProvider);
        let receiptDetails = {};
        if (receiptId > 0n) {
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ══════════════════════════════════════════════
//  Query state
// ══════════════════════════════════════════════
app.get("/api/state/:wallet/:assetId", async (req, res) => {
    try {
        const { wallet, assetId } = req.params;
        const assetIdNum = parseInt(assetId);
        const asc = new ethers_1.ethers.Contract(ASC_ADDRESS, ASC_ABI, creditcoinProvider);
        const vrs = new ethers_1.ethers.Contract(VRS_ADDRESS, VRS_ABI, creditcoinProvider);
        const verified = await asc.isVerified(wallet, assetIdNum);
        const details = await asc.getProofDetails(wallet, assetIdNum);
        const receiptId = await asc.getReceiptTokenId(wallet, assetIdNum);
        let receipt = null;
        if (receiptId > 0n) {
            receipt = {
                id: receiptId.toString(),
                valid: await vrs.isValid(receiptId),
                owner: await vrs.ownerOf(receiptId),
                chainKey: (await vrs.sourceChainKey(receiptId)).toString(),
                blockHeight: (await vrs.sourceBlockHeight(receiptId)).toString(),
                txHash: await vrs.sourceTxHash(receiptId),
                mintedAt: (await vrs.mintedAt(receiptId)).toString(),
                isStale: await vrs.isStale(receiptId),
            };
        }
        res.json({
            verified,
            proof: {
                owned: details.owned,
                mintTimeValid: details.mintTimeValid,
                fromApprovedMinter: details.fromApprovedMinter,
                chainKey: details.chainKey.toString(),
                blockHeight: details.blockHeight.toString(),
                txHash: details.txHash,
            },
            receipt,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ══════════════════════════════════════════════
//  Get all receipts
// ══════════════════════════════════════════════
app.get("/api/receipts", async (_req, res) => {
    try {
        const vrs = new ethers_1.ethers.Contract(VRS_ADDRESS, VRS_ABI, creditcoinProvider);
        const asc = new ethers_1.ethers.Contract(ASC_ADDRESS, ASC_ABI, creditcoinProvider);
        // Get total supply
        let totalSupply = 0n;
        try {
            totalSupply = await vrs.totalSupply();
        }
        catch {
            // If totalSupply not available, return empty
            return res.json({ receipts: [] });
        }
        const receipts = [];
        for (let i = 0; i < Number(totalSupply); i++) {
            try {
                const tokenId = BigInt(i);
                const valid = await vrs.isValid(tokenId);
                const owner = await vrs.ownerOf(tokenId);
                const chainKey = (await vrs.sourceChainKey(tokenId)).toString();
                const blockHeight = (await vrs.sourceBlockHeight(tokenId)).toString();
                const txHash = await vrs.sourceTxHash(tokenId);
                const isStale = await vrs.isStale(tokenId);
                receipts.push({
                    tokenId: tokenId.toString(),
                    valid,
                    owner,
                    chainKey,
                    blockHeight,
                    txHash,
                    isStale,
                });
            }
            catch { }
        }
        res.json({ receipts });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ══════════════════════════════════════════════
//  Serve static frontend
// ══════════════════════════════════════════════
app.use(express_1.default.static("frontend"));
// SPA fallback
app.get("/{*splat}", (_req, res) => {
    res.sendFile("index.html", { root: "frontend" });
});
// ══════════════════════════════════════════════
//  Start
// ══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n  🏠 RWA Ownership Proof API`);
    console.log(`  ─────────────────────────`);
    console.log(`  Server:    http://localhost:${PORT}`);
    console.log(`  Frontend:  http://localhost:${PORT}`);
    console.log(`  Sepolia:   ${ASSET_ADDRESS}`);
    console.log(`  ASC:       ${ASC_ADDRESS}`);
    console.log(`  Receipt:   ${VRS_ADDRESS}\n`);
});
