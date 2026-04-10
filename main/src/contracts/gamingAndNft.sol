// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import "./MTS.sol";

contract MonsterGame is ERC721, VRFConsumerBaseV2Plus, ReentrancyGuard {
	MTS public mtsToken;
	uint256 private _nextTokenId;
	uint256 public discountPrice = 220;
	uint256 public discountEggValue = 100;

	// --- Chainlink VRF config ---
	IVRFCoordinatorV2Plus private coordinator;
	bytes32 private keyHash;
	uint256 private subscriptionId;
	uint32 private callbackGasLimit = 500000;
	uint16 private requestConfirmations = 3;
	bool private useNativePayment = false;

	struct Monster {
		uint256 power; // Combat power (20~50)
		uint256 level; // Level (max 5)
		uint256 totalFights; // Lifetime battle count (used for level up)
		uint256 dailyFights; // Battles used today (daily limit: 3)
		uint256 lastFightTime; // Timestamp of the last battle
	}

	struct EggBatch {
		uint256 holding;
		uint256 blockTime;
	}

	struct PendingOpen {
		address player;
		uint256 eggCount;
	}

	mapping(uint256 => Monster) public monsters;
	mapping(address => uint256) public leaderboard;
	address[] private leaderboardPlayers;
	mapping(address => bool) private isLeaderboardPlayer;
	mapping(address => uint256) public totalCheckIns;
	mapping(address => uint256) public lastCheckInTime;
	mapping(address => EggBatch) public holdingEggs;
	mapping(uint256 => PendingOpen) private pendingOpens;

	event CheckedIn(address indexed player, uint256 totalCount, uint256 reward);
	event EggMinted(address indexed owner, uint256 tokenId, uint256 power);
	event EggOpenRequested(address indexed player, uint256 requestId, uint256 eggCount);
	event BattleResult(uint256 tokenId, uint256 reward, uint256 dailyFightsUsed);
	event LevelUp(uint256 tokenId, uint256 newLevel, uint256 newPower);

	constructor(address _mtsTokenAddress, address _vrfCoordinator, uint256 _subId, bytes32 _keyHash) ERC721("MonsterNFT", "MNFT") VRFConsumerBaseV2Plus(_vrfCoordinator) {
		mtsToken = MTS(_mtsTokenAddress);
		coordinator = IVRFCoordinatorV2Plus(_vrfCoordinator);
		subscriptionId = _subId;
		keyHash = _keyHash;
	}

	modifier whenMinterConfigured() {
		require(isMinterConfigured(), "Game missing MINTER_ROLE");
		_;
	}

	function isMinterConfigured() public view returns (bool) {
		return mtsToken.hasRole(mtsToken.MINTER_ROLE(), address(this));
	}

	// --- Phase 1: Purchase eggs (burn MTS, record count) ---

	function mintEgg() external nonReentrant {
		uint256 cost = 300 * 10 ** mtsToken.decimals();
		mtsToken.burnFrom(msg.sender, cost);
		holdingEggs[msg.sender].holding += 1;
		holdingEggs[msg.sender].blockTime = block.number;
	}

	function mintMutiEgg(uint256 num) external nonReentrant {
		require(discountEggValue > 0, "not enought egg");
		require(discountEggValue >= num, "Purchase exceeds stock");
		discountEggValue = discountEggValue - num;
		uint256 cost = num * discountPrice * 10 ** mtsToken.decimals();
		mtsToken.burnFrom(msg.sender, cost);
		holdingEggs[msg.sender].holding += num;
		holdingEggs[msg.sender].blockTime = block.number;
	}

	// --- Phase 2: Request VRF randomness to open eggs (must wait 5 blocks after purchase) ---

	function openTheEgg() external nonReentrant returns (uint256 requestId) {
		uint256 eggCount = holdingEggs[msg.sender].holding;
		require(eggCount > 0, "No eggs to open");
		require(block.number >= holdingEggs[msg.sender].blockTime + 5, "Wait 5 blocks after purchase");

		// Clear eggs before external call (prevents double-open)
		delete holdingEggs[msg.sender];

		requestId = coordinator.requestRandomWords(
			VRFV2PlusClient.RandomWordsRequest({
				keyHash: keyHash,
				subId: subscriptionId,
				requestConfirmations: requestConfirmations,
				callbackGasLimit: callbackGasLimit,
				numWords: 1,
				extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: useNativePayment}))
			})
		);

		pendingOpens[requestId] = PendingOpen({player: msg.sender, eggCount: eggCount});
		emit EggOpenRequested(msg.sender, requestId, eggCount);
	}

	// --- Phase 3: Chainlink VRF callback — mint NFTs with verifiable randomness ---

	function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
		PendingOpen memory pending = pendingOpens[requestId];
		delete pendingOpens[requestId];

		for (uint256 i = 0; i < pending.eggCount; i++) {
			uint256 seed = uint256(keccak256(abi.encode(randomWords[0], i)));
			uint256 randomPower = (seed % 31) + 20;
			uint256 tokenId = _nextTokenId++;
			_safeMint(pending.player, tokenId);
			monsters[tokenId] = Monster({power: randomPower, level: 1, totalFights: 0, dailyFights: 0, lastFightTime: 0});
			emit EggMinted(pending.player, tokenId, randomPower);
		}
	}

	function addDiscountEggValue(uint256 eggValue, uint256 price) external onlyOwner nonReentrant {
		discountPrice = price;
		discountEggValue = eggValue;
	}

	// --- Core feature: battle (includes daily reset logic) ---

	function battle(uint256 tokenId, uint256 bossId) external nonReentrant whenMinterConfigured {
		require(ownerOf(tokenId) == msg.sender, "Not owner");
		Monster storage mon = monsters[tokenId];

		// Daily reset: compare "current day index" vs "last fight day index" (Unix time / 86400)
		uint256 currentDay = block.timestamp / 1 days;
		uint256 lastFightDay = mon.lastFightTime / 1 days;

		if (currentDay > lastFightDay) {
			mon.dailyFights = 0;
		}

		require(mon.dailyFights < 3, "Daily limit reached (3/3). Come back tomorrow!");

		// Multiplier range: 30% ~ 100%
		uint256 multiplier = (random(msg.sender, block.timestamp) % 71) + 30;
		uint256 rewardAmount = bossChose(tokenId, bossId, mon.power, multiplier);

		mtsToken.mint(msg.sender, rewardAmount);

		mon.dailyFights += 1;
		mon.totalFights += 1;
		mon.lastFightTime = block.timestamp;

		if (!isLeaderboardPlayer[msg.sender]) {
			isLeaderboardPlayer[msg.sender] = true;
			leaderboardPlayers.push(msg.sender);
		}
		leaderboard[msg.sender] = leaderboard[msg.sender] + rewardAmount;

		emit BattleResult(tokenId, rewardAmount, mon.dailyFights);

		// Level-up every 10 fights (max level 5)
		if (mon.totalFights % 10 == 0 && mon.level < 5) {
			mon.level += 1;
			mon.power += 5;
			emit LevelUp(tokenId, mon.level, mon.power);
		}
	}

	function bossChose(uint256 tokenId, uint256 bossId, uint256 power, uint256 multiplier) internal view returns (uint256) {
		uint256 amount = (power * multiplier * (10 ** mtsToken.decimals())) / 100;
		uint256 ran = (random(msg.sender, monsters[tokenId].totalFights + tokenId) % 100) + 1;

		if (bossId == 1) {
			return (amount * 67) / 100;
		} else if (bossId == 2) {
			return (ran > 30) ? ((amount * 90) / 100) : 0;
		} else if (bossId == 3) {
			return (ran > 50) ? ((amount * 120) / 100) : 0;
		} else if (bossId == 4) {
			return (ran > 70) ? ((amount * 150) / 100) : 0;
		}
		return 0;
	}

	function getRemainingBattles(uint256 tokenId) external view returns (uint256) {
		Monster memory mon = monsters[tokenId];
		uint256 currentDay = block.timestamp / 1 days;
		uint256 lastFightDay = mon.lastFightTime / 1 days;

		if (currentDay > lastFightDay) {
			return 3;
		} else {
			if (mon.dailyFights >= 3) return 0;
			return 3 - mon.dailyFights;
		}
	}

	function checkIn() external nonReentrant whenMinterConfigured {
		uint256 currentDay = block.timestamp / 1 days;
		uint256 lastCheckInDay = lastCheckInTime[msg.sender] / 1 days;

		require(currentDay > lastCheckInDay, "Already checked in today!");

		totalCheckIns[msg.sender] += 1;
		lastCheckInTime[msg.sender] = block.timestamp;

		uint256 rewardAmount = 10 * 10 ** mtsToken.decimals();
		mtsToken.mint(msg.sender, rewardAmount);

		emit CheckedIn(msg.sender, totalCheckIns[msg.sender], rewardAmount);
	}

	function canCheckIn(address player) external view returns (bool) {
		uint256 currentDay = block.timestamp / 1 days;
		uint256 lastCheckInDay = lastCheckInTime[player] / 1 days;
		return currentDay > lastCheckInDay;
	}

	function getLeaderboardCount() external view returns (uint256) {
		return leaderboardPlayers.length;
	}

	function getLeaderboardPage(uint256 offset, uint256 limit) external view returns (address[] memory players, uint256[] memory scores) {
		uint256 total = leaderboardPlayers.length;
		if (offset >= total || limit == 0) {
			return (new address[](0), new uint256[](0));
		}

		uint256 end = offset + limit;
		if (end > total) {
			end = total;
		}

		uint256 size = end - offset;
		players = new address[](size);
		scores = new uint256[](size);

		for (uint256 i = 0; i < size; i++) {
			address player = leaderboardPlayers[offset + i];
			players[i] = player;
			scores[i] = leaderboard[player];
		}
	}

	function random(address sender, uint256 salt) internal view returns (uint256) {
		return uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender, salt)));
	}
}
