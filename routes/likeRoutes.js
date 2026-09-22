const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Reel = require("../models/Reel");
const User = require("../models/Users");
const LikeTracking = require("../models/LikeTracking");
const rewardService = require("../services/rewardService");
const resolveUser = require("../middleware/resolveUser");

/**
 * Helper to get reelId from params or body
 */
function getReelId(req) {
  return req.params.reelId || req.params.id || req.body.reelId || req.body.id;
}

/**
 * POST /api/likes/toggle or /api/likes/:reelId
 * Main Like & Unlike Handler with atomic tracking and milestone reward verification
 */
async function handleLikeToggle(req, res) {
  try {
    const reelId = getReelId(req);
    const user = req.resolvedUser;
    const explicitAction = req.body.action; // "like" | "unlike" | optional

    if (!reelId || !mongoose.isValidObjectId(reelId)) {
      return res.status(400).json({ success: false, message: "Valid reelId is required" });
    }

    // 1. Fetch Reel
    const reel = await Reel.findOne({ _id: reelId, isDeleted: { $ne: true } });
    if (!reel) {
      return res.status(404).json({ success: false, message: "Reel not found" });
    }

    // 2. Check existing LikeTracking record
    const existingTracking = await LikeTracking.findOne({
      user: user._id,
      reel: reel._id,
    });

    const isCurrentlyLiked = existingTracking && existingTracking.status === "LIKED";

    // 3. Determine target action
    let targetAction = explicitAction;
    if (!targetAction) {
      targetAction = isCurrentlyLiked ? "unlike" : "like";
    }

    // ==========================================
    // CASE A: ALREADY LIKED (Duplicate prevention)
    // ==========================================
    if (targetAction === "like" && isCurrentlyLiked) {
      const milestoneStatus = await rewardService.getMilestoneStatus({
        reelId: reel._id,
        currentCount: reel.likes.length,
        type: "LIKE",
      });

      return res.status(200).json({
        success: true,
        message: "Reel already liked",
        liked: true,
        alreadyLiked: true,
        likes: reel.likes.length,
        reward: {
          earned: false,
          alreadyAwarded: milestoneStatus.alreadyAwarded,
          coins: 0,
          milestone: milestoneStatus.milestone,
        },
      });
    }

    // ==========================================
    // CASE B: UNLIKE FLOW
    // ==========================================
    if (targetAction === "unlike") {
      // Update Like Tracking status
      await LikeTracking.findOneAndUpdate(
        { user: user._id, reel: reel._id },
        {
          $set: {
            userId: user.userid,
            status: "UNLIKED",
            lastUnlikedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      // Decrement like from Reel
      const updatedReel = await Reel.findByIdAndUpdate(
        reel._id,
        { $pull: { likes: user._id } },
        { new: true }
      );

      const activeLikes = updatedReel.likes ? updatedReel.likes.length : 0;
      const milestoneStatus = await rewardService.getMilestoneStatus({
        reelId: reel._id,
        currentCount: activeLikes,
        type: "LIKE",
      });

      return res.status(200).json({
        success: true,
        message: "Reel unliked successfully",
        liked: false,
        alreadyLiked: false,
        likes: activeLikes,
        reward: {
          earned: false,
          alreadyAwarded: milestoneStatus.alreadyAwarded,
          coins: 0,
          milestone: milestoneStatus.milestone,
        },
      });
    }

    // ==========================================
    // CASE C: NEW LIKE / RELIKE FLOW
    // ==========================================
    // 1. Update or create LikeTracking record
    await LikeTracking.findOneAndUpdate(
      { user: user._id, reel: reel._id },
      {
        $set: {
          userId: user.userid,
          status: "LIKED",
          lastLikedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // 2. Add user to Reel likes set
    const updatedReel = await Reel.findByIdAndUpdate(
      reel._id,
      { $addToSet: { likes: user._id } },
      { new: true }
    );

    const activeLikes = updatedReel.likes ? updatedReel.likes.length : 0;

    // 3. Process Milestone Reward for the reel creator
    const rewardResult = await rewardService.processMilestoneReward({
      reelId: reel._id,
      creatorId: reel.user,
      currentCount: activeLikes,
      type: "LIKE",
    });

    return res.status(200).json({
      success: true,
      message: "Reel liked successfully",
      liked: true,
      alreadyLiked: false,
      likes: activeLikes,
      reward: {
        earned: rewardResult.earned,
        alreadyAwarded: rewardResult.alreadyAwarded,
        coins: rewardResult.coins,
        milestone: rewardResult.milestone,
      },
    });
  } catch (error) {
    console.error("❌ Error in like toggle route:", error);
    return res.status(500).json({ success: false, message: "Internal server error processing like" });
  }
}

// Route definitions
router.post("/toggle", resolveUser, handleLikeToggle);
router.post("/:reelId", resolveUser, handleLikeToggle);
router.post("/", resolveUser, handleLikeToggle);

/**
 * GET /api/likes/status/:reelId
 * Check like status and active count
 */
router.get("/status/:reelId", resolveUser, async (req, res) => {
  try {
    const reelId = req.params.reelId;
    const user = req.resolvedUser;

    if (!reelId || !mongoose.isValidObjectId(reelId)) {
      return res.status(400).json({ success: false, message: "Valid reelId is required" });
    }

    const reel = await Reel.findById(reelId).select("likes isDeleted").lean();
    if (!reel || reel.isDeleted) {
      return res.status(404).json({ success: false, message: "Reel not found" });
    }

    const tracking = await LikeTracking.findOne({
      user: user._id,
      reel: reel._id,
    }).lean();

    const isLiked = tracking ? tracking.status === "LIKED" : false;
    const likesCount = reel.likes ? reel.likes.length : 0;

    return res.status(200).json({
      success: true,
      liked: isLiked,
      likes: likesCount,
    });
  } catch (error) {
    console.error("❌ Error in like status route:", error);
    return res.status(500).json({ success: false, message: "Internal server error fetching like status" });
  }
});

module.exports = router;
