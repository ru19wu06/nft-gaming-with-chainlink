import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

contract VRFv2Example is VRFConsumerBaseV2 {
    VRFCoordinatorV2Interface COORDINATOR;
    uint64 subscriptionId; // No need to hold link
    uint256[] public randomWords; 
    constructor(uint64 subId)
        VRFConsumerBaseV2(0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625)
    {
        COORDINATOR = VRFCoordinatorV2Interface(0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625);
        subscriptionId = subId;
    }

    function requestRandomWords() external {
        COORDINATOR.requestRandomWords(
            0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56, // keyHash
            subscriptionId,
            3,       // requestConfirmations
            100000,  // callbackGasLimit
            3        // numWords of random 
        );
    }

    // callback different from v1
    function fulfillRandomWords(uint256 requestId, uint256[] memory _randomWords) internal override {
        randomWords = _randomWords; // array muti random number
    }
}