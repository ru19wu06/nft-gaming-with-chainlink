import hardhat from "hardhat";

async function main() {
	console.log("Deploy...");

	const LotteryV2 = await hardhat.ethers.deployContract("LotteryV2_5");
	await LotteryV2.waitForDeployment();
	const contractAddress = await LotteryV2.getAddress();
	console.log(`Deployed LotteryV2: ${contractAddress}`);

	const tx = await LotteryV2.enter({
		value: hardhat.ethers.parseEther("0.01"),
	});
	await tx.wait();
	console.log("tx info: ", tx);
	const tx2 = await LotteryV2.drawRandom();
	await tx2.wait();
	console.log("tx info: ", tx2);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
