const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MTS", function () {
  async function deployMTSFixture() {
    const [owner, alice] = await ethers.getSigners();
    const mts = await ethers.deployContract("MTS");
    await mts.waitForDeployment();
    return { mts, owner, alice };
  }

  it("sets initial supply and roles correctly", async function () {
    const { mts, owner } = await deployMTSFixture();
    const decimals = await mts.decimals();
    const unit = 10n ** BigInt(decimals);
    const expectedSupply = 10000n * unit;

    const adminRole = await mts.DEFAULT_ADMIN_ROLE();
    const minterRole = await mts.MINTER_ROLE();

    expect(await mts.totalSupply()).to.equal(expectedSupply);
    expect(await mts.balanceOf(owner.address)).to.equal(expectedSupply);
    expect(await mts.hasRole(adminRole, owner.address)).to.equal(true);
    expect(await mts.hasRole(minterRole, owner.address)).to.equal(true);
  });

  it("allows minter to mint", async function () {
    const { mts, alice } = await deployMTSFixture();
    const amount = ethers.parseUnits("25", await mts.decimals());
    const balanceBefore = await mts.balanceOf(alice.address);

    await mts.mint(alice.address, amount);

    expect(await mts.balanceOf(alice.address)).to.equal(balanceBefore + amount);
  });

  it("reverts when non-minter calls mint", async function () {
    const { mts, alice } = await deployMTSFixture();
    const minterRole = await mts.MINTER_ROLE();

    await expect(mts.connect(alice).mint(alice.address, 1n))
      .to.be.revertedWithCustomError(mts, "AccessControlUnauthorizedAccount")
      .withArgs(alice.address, minterRole);
  });
});
