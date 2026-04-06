require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
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
    eni: {
      url: process.env.ENIMAIN_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
    enitest: {
      url: process.env.ENITEST_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
  },

  etherscan: {
    apiKey: process.env.ENITESTSCAN_API_KEY,
  },
};
