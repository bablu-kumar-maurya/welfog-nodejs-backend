const mongoose = require("mongoose");

const coinSettingSchema = new mongoose.Schema(
  {
    coins: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    rupees: {
      type: Number,
      required: true,
      default: 5,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    currencySymbol: {
      type: String,
      default: "₹",
    },
    updatedBy: {
      type: String,
      default: "admin",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CoinSetting", coinSettingSchema);
