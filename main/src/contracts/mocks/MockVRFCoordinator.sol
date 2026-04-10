// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Re-export the Chainlink mock so Hardhat compiles it as an artifact.
// Usage in tests: ethers.deployContract("VRFCoordinatorV2_5Mock", [baseFee, gasPrice, weiPerUnitLink])
import "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
