const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // 👇 Option 1: Store User ObjectId (recommended for Mongo refs)
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: false
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: false
    },

    // 👇 Option 2: Store userId as string (like "1113") for backward compatibility
    recipientUserId: {
      type: String,
      required: false
    },
    senderUserId: {
      type: String,
      required: false
    },

    type: {
      type: String,
      enum: ["follow", "like", "comment", "comment_like", "comment_reply"],
      required: true
    },

    reel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reel",
      default: null
    },

    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null
    },

    message: {
      type: String,
      required: true
    },

    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);






