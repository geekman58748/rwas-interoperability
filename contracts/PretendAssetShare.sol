// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PretendAssetShare
 * @notice ERC-721 representing fractional ownership of a fictional real-world asset.
 *         Users buy shares with USD tokens. Each share is an ERC-721 token.
 *
 *         Share tiers: 10%, 25%, 50%, 100%
 *         Price per share = tier percentage * property value
 */
contract PretendAssetShare is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    /// @notice USD token used for payments
    IERC20 public immutable usdToken;

    /// @notice Property total value in USD (with 18 decimals)
    uint256 public propertyValue;

    /// @notice Property name
    string public propertyName;

    /// @notice Share tiers available (percentage * 100, e.g., 10 = 10%)
    uint256[] public shareTiers = [10, 25, 50, 100];

    /// @notice Price per tier in USD (calculated from propertyValue)
    mapping(uint256 => uint256) public tierPrice;

    /// @notice Track which token has which tier
    mapping(uint256 => uint256) public tokenTier;

    /// @notice Track total supply per tier
    mapping(uint256 => uint256) public tierSupply;

    /// @notice Max supply per tier
    mapping(uint256 => uint256) public maxPerTier;

    event AssetMinted(uint256 indexed tokenId, address indexed owner, uint256 tier, uint256 price, string description);
    event PropertyValueUpdated(uint256 newValue);

    constructor(
        address _usdToken,
        string memory _name,
        uint256 _value
    ) ERC721("PretendAssetShare", "PAS") Ownable(msg.sender) {
        usdToken = IERC20(_usdToken);
        propertyName = _name;
        propertyValue = _value;
        _calculatePrices();
    }

    function _calculatePrices() internal {
        for (uint256 i = 0; i < shareTiers.length; i++) {
            uint256 tier = shareTiers[i];
            tierPrice[tier] = (propertyValue * tier) / 100;
            maxPerTier[tier] = 100 / tier; // e.g., 10% tier = 10 max shares
        }
    }

    /**
     * @notice Buy a share of the property with USD tokens
     * @param tier Share tier (10, 25, 50, or 100)
     */
    function buyShare(uint256 tier) external returns (uint256) {
        require(tierPrice[tier] > 0, "Invalid tier");
        require(tierSupply[tier] < maxPerTier[tier], "Tier sold out");

        uint256 price = tierPrice[tier];

        // Transfer USD from buyer to contract
        require(
            usdToken.transferFrom(msg.sender, address(this), price),
            "USD transfer failed"
        );

        // Mint the share
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        tokenTier[tokenId] = tier;
        tierSupply[tier]++;

        string memory desc = _buildDescription(tier);
        emit AssetMinted(tokenId, msg.sender, tier, price, desc);

        return tokenId;
    }

    /**
     * @notice Admin mint (free, for testing)
     */
    function mint(address to, uint256 tier) external onlyOwner returns (uint256) {
        require(tierPrice[tier] > 0, "Invalid tier");
        require(tierSupply[tier] < maxPerTier[tier], "Tier sold out");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        tokenTier[tokenId] = tier;
        tierSupply[tier]++;

        string memory desc = _buildDescription(tier);
        emit AssetMinted(tokenId, to, tier, 0, desc);

        return tokenId;
    }

    function _buildDescription(uint256 tier) internal view returns (string memory) {
        if (tier == 100) return string(abi.encodePacked(propertyName, " - Full Ownership"));
        if (tier == 50) return string(abi.encodePacked(propertyName, " - 50% Share"));
        if (tier == 25) return string(abi.encodePacked(propertyName, " - 25% Share"));
        return string(abi.encodePacked(propertyName, " - 10% Share"));
    }

    /**
     * @notice Get available tiers and their prices
     */
    function getTiers() external view returns (uint256[] memory tiers, uint256[] memory prices, uint256[] memory supply, uint256[] memory max) {
        tiers = new uint256[](shareTiers.length);
        prices = new uint256[](shareTiers.length);
        supply = new uint256[](shareTiers.length);
        max = new uint256[](shareTiers.length);

        for (uint256 i = 0; i < shareTiers.length; i++) {
            uint256 tier = shareTiers[i];
            tiers[i] = tier;
            prices[i] = tierPrice[tier];
            supply[i] = tierSupply[tier];
            max[i] = maxPerTier[tier];
        }
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
