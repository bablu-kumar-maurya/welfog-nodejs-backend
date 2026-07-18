const mongoose = require("mongoose");

const reelSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User4",
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    userid: { type: String, required: true },
    username: { type: String, required: true },
    name: { type: String, default: "" },

   
    seller_id: { type: String, default: "" },
    userseller_id: { type: String, default: "" },

    videoUrl: { type: String, default: "" },
    thumbnailUrl: { type: String },
    title: { type: String },

    status: {
      type: String,
      enum: ["Published", "Processing", "Blocked", "Reported", "Failed"],
      default: "Processing",
      index: true,
    },

    error: { type: String, default: null },

    blockReason: { type: String, default: null },
    blockedAt: { type: Date, default: null },

    qualityVariants: {
      type: [String],
      default: ["240p", "480p", "720p"],
    },

    caption: { type: String },
    category: { type: String },
    description: { type: String },
    duration: { type: Number },

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User4" }],
    viewsdata: [{ type: mongoose.Schema.Types.ObjectId, ref: "User4" }],
    views: { type: Number, default: 0 },

    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
    music: { type: mongoose.Schema.Types.ObjectId, ref: "Music" },

    shares: [
      {
        sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User4" },
        sharedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User4" },
        sharedAt: { type: Date, default: Date.now },
      },
    ],

    shortLinks: [
      {
        slug: { type: String, required: true },
        shortLink: { type: String, required: true },
        generatedForUser: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User4",
        },
        generatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// ================= AUTO SYNC USER DATA =================

reelSchema.pre("save", async function (next) {
  try {
    if (!this.isModified("user") && !this.isNew) return next();

    const User = mongoose.model("User4");
    const userDoc = await User.findById(this.user);

    if (userDoc) {
      this.userid = userDoc.userid;
      this.username = userDoc.username;
      this.name = userDoc.name;
      this.seller_id = userDoc.seller_id || "";
      this.userseller_id = userDoc.userseller_id || "";
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Reel4test", reelSchema);
