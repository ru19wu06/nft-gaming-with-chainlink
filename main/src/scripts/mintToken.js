import hardhat from "hardhat";
const { ethers } = hardhat;

const TOKEN_ADDRESS = process.env.MTS_ADDRESS ?? "";
const TO_ADDRESS = process.env.TO_ADDRESS ?? "";
const AMOUNT = process.env.MINT_AMOUNT ?? "5000";

async function main() {
  const code = await ethers.provider.getCode(TOKEN_ADDRESS);
  if (code === "0x") {
    throw new Error(
      `No contract found at TOKEN_ADDRESS: ${TOKEN_ADDRESS}. Please use deployed MTS address.`
    );
  }

  const mtsToken = await ethers.getContractAt("MTS", TOKEN_ADDRESS);
  const amount = ethers.parseUnits(AMOUNT, 18);
  const tx = await mtsToken.mint(TO_ADDRESS, amount);
  const receipt = await tx.wait();

  console.log(`Mint success. txHash=${tx.hash}`);
  console.log(`Minted ${AMOUNT} MTS to ${TO_ADDRESS}`);
  console.log(`Block number: ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
