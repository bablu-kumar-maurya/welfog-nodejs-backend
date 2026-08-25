const mongoose = require("mongoose");

const ALLOWED_MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "pdf",
  "zip",
  "excel",
  "word",
  "powerpoint",
  "json",
  "csv",
  "file",
  "reel",
  "product",
];

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ALLOWED_MESSAGE_TYPES,
      default: "text",
      required: true,
    },
    text: {
      type: String,
      default: "",
    },
    mediaUrl: {
      type: String,
      default: "",
    },
    thumbnailUrl: {
      type: String,
      default: "",
    },
    fileName: {
      type: String,
      default: "",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "",
    },
    duration: {
      type: Number,
      default: 0,
    },
    sharedReel: {
      reelId: { type: String, default: "" },
      videoUrl: { type: String, default: "" },
      thumbnailUrl: { type: String, default: "" },
      caption: { type: String, default: "" },
      authorName: { type: String, default: "" },
    },
    sharedProduct: {
      productId: { type: String, default: "" },
      title: { type: String, default: "" },
      imageUrl: { type: String, default: "" },
      price: { type: Number, default: 0 },
      slug: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
      index: true,
    },
    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User4",
      },
    ],
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User4",
      },
    ],
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User4",
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
