const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const RewardRule = require("../models/RewardRule");
const RewardHistory = require("../models/RewardHistory");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const CoinSetting = require("../models/CoinSetting");
const walletService = require("../services/walletService");

/**
 * GET /api/rewards/rules
 * Fetch all reward rules
 */
router.get("/rules", async (req, res) => {
  try {
    const rules = await RewardRule.find().sort({ type: 1, version: -1 });
    return res.status(200).json({ success: true, rules });
  } catch (error) {
    console.error("❌ Error fetching reward rules:", error);
    return res.status(500).json({ success: false, message: "Error fetching reward rules" });
  }
});

/**
 * POST /api/rewards/rules
 * Create or update a reward rule with automatic versioning
 */
router.post("/rules", async (req, res) => {
  try {
    const { type, requirement, coins, createdBy } = req.body;

    if (!type || !requirement || !coins) {
      return res.status(400).json({
        success: false,
        message: "type, requirement, and coins are required",
      });
    }

    const normalizedType = type.toUpperCase();
    const reqNum = Number(requirement);
    const coinsNum = Number(coins);

    if (isNaN(reqNum) || reqNum <= 0 || isNaN(coinsNum) || coinsNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "Requirement and coins must be positive numbers",
      });
    }

    // 1. Find existing active rule for this type to determine next version
    const existingRule = await RewardRule.findOne({
      type: normalizedType,
      status: "ACTIVE",
    }).sort({ version: -1 });

    const nextVersion = existingRule ? existingRule.version + 1 : 1;

    // 2. Mark previous rule inactive
    if (existingRule) {
      existingRule.status = "INACTIVE";
      existingRule.effectiveTo = new Date();
      await existingRule.save();
    }

    // 3. Create new Versioned Rule
    const newRule = await RewardRule.create({
      type: normalizedType,
      requirement: reqNum,
      coins: coinsNum,
      version: nextVersion,
      status: "ACTIVE",
      effectiveFrom: new Date(),
      createdBy: createdBy || "admin",
    });

    return res.status(201).json({
      success: true,
      message: `Reward rule for ${normalizedType} updated to Version ${nextVersion}`,
      rule: newRule,
    });
  } catch (error) {
    console.error("❌ Error creating reward rule:", error);
    return res.status(500).json({ success: false, message: "Error creating reward rule" });
  }
});

/**
 * PUT /api/rewards/rules/:id/toggle
 * Toggle active/inactive status of a rule
 */
router.put("/rules/:id/toggle", async (req, res) => {
  try {
    const rule = await RewardRule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, message: "Rule not found" });
    }

    rule.status = rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (rule.status === "INACTIVE") {
      rule.effectiveTo = new Date();
    } else {
      rule.effectiveTo = null;
    }

    await rule.save();
    return res.status(200).json({ success: true, rule });
  } catch (error) {
    console.error("❌ Error toggling reward rule:", error);
    return res.status(500).json({ success: false, message: "Error toggling rule" });
  }
});

/**
 * GET /api/rewards/history
 * Fetch milestone rewards history
 */
router.get("/history", async (req, res) => {
  try {
    const { reelId, creatorId, type, page = 1, limit = 20 } = req.query;
    const query = {};

    if (reelId && mongoose.isValidObjectId(reelId)) query.reel = reelId;
    if (creatorId && mongoose.isValidObjectId(creatorId)) query.creator = creatorId;
    if (type) query.type = type.toUpperCase();

    const skip = (Number(page) - 1) * Number(limit);
    const total = await RewardHistory.countDocuments(query);
    const history = await RewardHistory.find(query)
      .populate("creator", "userid username name profilePicture")
      .populate("reel", "title thumbnailUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      history,
    });
  } catch (error) {
    console.error("❌ Error fetching reward history:", error);
    return res.status(500).json({ success: false, message: "Error fetching reward history" });
  }
});

/**
 * GET /api/rewards/wallet/:userId
 * Fetch user wallet and transaction log
 */
router.get("/wallet/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    let targetUserId = userId;

    if (!mongoose.isValidObjectId(userId)) {
      const User = mongoose.model("User4");
      const u = await User.findOne({ userid: userId });
      if (u) targetUserId = u._id;
    }

    const wallet = await walletService.getWallet(targetUserId);
    const transactions = await WalletTransaction.find({ user: targetUserId })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      wallet,
      transactions,
    });
  } catch (error) {
    console.error("❌ Error fetching wallet:", error);
    return res.status(500).json({ success: false, message: "Error fetching wallet" });
  }
});

/**
 * GET /api/rewards/coin-setting
 * Fetch active Coin to Rupee conversion rate
 */
router.get("/coin-setting", async (req, res) => {
  try {
    let setting = await CoinSetting.findOne().sort({ updatedAt: -1 });
    if (!setting) {
      setting = await CoinSetting.create({
        coins: 1,
        rupees: 5,
        currency: "INR",
        currencySymbol: "₹",
        updatedBy: "admin",
      });
    }
    return res.status(200).json({ success: true, setting });
  } catch (error) {
    console.error("❌ Error fetching coin setting:", error);
    return res.status(500).json({ success: false, message: "Error fetching coin setting" });
  }
});

/**
 * POST /api/rewards/coin-setting
 * Create or update Coin to Rupee conversion rate
 */
router.post("/coin-setting", async (req, res) => {
  try {
    const { coins = 1, rupees, updatedBy } = req.body;

    const coinsNum = Number(coins);
    const rupeesNum = Number(rupees);

    if (isNaN(coinsNum) || coinsNum <= 0 || isNaN(rupeesNum) || rupeesNum < 0) {
      return res.status(400).json({
        success: false,
        message: "Coins and rupees must be valid positive numbers",
      });
    }

    let setting = await CoinSetting.findOne().sort({ updatedAt: -1 });

    if (setting) {
      setting.coins = coinsNum;
      setting.rupees = rupeesNum;
      if (updatedBy) setting.updatedBy = updatedBy;
      await setting.save();
    } else {
      setting = await CoinSetting.create({
        coins: coinsNum,
        rupees: rupeesNum,
        currency: "INR",
        currencySymbol: "₹",
        updatedBy: updatedBy || "admin",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Coin conversion rate updated: ${coinsNum} Coin = ₹${rupeesNum}`,
      setting,
    });
  } catch (error) {
    console.error("❌ Error updating coin setting:", error);
    return res.status(500).json({ success: false, message: "Error updating coin setting" });
  }
});

module.exports = router;
