import hardhat from "hardhat";
const { ethers } = hardhat;

const TOKEN_ADDRESS = "0x8a92913959e33FEb641a88C8DB855C207CbBB54b";
const GAME_ADDRESS = "0x625c2b15B09D7826a8FEe083C535dBc2f2a63d77";

async function main() {
	// 1. Get test account (player)
	const [player] = await ethers.getSigners();
	console.log(`Player address: ${player.address}`);

	// 2. Connect to deployed contracts using getContractAt
	const mtsToken = await ethers.getContractAt("MTS", TOKEN_ADDRESS);
	const game = await ethers.getContractAt("MonsterGame", GAME_ADDRESS);

	// --- Step A: Ensure player has enough MTS tokens ---
	console.log("\n[Step 1] Checking balance...");
	let balance = await mtsToken.balanceOf(player.address);
	const needed = ethers.parseEther("1000"); // Prepare 1000 MTS

	if (balance < needed) {
		console.log("   Insufficient balance, minting 1000 MTS...");
		// As deployer, you typically have MINTER_ROLE
		try {
			// Requires MINTER_ROLE or public mint permission
			await (await mtsToken.mint(player.address, needed)).wait();
			console.log("   Mint successful.");
		} catch (e) {
			console.log("   Unable to mint tokens. Check if you have MINTER_ROLE.");
			// If this fails, you may need to manually transfer tokens
		}
	} else {
		console.log(`   Balance sufficient: ${ethers.formatEther(balance)} MTS`);
	}

	// --- Step B: Approve ---
	console.log("[Step 2] Approving game contract to spend tokens...");
	const cost = ethers.parseEther("300"); // Egg costs 300 MTS

	// Check current allowance
	const allowance = await mtsToken.allowance(player.address, GAME_ADDRESS);
	if (allowance < cost) {
		const txApprove = await mtsToken.approve(GAME_ADDRESS, ethers.parseEther("10000")); // Approve a large amount
		await txApprove.wait();
		console.log("   Approval successful.");
	} else {
		console.log("   Sufficient allowance already set, skipping.");
	}

	// --- Step C: Buy and hatch egg (Mint NFT) ---
	console.log("[Step 3] Buying and hatching monster egg...");
	const txMint = await game.mintEgg();
	const receipt = await txMint.wait();

	// Filter EggMinted event
	const mintEvent = receipt.logs
		.map((log) => {
			try {
				return game.interface.parseLog(log);
			} catch (e) {
				return null;
			}
		})
		.find((event) => event && event.name === "EggMinted");

	if (!mintEvent) {
		throw new Error("EggMinted event not found. Mint may have failed.");
	}

	const tokenId = mintEvent.args.tokenId;
	const power = mintEvent.args.power;

	console.log(`Egg hatched successfully!`);
	console.log(`Token ID: ${tokenId}`);
	console.log(`Power: ${power}`);

	// --- Step D: View monster status ---
	console.log("[Step 4] Viewing monster details...");
	const monsterData = await game.monsters(tokenId);
	console.log(`Level: ${monsterData.level}`);
	console.log(`Daily fights: ${monsterData.dailyFights}/3`);

	// --- Step E: Battle ---
	console.log("[Step 5] Starting battle!");

	// Record balance before battle
	const balanceBefore = await mtsToken.balanceOf(player.address);

	const txBattle = await game.battle(tokenId);
	const battleReceipt = await txBattle.wait();

	// Parse BattleResult event
	const battleEvent = battleReceipt.logs
		.map((log) => {
			try {
				return game.interface.parseLog(log);
			} catch (e) {
				return null;
			}
		})
		.find((event) => event && event.name === "BattleResult");

	const reward = battleEvent.args.reward;

	// Record balance after battle
	const balanceAfter = await mtsToken.balanceOf(player.address);
	const earned = balanceAfter - balanceBefore;

	console.log(`   Battle complete!`);
	console.log(`   Reward earned: ${ethers.formatEther(reward)} MTS`);
	console.log(`   Wallet balance change: +${ethers.formatEther(earned)} MTS`);

	console.log("\nGame script finished.");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
