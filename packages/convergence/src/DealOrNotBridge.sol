// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CCIPReceiver} from "@chainlink/contracts/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";

interface IDealOrNot {
    function joinGameCrossChain(uint256 gameId, address player) external;
}

/// @title DealOrNotBridge -- CCIP Receiver (Base Sepolia)
/// @notice Receives CCIP messages from spoke gateways on other chains and
///         joins the player into the game on the home chain.
contract DealOrNotBridge is CCIPReceiver {
    IDealOrNot public gameContract;
    address public owner;

    mapping(uint64 => address) public gateways;

    event PlayerJoinedCrossChain(uint256 indexed gameId, address indexed player, uint64 sourceChainSelector, bytes32 ccipMessageId);
    event CrossChainJoinFailed(uint256 indexed gameId, address indexed player, uint64 sourceChainSelector, bytes32 ccipMessageId);
    event GatewayRegistered(uint64 indexed chainSelector, address gateway);
    event GatewayRemoved(uint64 indexed chainSelector);
    event GameContractUpdated(address indexed newGameContract);

    error UnauthorizedGateway(uint64 chainSelector, address sender);
    error NotOwner();

    constructor(address _router, address _gameContract) CCIPReceiver(_router) {
        gameContract = IDealOrNot(_gameContract);
        owner = msg.sender;
    }

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        address sender = abi.decode(message.sender, (address));
        uint64 sourceChain = message.sourceChainSelector;
        if (gateways[sourceChain] != sender) {
            revert UnauthorizedGateway(sourceChain, sender);
        }
        (uint256 gameId, address player) = abi.decode(message.data, (uint256, address));
        try gameContract.joinGameCrossChain(gameId, player) {
            emit PlayerJoinedCrossChain(gameId, player, sourceChain, message.messageId);
        } catch {
            emit CrossChainJoinFailed(gameId, player, sourceChain, message.messageId);
        }
    }

    function setGateway(uint64 chainSelector, address gateway) external {
        if (msg.sender != owner) revert NotOwner();
        gateways[chainSelector] = gateway;
        emit GatewayRegistered(chainSelector, gateway);
    }

    function removeGateway(uint64 chainSelector) external {
        if (msg.sender != owner) revert NotOwner();
        delete gateways[chainSelector];
        emit GatewayRemoved(chainSelector);
    }

    function setGameContract(address _gameContract) external {
        if (msg.sender != owner) revert NotOwner();
        gameContract = IDealOrNot(_gameContract);
        emit GameContractUpdated(_gameContract);
    }
}
