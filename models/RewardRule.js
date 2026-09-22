const mongoose = require("mongoose");

const rewardRuleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["LIKE", "VIEW", "SHARE", "ORDER"],
      index: true,
    },
    requirement: {
      type: Number,
      required: true,
      min: 1,
    },
    coins: {
      type: Number,
      required: true,
      min: 1,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      default: "admin",
    },
  },
  { timestamps: true }
);

rewardRuleSchema.index({ type: 1, status: 1, version: -1 });

module.exports = mongoose.model("RewardRule", rewardRuleSchema);
