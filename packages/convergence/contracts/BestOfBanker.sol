// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title BestOfBanker -- On-chain gallery of AI Banker quotes with paid upvoting
/// @notice Stores banker messages from the AI Banker CRE workflow.
///         Anyone can upvote their favorite quotes for $0.02 (two cents)
///         priced via Chainlink ETH/USD data feed.
///
///         "The Banker has spoken. Deal... or NOT?"
contract BestOfBanker is Ownable, IReceiver {

    uint256 public constant UPVOTE_COST_CENTS = 2;

    struct Quote {
        uint256 gameId;
        uint8 round;
        string message;
        uint256 upvotes;
        uint256 timestamp;
    }

    AggregatorV3Interface public immutable priceFeed;
    address public creForwarder;

    Quote[] public quotes;
    mapping(uint256 => uint256) public latestQuoteForGame;
    mapping(uint256 => mapping(address => bool)) public hasUpvoted;
    mapping(address => bool) public writers;

    event QuoteSaved(uint256 indexed quoteId, uint256 indexed gameId, uint8 round, string message);
    event QuoteUpvoted(uint256 indexed quoteId, address indexed voter, uint256 newTotal);

    error NotWriter();
    error NotCREForwarder();
    error AlreadyUpvoted();
    error InvalidQuote();
    error EmptyMessage();
    error InsufficientPayment();
    error StalePriceFeed();

    constructor(address _priceFeed) Ownable(msg.sender) {
        priceFeed = AggregatorV3Interface(_priceFeed);
        writers[msg.sender] = true;
    }

    function saveQuote(uint256 gameId, uint8 round, string calldata message) external {
        if (!writers[msg.sender]) revert NotWriter();
        _saveQuote(gameId, round, message);
    }

    function _saveQuote(uint256 gameId, uint8 round, string memory message) internal {
        if (bytes(message).length == 0) revert EmptyMessage();
        uint256 quoteId = quotes.length;
        quotes.push(Quote({
            gameId: gameId,
            round: round,
            message: message,
            upvotes: 0,
            timestamp: block.timestamp
        }));
        latestQuoteForGame[gameId] = quoteId;
        emit QuoteSaved(quoteId, gameId, round, message);
    }

    function upvote(uint256 quoteId) external payable {
        if (quoteId >= quotes.length) revert InvalidQuote();
        if (hasUpvoted[quoteId][msg.sender]) revert AlreadyUpvoted();
        uint256 costWei = upvoteCostWei();
        if (msg.value < costWei) revert InsufficientPayment();
        hasUpvoted[quoteId][msg.sender] = true;
        quotes[quoteId].upvotes++;
        emit QuoteUpvoted(quoteId, msg.sender, quotes[quoteId].upvotes);
        uint256 excess = msg.value - costWei;
        if (excess > 0) {
            (bool ok,) = msg.sender.call{value: excess}("");
            require(ok);
        }
    }

    function upvoteCostWei() public view returns (uint256) {
        (, int256 ethUsdPrice, , , ) = priceFeed.latestRoundData();
        if (ethUsdPrice <= 0) revert StalePriceFeed();
        return (UPVOTE_COST_CENTS * 1e24) / uint256(ethUsdPrice);
    }

    function quoteCount() external view returns (uint256) {
        return quotes.length;
    }

    function getQuote(uint256 quoteId) external view returns (
        uint256 gameId, uint8 round, string memory message, uint256 upvotes, uint256 timestamp
    ) {
        if (quoteId >= quotes.length) revert InvalidQuote();
        Quote storage q = quotes[quoteId];
        return (q.gameId, q.round, q.message, q.upvotes, q.timestamp);
    }

    function getLatestMessage(uint256 gameId) external view returns (string memory) {
        if (quotes.length == 0) return "";
        uint256 idx = latestQuoteForGame[gameId];
        if (quotes[idx].gameId != gameId) return "";
        return quotes[idx].message;
    }

    function getTopQuotes(uint256 count) external view returns (
        uint256[] memory ids, uint256[] memory gameIds, string[] memory messages, uint256[] memory upvoteCounts
    ) {
        uint256 total = quotes.length;
        if (count > total) count = total;
        ids = new uint256[](count);
        gameIds = new uint256[](count);
        messages = new string[](count);
        upvoteCounts = new uint256[](count);
        bool[] memory used = new bool[](total);
        for (uint256 i = 0; i < count; i++) {
            uint256 bestIdx = 0;
            uint256 bestVotes = 0;
            bool found = false;
            for (uint256 j = 0; j < total; j++) {
                if (!used[j] && (quotes[j].upvotes > bestVotes || (!found && quotes[j].upvotes >= bestVotes))) {
                    bestIdx = j;
                    bestVotes = quotes[j].upvotes;
                    found = true;
                }
            }
            if (!found) break;
            used[bestIdx] = true;
            ids[i] = bestIdx;
            gameIds[i] = quotes[bestIdx].gameId;
            messages[i] = quotes[bestIdx].message;
            upvoteCounts[i] = quotes[bestIdx].upvotes;
        }
    }

    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != creForwarder) revert NotCREForwarder();
        bytes4 selector = bytes4(report[:4]);
        if (selector == this.saveQuote.selector) {
            (uint256 gameId, uint8 round, string memory message) =
                abi.decode(report[4:], (uint256, uint8, string));
            _saveQuote(gameId, round, message);
        }
    }

    function setCREForwarder(address _forwarder) external onlyOwner {
        creForwarder = _forwarder;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == 0x01ffc9a7;
    }

    function setWriter(address writer, bool allowed) external onlyOwner {
        writers[writer] = allowed;
    }

    function withdraw() external onlyOwner {
        (bool ok,) = owner().call{value: address(this).balance}("");
        require(ok);
    }
}
