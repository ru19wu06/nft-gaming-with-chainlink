// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract LotteryV2_5 is VRFConsumerBaseV2Plus {
    IVRFCoordinatorV2Plus private coordinator;

    // polygon 設定
    bytes32 private keyHash = 0x0ffbbd0c1c18c0263dd778dadd1d64240d7bc338d95fec1cf0473928ca7eaf9e;
    uint256 private subscriptionId; // ← V2.5  uint256
    uint32 private callbackGasLimit = 100000;
    uint16 private requestConfirmations = 3;

    uint256 public randomResult;
    bool public fulfilled;
    address[] public players;
    address public winner;

    bool private useNativePayment = true;

    enum State {
        OPEN,
        DRAWING
    }
    State public state;

    constructor() VRFConsumerBaseV2Plus(0xec0Ed46f36576541C75739E915ADbCb3DE24bD77) {
        coordinator = IVRFCoordinatorV2Plus(0xec0Ed46f36576541C75739E915ADbCb3DE24bD77);
        subscriptionId = 33052362848653601144628215280478780936142151661209813952189268371226136887118; //subid
        state = State.OPEN;
    }

    function enter() external payable {
        require(state == State.OPEN, "Lottery is drawing");
        require(msg.value == 0.01 ether, "Need 0.01 ETH");
        players.push(msg.sender);
    }

    function drawWinner() external {
        require(players.length > 0, "No players");
        state = State.DRAWING;

        //  V2.5：VRFV2PlusClient.RandomWordsRequest struct
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

    // ⭐ V2.5：函數簽名相同，但來自不同的 base contract
    function fulfillRandomWords(uint256, uint256[] calldata randomWords) internal override {
        randomResult = randomWords[0];
        fulfilled = true;
    }

    function claimWinner() external {
        require(fulfilled, "Not ready");
        uint256 index = randomResult % players.length;
        winner = players[index];
        fulfilled = false;
        state = State.OPEN;
        delete players;
        payable(winner).transfer(address(this).balance);
    }

    function getRandom() external view returns (uint256) {
        return randomResult;
    }
}
