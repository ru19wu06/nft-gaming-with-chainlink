// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/**
 * @title LotteryV2_5
 * @notice Standalone Chainlink VRF v2.5 lottery contract (Polygon Amoy).
 *         Separate from MonsterGame — used for direct on-chain lottery draws.
 */
contract LotteryV2_5 is VRFConsumerBaseV2Plus {
	IVRFCoordinatorV2Plus private coordinator;

	// Polygon Amoy VRF coordinator: 0xec0Ed46f36576541C75739E915ADbCb3DE24bD77
	bytes32 private keyHash = 0x0ffbbd0c1c18c0263dd778dadd1d64240d7bc338d95fec1cf0473928ca7eaf9e;
	uint256 private subscriptionId;
	uint32 private callbackGasLimit = 100000;
	uint16 private requestConfirmations = 5;
	bool private useNativePayment = true;

	uint256 public randomResult;
	bool public fulfilled;

	mapping(address => uint256) public opingToBlock;

	constructor() VRFConsumerBaseV2Plus(0xec0Ed46f36576541C75739E915ADbCb3DE24bD77) {
		coordinator = IVRFCoordinatorV2Plus(0xec0Ed46f36576541C75739E915ADbCb3DE24bD77);
		subscriptionId = 33052362848653601144628215280478780936142151661209813952189268371226136887118;
	}

	function drawRandom() public onlyOwner {
		opingToBlock[msg.sender] = block.number;
		coordinator.requestRandomWords(
			VRFV2PlusClient.RandomWordsRequest({
				keyHash: keyHash,
				subId: subscriptionId,
				requestConfirmations: requestConfirmations,
				callbackGasLimit: callbackGasLimit,
				numWords: 1,
				extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: useNativePayment}))
			})
		);
	}

	function fulfillRandomWords(uint256, uint256[] calldata randomWords) internal override {
		randomResult = randomWords[0];
		fulfilled = true;
	}

	function getRandom() external view returns (uint256) {
		return randomResult;
	}
}
