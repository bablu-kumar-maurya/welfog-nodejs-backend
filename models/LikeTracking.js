const mongoose = require("mongoose");

const likeTrackingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    reel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reel4test",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["LIKED", "UNLIKED"],
      default: "LIKED",
      index: true,
    },
    lastLikedAt: {
      type: Date,
      default: Date.now,
    },
    lastUnlikedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// 🔥 Compound unique index: Ek user aur reel ke liye sirf ek tracking record hoga
likeTrackingSchema.index({ user: 1, reel: 1 }, { unique: true });
likeTrackingSchema.index({ reel: 1, status: 1 });

module.exports = mongoose.model("LikeTracking", likeTrackingSchema);
