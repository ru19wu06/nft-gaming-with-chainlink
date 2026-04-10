import { Wallet } from "ethers";
import dotenv from "dotenv";
dotenv.config();

function privateKeyToAddress() {
	const wallet = new Wallet(process.env.PRIVATE_KEY);
	console.log(".env address: ", wallet.address);
}

function main() {
	const wallet = Wallet.createRandom();

	console.log(" New EVM Wallet");
	console.log(`Address:     ${wallet.address}`);
	console.log(`Private Key: ${wallet.privateKey}`);
	console.log(`Mnemonic:    ${wallet.mnemonic?.phrase ?? "(unavailable)"}`);
	console.log("");
}

privateKeyToAddress();
