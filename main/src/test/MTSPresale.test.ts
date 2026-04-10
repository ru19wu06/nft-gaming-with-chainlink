import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("MTSPresale", function () {
	// ─── Fixtures ─────────────────────────────────────────────────────────────

	/**
	 * Native payment fixture: payToken is address(0), buyers pay with ETH/native coin.
	 */
	async function deployNativeFixture() {
		const [owner, buyer, other] = await ethers.getSigners();

		const mts = await ethers.deployContract("MTS");
		await mts.waitForDeployment();
		const unit = 10n ** BigInt(await mts.decimals());

		const presale = await ethers.deployContract("MTSPresale", [await mts.getAddress(), ethers.ZeroAddress]);
		await presale.waitForDeployment();

		const saleSupply = 500000n * unit;
		await mts.mint(await presale.getAddress(), saleSupply);

		return { owner, buyer, other, mts, presale, unit, saleSupply };
	}

	/**
	 * ERC20 payment fixture: buyers pay with a separate ERC20 token.
	 */
	async function deployERC20Fixture() {
		const [owner, buyer, other] = await ethers.getSigners();

		const mts = await ethers.deployContract("MTS");
		await mts.waitForDeployment();
		const unit = 10n ** BigInt(await mts.decimals());

		// Use a second MTS instance as the payment token
		const payToken = await ethers.deployContract("MTS");
		await payToken.waitForDeployment();

		const presale = await ethers.deployContract("MTSPresale", [await mts.getAddress(), await payToken.getAddress()]);
		await presale.waitForDeployment();

		const saleSupply = 500000n * unit;
		await mts.mint(await presale.getAddress(), saleSupply);

		const payUnit = 10n ** BigInt(await payToken.decimals());
		await payToken.mint(buyer.address, 1000000n * payUnit);

		return {
			owner,
			buyer,
			other,
			mts,
			payToken,
			presale,
			unit,
			payUnit,
			saleSupply,
		};
	}

	// ─── Deployment ───────────────────────────────────────────────────────────

	describe("Deployment", function () {
		it("reverts when MTS token address is zero", async function () {
			await expect(ethers.deployContract("MTSPresale", [ethers.ZeroAddress, ethers.ZeroAddress])).to.be.revertedWith("Invalid MTS token");
		});

		it("stores the mtsToken and payToken addresses", async function () {
			const { mts, payToken, presale } = await loadFixture(deployERC20Fixture);
			expect(await presale.mtsToken()).to.equal(await mts.getAddress());
			expect(await presale.payToken()).to.equal(await payToken.getAddress());
		});

		it("sets the deployer as owner", async function () {
			const { owner, presale } = await loadFixture(deployNativeFixture);
			expect(await presale.owner()).to.equal(owner.address);
		});

		it("reports isNativePayment() = true when payToken is address(0)", async function () {
			const { presale } = await loadFixture(deployNativeFixture);
			expect(await presale.isNativePayment()).to.equal(true);
		});

		it("reports isNativePayment() = false when payToken is a real contract", async function () {
			const { presale } = await loadFixture(deployERC20Fixture);
			expect(await presale.isNativePayment()).to.equal(false);
		});

		it("exposes the correct PRICE constant (0.02 × 1e18)", async function () {
			const { presale } = await loadFixture(deployNativeFixture);
			const expected = BigInt(Math.round(0.02 * 1e18));
			expect(await presale.PRICE()).to.equal(expected);
		});

		it("exposes the correct MAX_SALE_AMOUNT (500,000 MTS)", async function () {
			const { presale, unit } = await loadFixture(deployNativeFixture);
			expect(await presale.MAX_SALE_AMOUNT()).to.equal(500000n * unit);
		});
	});

	// ─── quoteCost() ──────────────────────────────────────────────────────────

	describe("quoteCost()", function () {
		it("returns the correct cost for a given MTS amount", async function () {
			const { presale, unit } = await loadFixture(deployNativeFixture);
			const mtsAmount = 100n * unit;
			const expectedCost = 2n * unit; // 100 MTS × 0.02 = 2
			expect(await presale.quoteCost(mtsAmount)).to.equal(expectedCost);
		});

		it("returns 0 when amount is 0", async function () {
			const { presale } = await loadFixture(deployNativeFixture);
			expect(await presale.quoteCost(0n)).to.equal(0n);
		});

		it("scales linearly with amount", async function () {
			const { presale, unit } = await loadFixture(deployNativeFixture);
			const cost1 = await presale.quoteCost(50n * unit);
			const cost2 = await presale.quoteCost(100n * unit);
			expect(cost2).to.equal(cost1 * 2n);
		});
	});

	// ─── buyTokens() — native payment ─────────────────────────────────────────

	describe("buyTokens() with native payment", function () {
		it("transfers MTS to buyer and updates totalSold", async function () {
			const { buyer, mts, presale, unit } = await loadFixture(deployNativeFixture);
			const mtsAmount = 10n * unit;
			const cost = await presale.quoteCost(mtsAmount);

			await presale.connect(buyer).buyTokens(mtsAmount, { value: cost });

			expect(await mts.balanceOf(buyer.address)).to.equal(mtsAmount);
			expect(await presale.totalSold()).to.equal(mtsAmount);
		});

		it("emits TokensPurchased with correct args", async function () {
			const { buyer, presale, unit } = await loadFixture(deployNativeFixture);
			const mtsAmount = 5n * unit;
			const cost = await presale.quoteCost(mtsAmount);

			await expect(presale.connect(buyer).buyTokens(mtsAmount, { value: cost }))
				.to.emit(presale, "TokensPurchased")
				.withArgs(buyer.address, mtsAmount, cost);
		});

		it("reverts when amount is 0", async function () {
			const { buyer, presale } = await loadFixture(deployNativeFixture);
			await expect(presale.connect(buyer).buyTokens(0n, { value: 0n })).to.be.revertedWith("Amount must be > 0");
		});

		it("reverts when purchase would exceed IDO limit", async function () {
			// Use ERC20 fixture to avoid ETH balance constraints (500k MTS = 10,000 ETH)
			const { buyer, payToken, presale, unit } = await loadFixture(deployERC20Fixture);
			const overLimit = 500001n * unit;
			const cost = await presale.quoteCost(overLimit);
			await payToken.connect(buyer).approve(await presale.getAddress(), cost);
			await expect(presale.connect(buyer).buyTokens(overLimit)).to.be.revertedWith("Exceeds IDO limit");
		});

		it("reverts when msg.value does not match the required cost", async function () {
			const { buyer, presale, unit } = await loadFixture(deployNativeFixture);
			const mtsAmount = 10n * unit;
			const cost = await presale.quoteCost(mtsAmount);
			await expect(presale.connect(buyer).buyTokens(mtsAmount, { value: cost - 1n })).to.be.revertedWith("Invalid native amount");
		});

		it("reverts when native value is sent in ERC20 mode", async function () {
			const { buyer, presale, unit } = await loadFixture(deployERC20Fixture);
			const mtsAmount = 1n * unit;
			await expect(presale.connect(buyer).buyTokens(mtsAmount, { value: 1n })).to.be.revertedWith("Native value not accepted");
		});

		it("accumulates totalSold across multiple purchases", async function () {
			const { buyer, presale, unit } = await loadFixture(deployNativeFixture);
			const mtsAmount = 10n * unit;
			const cost = await presale.quoteCost(mtsAmount);

			await presale.connect(buyer).buyTokens(mtsAmount, { value: cost });
			await presale.connect(buyer).buyTokens(mtsAmount, { value: cost });

			expect(await presale.totalSold()).to.equal(mtsAmount * 2n);
		});
	});

	// ─── buyTokens() — ERC20 payment ──────────────────────────────────────────

	describe("buyTokens() with ERC20 payment", function () {
		it("transfers MTS to buyer and deducts payToken from buyer", async function () {
			const { buyer, mts, payToken, presale, unit } = await loadFixture(deployERC20Fixture);
			const mtsAmount = 20n * unit;
			const cost = await presale.quoteCost(mtsAmount);
			const payBalanceBefore = await payToken.balanceOf(buyer.address);

			await payToken.connect(buyer).approve(await presale.getAddress(), cost);
			await presale.connect(buyer).buyTokens(mtsAmount);

			expect(await mts.balanceOf(buyer.address)).to.equal(mtsAmount);
			expect(await payToken.balanceOf(buyer.address)).to.equal(payBalanceBefore - cost);
		});

		it("emits TokensPurchased with correct args", async function () {
			const { buyer, payToken, presale, unit } = await loadFixture(deployERC20Fixture);
			const mtsAmount = 10n * unit;
			const cost = await presale.quoteCost(mtsAmount);

			await payToken.connect(buyer).approve(await presale.getAddress(), cost);
			await expect(presale.connect(buyer).buyTokens(mtsAmount)).to.emit(presale, "TokensPurchased").withArgs(buyer.address, mtsAmount, cost);
		});

		it("reverts when buyer has not approved enough payToken", async function () {
			const { buyer, presale, unit } = await loadFixture(deployERC20Fixture);
			const mtsAmount = 10n * unit;
			await expect(presale.connect(buyer).buyTokens(mtsAmount)).to.be.reverted;
		});

		it("reverts when partial allowance is set", async function () {
			const { buyer, payToken, presale, unit } = await loadFixture(deployERC20Fixture);
			const mtsAmount = 50n * unit;
			const cost = await presale.quoteCost(mtsAmount);

			await payToken.connect(buyer).approve(await presale.getAddress(), cost / 2n);
			await expect(presale.connect(buyer).buyTokens(mtsAmount)).to.be.reverted;
		});
	});

	// ─── withdrawFunds() ──────────────────────────────────────────────────────

	describe("withdrawFunds()", function () {
		it("allows owner to withdraw native balance after sales", async function () {
			const { owner, buyer, presale, unit } = await loadFixture(deployNativeFixture);
			const mtsAmount = 100n * unit;
			const cost = await presale.quoteCost(mtsAmount);
			await presale.connect(buyer).buyTokens(mtsAmount, { value: cost });

			const ownerBalBefore = await ethers.provider.getBalance(owner.address);
			const tx = await presale.connect(owner).withdrawFunds();
			const receipt = await tx.wait();
			const gasCost = receipt!.gasUsed * receipt!.gasPrice;
			const ownerBalAfter = await ethers.provider.getBalance(owner.address);

			expect(ownerBalAfter).to.equal(ownerBalBefore + cost - gasCost);
		});

		it("allows owner to withdraw ERC20 payment balance", async function () {
			const { owner, buyer, payToken, presale, unit } = await loadFixture(deployERC20Fixture);
			const mtsAmount = 50n * unit;
			const cost = await presale.quoteCost(mtsAmount);

			await payToken.connect(buyer).approve(await presale.getAddress(), cost);
			await presale.connect(buyer).buyTokens(mtsAmount);

			const ownerPayBefore = await payToken.balanceOf(owner.address);
			await presale.connect(owner).withdrawFunds();

			expect(await payToken.balanceOf(owner.address)).to.equal(ownerPayBefore + cost);
		});

		it("reverts when called by non-owner", async function () {
			const { other, presale } = await loadFixture(deployNativeFixture);
			await expect(presale.connect(other).withdrawFunds()).to.be.revertedWith("Ownable: caller is not the owner");
		});
	});

	// ─── withdrawUnsoldTokens() ───────────────────────────────────────────────

	describe("withdrawUnsoldTokens()", function () {
		it("transfers all remaining MTS to the owner", async function () {
			const { owner, buyer, mts, presale, unit } = await loadFixture(deployNativeFixture);
			const mtsAmount = 100n * unit;
			const cost = await presale.quoteCost(mtsAmount);
			await presale.connect(buyer).buyTokens(mtsAmount, { value: cost });

			const ownerMtsBefore = await mts.balanceOf(owner.address);
			const presaleBalance = await mts.balanceOf(await presale.getAddress());

			await presale.connect(owner).withdrawUnsoldTokens();

			expect(await mts.balanceOf(owner.address)).to.equal(ownerMtsBefore + presaleBalance);
			expect(await mts.balanceOf(await presale.getAddress())).to.equal(0n);
		});

		it("reverts when called by non-owner", async function () {
			const { other, presale } = await loadFixture(deployNativeFixture);
			await expect(presale.connect(other).withdrawUnsoldTokens()).to.be.revertedWith("Ownable: caller is not the owner");
		});
	});
});
