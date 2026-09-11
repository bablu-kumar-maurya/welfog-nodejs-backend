const express = require("express");
const router = express.Router();
const User = require("../models/Users");
const Reel4test = require("../models/Reel");
const ReelInteraction = require("../models/ReelInteraction");
const logUserAction = require("../utils/logUserAction");


// 1️⃣ BLOCK USER API (SUPERFAST)
router.post("/block-user", async (req, res) => {
  try {
    const { blockerId, targetUserId } = req.body;

    if (!blockerId || !targetUserId) {
      return res.status(400).json({ success: false, message: "Both blockerId and targetUserId are required." });
    }

    if (blockerId === targetUserId) {
      return res.status(400).json({ success: false, message: "You cannot block yourself." });
    }

    // 🚀 OPTIMIZATION 1: Fetch both users in PARALLEL (Same time pe)
    const [blocker, target] = await Promise.all([
      User.findById(blockerId),
      User.findById(targetUserId)
    ]);

    if (!blocker || !target) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Safe ObjectId string comparison
    const isAlreadyBlocked = blocker.blockedUsers.some(id => id.toString() === targetUserId.toString());
    if (isAlreadyBlocked) {
      return res.status(400).json({ success: false, message: "User is already blocked." });
    }

    // 1. Add to blocked list
    blocker.blockedUsers.push(targetUserId);

    // 2. Mutual Unfollow (Instagram style)
    blocker.following = blocker.following.filter(id => id.toString() !== targetUserId.toString());
    blocker.followers = blocker.followers.filter(id => id.toString() !== targetUserId.toString());

    target.following = target.following.filter(id => id.toString() !== blockerId.toString());
    target.followers = target.followers.filter(id => id.toString() !== blockerId.toString());

    // 🚀 OPTIMIZATION 2: Save both user documents in PARALLEL (Ek sath save honge)
    await Promise.all([blocker.save(), target.save()]);

    res.status(200).json({
      success: true,
      message: `${target.username} has been blocked and mutually unfollowed.`
    });

  } catch (error) {
    console.error("Block API Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// 2️⃣ UNBLOCK USER API (SUPERFAST)
router.post("/unblock-user", async (req, res) => {
  try {
    const { unblockerId, targetUserId } = req.body;

    if (!unblockerId || !targetUserId) {
      return res.status(400).json({ success: false, message: "Both unblockerId and targetUserId are required." });
    }

    if (unblockerId === targetUserId) {
      return res.status(400).json({ success: false, message: "You cannot unblock yourself." });
    }

    // 🚀 OPTIMIZATION 1: Fetch unblocker (Full doc) and target (Only username needed) in PARALLEL
    const [unblocker, target] = await Promise.all([
      User.findById(unblockerId),
      User.findById(targetUserId).select("username").lean() // Target me bas username chahiye toh sirf wahi fetch kiya
    ]);

    if (!unblocker || !target) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Check if target is blocked
    const isBlocked = unblocker.blockedUsers.some(id => id.toString() === targetUserId.toString());
    if (!isBlocked) {
      return res.status(400).json({ success: false, message: "User is not currently blocked." });
    }

    // Remove from blocked list
    unblocker.blockedUsers = unblocker.blockedUsers.filter(id => id.toString() !== targetUserId.toString());

    // Save unblocker
    await unblocker.save();

    res.status(200).json({
      success: true,
      message: `${target.username} has been unblocked.`
    });

  } catch (error) {
    console.error("Unblock API Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// 3️⃣ GET BLOCKED USERS API (SUPERFAST)
router.get("/blocked-users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 🚀 OPTIMIZATION: Early ObjectId validation (Fail Fast - bina database jaye hi invalid ID reject ho jayegi)
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(id)
      .select("blockedUsers")
      .populate({
        path: "blockedUsers",
        select: "username profilePicture name userid"
      })
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      totalBlockedUsers: user.blockedUsers ? user.blockedUsers.length : 0,
      blockedUsers: user.blockedUsers || []
    });

  } catch (error) {
    console.error("Blocked Users API Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Server Error" });
    }
  }
});


router.post("/mark-interest", async (req, res) => {
  try {
    const { userId, reelId, action } = req.body;


    if (!userId || !reelId || !action) {
      return res.status(400).json({ message: "userId, reelId, aur action required hain." });
    }

    if (!["interested", "not_interested"].includes(action)) {
      return res.status(400).json({ message: "Invalid action. Use 'interested' or 'not_interested'." });
    }


    const interaction = await ReelInteraction.findOneAndUpdate(
      { user: userId, reel: reelId },
      { action: action },
      { upsert: true, new: true }
    );

    // Optional: Log analytics
    try {
      await logUserAction({
        user: userId,
        action: `marked_${action}`,
        targetType: "Reel",
        targetId: reelId,
        device: req.headers["user-agent"]
      });
    } catch (e) {
      console.error("Interest log error:", e.message);
    }

    return res.status(200).json({
      success: true,
      message: `Reel marked as ${action.replace("_", " ")} successfully.`,
      data: interaction
    });

  } catch (error) {
    console.error("Mark Interest API Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;