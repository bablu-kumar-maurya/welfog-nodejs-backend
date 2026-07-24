const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
// 🔥 uuidv4 ka import yahan se hata diya hai

// ================= USER SCHEMA =================

const userSchema = new mongoose.Schema({
  userid: {
    type: String,
    required: true,
    unique: true, // ✅ UserID hamesha unique rahegi
    // 🔥 default: uuidv4 yahan se hata diya hai
  },

  // 🔥 SELLER FIELDS FIXED (Removed default: "")
  seller_id: {
    type: String,
    unique: true,
    sparse: true,
  },
  userseller_id: {
    type: String,
    unique: true,
    sparse: true,
  },

  // ✅ SOFT DELETE FIELDS ADDED
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },

  name: { type: String, default: "" },
  username: { type: String, unique: true, required: true },
  mobile: { type: String, required: true, unique: true },
  email: { type: String, default: "" },

  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User4" }],

  profilePicture: { type: String, default: "" },

  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User4" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User4" }],

  isConnected: {
    type: Boolean,
    default: false,
  },
  lastConnectedAt: {
    type: Date,
  },
  suspendReason: {
    type: String,
    default: "",
  },
  suspendedBy: {
    type: String,
    ref: "Admin",
  },
  suspendedAt: {
    type: Date,
  },
  fcmToken: {
    type: String,
    default: "",
  },
  bio: { type: String, default: "" },
  isSuspended: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, default: Date.now },
});

// ================= SYNC USER DATA TO REELS =================
userSchema.pre("save", async function (next) {
  if (
    !this.isModified("username") &&
    !this.isModified("name") &&
    !this.isModified("seller_id") &&
    !this.isModified("userseller_id")
  ) {
    return next();
  }

  try {
    const Reel = mongoose.model("Reel4test");
    const update = {};

    if (this.isModified("username")) update.username = this.username;
    if (this.isModified("name")) update.name = this.name;
    if (this.isModified("seller_id")) update.seller_id = this.seller_id;
    if (this.isModified("userseller_id")) update.userseller_id = this.userseller_id;

    if (!Object.keys(update).length) return next();

    const result = await Reel.updateMany({ user: this._id }, { $set: update });
    console.log("✅ Reels matched:", result.matchedCount);
    console.log("✅ Reels modified:", result.modifiedCount);

    next();
  } catch (err) {
    console.error("❌ Error syncing reels:", err);
    next(err);
  }
});

// ================= GENERATE UNIQUE USERNAME =================
userSchema.statics.generateUniqueUsername = async function () {
  let isUnique = false;
  let newUsername = "";

  while (!isUnique) {
    newUsername = `user${Math.floor(1000 + Math.random() * 9000)}`;
    const existing = await this.findOne({ username: newUsername });
    if (!existing) isUnique = true;
  }
  return newUsername;
};

// ================= SYNC USERID ACROSS MODELS =================
userSchema.pre("save", async function (next) {
  try {
    if (!this.isNew) return next();

    // 🔥 YAHAN SE BHI uuidv4() GENERATE KARNE WALI LINE HATA DI HAI
    // Ab user.userid wahi rahegi jo tumne API (frontend) se bheji thi

    const Reel = mongoose.model("Reel4test");
    const Music = mongoose.model("Music");
    const Comment = mongoose.model("Comment");

    const updateModels = [Reel, Music, Comment];

    for (const Model of updateModels) {
      await Model.updateMany(
        { uploadedBy: this._id },
        { $set: { userid: this.userid } },
      );
    }
    next();
  } catch (err) {
    console.error("❌ Error syncing userid across models:", err);
    next(err);
  }
});

module.exports = mongoose.model("User4", userSchema);