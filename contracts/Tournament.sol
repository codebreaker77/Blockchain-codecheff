// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Arena.sol";
import "./WinnerTrophy.sol";

/// @notice Four/eight-player elimination. Any drawn round voids the cup and refunds entrants.
contract Tournament is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Status { Missing, Registration, Running, Finished, Refunded }
    struct Cup {
        Status status;
        uint8 size;
        uint64 deadline;
        uint64 duration;
        uint256 fee;
        bytes32 problem;
        address champion;
        address[] entrants;
        uint256[] roundMatches;
    }
    IERC20 public immutable token;
    Arena public immutable arena;
    WinnerTrophy public immutable trophy;
    uint256 public nextId;
    mapping(uint256 => Cup) private cups;
    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(address => uint256) public claimable;
    mapping(address => uint256) public championships;
    event CupCreated(uint256 indexed id, uint8 size, uint256 fee);
    event Joined(uint256 indexed id, address indexed participant);
    event RoundStarted(uint256 indexed id, uint256[] matches);
    event Champion(uint256 indexed id, address indexed winner, uint256 pool);
    event Refunded(uint256 indexed id);
    constructor(IERC20 asset, Arena matches, WinnerTrophy awards) { token=asset; arena=matches; trophy=awards; }
    function getCup(uint256 id) external view returns (Cup memory) { return cups[id]; }
    function create(bytes32 problem, uint8 size, uint256 fee, uint64 registerSecs, uint64 duration) external returns (uint256 id) {
        require((size==4 || size==8) && fee>0 && fee<=1000 ether && problem!=bytes32(0), "invalid cup");
        require(registerSecs>=10 && registerSecs<=1 days && duration>=10 && duration<=1 days,"invalid duration");
        id=++nextId; Cup storage c=cups[id];
        c.status=Status.Registration; c.size=size; c.fee=fee; c.problem=problem;
        c.duration=duration; c.deadline=uint64(block.timestamp)+registerSecs;
        emit CupCreated(id,size,fee);
    }
    function join(uint256 id) external nonReentrant {
        Cup storage c=cups[id];
        require(c.status==Status.Registration && block.timestamp<c.deadline && !joined[id][msg.sender],"registration closed/duplicate");
        require(!arena.isVerifier(msg.sender),"verifier cannot play");
        joined[id][msg.sender]=true; c.entrants.push(msg.sender);
        token.safeTransferFrom(msg.sender,address(this),c.fee);
        emit Joined(id,msg.sender);
        if(c.entrants.length==c.size) { c.status=Status.Running; _round(id,c.entrants); }
    }
    function _round(uint256 id,address[] memory contenders) internal {
        Cup storage c=cups[id]; delete c.roundMatches;
        for(uint256 i; i<contenders.length; i+=2) c.roundMatches.push(arena.sponsor(c.problem,contenders[i],contenders[i+1],c.duration));
        emit RoundStarted(id,c.roundMatches);
    }
    function advance(uint256 id) external nonReentrant {
        Cup storage c=cups[id]; require(c.status==Status.Running,"cup not running");
        address[] memory winners=new address[](c.roundMatches.length);
        for(uint256 i; i<c.roundMatches.length; i++) {
            Arena.Match memory m=arena.getMatch(c.roundMatches[i]);
            require(m.state==Arena.State.Settled,"round incomplete");
            if(m.result==0) { _refund(id); return; }
            winners[i]=m.result==1 ? m.teamA[0] : m.teamB[0];
        }
        if(winners.length==1) {
            c.status=Status.Finished; c.champion=winners[0];
            claimable[winners[0]]+=c.fee*c.entrants.length; championships[winners[0]]++;
            trophy.award(winners[0],id); emit Champion(id,winners[0],c.fee*c.entrants.length);
        } else _round(id,winners);
    }
    function expire(uint256 id) external {
        Cup storage c=cups[id]; require(c.status==Status.Registration && block.timestamp>=c.deadline,"registration pending");
        _refund(id);
    }
    function _refund(uint256 id) internal {
        Cup storage c=cups[id]; c.status=Status.Refunded;
        for(uint256 i; i<c.entrants.length; i++) claimable[c.entrants[i]]+=c.fee;
        emit Refunded(id);
    }
    function claim() external nonReentrant {
        uint256 amount=claimable[msg.sender]; require(amount>0,"nothing to claim");
        claimable[msg.sender]=0; token.safeTransfer(msg.sender,amount);
    }
}
