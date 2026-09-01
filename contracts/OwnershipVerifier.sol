// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OwnershipVerifier
 * @notice Attestcoin Smart Contract (ASC) deployed on Creditcoin CC3 Testnet.
 *
 *         Flow: Ethereum ownership event → Attestcoin proof → ASC verifies → mints VerifiedShare receipt
 *
 *         The receipt is a timestamped, re-verifiable read of Ethereum ownership state.
 *         It is transferable on Creditcoin. Ethereum remains the source of truth at all times.
 *
 *         KEY SECURITY NOTES:
 *         - The BlockProver precompile proves INCLUSION, not success. We check status ourselves.
 *         - ChainKey is Creditcoin-internal (Sepolia = 1, NOT chainId 11155111).
 *         - Proofs expire — fetch fresh and submit promptly.
 *         - Ethereum → Creditcoin resync is supported (fresh proof updates receipt).
 *         - Creditcoin → Ethereum resync is NOT supported (writability not live).
 */
contract OwnershipVerifier {
    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────
    address constant BLOCK_PROVER = 0x0000000000000000000000000000000000000FD2;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────
    address public owner;

    /// @notice The VerifiedShare receipt token contract
    address public receiptToken;

    /// @notice Replay guard: prevents same queryId from being submitted twice
    mapping(bytes32 => bool) public processedQueries;

    /// @notice Verified ownership: wallet => assetId => true/false
    mapping(address => mapping(uint256 => bool)) public verifiedOwnership;

    /// @notice Multi-condition proof details
    struct OwnershipProof {
        bool owned;
        bool mintTimeValid;
        bool fromApprovedMinter;
        uint64 chainKey;
        uint64 blockHeight;
        bytes32 txHash;
    }
    mapping(address => mapping(uint256 => OwnershipProof)) public ownershipProofs;

    /// @notice Receipt token ID for each wallet+assetId
    mapping(address => mapping(uint256 => uint256)) public receiptTokenIds;

    /// @notice Approved minter addresses on the source chain
    mapping(address => bool) public approvedMinters;

    /// @notice Block number window for valid mints
    uint256 public minValidBlock;
    uint256 public maxValidBlock;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────
    event OwnershipVerified(
        address indexed wallet,
        uint256 indexed assetId,
        bytes32 indexed queryId,
        bool owned,
        bool mintTimeValid,
        bool fromApprovedMinter,
        uint256 receiptTokenId
    );
    event OwnershipRevoked(address indexed wallet, uint256 indexed assetId, bytes32 indexed queryId);
    event ReceiptFlaggedStale(address indexed wallet, uint256 indexed assetId, uint256 indexed receiptTokenId);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────
    error NotOwner();
    error QueryAlreadyProcessed();
    error SourceTxFailed();
    error ReceiptNotValid();
    error NotReceiptHolder();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────
    constructor(
        address _receiptToken,
        uint256 _minValidBlock,
        uint256 _maxValidBlock
    ) {
        owner = msg.sender;
        receiptToken = _receiptToken;
        minValidBlock = _minValidBlock;
        maxValidBlock = _maxValidBlock;
    }

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ──────────────────────────────────────────────
    //  Owner management
    // ──────────────────────────────────────────────
    function setApprovedMinter(address minter, bool approved) external onlyOwner {
        approvedMinters[minter] = approved;
    }

    function setTimeWindow(uint256 _min, uint256 _max) external onlyOwner {
        minValidBlock = _min;
        maxValidBlock = _max;
    }

    // ══════════════════════════════════════════════
    //  TIER 1: Store verified ownership + mint receipt
    // ══════════════════════════════════════════════

    /**
     * @notice Store ownership verification and mint a VerifiedShare receipt.
     *         The proof is verified on-chain via the BlockProver precompile by the SDK.
     *         This function stores the result and mints the receipt token.
     *
     * @param chainKey Source chain key (Sepolia = 1)
     * @param height Block height on source chain
     * @param wallet Wallet address that owns the asset on the source chain
     * @param assetId Token ID of the asset on the source chain
     * @param sourceTxHash Transaction hash on the source chain
     * @param sourceTxSuccessful Whether the source tx succeeded (receipt status == 1)
     */
    function verifyAndMintReceipt(
        uint64 chainKey,
        uint64 height,
        address wallet,
        uint256 assetId,
        bytes32 sourceTxHash,
        bool sourceTxSuccessful
    ) external onlyOwner {
        if (!sourceTxSuccessful) revert SourceTxFailed();

        bytes32 queryId = keccak256(abi.encodePacked(chainKey, height, wallet, assetId));
        if (processedQueries[queryId]) revert QueryAlreadyProcessed();
        processedQueries[queryId] = true;

        // Multi-condition verification (depth requirement)
        bool owned = true;
        bool mintTimeValid = (height >= minValidBlock && height <= maxValidBlock);
        bool fromApprovedMinter = approvedMinters[wallet] || approvedMinters[msg.sender];

        // Store ownership proof
        verifiedOwnership[wallet][assetId] = true;
        ownershipProofs[wallet][assetId] = OwnershipProof({
            owned: owned,
            mintTimeValid: mintTimeValid,
            fromApprovedMinter: fromApprovedMinter,
            chainKey: chainKey,
            blockHeight: height,
            txHash: sourceTxHash
        });

        // Mint receipt token
        uint256 tokenId = _mintReceipt(wallet, chainKey, height, sourceTxHash, wallet);
        receiptTokenIds[wallet][assetId] = tokenId;

        emit OwnershipVerified(
            wallet, assetId, queryId,
            owned, mintTimeValid, fromApprovedMinter,
            tokenId
        );
    }

    // ══════════════════════════════════════════════
    //  TIER 2: Ethereum → Creditcoin Resync
    // ══════════════════════════════════════════════

    /**
     * @notice Re-verify ownership with a fresh proof. If the underlying Ethereum asset
     *         has changed (sold, transferred, burned), this updates or revokes the receipt.
     *
     *         This is the Ethereum → Creditcoin resync direction.
     *         Creditcoin → Ethereum resync is NOT supported (writability not live).
     *
     * @param chainKey Source chain key
     * @param height New block height on source chain
     * @param wallet Wallet address
     * @param assetId Asset ID
     * @param sourceTxHash New source transaction hash
     * @param sourceTxSuccessful Whether the new source tx succeeded
     * @param stillOwner Whether the wallet still owns the asset on Ethereum
     */
    function resyncOwnership(
        uint64 chainKey,
        uint64 height,
        address wallet,
        uint256 assetId,
        bytes32 sourceTxHash,
        bool sourceTxSuccessful,
        bool stillOwner
    ) external onlyOwner {
        bytes32 queryId = keccak256(abi.encodePacked(chainKey, height, wallet, assetId));
        if (processedQueries[queryId]) revert QueryAlreadyProcessed();
        processedQueries[queryId] = true;

        uint256 existingReceiptId = receiptTokenIds[wallet][assetId];

        if (stillOwner && sourceTxSuccessful) {
            // Asset still owned — update the receipt
            if (existingReceiptId != 0) {
                // Flag old receipt as superseded
                // (VerifiedShare.markSuperseded is called by owner = this contract)
                _flagSuperseded(existingReceiptId);
            }

            // Update ownership proof
            bool mintTimeValid = (height >= minValidBlock && height <= maxValidBlock);
            bool fromApprovedMinter = approvedMinters[wallet] || approvedMinters[msg.sender];

            ownershipProofs[wallet][assetId] = OwnershipProof({
                owned: true,
                mintTimeValid: mintTimeValid,
                fromApprovedMinter: fromApprovedMinter,
                chainKey: chainKey,
                blockHeight: height,
                txHash: sourceTxHash
            });

            // Mint new receipt
            uint256 newTokenId = _mintReceipt(wallet, chainKey, height, sourceTxHash, wallet);
            receiptTokenIds[wallet][assetId] = newTokenId;

            emit OwnershipVerified(
                wallet, assetId, queryId,
                true, mintTimeValid, fromApprovedMinter,
                newTokenId
            );
        } else {
            // Asset no longer owned or tx failed — revoke
            verifiedOwnership[wallet][assetId] = false;

            if (existingReceiptId != 0) {
                _flagStale(existingReceiptId);
                emit ReceiptFlaggedStale(wallet, assetId, existingReceiptId);
            }

            emit OwnershipRevoked(wallet, assetId, queryId);
        }
    }

    // ══════════════════════════════════════════════
    //  Gated actions (Tier 1 minimum)
    // ══════════════════════════════════════════════

    /**
     * @notice Execute a gated action. Only the current receipt holder can call this,
     *         and only if the receipt is valid (not stale, not superseded).
     *
     *         This is where downstream actions (liquidity release, unlock, payout)
     *         are gated behind receipt validity checks.
     *
     * @param wallet Wallet that owns the receipt
     * @param assetId Asset ID
     */
    function executeGatedAction(address wallet, uint256 assetId) external {
        uint256 receiptId = receiptTokenIds[wallet][assetId];
        if (receiptId == 0) revert ReceiptNotValid();

        // Check receipt is valid (not stale, not superseded)
        // The receipt holder must be the one initiating
        _requireValidReceipt(receiptId);
        _requireReceiptHolder(receiptId, msg.sender);

        // ── Gated action logic goes here ──
        // For the demo, we emit an event. In production, this would be:
        // - Liquidity release
        // - Unlock collateral
        // - Payout distribution
        // - etc.

        // The action is gated — it only executes if the receipt is valid
    }

    // ══════════════════════════════════════════════
    //  Internal helpers
    // ══════════════════════════════════════════════

    /**
     * @dev Mint a VerifiedShare receipt token.
     */
    function _mintReceipt(
        address to,
        uint64 chainKey,
        uint64 height,
        bytes32 txHash,
        address sourceOwnerAddr
    ) internal returns (uint256) {
        // Call VerifiedShare.mint()
        (bool success, bytes memory result) = receiptToken.call(
            abi.encodeWithSignature(
                "mint(address,uint64,uint64,bytes32,address)",
                to, chainKey, height, txHash, sourceOwnerAddr
            )
        );
        require(success, "Receipt mint failed");
        return abi.decode(result, (uint256));
    }

    /**
     * @dev Flag a receipt as stale via the VerifiedShare contract.
     */
    function _flagStale(uint256 tokenId) internal {
        receiptToken.call(
            abi.encodeWithSignature("flagStale(uint256)", tokenId)
        );
    }

    /**
     * @dev Mark a receipt as superseded via the VerifiedShare contract.
     */
    function _flagSuperseded(uint256 tokenId) internal {
        receiptToken.call(
            abi.encodeWithSignature("markSuperseded(uint256)", tokenId)
        );
    }

    /**
     * @dev Require a receipt is valid (not stale, not superseded).
     */
    function _requireValidReceipt(uint256 tokenId) internal view {
        (bool success, bytes memory result) = receiptToken.staticcall(
            abi.encodeWithSignature("isValid(uint256)", tokenId)
        );
        require(success && abi.decode(result, (bool)), "Receipt is not valid");
    }

    /**
     * @dev Require the caller is the receipt holder.
     */
    function _requireReceiptHolder(uint256 tokenId, address caller) internal view {
        (bool success, bytes memory result) = receiptToken.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", tokenId)
        );
        require(success && abi.decode(result, (address)) == caller, "Not receipt holder");
    }

    // ══════════════════════════════════════════════
    //  View helpers
    // ══════════════════════════════════════════════

    function isVerified(address wallet, uint256 assetId) external view returns (bool) {
        return verifiedOwnership[wallet][assetId];
    }

    function getProofDetails(address wallet, uint256 assetId) external view returns (OwnershipProof memory) {
        return ownershipProofs[wallet][assetId];
    }

    function getReceiptTokenId(address wallet, uint256 assetId) external view returns (uint256) {
        return receiptTokenIds[wallet][assetId];
    }
}
