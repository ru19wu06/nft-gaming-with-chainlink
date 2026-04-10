# MonsterSaga — GameFi on Polygon

MonsterSaga is a GameFi project built on Polygon. Players mint Monster NFTs with randomized power and rarity, battle bosses to earn MTS tokens, and level up their monsters over time.
Randomness is sourced from **Chainlink VRF v2.5** using a pre-registered subscription.

## Contracts

### MTS Token (`MTS.sol`)
- ERC20 game currency
- Initial supply: **7,500,000 MTS** minted to deployer
- Maximum supply: **80,000,000 MTS**
- `MINTER_ROLE` required to mint — granted to `MonsterGame` on deployment
- Burnable via `burn()` and `burnFrom()`

### MonsterGame (`gamingAndNft.sol`)
- ERC721 Monster NFTs with on-chain stats
- **Mint Egg**: costs 300 MTS, generates a monster with random power (20–50)
- **Bulk Mint**: discounted at 220 MTS each, limited by discount stock
- **Battle System**: fight one of 4 bosses, earn MTS rewards
  - Boss 1: 67% reward rate (guaranteed win)
  - Boss 2: 90% reward rate (70% success chance)
  - Boss 3: 120% reward rate (50% success chance)
  - Boss 4: 150% reward rate (30% success chance)
- **Daily Limit**: 3 battles per monster per day, resets at UTC midnight
- **Level Up**: every 10 total battles, power increases by 5 (max level 5)
- **Daily Check-in**: earn 10 MTS once per day
- **Leaderboard**: tracks total rewards earned per player

### MTSPresale (`ido.sol`)
- IDO contract for the initial MTS token sale
- Fixed price: **0.02 per MTS**
- Hard cap: **500,000 MTS**
- Supports native coin (MATIC) or any ERC20 as payment
- Owner can withdraw funds and unsold tokens after sale

### Lottery (`chinlink.sol`)
- Standalone lottery powered by **Chainlink VRF v2.5**
- Entry fee: 0.01 ETH
- Randomness is verifiably fair — sourced from Chainlink, not manipulable on-chain
- Network: Polygon
- VRF Coordinator: `0xec0Ed46f36576541C75739E915ADbCb3DE24bD77`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.28 |
| Framework | Hardhat |
| Token Standards | OpenZeppelin ERC20, ERC721 |
| Access Control | OpenZeppelin AccessControl, Ownable |
| Randomness | Chainlink VRF v2.5 |
| Network | Polygon |
| Config & Tests | TypeScript |
| Testing | Mocha + Chai |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Environment Variables

Create a `.env` file in `main/src/`:

```env
PRIVATE_KEY=your_wallet_private_key
POLYGON_RPC=https://polygon-mainnet.g.alchemy.com/v2/your_key

---

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
# Run all tests
npx hardhat test

# Filter tests by keyword
npx hardhat test --grep "mint"
npx hardhat test --grep "battle"
npx hardhat test --grep "withdraw"
npx hardhat test --grep "Deployment"


### Gas Report

```bash
REPORT_GAS=true npx hardhat test
```

### Coverage Report

```bash
npx hardhat coverage
```

---

## Deployment

### Mode A — Deploy everything from scratch

```bash
npx hardhat run scripts/deploy.js --network polygon
```

### Mode B — Reuse an existing MTS contract

```bash
MTS_ADDRESS=0xYourMtsAddress npx hardhat run scripts/deploy.js --network polygon
```

> The deployer must hold `DEFAULT_ADMIN_ROLE` on the existing MTS contract so the script can grant `MINTER_ROLE` to `MonsterGame`.

### Mode C — Use an ERC20 token as IDO payment

```bash
PAY_TOKEN_ADDRESS=0xYourErc20Token npx hardhat run scripts/deploy.js --network polygon
```

> If `PAY_TOKEN_ADDRESS` is omitted, the IDO defaults to native coin mode (MATIC).

### Deploy on Local Hardhat Node

```bash
# Terminal 1 — start a local node
npx hardhat node

# Terminal 2 — deploy
npx hardhat run scripts/deploy.js --network localhost
```

### Deploy Chainlink Lottery

```bash
npx hardhat run scripts/chainlink/deployChainlink.js --network polygon
```

> **Before deploying the lottery**, register a VRF subscription at [vrf.chain.link](https://vrf.chain.link), fund it with LINK, and update `subscriptionId` in `chinlink.sol`.


## Post-Deployment Checklist

| Step | Done by |
|------|---------|
| Grant `MINTER_ROLE` to MonsterGame on MTS | `deploy.js` automatically |
| Fund MTSPresale with 500,000 MTS | `deploy.js` automatically |
| Add LotteryV2_5 as VRF consumer | Manually on vrf.chain.link |

---

## Other Scripts

```bash
# Check token balance
npx hardhat run scripts/getBalance.js --network polygon

# Mint tokens manually
npx hardhat run scripts/mintToken.js --network polygon

# Interact with the game
npx hardhat run scripts/gaming.js --network polygon

# Interact with Chainlink Lottery
npx hardhat run scripts/chainlink/interactChainlink.js --network polygon
```

---

## Project Structure

```
main/src/
├── contracts/
│   ├── MTS.sol                    # ERC20 game token
│   ├── gamingAndNft.sol           # ERC721 monster game
│   ├── ido.sol                    # IDO presale
│   └── chinlink.sol               # Chainlink VRF lottery
├── scripts/
│   ├── deploy.js                  # Main deployment script
│   ├── gaming.js                  # Game interaction
│   ├── mintToken.js               # Token minting
│   ├── getBalance.js              # Balance checker
│   └── chainlink/
│       ├── deployChainlink.js
│       └── interactChainlink.js
├── test/
│   ├── MTS.test.ts                # Token unit tests       (17 cases)
│   ├── MTSPresale.test.ts         # IDO unit tests         (26 cases)
│   └── MonsterGame.test.ts        # Game unit tests        (11 cases)
├── hardhat.config.ts
├── tsconfig.json
└── package.json
```

