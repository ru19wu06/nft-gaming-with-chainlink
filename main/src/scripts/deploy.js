import hardhat from "hardhat";

const { ethers, network } = hardhat;

const IDO_ALLOCATION = ethers.parseUnits("500000", 18);

// Polygon Amoy mainnet VRF config
const POLYGON_VRF_COORDINATOR = "0xec0Ed46f36576541C75739E915ADbCb3DE24bD77";
const POLYGON_KEY_HASH = "0x0ffbbd0c1c18c0263dd778dadd1d64240d7bc338d95fec1cf0473928ca7eaf9e";
const POLYGON_SUB_ID = 33052362848653601144628215280478780936142151661209813952189268371226136887118n;

async function setupLocalVRF() {
	console.log("  Deploying VRFCoordinatorV2_5Mock for local network...");
	const vrfMock = await ethers.deployContract("VRFCoordinatorV2_5Mock", [
	  0n, // baseFee = 0 (free for local testing)
		0n, // gasPrice = 0
		ethers.parseEther("0.003"),
	]);
	await vrfMock.waitForDeployment();
	const vrfAddress = await vrfMock.getAddress();
	console.log(`  VRFCoordinatorV2_5Mock: ${vrfAddress}`);

	const createTx = await vrfMock.createSubscription();
	const receipt = await createTx.wait();

	let subId = 0n;
	for (const log of receipt.logs) {
		try {
			const parsed = vrfMock.interface.parseLog({
				topics: log.topics,
				data: log.data,
			});
			if (parsed && parsed.name === "SubscriptionCreated") {
				subId = parsed.args.subId;
				break;
			}
		} catch {}
	}

	await vrfMock.fundSubscription(subId, ethers.parseEther("100"));
	console.log(`  Subscription ID: ${subId}`);

	return { vrfAddress, subId, keyHash: ethers.ZeroHash, vrfMock };
}

async function main() {
	console.log(`\nNetwork: ${network.name}`);
	const isLocal = network.name === "localhost" || network.name === "hardhat";

	// ── 1. Deploy or attach MTS ────────────────────────────────────────────────
	let mtsToken, tokenAddress;
	const existingMts = process.env.MTS_ADDRESS?.trim();

	if (existingMts && ethers.isAddress(existingMts)) {
		tokenAddress = ethers.getAddress(existingMts);
		mtsToken = await ethers.getContractAt("MTS", tokenAddress);
		console.log(`Using existing MTS: ${tokenAddress}`);
	} else {
		mtsToken = await ethers.deployContract("MTS");
		await mtsToken.waitForDeployment();
		tokenAddress = await mtsToken.getAddress();
		console.log(`Deployed MTS: ${tokenAddress}`);
	}

	// ── 2. VRF setup ──────────────────────────────────────────────────────────
	let vrfAddress, subId, keyHash, vrfMock;

	if (isLocal) {
		({ vrfAddress, subId, keyHash, vrfMock } = await setupLocalVRF());
	} else {
	  vrfAddress = process.env.VRF_COORDINATOR ?? POLYGON_VRF_COORDINATOR;
		subId = process.env.VRF_SUB_ID ? BigInt(process.env.VRF_SUB_ID) : POLYGON_SUB_ID;
		keyHash = process.env.VRF_KEY_HASH ?? POLYGON_KEY_HASH;
		console.log(`Using VRF Coordinator: ${vrfAddress}`);
		console.log(`Sub ID: ${subId}`);
	}

	// ── 3. Deploy MonsterGame ─────────────────────────────────────────────────
	const monsterGame = await ethers.deployContract("MonsterGame", [tokenAddress, vrfAddress, subId, keyHash]);
	await monsterGame.waitForDeployment();
	const gameAddress = await monsterGame.getAddress();
	console.log(`Deployed MonsterGame: ${gameAddress}`);

	// ── 4. Register MonsterGame as VRF consumer ───────────────────────────────
	if (isLocal && vrfMock) {
		await (await vrfMock.addConsumer(subId, gameAddress)).wait();
		console.log(`MonsterGame added as VRF consumer`);
	} else {
		console.log(`ACTION REQUIRED: Add ${gameAddress} as consumer on Chainlink dashboard (sub ${subId})`);
	}

	// ── 5. Grant MINTER_ROLE to MonsterGame ───────────────────────────────────
	const MINTER_ROLE = await mtsToken.MINTER_ROLE();
	if (!(await mtsToken.hasRole(MINTER_ROLE, gameAddress))) {
		await (await mtsToken.grantRole(MINTER_ROLE, gameAddress)).wait();
	}
	console.log(`MonsterGame MINTER_ROLE: granted`);

	// ── 6. Deploy MTSPresale ──────────────────────────────────────────────────
	const payTokenAddress = process.env.PAY_TOKEN_ADDRESS?.trim() || ethers.ZeroAddress;

	const mtsPresale = await ethers.deployContract("MTSPresale", [tokenAddress, payTokenAddress]);
	await mtsPresale.waitForDeployment();
	const presaleAddress = await mtsPresale.getAddress();
	console.log(`Deployed MTSPresale: ${presaleAddress}`);

	// ── 7. Fund MTSPresale with IDO allocation ────────────────────────────────
	const [deployer] = await ethers.getSigners();
	let deployerBalance = await mtsToken.balanceOf(deployer.address);

	if (deployerBalance < IDO_ALLOCATION) {
		const shortfall = IDO_ALLOCATION - deployerBalance;
		const canMint = await mtsToken.hasRole(MINTER_ROLE, deployer.address);
		if (canMint) {
			await (await mtsToken.mint(deployer.address, shortfall)).wait();
		}
	}

	await (await mtsToken.transfer(presaleAddress, IDO_ALLOCATION)).wait();
	console.log(`MTSPresale funded with 500,000 MTS`);

	// ── 8. Print addresses ────────────────────────────────────────────────────
	console.log("\n── Contract Addresses ──────────────────────────────");
	console.log(`NEXT_PUBLIC_MTS_ADDRESS=${tokenAddress}`);
	console.log(`NEXT_PUBLIC_MONSTER_GAME_ADDRESS=${gameAddress}`);
	console.log(`NEXT_PUBLIC_PAY_TOKEN_ADDRESS=${payTokenAddress}`);
	console.log(`NEXT_PUBLIC_MTS_PRESALE_ADDRESS=${presaleAddress}`);
	if (isLocal) {
		console.log(`VRF_MOCK_ADDRESS=${vrfAddress}`);
		console.log(`VRF_SUB_ID=${subId}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
