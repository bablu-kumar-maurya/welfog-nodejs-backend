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
    // 🔥 New Hashtags Array Field
    hashtags: [{ type: String, index: true }],

    captionTime: { type: Date },
    captionUpdatedAt: { type: Date },
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

// ================= AUTO SYNC USER DATA, CAPTION TIME & HASHTAGS =================

// ================= AUTO SYNC USER DATA, CAPTION TIME & HASHTAGS =================

reelSchema.pre("save", async function (next) {
  try {
    if (this.isModified("caption") && this.caption) {
      const now = new Date();
      if (!this.captionTime) {
        this.captionTime = now;
      }
      this.captionUpdatedAt = now;

      // 1. Hashtags extract karna
      const extractedTags = (this.caption.match(/#[\w\u0590-\u05ff]+/g) || [])
        .map((tag) => tag.replace("#", "").toLowerCase().trim());

      const uniqueTags = Array.from(new Set(extractedTags));
      this.hashtags = uniqueTags; // Reel me save karne ke liye

      // 🔥 2. NAYA LOGIC: Hashtag collection me COUNT update karna
      if (uniqueTags.length > 0 && this.isNew) {
        // this.isNew isliye taaki sirf nayi reel upload par count badhe
        const Hashtag = require("./hashtag"); // Hashtag model ka path apne folder ke hisaab se check karein

        const bulkOps = uniqueTags.map(tag => ({
          updateOne: {
            filter: { name: tag },
            update: {
              $inc: {
                count: 1
              },
              $set: {
                lastUsedAt: now
              }
            },
            upsert: true
          }
        }));

        await Hashtag.bulkWrite(bulkOps);
      }
    }

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