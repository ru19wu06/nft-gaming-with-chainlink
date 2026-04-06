# MonsterSage Contracts

## Setup

Install dependencies:

```bash
npm install
```

Create `.env` (or update existing one) with network settings used in `hardhat.config.cjs`:

```bash
ENIMAIN_RPC_URL=
ENITEST_RPC_URL=
PRIVATE_KEY=
ENITESTSCAN_API_KEY=
```

## Common Commands

```bash
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
```

## Deploy (`scripts/deploy.js`)

`deploy.js` supports:

1. Deploy new `MTS` + deploy `MonsterGame` + grant `MINTER_ROLE`
2. Use existing `MTS` address + deploy `MonsterGame` + grant `MINTER_ROLE`
3. Deploy `MTSPresale` (IDO) after game deployment
4. If `PAY_TOKEN_ADDRESS` is not provided, IDO defaults to native coin mode (`payToken = 0x0000000000000000000000000000000000000000`, e.g. EGAS)
5. Automatically funds `MTSPresale` with `500000 MTS` as initial IDO inventory

### Mode A: Deploy new MTS

```bash
npx hardhat run scripts/deploy.js --network enitest
```

### Mode B: Use existing MTS

```bash
MTS_ADDRESS=0xYourMtsAddress npx hardhat run scripts/deploy.js --network enitest
```

### Optional: Use ERC20 as IDO payment token

```bash
PAY_TOKEN_ADDRESS=0xYourErc20Token npx hardhat run scripts/deploy.js --network enitest
```

### Important

- If `MTS_ADDRESS` is provided, it must be a valid address.
- The deployer account must have `DEFAULT_ADMIN_ROLE` on that MTS contract, otherwise `grantRole(MINTER_ROLE, monsterGame)` will fail.
- Script output includes addresses:
  - `MTS_ADDRESS=...`
  - `MONSTER_GAME_ADDRESS=...`
  - `PAY_TOKEN_ADDRESS=...`
  - `MTS_PRESALE_ADDRESS=...`
