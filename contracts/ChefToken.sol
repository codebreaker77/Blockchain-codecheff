// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fictional, non-redeemable local-chain tokens. Never deploy on a value-bearing chain.
contract ChefToken is ERC20 {
    mapping(address => bool) public received;
    constructor() ERC20("Fictional Chef Token", "CHEF") {
        require(block.chainid == 31337 || block.chainid == 1337, "local chain only");
    }
    function faucet() external {
        require(!received[msg.sender], "already received");
        received[msg.sender] = true;
        _mint(msg.sender, 1000 ether);
    }
}
