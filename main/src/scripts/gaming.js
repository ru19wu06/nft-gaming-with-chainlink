import hardhat from "hardhat";
const { ethers, network } = hardhat;

const TOKEN_ADDRESS = "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1";
const GAME_ADDRESS = "0x7a2088a1bFc9d81c55368AE168C2C02570cB814F";
const VRF_MOCK_ADDRESS = "0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44"; // 填入 deploy 輸出的 VRF_MOCK_ADDRESS（local 才需要）

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
		console.log("Approval successful.");
	} else {
		console.log("Sufficient allowance already set, skipping.");
	}

	// --- Step C: Buy egg ---
	console.log("[Step 3] Buying egg (mintEgg)...");
	await (await game.mintEgg()).wait();
	console.log("Egg purchased. Waiting 5 blocks...");

	// Mine 5 blocks so openTheEgg() requirement is met
	await network.provider.send("hardhat_mine", ["0x5"]);

	// --- Step C2: Open egg (send VRF request) ---
	console.log("[Step 4] Opening egg (openTheEgg)...");
	const txOpen = await game.openTheEgg();
	const openReceipt = await txOpen.wait();

	const openEvent = openReceipt.logs
		.map((log) => {
			try { return game.interface.parseLog(log); } catch { return null; }
		})
		.find((e) => e && e.name === "EggOpenRequested");

	if (!openEvent) throw new Error("EggOpenRequested event not found.");
	const requestId = openEvent.args.requestId;
	console.log(`   VRF requestId: ${requestId}`);

	// --- Step C3: Fulfill VRF (local mock only) ---
	const isLocal = network.name === "localhost" || network.name === "hardhat";
	if (isLocal) {
		if (!VRF_MOCK_ADDRESS) throw new Error("Set VRF_MOCK_ADDRESS at top of script.");
		console.log("[Step 5] Triggering VRF fulfillment (Mock)...");
		const vrfMock = await ethers.getContractAt("VRFCoordinatorV2_5Mock", VRF_MOCK_ADDRESS);
		const txFulfill = await vrfMock.fulfillRandomWords(requestId, GAME_ADDRESS);
		const fulfillReceipt = await txFulfill.wait();

		const mintEvent = fulfillReceipt.logs
			.map((log) => {
				try { return game.interface.parseLog(log); } catch { return null; }
			})
			.find((e) => e && e.name === "EggMinted");

		if (!mintEvent) throw new Error("EggMinted event not found after VRF fulfillment.");

		const tokenId = mintEvent.args.tokenId;
		const power = mintEvent.args.power;
		console.log(`   Egg hatched! Token ID: ${tokenId}, Power: ${power}`);

		// --- Step D: View monster status ---
		console.log("[Step 6] Viewing monster details...");
		const monsterData = await game.monsters(tokenId);
		console.log(`   Level: ${monsterData.level}`);
		console.log(`   Daily fights: ${monsterData.dailyFights}/3`);

		// --- Step E: Battle (bossId 1~4) ---
		console.log("[Step 7] Starting battle (boss 1)!");
		const balanceBefore = await mtsToken.balanceOf(player.address);

		const txBattle = await game.battle(tokenId, 1);
		const battleReceipt = await txBattle.wait();

		const battleEvent = battleReceipt.logs
			.map((log) => {
				try { return game.interface.parseLog(log); } catch { return null; }
			})
			.find((e) => e && e.name === "BattleResult");

		const reward = battleEvent.args.reward;
		const balanceAfter = await mtsToken.balanceOf(player.address);
		const earned = balanceAfter - balanceBefore;

		console.log(`   Battle complete!`);
		console.log(`   Reward earned: ${ethers.formatEther(reward)} MTS`);
		console.log(`   Wallet balance change: +${ethers.formatEther(earned)} MTS`);
	}

	console.log("\nGame script finished.");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
