// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MTS.sol"; 

contract MonsterGame is ERC721, Ownable, ReentrancyGuard {
    MTS public mtsToken;
    uint256 private _nextTokenId;
    uint256 public discountPrice = 220; 
    uint256 public discountEggValue = 100; 


    struct Monster {
        uint256 power;           // Combat power (20~50)
        uint256 level;           // Level (max 5)
        uint256 totalFights;     // Lifetime battle count (used for level up)
        uint256 dailyFights;     // Battles used today (daily limit: 3)
        uint256 lastFightTime;   // Timestamp of the last battle
    }

    mapping(uint256 => Monster) public monsters;
    mapping(address => uint256) public leaderboard;
    address[] private leaderboardPlayers;
    mapping(address => bool) private isLeaderboardPlayer;
    mapping(address => uint256) public totalCheckIns;    // Total check-in count per address
    mapping(address => uint256) public lastCheckInTime;  // Timestamp of the last check-in

    event CheckedIn(address indexed player, uint256 totalCount, uint256 reward);

    event EggMinted(address indexed owner, uint256 tokenId, uint256 power);
    event BattleResult(uint256 tokenId, uint256 reward, uint256 dailyFightsUsed);
    event LevelUp(uint256 tokenId, uint256 newLevel, uint256 newPower);

    constructor(address _mtsTokenAddress) ERC721("MonsterNFT", "MNFT") Ownable(msg.sender) {
        mtsToken = MTS(_mtsTokenAddress);
    }

    modifier whenMinterConfigured() {
        require(isMinterConfigured(), "Game missing MINTER_ROLE");
        _;
    }

    function isMinterConfigured() public view returns (bool) {
        return mtsToken.hasRole(mtsToken.MINTER_ROLE(), address(this));
    }

    // --- Core feature: mint an egg ---
    function mintEgg() external nonReentrant {
        uint256 cost = 300 * 10 ** mtsToken.decimals();
        mtsToken.burnFrom(msg.sender, cost);

        // Random combat power: 20 ~ 50
        uint256 randomPower = (random(msg.sender, _nextTokenId) % 31) + 20;

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        // Initialize monster data
        monsters[tokenId] = Monster({
            power: randomPower,
            level: 1,
            totalFights: 0,
            dailyFights: 0,
            lastFightTime: 0 
        });

        emit EggMinted(msg.sender, tokenId, randomPower);
    }

    function mintMutiEgg(uint256 num) external nonReentrant {
        require(discountEggValue >0,"not enought egg");
        require(discountEggValue >= num, "Purchase exceeds stock");
        discountEggValue = discountEggValue - num;
        uint256 cost = num * discountPrice * 10 ** mtsToken.decimals();
        mtsToken.burnFrom(msg.sender, cost);


        for(uint256 a =0;a<num;a++){
            // Random combat power: 20 ~ 50
            uint256 randomPower = (random(msg.sender, _nextTokenId) % 31) + 20;

            uint256 tokenId = _nextTokenId++;
            _safeMint(msg.sender, tokenId);

            // Initialize monster data
            monsters[tokenId] = Monster({
                power: randomPower,
                level: 1,
                totalFights: 0,
                dailyFights: 0,
                lastFightTime: 0 
            });

            emit EggMinted(msg.sender, tokenId, randomPower);
        }
    }

    function addDiscountEggValue(uint256 eggValue,uint256 price) external onlyOwner nonReentrant {
        discountPrice = price; 
        discountEggValue = eggValue; 
    }

    // --- Core feature: battle (includes daily reset logic) ---
    function battle(uint256 tokenId,uint256 bossId) external nonReentrant whenMinterConfigured {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        Monster storage mon = monsters[tokenId];

        // === 1. Daily reset check ===
        // Compare "current day index" vs "last fight day index" (Unix time / 86400)
        // This resets automatically at UTC 00:00
        uint256 currentDay = block.timestamp / 1 days;
        uint256 lastFightDay = mon.lastFightTime / 1 days;

        if (currentDay > lastFightDay) {
            // If the current day is greater than the last fight day, reset daily count
            mon.dailyFights = 0;
        }

        // === 2. Validate today's battle limit ===
        require(mon.dailyFights < 3, "Daily limit reached (3/3). Come back tomorrow!");

        // === 3. Battle and reward calculation ===
        // Multiplier range: 30% ~ 100%
        uint256 multiplier = (random(msg.sender, block.timestamp) % 71) + 30;
        uint256 rewardAmount = bossChose(tokenId, bossId, mon.power, multiplier);
        
        mtsToken.mint(msg.sender, rewardAmount);

        // === 4. Update state ===
        mon.dailyFights += 1;          // Daily count +1
        mon.totalFights += 1;          // Lifetime count +1
        mon.lastFightTime = block.timestamp; // Update last battle timestamp
        if (!isLeaderboardPlayer[msg.sender]) {
            isLeaderboardPlayer[msg.sender] = true;
            leaderboardPlayers.push(msg.sender);
        }
        leaderboard[msg.sender] =  leaderboard[msg.sender] + rewardAmount;

        emit BattleResult(tokenId, rewardAmount, mon.dailyFights);

        // === 5. Level-up logic (every 10 fights) ===
        if (mon.totalFights % 10 == 0 && mon.level < 5) {
            mon.level += 1;
            mon.power += 5;
            emit LevelUp(tokenId, mon.level, mon.power);
        }
    }


    function bossChose(uint256 tokenId, uint256 bossId, uint256 power, uint256 multiplier) internal view returns (uint256){
        uint256 amount = (power * multiplier * (10 ** mtsToken.decimals())) / 100;
        uint256 ran = (random(msg.sender, monsters[tokenId].totalFights + tokenId) % 100) + 1;

        if(bossId == 1){
            return amount * 67 / 100;
        } else if(bossId == 2){
            return (ran > 30) ? (amount * 90 / 100) : 0;
        } else if(bossId == 3){
            return (ran > 50) ? (amount * 120 / 100) : 0;
        } else if(bossId == 4){
            return (ran > 70) ? (amount * 150 / 100) : 0;
        }
        return 0;
    }

    // Returns remaining battles for this monster today (for frontend)
    function getRemainingBattles(uint256 tokenId) external view returns (uint256) {
        Monster memory mon = monsters[tokenId];
        uint256 currentDay = block.timestamp / 1 days;
        uint256 lastFightDay = mon.lastFightTime / 1 days;

        if (currentDay > lastFightDay) {
            return 3; // New day: 3 battles available
        } else {
            if (mon.dailyFights >= 3) return 0;
            return 3 - mon.dailyFights;
        }
    }

    function checkIn() external nonReentrant whenMinterConfigured {
        // 1. New day check
        uint256 currentDay = block.timestamp / 1 days;
        uint256 lastCheckInDay = lastCheckInTime[msg.sender] / 1 days;

        require(currentDay > lastCheckInDay, "Already checked in today!");

        // 2. Update state
        totalCheckIns[msg.sender] += 1;
        lastCheckInTime[msg.sender] = block.timestamp;

        // 3. Grant reward (fixed at 10 MTS, can be adjusted)
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

    function getLeaderboardPage(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory players, uint256[] memory scores)
    {
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
