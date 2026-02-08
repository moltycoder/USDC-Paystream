// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract PayStream is Ownable {
    IERC20 public usdcToken;

    struct Stream {
        address sender;
        address recipient;
        uint256 deposit;
        uint256 ratePerSecond;
        uint256 startTime;
        uint256 stopTime;
        uint256 remainingBalance;
        bool active;
    }

    mapping(uint256 => Stream) public streams;
    uint256 public nextStreamId;

    event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed recipient, uint256 ratePerSecond);
    event StreamCancelled(uint256 indexed streamId, address indexed sender, address indexed recipient, uint256 senderRefund, uint256 recipientBalance);

    constructor(address _usdcToken) Ownable(msg.sender) {
        usdcToken = IERC20(_usdcToken);
    }

    function createStream(address recipient, uint256 deposit, uint256 ratePerSecond) external {
        require(deposit > 0, 'Deposit must be > 0');
        require(ratePerSecond > 0, 'Rate must be > 0');
        require(usdcToken.transferFrom(msg.sender, address(this), deposit), 'USDC transfer failed');

        uint256 streamId = nextStreamId++;
        streams[streamId] = Stream({
            sender: msg.sender,
            recipient: recipient,
            deposit: deposit,
            ratePerSecond: ratePerSecond,
            startTime: block.timestamp,
            stopTime: 0,
            remainingBalance: deposit,
            active: true
        });

        emit StreamCreated(streamId, msg.sender, recipient, ratePerSecond);
    }
}
