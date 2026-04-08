import hardhat from "hardhat";

async function main() {
  const { ethers } = hardhat;

  const myAddress = "0x508E06C9dDd54B0862611312f22244be0417b438";

  const balanceInWei = await ethers.provider.getBalance(myAddress);

  const balanceInEth = ethers.formatEther(balanceInWei);

  console.log(`account address: ${myAddress}`);
  console.log(`value: ${balanceInEth} Polygon`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
