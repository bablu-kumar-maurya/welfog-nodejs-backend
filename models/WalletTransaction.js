const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },
    source: {
      type: String,
      enum: [
        "LIKE_REWARD",
        "VIEW_REWARD",
        "SHARE_REWARD",
        "ORDER_REWARD",
        "ADMIN_ADJUSTMENT",
        "PURCHASE",
        "OTHER",
      ],
      required: true,
      index: true,
    },
    reel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reel4test",
      default: null,
      index: true,
    },
    milestone: {
      type: Number,
      default: null,
    },
    configVersion: {
      type: Number,
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
