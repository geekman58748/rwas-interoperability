// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CUSDToken
 * @notice Creditcoin USD stablecoin — issued as loans against verified RWA ownership.
 *         Minted by the protocol when ownership is verified on Creditcoin.
 *         In production, this would be backed by real collateral on Creditcoin.
 *         For the hackathon, the deployer wallet mints and distributes.
 */
contract CUSDToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 10_000_000 * 1e18; // 10M CUSD

    event LoanIssued(address indexed borrower, uint256 amount, bytes32 receiptId);
    event Airdropped(address indexed to, uint256 amount);

    constructor() ERC20("Creditcoin USD", "CUSD") Ownable(msg.sender) {}

    /**
     * @notice Issue a loan — mint CUSD to borrower against verified ownership
     * @param borrower Wallet that owns the verified RWA
     * @param amount Amount of CUSD to issue
     * @param receiptId The VerifiedShare receipt ID used as collateral
     */
    function issueLoan(address borrower, uint256 amount, bytes32 receiptId) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(borrower, amount);
        emit LoanIssued(borrower, amount, receiptId);
    }

    /**
     * @notice Airdrop tokens to a vault or address
     */
    function airdrop(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit Airdropped(to, amount);
    }

    /**
     * @notice Faucet for testing
     */
    function faucet(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
