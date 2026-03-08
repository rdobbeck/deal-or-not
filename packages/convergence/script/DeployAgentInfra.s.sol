// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentStaking} from "../contracts/AgentStaking.sol";
import {DealOrNotAgents} from "../contracts/DealOrNotAgents.sol";
import {SeasonalLeaderboard} from "../contracts/SeasonalLeaderboard.sol";
import {PredictionMarket} from "../contracts/PredictionMarket.sol";
import {SharedPriceFeed} from "../contracts/SharedPriceFeed.sol";
import {Bank} from "../contracts/Bank.sol";

/// @notice Deploy Agent Infrastructure contracts to Base Sepolia
/// @dev Run: forge script script/DeployAgentInfra.s.sol:DeployAgentInfra --rpc-url $RPC_URL --broadcast --verify
contract DeployAgentInfra is Script {
    // Base Sepolia Chainlink Config
    address constant VRF_COORDINATOR = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE;
    bytes32 constant VRF_KEY_HASH = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    address constant ETH_USD_PRICE_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;

    // Existing VRF subscription
    uint256 constant VRF_SUBSCRIPTION_ID = 20136374336138753384898843390506225296052091906296406953567310616148092014984;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address creForwarder = vm.envAddress("CRE_FORWARDER");
        address bankAddress = vm.envAddress("BANK_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        Bank bank = Bank(payable(bankAddress));

        // 1. Deploy AgentRegistry
        console.log("Deploying AgentRegistry...");
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry deployed at:", address(registry));

        // 2. Deploy DealOrNotAgents (modular: VRF + PriceFeed + CRE + Registry + Bank)
        console.log("Deploying DealOrNotAgents...");
        DealOrNotAgents agents = new DealOrNotAgents(
            VRF_COORDINATOR,
            VRF_SUBSCRIPTION_ID,
            VRF_KEY_HASH,
            ETH_USD_PRICE_FEED,
            creForwarder,
            address(registry),
            address(bank)
        );
        console.log("DealOrNotAgents deployed at:", address(agents));

        // 3. Wire: authorize DealOrNotAgents in Bank and AgentRegistry
        bank.setAuthorizedGame(address(agents), true);
        console.log("DealOrNotAgents authorized in Bank");

        registry.authorizeContract(address(agents));
        console.log("DealOrNotAgents authorized in AgentRegistry");

        // 4. Deploy AgentStaking
        console.log("Deploying AgentStaking...");
        AgentStaking staking = new AgentStaking(address(registry));
        console.log("AgentStaking deployed at:", address(staking));

        // 5. Deploy SeasonalLeaderboard
        console.log("Deploying SeasonalLeaderboard...");
        SeasonalLeaderboard leaderboard = new SeasonalLeaderboard(address(registry));
        console.log("SeasonalLeaderboard deployed at:", address(leaderboard));

        // 6. Deploy PredictionMarket
        console.log("Deploying PredictionMarket...");
        PredictionMarket market = new PredictionMarket();
        console.log("PredictionMarket deployed at:", address(market));

        // 7. Deploy SharedPriceFeed
        console.log("Deploying SharedPriceFeed...");
        SharedPriceFeed priceFeed = new SharedPriceFeed(ETH_USD_PRICE_FEED);
        console.log("SharedPriceFeed deployed at:", address(priceFeed));

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("  AGENT INFRASTRUCTURE DEPLOYED");
        console.log("==============================================");
        console.log("AgentRegistry:      ", address(registry));
        console.log("DealOrNotAgents:    ", address(agents));
        console.log("AgentStaking:       ", address(staking));
        console.log("SeasonalLeaderboard:", address(leaderboard));
        console.log("PredictionMarket:   ", address(market));
        console.log("SharedPriceFeed:    ", address(priceFeed));
        console.log("==============================================\n");

        console.log("Next steps:");
        console.log("1. Add DealOrNotAgents as VRF consumer:");
        console.log("   https://vrf.chain.link");
        console.log("2. Register an agent:");
        console.log("   cast send <registry> 'registerAgent(string,string,string)' 'TestBot' 'https://your-agent-api.com/decide' '{}'");
        console.log("3. Update CRE agent-gameplay-orchestrator config with new addresses");
        console.log("4. Update env.sh with AGENTS_CONTRACT, AGENT_REGISTRY addresses");
    }
}
