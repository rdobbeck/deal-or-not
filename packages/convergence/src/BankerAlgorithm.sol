// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BankerAlgorithm — Deal or NOT Prototype (5 Cases / 4 Rounds)
/// @notice Pure library for computing banker offers. Adapted from v1 show-accurate algorithm.
/// @dev EV-based with discount escalation, random variance, and banker psychology.
library BankerAlgorithm {
    /// @notice Calculate expected value of remaining case values
    function expectedValue(uint256[] memory remainingValues) internal pure returns (uint256 ev) {
        uint256 len = remainingValues.length;
        if (len == 0) return 0;
        uint256 sum;
        for (uint256 i; i < len; ++i) {
            sum += remainingValues[i];
        }
        ev = sum / len;
    }

    /// @notice Simple offer: EV * round discount
    function calculateOffer(uint256[] memory remainingValues, uint256 round) internal pure returns (uint256) {
        uint256 ev = expectedValue(remainingValues);
        uint256 discount = discountBps(round);
        return (ev * discount) / 10000;
    }

    /// @notice Full offer with variance + psychology
    function calculateOfferWithVariance(
        uint256[] memory remainingValues,
        uint256 round,
        uint256 initialEV,
        bytes32 seed
    ) internal pure returns (uint256) {
        uint256 ev = expectedValue(remainingValues);
        if (ev == 0) return 0;

        // 1. Base discount (reduced to compensate for variance)
        int256 base = int256(baseDiscountBps(round));

        // 2. Random variance (+-5-15% depending on round)
        int256 variance = _randomVariance(seed, round);

        // 3. Context adjustment (banker psychology)
        int256 context = _contextAdjustment(ev, initialEV, round);

        // 4. Combine and clamp
        int256 finalDiscount = _clamp(base + variance + context, 1500, 9500);

        return (ev * uint256(finalDiscount)) / 10000;
    }

    /// @notice Discount per round -- 4 rounds, escalating from lowball to near-fair
    /// Round 0: 30% (lowball), Round 1: 50%, Round 2: 70%, Round 3: 85%
    function discountBps(uint256 round) internal pure returns (uint256) {
        if (round == 0) return 3000;
        if (round == 1) return 5000;
        if (round == 2) return 7000;
        if (round == 3) return 8500;
        return 9000; // fallback
    }

    /// @notice Base discount with variance compensation (slightly lower than discountBps)
    function baseDiscountBps(uint256 round) internal pure returns (uint256) {
        if (round == 0) return 2700;
        if (round == 1) return 4600;
        if (round == 2) return 6500;
        if (round == 3) return 8000;
        return 8500;
    }

    /// @notice Pseudo-random variance from seed
    function _randomVariance(bytes32 seed, uint256 round) internal pure returns (int256) {
        uint256 entropy = uint256(keccak256(abi.encodePacked(seed, round)));
        // Variance increases with round (more drama late game)
        uint256 maxBps;
        if (round <= 1) maxBps = 500;       // +-5% early
        else if (round == 2) maxBps = 1000;  // +-10% mid
        else maxBps = 1500;                   // +-15% late
        uint256 range = maxBps * 2;
        return int256(entropy % range) - int256(maxBps);
    }

    /// @notice Banker psychology: generous when player losing, stingy when winning
    function _contextAdjustment(uint256 currentEV, uint256 initialEV, uint256 round) internal pure returns (int256) {
        if (round < 1 || initialEV == 0) return 0;
        int256 evChange = (int256(currentEV) - int256(initialEV)) * 10000 / int256(initialEV);
        if (evChange < -2000) return 300;    // EV dropped >20%: +3% bonus
        if (evChange < -1000) return 150;    // EV dropped >10%: +1.5%
        if (evChange > 2000) return -300;    // EV rose >20%: -3% penalty
        if (evChange > 1000) return -150;    // EV rose >10%: -1.5%
        return 0;
    }

    /// @notice Evaluate deal quality relative to EV (10000 = fair)
    function dealQuality(uint256 offer, uint256[] memory remainingValues) internal pure returns (uint256) {
        uint256 ev = expectedValue(remainingValues);
        if (ev == 0) return 0;
        return (offer * 10000) / ev;
    }

    function _clamp(int256 val, int256 min, int256 max) internal pure returns (int256) {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }
}
