const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    isGroup: {
      type: Boolean,
      default: false,
      index: true,
    },
    groupName: {
      type: String,
      default: "",
      trim: true,
    },
    groupAvatar: {
      type: String,
      default: "",
    },
    groupDescription: {
      type: String,
      default: "",
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
    },
    groupCoAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User4",
      },
    ],
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User4",
        required: true,
      },
    ],
    exitedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User4",
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User4",
      },
    ],
    clearedAt: {
      type: Map,
      of: Date,
      default: {},
    },
    joinedAt: {
      type: Map,
      of: Date,
      default: {},
    },
    inviteCode: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
