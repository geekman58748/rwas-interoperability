// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title USDToken
 * @notice Mock USD ERC-20 token for testing property purchases.
 *         Faucet function allows anyone to get test USD for free.
 */
contract USDToken is ERC20, Ownable {
    constructor() ERC20("USD Test Token", "USD") Ownable(msg.sender) {}

    /**
     * @notice Get free test USD tokens
     */
    function faucet(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    /**
     * @notice Admin can also mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
