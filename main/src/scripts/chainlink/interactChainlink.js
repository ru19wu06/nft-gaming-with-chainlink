import hardhat from "hardhat";

const CONTRACT_ADDRESS = "0x446dF1b552b4C91639700805028c23F0591C9608"; // fill in your deployed LotteryV2_5 address
const LotteryV2 = await hardhat.ethers.getContractAt("LotteryV2_5", CONTRACT_ADDRESS);
async function main() {

  // const tx = await LotteryV2.enter({
  //   value: hardhat.ethers.parseEther("0.01"),
  // });
  // await tx.wait();
  // console.log("enter tx:", tx.hash);

  // const tx2 = await LotteryV2.drawWinner();
  // await tx2.wait();
  // console.log("drawWinner tx:", tx2.hash);

  const randominfo = await LotteryV2.randomResult();
  console.log(randominfo)
}

async function excuteFunction() {
  const tx = await LotteryV2.enter({
    value: hardhat.ethers.parseEther("0.01"),
  });
  await tx.wait();
  console.log("enter tx:", tx.hash);

  const tx2 = await LotteryV2.drawWinner();
  await tx2.wait();
  console.log("drawWinner tx:", tx2.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
