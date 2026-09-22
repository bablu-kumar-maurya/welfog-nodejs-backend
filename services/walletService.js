const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

/**
 * Atomically credit coins to a user's wallet
 * @param {ObjectId|string} userId - Mongo ObjectId of User
 * @param {number} amount - Coins amount to credit
 * @param {string} source - Transaction source (LIKE_REWARD, VIEW_REWARD, etc.)
 * @param {object} metadata - Additional metadata (reelId, milestone, configVersion, description)
 */
async function creditCoins(userId, amount, source, metadata = {}) {
  try {
    if (!userId || amount <= 0) {
      return { success: false, message: "Invalid user or amount" };
    }

    // 🔥 Atomic Upsert and Increment
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: { balance: amount, totalEarned: amount },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    // Record Transaction Log
    const transaction = await WalletTransaction.create({
      wallet: wallet._id,
      user: userId,
      amount,
      type: "CREDIT",
      source,
      reel: metadata.reelId || null,
      milestone: metadata.milestone || null,
      configVersion: metadata.configVersion || null,
      description:
        metadata.description ||
        `Earned ${amount} coins from ${source} for milestone ${metadata.milestone || ""}`,
      balanceAfter: wallet.balance,
    });

    return {
      success: true,
      wallet,
      transaction,
      balance: wallet.balance,
    };
  } catch (error) {
    console.error("❌ Error crediting coins to wallet:", error);
    throw error;
  }
}

/**
 * Get user wallet balance
 */
async function getWallet(userId) {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user: userId, balance: 0, totalEarned: 0, totalSpent: 0 });
  }
  return wallet;
}

module.exports = {
  creditCoins,
  getWallet,
};
