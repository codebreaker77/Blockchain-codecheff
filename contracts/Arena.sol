// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Arena is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum State { Missing, Open, Active, Proposed, Disputed, Settled, Cancelled }
    struct Match {
        State state;
        uint8 result; // 0 draw, 1 team A, 2 team B
        uint8 round;
        uint64 acceptDeadline;
        uint64 solveDeadline;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 disputeDeadline;
        uint64 duration;
        uint256 stake; // stake per team, funded by its captain; zero for sponsored bracket matches
        bytes32 problem;
        bytes32 submissionA;
        bytes32 submissionB;
        address[] teamA;
        address[] teamB;
    }
    struct Stats { uint256 wins; uint256 losses; uint256 draws; uint256 earned; }
    IERC20 public immutable token;
    address public immutable deployer;
    address public tournament;
    address[3] public primaryPanel;
    address[3] public appealPanel;
    uint64 public immutable commitWindow;
    uint64 public immutable revealWindow;
    uint64 public immutable disputeWindow;
    uint256 public nextId;
    mapping(uint256 => Match) private matches;
    mapping(uint256 => mapping(uint8 => mapping(address => bytes32))) public commitments;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public revealed;
    mapping(uint256 => mapping(uint8 => mapping(uint8 => uint256))) public votes;
    mapping(address => uint256) public claimable;
    mapping(address => Stats) public stats;
    address[] public players;
    mapping(address => bool) private known;
    mapping(address => mapping(address => bool)) public teamConsent;
    event MatchCreated(uint256 indexed id, address indexed captain, bytes32 problem);
    event MatchAccepted(uint256 indexed id, address indexed captain, uint64 solveDeadline);
    event Submission(uint256 indexed id, address indexed captain, bytes32 sourceHash);
    event Committed(uint256 indexed id, uint8 round, address indexed verifier);
    event Revealed(uint256 indexed id, uint8 round, address indexed verifier, uint8 outcome, bytes32 evidence);
    event Proposed(uint256 indexed id, uint8 outcome, uint64 disputeDeadline);
    event Disputed(uint256 indexed id, bytes32 reason);
    event Settled(uint256 indexed id, uint8 outcome);
    event Claimed(address indexed player, uint256 amount);

    constructor(IERC20 asset, address[3] memory primary, address[3] memory appeal, uint64 commitSecs, uint64 revealSecs, uint64 disputeSecs) {
        require(block.chainid == 31337 || block.chainid == 1337, "local chain only");
        require(address(asset) != address(0) && commitSecs > 0 && revealSecs > 0 && disputeSecs > 0, "invalid configuration");
        for (uint256 i; i < 6; i++) {
            address a = i < 3 ? primary[i] : appeal[i-3];
            require(a != address(0), "zero verifier");
            for (uint256 j; j < i; j++) require(a != (j < 3 ? primary[j] : appeal[j-3]), "duplicate verifier");
        }
        token = asset; deployer = msg.sender; primaryPanel = primary; appealPanel = appeal;
        commitWindow = commitSecs; revealWindow = revealSecs; disputeWindow = disputeSecs;
    }
    function bindTournament(address target) external {
        require(msg.sender == deployer && tournament == address(0) && target != address(0), "binding denied");
        tournament = target;
    }
    function getMatch(uint256 id) external view returns (Match memory) { return matches[id]; }
    function playerCount() external view returns (uint256) { return players.length; }
    function consent(address captain, bool allowed) external { teamConsent[msg.sender][captain] = allowed; }
    function isVerifier(address who) public view returns (bool) {
        for (uint256 i; i<3; i++) if (primaryPanel[i] == who || appealPanel[i] == who) return true;
        return false;
    }
    function _team(address[] memory team) internal view {
        require(team.length > 0 && team.length <= 4, "team size 1-4");
        for (uint256 i; i<team.length; i++) {
            require(team[i] != address(0) && !isVerifier(team[i]), "invalid participant");
            if (i > 0) require(teamConsent[team[i]][team[0]], "member consent required");
            for (uint256 j; j<i; j++) require(team[i] != team[j], "duplicate member");
        }
    }
    function _remember(address[] memory team) internal {
        for (uint256 i; i<team.length; i++) if (!known[team[i]]) { known[team[i]] = true; players.push(team[i]); }
    }
    function _start(Match storage m) internal {
        m.state = State.Active;
        m.solveDeadline = uint64(block.timestamp) + m.duration;
        m.commitDeadline = m.solveDeadline + commitWindow;
        m.revealDeadline = m.commitDeadline + revealWindow;
    }
    function create(bytes32 problem, uint256 stake, uint64 duration, uint64 acceptSecs, address[] calldata team) external nonReentrant returns (uint256 id) {
        _team(team);
        require(team[0] == msg.sender && problem != bytes32(0) && stake > 0 && stake <= 1000 ether, "invalid challenge");
        require(duration >= 10 && duration <= 1 days && acceptSecs >= 10 && acceptSecs <= 1 days, "invalid duration");
        id = ++nextId;
        Match storage m = matches[id];
        m.state = State.Open; m.problem = problem; m.stake = stake; m.duration = duration;
        m.acceptDeadline = uint64(block.timestamp) + acceptSecs; m.teamA = team;
        _remember(team);
        token.safeTransferFrom(msg.sender, address(this), stake);
        emit MatchCreated(id, msg.sender, problem);
    }
    function accept(uint256 id, address[] calldata team) external nonReentrant {
        Match storage m = matches[id];
        require(m.state == State.Open && block.timestamp < m.acceptDeadline, "not accepting");
        _team(team);
        require(team[0] == msg.sender && team.length == m.teamA.length, "captain/team size mismatch");
        for (uint256 i; i<team.length; i++) for (uint256 j; j<m.teamA.length; j++) require(team[i] != m.teamA[j], "overlapping teams");
        m.teamB = team; _remember(team); _start(m);
        token.safeTransferFrom(msg.sender, address(this), m.stake);
        emit MatchAccepted(id, msg.sender, m.solveDeadline);
    }
    function sponsor(bytes32 problem, address a, address b, uint64 duration) external returns (uint256 id) {
        require(msg.sender == tournament && a != b && duration >= 10 && duration <= 1 days && problem != bytes32(0), "invalid sponsor");
        address[] memory ta = new address[](1); ta[0] = a;
        address[] memory tb = new address[](1); tb[0] = b;
        _team(ta); _team(tb); _remember(ta); _remember(tb);
        id = ++nextId; Match storage m = matches[id];
        m.problem = problem; m.duration = duration; m.teamA = ta; m.teamB = tb;
        _start(m); emit MatchCreated(id, a, problem); emit MatchAccepted(id, b, m.solveDeadline);
    }
    function cancelOpen(uint256 id) external {
        Match storage m = matches[id];
        require(m.state == State.Open && (msg.sender == m.teamA[0] || block.timestamp >= m.acceptDeadline), "cannot cancel");
        m.state = State.Cancelled; claimable[m.teamA[0]] += m.stake;
        emit Settled(id, 0);
    }
    function submit(uint256 id, bytes32 sourceHash) external {
        Match storage m = matches[id];
        require(m.state == State.Active && block.timestamp < m.solveDeadline && sourceHash != bytes32(0), "submission closed");
        if (msg.sender == m.teamA[0]) { require(m.submissionA == bytes32(0), "already submitted"); m.submissionA = sourceHash; }
        else { require(msg.sender == m.teamB[0] && m.submissionB == bytes32(0), "not captain/already submitted"); m.submissionB = sourceHash; }
        emit Submission(id, msg.sender, sourceHash);
    }
    function _eligible(Match storage m, address verifier) internal view returns (bool) {
        for (uint256 i; i<3; i++) if ((m.round == 0 ? primaryPanel[i] : appealPanel[i]) == verifier) return true;
        return false;
    }
    function commitmentHash(uint256 id, uint8 round, uint8 outcome, bytes32 evidence, bytes32 salt, address verifier) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), id, round, outcome, evidence, salt, verifier));
    }
    function commit(uint256 id, bytes32 digest) external {
        Match storage m = matches[id];
        require((m.state == State.Active || m.state == State.Disputed) && _eligible(m,msg.sender), "not verifier/phase");
        require(block.timestamp >= m.solveDeadline && block.timestamp < m.commitDeadline && digest != bytes32(0), "commit closed");
        require(commitments[id][m.round][msg.sender] == bytes32(0), "already committed");
        commitments[id][m.round][msg.sender] = digest; emit Committed(id,m.round,msg.sender);
    }
    function reveal(uint256 id, uint8 outcome, bytes32 evidence, bytes32 salt) external {
        Match storage m = matches[id];
        require((m.state == State.Active || m.state == State.Disputed) && _eligible(m,msg.sender), "not verifier/phase");
        require(block.timestamp >= m.commitDeadline && block.timestamp < m.revealDeadline && outcome <= 2, "reveal closed");
        require(!revealed[id][m.round][msg.sender] && commitments[id][m.round][msg.sender] == commitmentHash(id,m.round,outcome,evidence,salt,msg.sender), "invalid reveal");
        revealed[id][m.round][msg.sender] = true; votes[id][m.round][outcome]++;
        emit Revealed(id,m.round,msg.sender,outcome,evidence);
    }
    function dispute(uint256 id, bytes32 reason) external {
        Match storage m = matches[id];
        require(m.state == State.Proposed && block.timestamp < m.disputeDeadline && reason != bytes32(0), "dispute closed");
        require(_member(m.teamA,msg.sender) || _member(m.teamB,msg.sender), "participant only");
        m.state = State.Disputed; m.round = 1;
        m.solveDeadline = uint64(block.timestamp); m.commitDeadline = m.solveDeadline + commitWindow;
        m.revealDeadline = m.commitDeadline + revealWindow;
        emit Disputed(id,reason);
    }
    function _member(address[] storage team, address who) internal view returns (bool) {
        for (uint256 i; i<team.length; i++) if (team[i] == who) return true;
        return false;
    }
    function progress(uint256 id) external {
        Match storage m = matches[id];
        if (m.state == State.Active || m.state == State.Disputed) {
            require(block.timestamp >= m.revealDeadline, "verification pending");
            uint8 outcome;
            for (uint8 i; i<3; i++) if (votes[id][m.round][i] >= 2) outcome = i;
            if (m.round == 0) {
                m.state = State.Proposed; m.result = outcome;
                m.disputeDeadline = uint64(block.timestamp) + disputeWindow;
                emit Proposed(id,outcome,m.disputeDeadline);
            } else _settle(id,outcome);
        } else {
            require(m.state == State.Proposed && block.timestamp >= m.disputeDeadline, "not finalizable");
            _settle(id,m.result);
        }
    }
    function _settle(uint256 id, uint8 outcome) internal {
        Match storage m = matches[id];
        m.state = State.Settled; m.result = outcome;
        if (outcome == 0) { _credit(m.teamA,m.stake); _credit(m.teamB,m.stake); }
        else _credit(outcome == 1 ? m.teamA : m.teamB, m.stake * 2);
        _record(m.teamA,outcome == 0 ? 0 : (outcome == 1 ? 1 : 2),outcome == 1 ? m.stake * 2 : 0);
        _record(m.teamB,outcome == 0 ? 0 : (outcome == 2 ? 1 : 2),outcome == 2 ? m.stake * 2 : 0);
        emit Settled(id,outcome);
    }
    function _credit(address[] storage team, uint256 amount) internal {
        uint256 share = amount / team.length;
        for (uint256 i; i<team.length; i++) claimable[team[i]] += share + (i == 0 ? amount % team.length : 0);
    }
    function _record(address[] storage team, uint8 result, uint256 reward) internal {
        for (uint256 i; i<team.length; i++) {
            Stats storage s = stats[team[i]];
            if (result == 0) s.draws++; else if (result == 1) s.wins++; else s.losses++;
            s.earned += reward / team.length + (i == 0 ? reward % team.length : 0);
        }
    }
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender]; require(amount > 0, "nothing to claim");
        claimable[msg.sender] = 0; token.safeTransfer(msg.sender,amount); emit Claimed(msg.sender,amount);
    }
}
