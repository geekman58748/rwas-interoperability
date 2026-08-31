// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PretendAssetShare
 * @notice Mock ERC-721 representing fractional ownership of a fictional real-world asset.
 *         Deployed on Ethereum Sepolia as the source chain for Attestcoin ownership proof.
 *
 *         Each token ID represents a "share" of a fictional building.
 *         The mint event is what we prove cross-chain to Creditcoin via Attestcoin.
 */
contract PretendAssetShare is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    event AssetMinted(uint256 indexed tokenId, address indexed owner, string description);

    constructor() ERC721("PretendAssetShare", "PAS") Ownable(msg.sender) {}

    /**
     * @notice Mint a new asset share. This is the "real-world ownership event" we prove cross-chain.
     * @param to Address to receive the token
     * @param description Description of the asset share (e.g., "1% of Building #1")
     */
    function mint(address to, string memory description) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        emit AssetMinted(tokenId, to, description);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
