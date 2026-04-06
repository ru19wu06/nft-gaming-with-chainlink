const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("MonsterGame", function () {
  async function deployGameFixture() {
    const [owner, player1, player2, other] = await ethers.getSigners();

    const mts = await ethers.deployContract("MTS");
    await mts.waitForDeployment();

    const game = await ethers.deployContract("MonsterGame", [await mts.getAddress()]);
    await game.waitForDeployment();

    const minterRole = await mts.MINTER_ROLE();
    await mts.grantRole(minterRole, await game.getAddress());

    const unit = 10n ** BigInt(await mts.decimals());
    const seedAmount = 5000n * unit;
    await mts.mint(player1.address, seedAmount);
    await mts.mint(player2.address, seedAmount);

    return { owner, player1, player2, other, mts, game, unit };
  }

  async function deployWithoutMinterRoleFixture() {
    const [owner, player] = await ethers.getSigners();

    const mts = await ethers.deployContract("MTS");
    await mts.waitForDeployment();

    const game = await ethers.deployContract("MonsterGame", [await mts.getAddress()]);
    await game.waitForDeployment();

    const unit = 10n ** BigInt(await mts.decimals());
    await mts.mint(player.address, 1000n * unit);

    return { owner, player, mts, game, unit };
  }

  async function mintEggFor(game, mts, player, unit) {
    const cost = 300n * unit;
    await mts.connect(player).approve(await game.getAddress(), cost);
    await game.connect(player).mintEgg();
  }

  it("mintEgg burns token cost and creates initialized monster", async function () {
    const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
    const cost = 300n * unit;
    const balanceBefore = await mts.balanceOf(player1.address);

    await mts.connect(player1).approve(await game.getAddress(), cost);

    await expect(game.connect(player1).mintEgg())
      .to.emit(game, "EggMinted")
      .withArgs(player1.address, 0n, anyValue);

    expect(await mts.balanceOf(player1.address)).to.equal(balanceBefore - cost);
    expect(await game.ownerOf(0n)).to.equal(player1.address);

    const mon = await game.monsters(0n);
    expect(mon.level).to.equal(1n);
    expect(mon.totalFights).to.equal(0n);
    expect(mon.dailyFights).to.equal(0n);
    expect(mon.lastFightTime).to.equal(0n);
    expect(mon.power).to.be.gte(20n);
    expect(mon.power).to.be.lte(50n);
  });

  it("mintMutiEgg consumes discount stock and mints multiple NFTs", async function () {
    const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
    const num = 3n;
    const expectedCost = num * 220n * unit;
    const stockBefore = await game.discountEggValue();
    const balanceBefore = await mts.balanceOf(player1.address);

    await mts.connect(player1).approve(await game.getAddress(), expectedCost);
    await game.connect(player1).mintMutiEgg(num);

    expect(await game.discountEggValue()).to.equal(stockBefore - num);
    expect(await mts.balanceOf(player1.address)).to.equal(balanceBefore - expectedCost);
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

    await expect(game.connect(player1).mintMutiEgg(num)).to.be.revertedWith(
      "Purchase exceeds stock"
    );
  });

  it("only owner can update discount egg settings", async function () {
    const { owner, player1, game } = await loadFixture(deployGameFixture);

    await expect(game.connect(player1).addDiscountEggValue(50n, 180n))
      .to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount")
      .withArgs(player1.address);

    await game.connect(owner).addDiscountEggValue(50n, 180n);
    expect(await game.discountEggValue()).to.equal(50n);
    expect(await game.discountPrice()).to.equal(180n);
  });

  it("battle updates usage, reward and leaderboard", async function () {
    const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
    await mintEggFor(game, mts, player1, unit);
    const balanceBefore = await mts.balanceOf(player1.address);

    await expect(game.connect(player1).battle(0n, 1n))
      .to.emit(game, "BattleResult")
      .withArgs(0n, anyValue, 1n);

    const mon = await game.monsters(0n);
    expect(mon.dailyFights).to.equal(1n);
    expect(mon.totalFights).to.equal(1n);
    expect(mon.lastFightTime).to.be.gt(0n);

    const balanceAfter = await mts.balanceOf(player1.address);
    expect(balanceAfter).to.be.gt(balanceBefore);
    expect(await game.getLeaderboardCount()).to.equal(1n);
    expect(await game.leaderboard(player1.address)).to.be.gt(0n);
  });

  it("reverts battle when caller is not the owner", async function () {
    const { player1, other, mts, game, unit } = await loadFixture(deployGameFixture);
    await mintEggFor(game, mts, player1, unit);

    await expect(game.connect(other).battle(0n, 1n)).to.be.revertedWith("Not owner");
  });

  it("enforces 3 battles per day and resets next day", async function () {
    const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
    await mintEggFor(game, mts, player1, unit);

    await game.connect(player1).battle(0n, 1n);
    await game.connect(player1).battle(0n, 1n);
    await game.connect(player1).battle(0n, 1n);

    await expect(game.connect(player1).battle(0n, 1n)).to.be.revertedWith(
      "Daily limit reached (3/3). Come back tomorrow!"
    );

    expect(await game.getRemainingBattles(0n)).to.equal(0n);

    await time.increase(24 * 60 * 60 + 1);
    await game.connect(player1).battle(0n, 1n);

    const mon = await game.monsters(0n);
    expect(mon.dailyFights).to.equal(1n);
    expect(mon.totalFights).to.equal(4n);
    expect(await game.getRemainingBattles(0n)).to.equal(2n);
  });

  it("levels up after every 10 total fights", async function () {
    const { player1, mts, game, unit } = await loadFixture(deployGameFixture);
    await mintEggFor(game, mts, player1, unit);

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

  it("reverts battle/checkIn when game does not have MINTER_ROLE", async function () {
    const { player, mts, game, unit } = await loadFixture(deployWithoutMinterRoleFixture);
    await mintEggFor(game, mts, player, unit);

    await expect(game.connect(player).battle(0n, 1n)).to.be.revertedWith("Game missing MINTER_ROLE");
    await expect(game.connect(player).checkIn()).to.be.revertedWith("Game missing MINTER_ROLE");
  });

  it("returns leaderboard pages and empty result for out-of-range offset", async function () {
    const { player1, player2, mts, game, unit } = await loadFixture(deployGameFixture);

    await mintEggFor(game, mts, player1, unit);
    await mintEggFor(game, mts, player2, unit);
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
