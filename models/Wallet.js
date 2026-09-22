const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);
