// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VerifiedShare
 * @notice ERC-721 receipt token on Creditcoin representing a proven claim to an Ethereum asset.
 *
 *         This is NOT the original asset — it is a timestamped, re-verifiable read of
 *         Ethereum ownership state, proven via the Attestcoin Protocol.
 *
 *         Key properties:
 *         - Minted by the OwnershipVerifier ASC on successful proof verification
 *         - Transferable on Creditcoin (holders can trade the verified claim)
 *         - Can be flagged stale if Ethereum-side state changes
 *         - Gated actions check staleness before executing
 *
 *         IMPORTANT: Ethereum remains the source of truth for the underlying asset at all times.
 *         The Creditcoin receipt is a live, re-verifiable read of that truth — not a replacement,
 *         transfer, or migration of the asset.
 */
contract VerifiedShare is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    /// @notice Source chain key (e.g., Sepolia = 1)
    mapping(uint256 => uint64) public sourceChainKey;

    /// @notice Block height on source chain when proof was verified
    mapping(uint256 => uint64) public sourceBlockHeight;

    /// @notice Transaction hash on source chain
    mapping(uint256 => bytes32) public sourceTxHash;

    /// @notice Wallet address that owns the asset on the source chain
    mapping(uint256 => address) public sourceOwner;

    /// @notice Whether this receipt has been flagged stale (underlying asset changed)
    mapping(uint256 => bool) public isStale;

    /// @notice Timestamp when the receipt was minted
    mapping(uint256 => uint256) public mintedAt;

    /// @notice Whether this receipt has been superseded by a newer proof
    mapping(uint256 => bool) public isSuperseded;

    event ReceiptMinted(
        uint256 indexed tokenId,
        address indexed holder,
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 txHash,
        address sourceOwnerAddr
    );
    event ReceiptFlaggedStale(uint256 indexed tokenId, address indexed flaggedBy);
    event ReceiptSuperseded(uint256 indexed oldTokenId, uint256 indexed newTokenId);

    constructor() ERC721("VerifiedShare", "VRS") Ownable(msg.sender) {}

    /**
     * @notice Mint a receipt. Only callable by the OwnershipVerifier ASC.
     * @param to Holder of the receipt on Creditcoin
     * @param chainKey Source chain key
     * @param height Source block height
     * @param txHash Source transaction hash
     * @param sourceOwnerAddr Owner on the source chain
     */
    function mint(
        address to,
        uint64 chainKey,
        uint64 height,
        bytes32 txHash,
        address sourceOwnerAddr
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        sourceChainKey[tokenId] = chainKey;
        sourceBlockHeight[tokenId] = height;
        sourceTxHash[tokenId] = txHash;
        sourceOwner[tokenId] = sourceOwnerAddr;
        mintedAt[tokenId] = block.timestamp;

        emit ReceiptMinted(tokenId, to, chainKey, height, txHash, sourceOwnerAddr);
        return tokenId;
    }

    /**
     * @notice Flag a receipt as stale (underlying Ethereum asset changed).
     *         Only callable by the contract owner (the ASC).
     */
    function flagStale(uint256 tokenId) external onlyOwner {
        require(!_isOwnerOf(tokenId), "Token does not exist");
        require(!isStale[tokenId], "Already stale");
        isStale[tokenId] = true;
        emit ReceiptFlaggedStale(tokenId, msg.sender);
    }

    /**
     * @notice Mark a receipt as superseded by a newer proof.
     */
    function markSuperseded(uint256 tokenId) external onlyOwner {
        require(!_isOwnerOf(tokenId), "Token does not exist");
        isSuperseded[tokenId] = true;
    }

    /**
     * @notice Check if a receipt is valid (not stale, not superseded).
     */
    function isValid(uint256 tokenId) external view returns (bool) {
        if (!_isOwnerOf(tokenId)) return false;
        return !isStale[tokenId] && !isSuperseded[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _isOwnerOf(uint256 tokenId) internal view returns (bool) {
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
}
