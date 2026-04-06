import hardhat from "hardhat"; 

async function main() {
    const { ethers } = hardhat;


    const myAddress = '0x0B58A5c53F72840e514c47a8B0FB241fDF2Dab5e';

    const balanceInWei = await ethers.provider.getBalance(myAddress);


    const balanceInEth = ethers.formatEther(balanceInWei);

    console.log(`account address: ${myAddress}`);
    console.log(`value: ${balanceInEth} ENI`);


    
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});