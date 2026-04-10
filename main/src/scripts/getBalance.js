import hardhat from "hardhat";

async function main() {
	const { ethers } = hardhat;

	const myAddress = "";

	const balanceInWei = await ethers.provider.getBalance(myAddress);

	const balanceInEth = ethers.formatEther(balanceInWei);

	console.log(`account address: ${myAddress}`);
	console.log(`value: ${balanceInEth} Polygon`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
