const mongoose = require("mongoose");

const rewardHistorySchema = new mongoose.Schema(
  {
    reel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reel4test",
      required: true,
      index: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["LIKE", "VIEW"],
      required: true,
      index: true,
    },
    milestone: {
      type: Number,
      required: true,
    },
    configVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardRule",
      default: null,
    },
    coins: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["PROCESSED", "FAILED"],
      default: "PROCESSED",
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// 🔥 STRICT UNIQUE COMPOUND INDEX: Ek reel ke ek type (LIKE/VIEW) ke milestone ko sirf ek hi baar reward milega
rewardHistorySchema.index({ reel: 1, type: 1, milestone: 1 }, { unique: true });
rewardHistorySchema.index({ creator: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("RewardHistory", rewardHistorySchema);
