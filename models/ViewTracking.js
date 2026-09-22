const mongoose = require("mongoose");

const viewTrackingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      default: null,
      index: true,
    },
    userId: {
      type: String,
      default: "",
      index: true,
    },
    reel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reel4test",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    watchPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    watchedDuration: {
      type: Number,
      default: 0,
    },
    videoDuration: {
      type: Number,
      default: 0,
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// 🔥 Compound index: Prevent duplicate view counting for the same session
viewTrackingSchema.index({ reel: 1, sessionId: 1 }, { unique: true });
viewTrackingSchema.index({ user: 1, reel: 1, createdAt: -1 });

module.exports = mongoose.model("ViewTracking", viewTrackingSchema);
