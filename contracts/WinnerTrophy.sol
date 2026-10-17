// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract WinnerTrophy is ERC721 {
    address public immutable deployer;
    address public tournament;
    uint256 public nextId;
    mapping(uint256 => uint256) public tournamentOf;
    constructor() ERC721("Local CodeChef Champion", "CHEF-CUP") { deployer = msg.sender; }
    function bindTournament(address target) external {
        require(msg.sender == deployer && tournament == address(0) && target != address(0), "binding denied");
        tournament = target;
    }
    function award(address winner, uint256 cup) external returns (uint256 id) {
        require(msg.sender == tournament, "tournament only");
        id = ++nextId;
        tournamentOf[id] = cup;
        _mint(winner, id);
    }
    function _update(address to, uint256 id, address auth) internal override returns (address) {
        require(_ownerOf(id) == address(0), "non-transferable trophy");
        return super._update(to, id, auth);
    }
}
