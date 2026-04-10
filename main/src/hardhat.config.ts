import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
	solidity: {
		version: "0.8.28",
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	networks: {
		localhost: {
			url: "http://127.0.0.1:8545",
			chainId: 31337,
		},
		polygon: {
			url: process.env.POLYGON_RPC,
			accounts: [process.env.PRIVATE_KEY],
		},
	},
};

export default config;
