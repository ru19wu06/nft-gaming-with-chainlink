import hardhat from "hardhat";
const { ethers } = hardhat;


const TOKEN_ADDRESS = "0x8a92913959e33FEb641a88C8DB855C207CbBB54b"; 
const GAME_ADDRESS = "0x625c2b15B09D7826a8FEe083C535dBc2f2a63d77";  

async function main() {


  // 1. 取得測試帳號 (玩家)
  const [player] = await ethers.getSigners();
  console.log(`👤 玩家地址: ${player.address}`);

  // 2. 連接已部署的合約 (使用 getContractAt)
  // 這是 ethers.js 連接已經存在的合約的方法
  const mtsToken = await ethers.getContractAt("MTS", TOKEN_ADDRESS);
  const game = await ethers.getContractAt("MonsterGame", GAME_ADDRESS);

  // --- 步驟 A: 確保玩家有足夠的 MTS 代幣 ---
  console.log("\n💰 [Step 1] 檢查餘額...");
  let balance = await mtsToken.balanceOf(player.address);
  const needed = ethers.parseEther("1000"); // 準備 1000 MTS

  if (balance < needed) {
    console.log("   餘額不足，正在鑄造 1000 MTS 給自己...");
    // 因為你是 Deployer，通常有 MINTER_ROLE (如果是權限合約) 
    // 或者如果你是 Token Owner
    try {
      // 假設你擁有 MINTER_ROLE，或者合約是測試版任何人都能 mint (看你怎麼寫)
      // 如果你的 MTS 合約有 public mint 權限，用這行：
      await (await mtsToken.mint(player.address, needed)).wait(); 
      console.log("   ✅ 補幣成功！");
    } catch (e) {
      console.log("   ⚠️ 無法鑄造代幣，請確認你是否有 MINTER_ROLE 或合約邏輯。");
      // 如果這步失敗，代表你手動部署時沒給自己留錢，可能需要手動轉帳
    }
  } else {
    console.log(`   ✅ 餘額充足: ${ethers.formatEther(balance)} MTS`);
  }

  // --- 步驟 B: 授權 (Approve) ---
  console.log("\nUSER [Step 2] 授權遊戲合約花費我的代幣...");
  const cost = ethers.parseEther("300"); // 買蛋要 300 MTS
  
  // 檢查目前授權額度
  const allowance = await mtsToken.allowance(player.address, GAME_ADDRESS);
  if (allowance < cost) {
    const txApprove = await mtsToken.approve(GAME_ADDRESS, ethers.parseEther("10000")); // 一次授權多一點
    await txApprove.wait();
    console.log("   ✅ 授權成功！");
  } else {
    console.log("   ✅ 已有足夠授權，跳過。");
  }

  // --- 步驟 C: 購買並孵化蛋 (Mint NFT) ---
  console.log("\n🥚 [Step 3] 購買並孵化怪獸蛋...");
  const txMint = await game.mintEgg();
  const receipt = await txMint.wait();


  // 過濾出 EggMinted 事件
  const mintEvent = receipt.logs
    .map(log => {
        try { return game.interface.parseLog(log); } catch (e) { return null; }
    })
    .find(event => event && event.name === 'EggMinted');

  if (!mintEvent) {
    throw new Error("找不到 EggMinted 事件，Mint 可能失敗了？");
  }

  const tokenId = mintEvent.args.tokenId; // 抓到了！
  const power = mintEvent.args.power;
  
  console.log(`   🎉 成功孵化！`);
  console.log(`      Token ID: ${tokenId}`);
  console.log(`      戰鬥力: ${power}`);

  // --- 步驟 D: 查看怪獸狀態 ---
  console.log("\n📊 [Step 4] 查看怪獸詳細數據...");
  const monsterData = await game.monsters(tokenId);
  console.log(`   等級: ${monsterData.level}`);
  console.log(`   今日戰鬥次數: ${monsterData.dailyFights}/3`);

  // --- 步驟 E: 戰鬥 (Battle) ---
  console.log("\n⚔️ [Step 5] 發起戰鬥！");
  
  // 紀錄戰鬥前餘額
  const balanceBefore = await mtsToken.balanceOf(player.address);

  const txBattle = await game.battle(tokenId);
  const battleReceipt = await txBattle.wait();

  // 解析 BattleResult 事件
  const battleEvent = battleReceipt.logs
    .map(log => {
        try { return game.interface.parseLog(log); } catch (e) { return null; }
    })
    .find(event => event && event.name === 'BattleResult');

  const reward = battleEvent.args.reward;
  
  // 紀錄戰鬥後餘額
  const balanceAfter = await mtsToken.balanceOf(player.address);
  const earned = balanceAfter - balanceBefore;

  console.log(`   ✅ 戰鬥結束！`);
  console.log(`   💰 獲得獎勵: ${ethers.formatEther(reward)} MTS`);
  console.log(`   📈 錢包餘額變化: +${ethers.formatEther(earned)} MTS`);

  console.log("\n🎮 遊戲腳本執行完畢！");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});