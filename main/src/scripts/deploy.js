import hardhat from "hardhat";

const IDO_ALLOCATION = hardhat.ethers.parseUnits("500000", 18);

const normalizeAddress = (value, envName) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!hardhat.ethers.isAddress(trimmed)) {
    throw new Error(`Invalid ${envName}: ${trimmed}`);
  }
  return hardhat.ethers.getAddress(trimmed);
};

async function main() {
  console.log("Deploy...");

  const existingMtsAddress = normalizeAddress(
    process.env.MTS_ADDRESS,
    "MTS_ADDRESS",
  );
  const existingPayTokenAddress =
    normalizeAddress(process.env.PAY_TOKEN_ADDRESS, "PAY_TOKEN_ADDRESS") ??
    normalizeAddress(process.env.USDT_ADDRESS, "USDT_ADDRESS");

  let mtsToken;
  let tokenAddress;

  if (existingMtsAddress) {
    tokenAddress = existingMtsAddress;
    mtsToken = await hardhat.ethers.getContractAt("MTS", tokenAddress);
    console.log(`Using existing MTS Token: ${tokenAddress}`);
  } else {
    mtsToken = await hardhat.ethers.deployContract("MTS");
    await mtsToken.waitForDeployment();
    tokenAddress = await mtsToken.getAddress();
    console.log(`Deployed MTS Token: ${tokenAddress}`);
  }

  const monsterGame = await hardhat.ethers.deployContract("MonsterGame", [
    tokenAddress,
  ]);
  await monsterGame.waitForDeployment();
  const gameAddress = await monsterGame.getAddress();
  console.log(`Deployed MonsterGame: ${gameAddress}`);

  const MINTER_ROLE = await mtsToken.MINTER_ROLE();
  const hasMinterRole = await mtsToken.hasRole(MINTER_ROLE, gameAddress);
  if (!hasMinterRole) {
    try {
      const tx = await mtsToken.grantRole(MINTER_ROLE, gameAddress);
      await tx.wait();
    } catch (error) {
      throw new Error(
        `Failed to grant MINTER_ROLE to MonsterGame (${gameAddress}) on MTS (${tokenAddress}). ` +
          "Ensure deployer has DEFAULT_ADMIN_ROLE on MTS. " +
          `Original error: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  const isConfigured = await mtsToken.hasRole(MINTER_ROLE, gameAddress);
  if (!isConfigured) {
    throw new Error("MonsterGame MINTER_ROLE configuration failed");
  }
  console.log("MonsterGame MINTER_ROLE configured: true");

  const payTokenAddress = existingPayTokenAddress ?? hardhat.ethers.ZeroAddress;
  if (!existingPayTokenAddress) {
    console.log(
      `PAY_TOKEN_ADDRESS not provided, defaulting payToken to native coin mode (EGAS): ${payTokenAddress}`,
    );
  } else {
    console.log(`Using PAY token: ${payTokenAddress}`);
  }

  const mtsPresale = await hardhat.ethers.deployContract("MTSPresale", [
    tokenAddress,
    payTokenAddress,
  ]);
  await mtsPresale.waitForDeployment();
  const presaleAddress = await mtsPresale.getAddress();
  console.log(`Deployed MTSPresale: ${presaleAddress}`);

  const [deployer] = await hardhat.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer signer available. Check PRIVATE_KEY/accounts config for the selected network.",
    );
  }
  const deployerAddress = await deployer.getAddress();
  let deployerBalance = await mtsToken.balanceOf(deployerAddress);

  if (deployerBalance < IDO_ALLOCATION) {
    const shortfall = IDO_ALLOCATION - deployerBalance;
    const canMint = await mtsToken.hasRole(MINTER_ROLE, deployerAddress);
    if (canMint) {
      const mintTx = await mtsToken.mint(deployerAddress, shortfall);
      await mintTx.wait();
      deployerBalance = await mtsToken.balanceOf(deployerAddress);
      console.log(
        `Minted ${hardhat.ethers.formatUnits(
          shortfall,
          18,
        )} MTS to deployer for IDO allocation`,
      );
    }
  }

  if (deployerBalance < IDO_ALLOCATION) {
    throw new Error(
      `Insufficient deployer MTS balance for IDO allocation. Need ${hardhat.ethers.formatUnits(
        IDO_ALLOCATION,
        18,
      )} MTS, have ${hardhat.ethers.formatUnits(deployerBalance, 18)} MTS.`,
    );
  }

  const transferTx = await mtsToken.transfer(presaleAddress, IDO_ALLOCATION);
  await transferTx.wait();
  const presaleMtsBalance = await mtsToken.balanceOf(presaleAddress);
  console.log(
    `Funded MTSPresale with ${hardhat.ethers.formatUnits(
      IDO_ALLOCATION,
      18,
    )} MTS (balance: ${hardhat.ethers.formatUnits(presaleMtsBalance, 18)})`,
  );

  console.log(`NEXT_PUBLIC_MTS_ADDRESS=${tokenAddress}`);
  console.log(`NEXT_PUBLIC_MONSTER_GAME_ADDRESS=${gameAddress}`);
  console.log(`NEXT_PUBLIC_PAY_TOKEN_ADDRESS=${payTokenAddress}`);
  console.log(`NEXT_PUBLIC_MTS_PRESALE_ADDRESS=${presaleAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
