// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DealOrNotBridge} from "../contracts/DealOrNotBridge.sol";
import {DealOrNotGateway} from "../contracts/DealOrNotGateway.sol";

/// @notice Deploy DealOrNotBridge on Base Sepolia
/// @dev Run: DEAL_OR_NOT_ADDRESS=$GAME_CONTRACT forge script script/DeployCCIP.s.sol:DeployBridge --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY
contract DeployBridge is Script {
    address constant CCIP_ROUTER = 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93;
    uint64 constant ETH_SEPOLIA_CHAIN_SELECTOR = 16015286601757825753;

    function run() external {
        address gameContract = vm.envAddress("DEAL_OR_NOT_ADDRESS");

        vm.startBroadcast();

        DealOrNotBridge bridge = new DealOrNotBridge(CCIP_ROUTER, gameContract);
        console.log("DealOrNotBridge deployed at:", address(bridge));

        address gatewayAddress = vm.envOr("GATEWAY_ADDRESS", address(0));
        if (gatewayAddress != address(0)) {
            bridge.setGateway(ETH_SEPOLIA_CHAIN_SELECTOR, gatewayAddress);
            console.log("Registered ETH Sepolia gateway:", gatewayAddress);
        }

        vm.stopBroadcast();
    }
}

/// @notice Deploy DealOrNotGateway on ETH Sepolia
/// @dev Run: forge script script/DeployCCIP.s.sol:DeployGateway --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --private-key $DEPLOYER_KEY
contract DeployGateway is Script {
    address constant CCIP_ROUTER = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
    address constant ETH_USD_PRICE_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    uint64 constant BASE_SEPOLIA_CHAIN_SELECTOR = 10344971235874465080;

    function run() external {
        vm.startBroadcast();

        DealOrNotGateway gateway = new DealOrNotGateway(
            CCIP_ROUTER,
            ETH_USD_PRICE_FEED,
            BASE_SEPOLIA_CHAIN_SELECTOR
        );
        console.log("DealOrNotGateway deployed at:", address(gateway));

        address homeBridge = vm.envOr("HOME_BRIDGE_ADDRESS", address(0));
        if (homeBridge != address(0)) {
            gateway.setHomeBridge(homeBridge);
            console.log("Home bridge set to:", homeBridge);
        }

        vm.stopBroadcast();
    }
}
