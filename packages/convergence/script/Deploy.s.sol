// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DealOrNotQuickPlay} from "../contracts/DealOrNotQuickPlay.sol";
import {Bank} from "../contracts/Bank.sol";
import {SponsorVault} from "../contracts/SponsorVault.sol";
import {BestOfBanker} from "../contracts/BestOfBanker.sol";

/// @notice Deploy all QuickPlay contracts to Base Sepolia
/// @dev Run: forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast --verify
contract Deploy is Script {
    // Base Sepolia Chainlink Config
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    address constant ETH_USD_PRICE_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;

    // Existing VRF subscription from prototype
    uint256 constant VRF_SUBSCRIPTION_ID = 20136374336138753384898843390506225296052091906296406953567310616148092014984;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address creForwarder = vm.envAddress("CRE_FORWARDER");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Bank
        console.log("Deploying Bank...");
        Bank bank = new Bank(ETH_USD_PRICE_FEED);
        console.log("Bank deployed at:", address(bank));

        // 2. Deploy DealOrNotQuickPlay
        console.log("Deploying DealOrNotQuickPlay...");
        DealOrNotQuickPlay game = new DealOrNotQuickPlay(
            VRF_COORDINATOR,
            VRF_SUBSCRIPTION_ID,
            VRF_KEY_HASH,
            ETH_USD_PRICE_FEED,
            creForwarder,
            address(bank)
        );
        console.log("DealOrNotQuickPlay deployed at:", address(game));

        // 3. Authorize game in bank
        bank.setAuthorizedGame(address(game), true);
        console.log("Game authorized in Bank");

        // 4. Deploy SponsorVault
        console.log("Deploying SponsorVault...");
        SponsorVault sponsorVault = new SponsorVault(address(game));
        sponsorVault.setKeystoneForwarder(creForwarder);
        console.log("SponsorVault deployed at:", address(sponsorVault));

        // 5. Deploy BestOfBanker
        console.log("Deploying BestOfBanker...");
        BestOfBanker bestOfBanker = new BestOfBanker(ETH_USD_PRICE_FEED);
        bestOfBanker.setCREForwarder(creForwarder);
        console.log("BestOfBanker deployed at:", address(bestOfBanker));

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("  DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("Bank:              ", address(bank));
        console.log("DealOrNotQuickPlay:", address(game));
        console.log("SponsorVault:      ", address(sponsorVault));
        console.log("BestOfBanker:      ", address(bestOfBanker));
        console.log("==============================================\n");

        console.log("Next steps:");
        console.log("1. Add game contract as VRF consumer:");
        console.log("   https://vrf.chain.link");
        console.log("2. Sweeten the bank with $5 of ETH:");
        console.log("   cast send <bank> 'sweeten()' --value 0.0025ether");
        console.log("3. Update CRE workflows with new contract address");
        console.log("4. Test: ./scripts/play-game.sh create");
    }
}
