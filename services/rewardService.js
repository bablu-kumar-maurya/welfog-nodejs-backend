const RewardRule = require("../models/RewardRule");
const RewardHistory = require("../models/RewardHistory");
const walletService = require("./walletService");

// Default rule fallback if no rule has been created in DB
const DEFAULT_RULES = {
  LIKE: { requirement: 1000, coins: 10, version: 1 },
  VIEW: { requirement: 1000, coins: 10, version: 1 },
};

/**
 * Get active reward rule for a given type (LIKE or VIEW)
 */
async function getActiveRule(type) {
  try {
    const activeRule = await RewardRule.findOne({
      type: type.toUpperCase(),
      status: "ACTIVE",
    }).sort({ version: -1, createdAt: -1 });

    if (activeRule) {
      return {
        _id: activeRule._id,
        type: activeRule.type,
        requirement: activeRule.requirement,
        coins: activeRule.coins,
        version: activeRule.version,
      };
    }

    const fallback = DEFAULT_RULES[type.toUpperCase()] || {
      requirement: 1000,
      coins: 10,
      version: 1,
    };

    return {
      _id: null,
      type: type.toUpperCase(),
      requirement: fallback.requirement,
      coins: fallback.coins,
      version: fallback.version,
    };
  } catch (error) {
    console.error("❌ Error fetching active reward rule:", error);
    const fallback = DEFAULT_RULES[type.toUpperCase()] || {
      requirement: 1000,
      coins: 10,
      version: 1,
    };
    return {
      _id: null,
      type: type.toUpperCase(),
      requirement: fallback.requirement,
      coins: fallback.coins,
      version: fallback.version,
    };
  }
}

/**
 * Process milestone reward atomically
 * @param {object} params
 * @param {ObjectId|string} params.reelId - Mongo ObjectId of the Reel
 * @param {ObjectId|string} params.creatorId - Mongo ObjectId of Reel Owner
 * @param {number} params.currentCount - Current active like or view count
 * @param {string} params.type - "LIKE" or "VIEW"
 */
async function processMilestoneReward({ reelId, creatorId, currentCount, type }) {
  const normalizedType = type.toUpperCase();
  const rule = await getActiveRule(normalizedType);

  // 1. Validation
  if (!rule.requirement || rule.requirement <= 0 || currentCount < rule.requirement) {
    return {
      earned: false,
      alreadyAwarded: false,
      coins: 0,
      milestone: rule.requirement,
      ruleVersion: rule.version,
    };
  }

  // 2. Calculate current milestone reached based on active requirement
  const milestone = Math.floor(currentCount / rule.requirement) * rule.requirement;

  if (milestone < rule.requirement) {
    return {
      earned: false,
      alreadyAwarded: false,
      coins: 0,
      milestone,
      ruleVersion: rule.version,
    };
  }

  // 3. Find highest milestone previously awarded for this reel
  const highestAwarded = await RewardHistory.findOne({
    reel: reelId,
    type: normalizedType,
  }).sort({ milestone: -1 });

  // 4. If current milestone is less than or equal to highest already awarded milestone -> already awarded
  if (highestAwarded && milestone <= highestAwarded.milestone) {
    return {
      earned: false,
      alreadyAwarded: true,
      coins: 0,
      milestone,
      ruleVersion: rule.version,
    };
  }

  // 5. Check if exact milestone was recorded in RewardHistory
  const existingHistory = await RewardHistory.findOne({
    reel: reelId,
    type: normalizedType,
    milestone,
  });

  if (existingHistory) {
    return {
      earned: false,
      alreadyAwarded: true,
      coins: 0,
      milestone,
      ruleVersion: existingHistory.configVersion || rule.version,
    };
  }

  // 6. Attempt atomic lock & creation of milestone reward
  try {
    const rewardRecord = await RewardHistory.create({
      reel: reelId,
      creator: creatorId,
      type: normalizedType,
      milestone,
      configVersion: rule.version,
      ruleId: rule._id || null,
      coins: rule.coins,
      status: "PROCESSED",
      processedAt: new Date(),
    });

    // 7. Credit coins to creator's wallet
    await walletService.creditCoins(creatorId, rule.coins, `${normalizedType}_REWARD`, {
      reelId,
      milestone,
      configVersion: rule.version,
      description: `Earned ${rule.coins} coins for ${normalizedType.toLowerCase()} milestone ${milestone}`,
    });

    console.log(
      `🎉 [Reward Credited] Creator: ${creatorId}, Reel: ${reelId}, Type: ${normalizedType}, Milestone: ${milestone}, Coins: ${rule.coins}`
    );

    return {
      earned: true,
      alreadyAwarded: false,
      coins: rule.coins,
      milestone,
      ruleVersion: rule.version,
    };
  } catch (error) {
    // 🔥 MongoDB unique index error code 11000 handles concurrent race conditions
    if (error.code === 11000) {
      console.warn(
        `⚡ [Race Condition Handled] Milestone ${milestone} for ${normalizedType} on reel ${reelId} already awarded by concurrent request.`
      );
      return {
        earned: false,
        alreadyAwarded: true,
        coins: 0,
        milestone,
        ruleVersion: rule.version,
      };
    }
    console.error(`❌ Error in processMilestoneReward (${normalizedType}):`, error);
    throw error;
  }
}

/**
 * Get current milestone reward status without crediting coins
 */
async function getMilestoneStatus({ reelId, currentCount, type }) {
  const normalizedType = type.toUpperCase();
  const rule = await getActiveRule(normalizedType);

  if (!rule.requirement || currentCount < rule.requirement) {
    return {
      earned: false,
      alreadyAwarded: false,
      coins: 0,
      milestone: rule.requirement,
      ruleVersion: rule.version,
    };
  }

  const milestone = Math.floor(currentCount / rule.requirement) * rule.requirement;

  const highestAwarded = await RewardHistory.findOne({
    reel: reelId,
    type: normalizedType,
  }).sort({ milestone: -1 });

  if (highestAwarded && milestone <= highestAwarded.milestone) {
    return {
      earned: false,
      alreadyAwarded: true,
      coins: 0,
      milestone,
      ruleVersion: highestAwarded.configVersion || rule.version,
    };
  }

  return {
    earned: false,
    alreadyAwarded: false,
    coins: rule.coins,
    milestone,
    ruleVersion: rule.version,
  };
}

module.exports = {
  getActiveRule,
  processMilestoneReward,
  getMilestoneStatus,
};
