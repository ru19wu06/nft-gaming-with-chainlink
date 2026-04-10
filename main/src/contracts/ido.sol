// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract MTSPresale is Ownable, ReentrancyGuard {
	IERC20 public mtsToken;
	IERC20 public payToken;
	uint256 public constant PRICE = 0.02 * 10 ** 18; // 0.02 egas
	uint256 public constant MAX_SALE_AMOUNT = 500000 * 10 ** 18; // 0.5M
	uint256 public totalSold;

	event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);

	constructor(address _mtsToken, address _payToken) {
		require(_mtsToken != address(0), "Invalid MTS token");
		mtsToken = IERC20(_mtsToken);
		payToken = IERC20(_payToken);
	}

	function quoteCost(uint256 _mtsAmount) public pure returns (uint256) {
		return (_mtsAmount * PRICE) / 1e18;
	}

	function isNativePayment() public view returns (bool) {
		return address(payToken) == address(0);
	}

	function buyTokens(uint256 _mtsAmount) external payable nonReentrant {
		require(_mtsAmount > 0, "Amount must be > 0");
		require(totalSold + _mtsAmount <= MAX_SALE_AMOUNT, "Exceeds IDO limit");

		uint256 cost = quoteCost(_mtsAmount);
		if (isNativePayment()) {
			require(msg.value == cost, "Invalid native amount");
		} else {
			require(msg.value == 0, "Native value not accepted");
			require(payToken.transferFrom(msg.sender, address(this), cost), "Payment failed");
		}

		totalSold += _mtsAmount;
		require(mtsToken.transfer(msg.sender, _mtsAmount), "MTS transfer failed");

		emit TokensPurchased(msg.sender, _mtsAmount, cost);
	}

	/**
	 * @dev Owner withdraws received funds (ERC20 or native token)
	 */
	function withdrawFunds() external onlyOwner {
		if (isNativePayment()) {
			uint256 nativeBalance = address(this).balance;
			(bool sent, ) = payable(owner()).call{value: nativeBalance}("");
			require(sent, "Native transfer failed");
		} else {
			uint256 balance = payToken.balanceOf(address(this));
			require(payToken.transfer(owner(), balance), "Withdraw failed");
		}
	}

	/**
	 * @dev If the sale is not sold out, owner can withdraw remaining MTS
	 */
	function withdrawUnsoldTokens() external onlyOwner {
		uint256 remainder = mtsToken.balanceOf(address(this));
		require(mtsToken.transfer(owner(), remainder), "Withdraw unsold failed");
	}

	receive() external payable {}
}
