import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("MTS", function () {
	async function deployMTSFixture() {
		const [owner, alice, bob] = await ethers.getSigners();
		const mts = await ethers.deployContract("MTS");
		await mts.waitForDeployment();
		const unit = 10n ** BigInt(await mts.decimals());
		return { mts, owner, alice, bob, unit };
	}

	// ─── Deployment ───────────────────────────────────────────────────────────

	describe("Deployment", function () {
		it("mints 7,500,000 MTS to the deployer as initial supply", async function () {
			const { mts, owner, unit } = await loadFixture(deployMTSFixture);
			const expected = 7500000n * unit;
			expect(await mts.totalSupply()).to.equal(expected);
			expect(await mts.balanceOf(owner.address)).to.equal(expected);
		});

		it("sets token name and symbol correctly", async function () {
			const { mts } = await loadFixture(deployMTSFixture);
			expect(await mts.name()).to.equal("Monster Token");
			expect(await mts.symbol()).to.equal("MTS");
		});

		it("grants DEFAULT_ADMIN_ROLE and MINTER_ROLE to the deployer", async function () {
			const { mts, owner } = await loadFixture(deployMTSFixture);
			const adminRole = await mts.DEFAULT_ADMIN_ROLE();
			const minterRole = await mts.MINTER_ROLE();
			expect(await mts.hasRole(adminRole, owner.address)).to.equal(true);
			expect(await mts.hasRole(minterRole, owner.address)).to.equal(true);
		});

		it("exposes the correct MAX_SUPPLY constant", async function () {
			const { mts, unit } = await loadFixture(deployMTSFixture);
			expect(await mts.MAX_SUPPLY()).to.equal(80000000n * unit);
		});
	});

	// ─── Minting ──────────────────────────────────────────────────────────────

	describe("mint()", function () {
		it("allows a minter to mint tokens to any address", async function () {
			const { mts, alice, unit } = await loadFixture(deployMTSFixture);
			const amount = 1000n * unit;
			await mts.mint(alice.address, amount);
			expect(await mts.balanceOf(alice.address)).to.equal(amount);
		});

		it("increases totalSupply after minting", async function () {
			const { mts, alice, unit } = await loadFixture(deployMTSFixture);
			const supplyBefore = await mts.totalSupply();
			const amount = 500n * unit;
			await mts.mint(alice.address, amount);
			expect(await mts.totalSupply()).to.equal(supplyBefore + amount);
		});

		it("reverts when a non-minter calls mint", async function () {
			const { mts, alice, unit } = await loadFixture(deployMTSFixture);
			await expect(mts.connect(alice).mint(alice.address, 1n * unit)).to.be.revertedWith(/AccessControl: account .* is missing role .*/);
		});

		it("reverts when minting would exceed MAX_SUPPLY", async function () {
			const { mts, alice } = await loadFixture(deployMTSFixture);
			const maxSupply = await mts.MAX_SUPPLY();
			const currentSupply = await mts.totalSupply();
			const overLimit = maxSupply - currentSupply + 1n;
			await expect(mts.mint(alice.address, overLimit)).to.be.revertedWith("MTS: Exceeds max supply");
		});

		it("allows minting exactly up to MAX_SUPPLY without reverting", async function () {
			const { mts, alice } = await loadFixture(deployMTSFixture);
			const maxSupply = await mts.MAX_SUPPLY();
			const currentSupply = await mts.totalSupply();
			const remaining = maxSupply - currentSupply;
			await expect(mts.mint(alice.address, remaining)).not.to.be.reverted;
			expect(await mts.totalSupply()).to.equal(maxSupply);
		});
	});

	// ─── Burning ──────────────────────────────────────────────────────────────

	describe("burn()", function () {
		it("allows a token holder to burn their own tokens", async function () {
			const { mts, alice, unit } = await loadFixture(deployMTSFixture);
			const amount = 200n * unit;
			await mts.mint(alice.address, amount);
			const balanceBefore = await mts.balanceOf(alice.address);
			const supplyBefore = await mts.totalSupply();

			await mts.connect(alice).burn(amount);

			expect(await mts.balanceOf(alice.address)).to.equal(balanceBefore - amount);
			expect(await mts.totalSupply()).to.equal(supplyBefore - amount);
		});

		it("reverts when burning more than balance", async function () {
			const { mts, alice, unit } = await loadFixture(deployMTSFixture);
			await mts.mint(alice.address, 100n * unit);
			await expect(mts.connect(alice).burn(101n * unit)).to.be.reverted;
		});
	});

	describe("burnFrom()", function () {
		it("allows an approved spender to burn tokens on behalf of the holder", async function () {
			const { mts, alice, bob, unit } = await loadFixture(deployMTSFixture);
			const amount = 150n * unit;
			await mts.mint(alice.address, amount);

			await mts.connect(alice).approve(bob.address, amount);
			await mts.connect(bob).burnFrom(alice.address, amount);

			expect(await mts.balanceOf(alice.address)).to.equal(0n);
		});

		it("reverts when spender has insufficient allowance", async function () {
			const { mts, alice, bob, unit } = await loadFixture(deployMTSFixture);
			await mts.mint(alice.address, 100n * unit);
			await expect(mts.connect(bob).burnFrom(alice.address, 1n * unit)).to.be.reverted;
		});
	});

	// ─── Role Management ──────────────────────────────────────────────────────

	describe("Role management", function () {
		it("admin can grant MINTER_ROLE to another account", async function () {
			const { mts, alice, unit } = await loadFixture(deployMTSFixture);
			const minterRole = await mts.MINTER_ROLE();

			await mts.grantRole(minterRole, alice.address);
			expect(await mts.hasRole(minterRole, alice.address)).to.equal(true);

			await expect(mts.connect(alice).mint(alice.address, 1n * unit)).not.to.be.reverted;
		});

		it("admin can revoke MINTER_ROLE from an account", async function () {
			const { mts, alice, unit } = await loadFixture(deployMTSFixture);
			const minterRole = await mts.MINTER_ROLE();

			await mts.grantRole(minterRole, alice.address);
			await mts.revokeRole(minterRole, alice.address);
			expect(await mts.hasRole(minterRole, alice.address)).to.equal(false);

			await expect(mts.connect(alice).mint(alice.address, 1n * unit)).to.be.revertedWith(/AccessControl: account .* is missing role .*/);
		});

		it("non-admin cannot grant roles", async function () {
			const { mts, alice, bob } = await loadFixture(deployMTSFixture);
			const minterRole = await mts.MINTER_ROLE();
			await expect(mts.connect(alice).grantRole(minterRole, bob.address)).to.be.reverted;
		});
	});
});
