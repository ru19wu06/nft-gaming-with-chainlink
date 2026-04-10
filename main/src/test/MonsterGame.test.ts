import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("MonsterGame", function () {
	// ─── VRF mock constants ────────────────────────────────────────────────────
	// Use zero fees so tests never hit InsufficientBalance inside the mock.
	const BASE_FEE = 0n;
	const GAS_PRICE = 0n;
	const WEI_PER_UNIT_LINK = ethers.parseEther("0.003"); // non-zero avoids potential div-by-zero
	const KEY_HASH = ethers.ZeroHash; // mock ignores keyHash

	// ─── Helpers ───────────────────────────────────────────────────────────────

	/** Deploy VRFCoordinatorV2_5Mock, create a funded subscription, return subId. */
	async function setupVRF() {
		const vrfCoordinator = await ethers.deployContract("VRFCoordinatorV2_5Mock", [BASE_FEE, GAS_PRICE, WEI_PER_UNIT_LINK]);
		await vrfCoordinator.waitForDeployment();

		const createSubTx = await vrfCoordinator.createSubscription();
		const receipt = await createSubTx.wait();

		// Extract subId from SubscriptionCreated event
		let subId = 0n;
		for (const log of receipt!.logs) {
			try {
				const parsed = vrfCoordinator.interface.parseLog({
					topics: log.topics as string[],
					data: log.data,
				});
				if (parsed && parsed.name === "SubscriptionCreated") {
					subId = parsed.args.subId as bigint;
					break;
				}
			} catch {}
		}

		await vrfCoordinator.fundSubscription(subId, ethers.parseEther("10"));
		return { vrfCoordinator, subId };
	}

	/**
	 * Full egg lifecycle helper:
	 *   1. Approve + mintEgg (burns MTS, records holding)
	 *   2. Mine 5 blocks
	 *   3. openTheEgg  → emits EggOpenRequested, returns requestId
	 *   4. vrfCoordinator.fulfillRandomWords  → triggers callback, mints NFT(s)
	 */
	async function mintAndOpenEgg(game: any, vrfCoordinator: any, mts: any, player: any, unit: bigint) {
		const cost = 300n * unit;
		await mts.connect(player).approve(await game.getAddress(), cost);
		await game.connect(player).mintEgg();

		await mine(5);

		const openTx = await game.connect(player).openTheEgg();
		const openReceipt = await openTx.wait();

		// Extract requestId from EggOpenRequested event
		let requestId = 0n;
		for (const log of openReceipt!.logs) {
			try {
				const parsed = game.interface.parseLog({
					topics: log.topics as string[],
					data: log.data,
				});
				if (parsed && parsed.name === "EggOpenRequested") {
					requestId = parsed.args.requestId as bigint;
					break;
				}
			} catch {}
		}

		await vrfCoordinator.fulfillRandomWords(requestId, await game.getAddress());
	}

	// ─── Fixtures ──────────────────────────────────────────────────────────────

	async function deployGameFixture() {
		const [owner, player1, player2, other] = await ethers.getSigners();

		const mts = await ethers.deployContract("MTS");
		await mts.waitForDeployment();

		const { vrfCoordinator, subId } = await setupVRF();

		const game = await ethers.deployContract("MonsterGame", [await mts.getAddress(), await vrfCoordinator.getAddress(), subId, KEY_HASH]);
		await game.waitForDeployment();

		// Register game as VRF consumer
		await vrfCoordinator.addConsumer(subId, await game.getAddress());

		// Grant MINTER_ROLE to game
		const minterRole = await mts.MINTER_ROLE();
		await mts.grantRole(minterRole, await game.getAddress());

		const unit = 10n ** BigInt(await mts.decimals());
		const seedAmount = 5000n * unit;
		await mts.mint(player1.address, seedAmount);
		await mts.mint(player2.address, seedAmount);

		return { owner, player1, player2, other, mts, game, vrfCoordinator, unit };
	}

	async function deployWithoutMinterRoleFixture() {
		const [owner, player] = await ethers.getSigners();

		const mts = await ethers.deployContract("MTS");
		await mts.waitForDeployment();

		const { vrfCoordinator, subId } = await setupVRF();

		const game = await ethers.deployContract("MonsterGame", [await mts.getAddress(), await vrfCoordinator.getAddress(), subId, KEY_HASH]);
		await game.waitForDeployment();

		await vrfCoordinator.addConsumer(subId, await game.getAddress());

		const unit = 10n ** BigInt(await mts.decimals());
		await mts.mint(player.address, 1000n * unit);

		return { owner, player, mts, game, vrfCoordinator, unit };
	}

	// ─── mintEgg ───────────────────────────────────────────────────────────────

	it("mintEgg burns MTS cost and records egg holding", async function () {
		const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
		const cost = 300n * unit;
		const balanceBefore = await mts.balanceOf(player1.address);

		await mts.connect(player1).approve(await game.getAddress(), cost);
		await game.connect(player1).mintEgg();

		expect(await mts.balanceOf(player1.address)).to.equal(balanceBefore - cost);
		const batch = await game.holdingEggs(player1.address);
		expect(batch.holding).to.equal(1n);
		expect(batch.blockTime).to.be.gt(0n);
	});

	// ─── openTheEgg (VRF two-phase) ────────────────────────────────────────────

	it("openTheEgg reverts before 5 blocks have passed", async function () {
		const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
		const cost = 300n * unit;
		await mts.connect(player1).approve(await game.getAddress(), cost);
		await game.connect(player1).mintEgg();

		// mine(3) → openTheEgg tx runs in block mintBlock+4, which is < mintBlock+5
		await mine(3);

		await expect(game.connect(player1).openTheEgg()).to.be.revertedWith("Wait 5 blocks after purchase");
	});

	it("openTheEgg requests VRF and fulfillment mints monster NFT with correct attrs", async function () {
		const { player1, mts, game, vrfCoordinator, unit } = await loadFixture(deployGameFixture);

		const cost = 300n * unit;
		await mts.connect(player1).approve(await game.getAddress(), cost);
		await game.connect(player1).mintEgg();

		await mine(5);

		// openTheEgg should emit EggOpenRequested
		const openTx = await game.connect(player1).openTheEgg();
		const openReceipt = await openTx.wait();

		let requestId = 0n;
		for (const log of openReceipt!.logs) {
			try {
				const parsed = game.interface.parseLog({
					topics: log.topics as string[],
					data: log.data,
				});
				if (parsed && parsed.name === "EggOpenRequested") {
					requestId = parsed.args.requestId as bigint;
					break;
				}
			} catch {}
		}
		expect(requestId).to.be.gt(0n);

		// holdingEggs should be cleared
		const batch = await game.holdingEggs(player1.address);
		expect(batch.holding).to.equal(0n);

		// VRF callback mints the NFT and emits EggMinted
		await expect(vrfCoordinator.fulfillRandomWords(requestId, await game.getAddress()))
			.to.emit(game, "EggMinted")
			.withArgs(player1.address, 0n, anyValue);

		expect(await game.ownerOf(0n)).to.equal(player1.address);

		const mon = await game.monsters(0n);
		expect(mon.level).to.equal(1n);
		expect(mon.totalFights).to.equal(0n);
		expect(mon.dailyFights).to.equal(0n);
		expect(mon.lastFightTime).to.equal(0n);
		expect(mon.power).to.be.gte(20n);
		expect(mon.power).to.be.lte(50n);
	});

	it("openTheEgg reverts when no eggs are held", async function () {
		const { player1, game } = await loadFixture(deployGameFixture);
		await expect(game.connect(player1).openTheEgg()).to.be.revertedWith("No eggs to open");
	});

	// ─── mintMutiEgg ───────────────────────────────────────────────────────────

	it("mintMutiEgg consumes discount stock and VRF mints multiple NFTs", async function () {
		const { player1, mts, game, vrfCoordinator, unit } = await loadFixture(deployGameFixture);
		const num = 3n;
		const expectedCost = num * 220n * unit;
		const stockBefore = await game.discountEggValue();
		const balanceBefore = await mts.balanceOf(player1.address);

		await mts.connect(player1).approve(await game.getAddress(), expectedCost);
		await game.connect(player1).mintMutiEgg(num);

		expect(await game.discountEggValue()).to.equal(stockBefore - num);
		expect(await mts.balanceOf(player1.address)).to.equal(balanceBefore - expectedCost);

		const batch = await game.holdingEggs(player1.address);
		expect(batch.holding).to.equal(num);

		// Open eggs via VRF
		await mine(5);
		const openTx = await game.connect(player1).openTheEgg();
		const openReceipt = await openTx.wait();

		let requestId = 0n;
		for (const log of openReceipt!.logs) {
			try {
				const parsed = game.interface.parseLog({
					topics: log.topics as string[],
					data: log.data,
				});
				if (parsed && parsed.name === "EggOpenRequested") {
					requestId = parsed.args.requestId as bigint;
					break;
				}
			} catch {}
		}

		await vrfCoordinator.fulfillRandomWords(requestId, await game.getAddress());

		// All 3 NFTs should be minted
		expect(await game.balanceOf(player1.address)).to.equal(num);
		const mon0 = await game.monsters(0n);
		const mon2 = await game.monsters(2n);
		expect(mon0.level).to.equal(1n);
		expect(mon2.level).to.equal(1n);
	});

	it("reverts mintMutiEgg when purchase exceeds stock", async function () {
		const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
		const num = 101n;
		await mts.connect(player1).approve(await game.getAddress(), num * 220n * unit);

		await expect(game.connect(player1).mintMutiEgg(num)).to.be.revertedWith("Purchase exceeds stock");
	});

	it("only owner can update discount egg settings", async function () {
		const { owner, player1, game } = await loadFixture(deployGameFixture);

		// VRFConsumerBaseV2Plus uses ConfirmedOwner — reverts with string, not custom error
		await expect(game.connect(player1).addDiscountEggValue(50n, 180n)).to.be.revertedWith("Only callable by owner");

		await game.connect(owner).addDiscountEggValue(50n, 180n);
		expect(await game.discountEggValue()).to.equal(50n);
		expect(await game.discountPrice()).to.equal(180n);
	});

	// ─── battle ────────────────────────────────────────────────────────────────

	it("battle updates usage, reward and leaderboard", async function () {
		const { player1, mts, game, vrfCoordinator, unit } = await loadFixture(deployGameFixture);
		await mintAndOpenEgg(game, vrfCoordinator, mts, player1, unit);

		const balanceBefore = await mts.balanceOf(player1.address);

		await expect(game.connect(player1).battle(0n, 1n)).to.emit(game, "BattleResult").withArgs(0n, anyValue, 1n);

		const mon = await game.monsters(0n);
		expect(mon.dailyFights).to.equal(1n);
		expect(mon.totalFights).to.equal(1n);
		expect(mon.lastFightTime).to.be.gt(0n);

		expect(await mts.balanceOf(player1.address)).to.be.gt(balanceBefore);
		expect(await game.getLeaderboardCount()).to.equal(1n);
		expect(await game.leaderboard(player1.address)).to.be.gt(0n);
	});

	it("reverts battle when caller is not the NFT owner", async function () {
		const { player1, other, mts, game, vrfCoordinator, unit } = await loadFixture(deployGameFixture);
		await mintAndOpenEgg(game, vrfCoordinator, mts, player1, unit);

		await expect(game.connect(other).battle(0n, 1n)).to.be.revertedWith("Not owner");
	});

	it("enforces 3 battles per day and resets next day", async function () {
		const { player1, mts, game, vrfCoordinator, unit } = await loadFixture(deployGameFixture);
		await mintAndOpenEgg(game, vrfCoordinator, mts, player1, unit);

		await game.connect(player1).battle(0n, 1n);
		await game.connect(player1).battle(0n, 1n);
		await game.connect(player1).battle(0n, 1n);

		await expect(game.connect(player1).battle(0n, 1n)).to.be.revertedWith("Daily limit reached (3/3). Come back tomorrow!");
		expect(await game.getRemainingBattles(0n)).to.equal(0n);

		await time.increase(24 * 60 * 60 + 1);
		await game.connect(player1).battle(0n, 1n);

		const mon = await game.monsters(0n);
		expect(mon.dailyFights).to.equal(1n);
		expect(mon.totalFights).to.equal(4n);
		expect(await game.getRemainingBattles(0n)).to.equal(2n);
	});

	it("levels up after every 10 total fights", async function () {
		const { player1, mts, game, vrfCoordinator, unit } = await loadFixture(deployGameFixture);
		await mintAndOpenEgg(game, vrfCoordinator, mts, player1, unit);

		const initialPower = (await game.monsters(0n)).power;

		for (let i = 0; i < 10; i++) {
			if (i > 0 && i % 3 === 0) {
				await time.increase(24 * 60 * 60 + 1);
			}
			await game.connect(player1).battle(0n, 1n);
		}

		const mon = await game.monsters(0n);
		expect(mon.totalFights).to.equal(10n);
		expect(mon.level).to.equal(2n);
		expect(mon.power).to.equal(initialPower + 5n);
	});

	// ─── checkIn ───────────────────────────────────────────────────────────────

	it("checkIn can only happen once per day and grants reward", async function () {
		const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
		const reward = 10n * unit;
		const before = await mts.balanceOf(player1.address);

		await game.connect(player1).checkIn();

		expect(await game.totalCheckIns(player1.address)).to.equal(1n);
		expect(await game.canCheckIn(player1.address)).to.equal(false);
		expect(await mts.balanceOf(player1.address)).to.equal(before + reward);

		await expect(game.connect(player1).checkIn()).to.be.revertedWith("Already checked in today!");

		await time.increase(24 * 60 * 60 + 1);
		expect(await game.canCheckIn(player1.address)).to.equal(true);

		await game.connect(player1).checkIn();
		expect(await game.totalCheckIns(player1.address)).to.equal(2n);
	});

	// ─── MINTER_ROLE guard ─────────────────────────────────────────────────────

	it("reverts battle/checkIn when game does not have MINTER_ROLE", async function () {
		const { player, mts, game, vrfCoordinator, unit } = await loadFixture(deployWithoutMinterRoleFixture);
		await mintAndOpenEgg(game, vrfCoordinator, mts, player, unit);

		await expect(game.connect(player).battle(0n, 1n)).to.be.revertedWith("Game missing MINTER_ROLE");
		await expect(game.connect(player).checkIn()).to.be.revertedWith("Game missing MINTER_ROLE");
	});

	// ─── leaderboard pagination ────────────────────────────────────────────────

	it("returns leaderboard pages and empty result for out-of-range offset", async function () {
		const { player1, player2, mts, game, vrfCoordinator, unit } = await loadFixture(deployGameFixture);

		await mintAndOpenEgg(game, vrfCoordinator, mts, player1, unit);
		await mintAndOpenEgg(game, vrfCoordinator, mts, player2, unit);
		await game.connect(player1).battle(0n, 1n);
		await game.connect(player2).battle(1n, 1n);

		expect(await game.getLeaderboardCount()).to.equal(2n);

		const [players, scores] = await game.getLeaderboardPage(0n, 10n);
		expect(players.length).to.equal(2);
		expect(scores.length).to.equal(2);
		expect(players[0]).to.equal(player1.address);
		expect(players[1]).to.equal(player2.address);
		expect(scores[0]).to.be.gt(0n);
		expect(scores[1]).to.be.gt(0n);

		const [emptyPlayers, emptyScores] = await game.getLeaderboardPage(2n, 10n);
		expect(emptyPlayers.length).to.equal(0);
		expect(emptyScores.length).to.equal(0);
	});
});
