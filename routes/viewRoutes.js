const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Reel = require("../models/Reel");
const User = require("../models/Users");
const ViewTracking = require("../models/ViewTracking");
const rewardService = require("../services/rewardService");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Optional user resolution middleware for view route (supports logged-in and guest viewers)
 */
async function optionalResolveUser(req, res, next) {
  try {
    let extractedUserId = null;
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token && JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        extractedUserId = decoded.id || decoded._id || decoded.userId || decoded.userid;
      } catch (jwtErr) {}
    }

    if (!extractedUserId) {
      extractedUserId =
        req.body.userId ||
        req.body.currentUserId ||
        req.query.userId ||
        req.query.currentUserId ||
        req.headers["x-user-id"];
    }

    if (extractedUserId) {
      let user = null;
      if (mongoose.isValidObjectId(extractedUserId)) {
        user = await User.findById(extractedUserId);
      }
      if (!user) {
        user = await User.findOne({ userid: extractedUserId, isDeleted: { $ne: true } });
      }
      req.resolvedUser = user;
    }
    next();
  } catch (err) {
    next();
  }
}

/**
 * Helper to extract reelId
 */
function getReelId(req) {
  return req.params.reelId || req.params.id || req.body.reelId || req.body.id;
}

/**
 * POST /api/views or /api/views/:reelId
 * Separate View verification API (>= 70% threshold, session deduplication, dynamic milestone rewards)
 */
router.post("/", optionalResolveUser, handleRecordView);
router.post("/:reelId", optionalResolveUser, handleRecordView);

async function handleRecordView(req, res) {
  try {
    const reelId = getReelId(req);
    const user = req.resolvedUser || null;
    const {
      watchPercentage,
      percentage,
      watch_percentage,
      watchedDuration,
      watchTime,
      watch_time,
      watchedTime,
      watchDuration,
      timeWatched,
      videoDuration,
      video_duration,
      duration,
      totalDuration,
      sessionId,
      session_id,
      viewSessionId,
    } = req.body;

    if (!reelId || !mongoose.isValidObjectId(reelId)) {
      return res.status(400).json({ success: false, message: "Valid reelId is required" });
    }

    // 1. Fetch Reel
    const reel = await Reel.findOne({ _id: reelId, isDeleted: { $ne: true } });
    if (!reel) {
      return res.status(404).json({ success: false, message: "Reel not found" });
    }

    // 2. Extract watch duration and video duration from all possible parameter aliases
    const rawWatchTime = watchTime ?? watch_time ?? watchedDuration ?? watchedTime ?? watchDuration ?? timeWatched ?? 0;
    const rawVideoDuration = videoDuration ?? video_duration ?? duration ?? totalDuration ?? reel.duration ?? 0;
    const rawPercentage = watchPercentage ?? percentage ?? watch_percentage;

    const effWatchedDuration = Number(rawWatchTime) || 0;
    const effVideoDuration = Number(rawVideoDuration) || 0;

    // 3. Calculate Watch Percentage
    let calculatedPercentage = 0;
    if (rawPercentage !== undefined && rawPercentage !== null && !isNaN(Number(rawPercentage))) {
      calculatedPercentage = Number(rawPercentage);
    } else if (effVideoDuration > 0 && effWatchedDuration > 0) {
      calculatedPercentage = (effWatchedDuration / effVideoDuration) * 100;
    } else if (effWatchedDuration >= 70 && effVideoDuration === 0) {
      calculatedPercentage = effWatchedDuration; // If client passed 70 directly
    }

    // 🔥 RULE: Must watch at least 70% of video
    if (calculatedPercentage < 70) {
      return res.status(200).json({
        success: true,
        message: "70% watch threshold not reached",
        viewCounted: false,
        views: reel.views || 0,
        reward: {
          earned: false,
          alreadyAwarded: false,
          coins: 0,
        },
      });
    }

    // 4. Deduplication Check via Session Identifier
    const activeSessionId =
      sessionId ||
      session_id ||
      viewSessionId ||
      (user ? `user_${user._id}_${Date.now()}` : `ip_${req.ip || "unknown"}_${Date.now()}`);

    // If explicit sessionId provided, check if already recorded
    if (sessionId || session_id || viewSessionId) {
      const existingView = await ViewTracking.findOne({
        reel: reel._id,
        sessionId: activeSessionId,
      });

      if (existingView) {
        return res.status(200).json({
          success: true,
          message: "View already counted for this session",
          viewCounted: false,
          views: reel.views || 0,
          reward: {
            earned: false,
            alreadyAwarded: true,
            coins: 0,
          },
        });
      }
    }

    // 5. Record View in ViewTracking Collection
    try {
      await ViewTracking.create({
        user: user ? user._id : null,
        userId: user ? user.userid : "",
        reel: reel._id,
        sessionId: activeSessionId,
        watchPercentage: Math.min(100, Math.round(calculatedPercentage)),
        watchedDuration: effWatchedDuration,
        watchTime: effWatchedDuration,
        videoDuration: effVideoDuration,
        ipAddress: req.ip || "",
        userAgent: req.headers["user-agent"] || "",
        viewedAt: new Date(),
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        // Session duplicate
        return res.status(200).json({
          success: true,
          message: "View already counted for this session",
          viewCounted: false,
          views: reel.views || 0,
          reward: {
            earned: false,
            alreadyAwarded: true,
            coins: 0,
          },
        });
      }
      throw createErr;
    }

    // 5. Increment View Count on Reel
    const updateQuery = { $inc: { views: 1 } };
    if (user) {
      updateQuery.$addToSet = { viewsdata: user._id };
    }

    const updatedReel = await Reel.findByIdAndUpdate(reel._id, updateQuery, { new: true });
    const totalViews = updatedReel.views || 0;

    // 6. Process Dynamic Milestone Reward for Creator
    const rewardResult = await rewardService.processMilestoneReward({
      reelId: reel._id,
      creatorId: reel.user,
      currentCount: totalViews,
      type: "VIEW",
    });

    return res.status(200).json({
      success: true,
      message: "View counted successfully",
      viewCounted: true,
      views: totalViews,
      reward: {
        earned: rewardResult.earned,
        alreadyAwarded: rewardResult.alreadyAwarded,
        coins: rewardResult.coins,
        milestone: rewardResult.milestone,
      },
    });
  } catch (error) {
    console.error("❌ Error in view tracking route:", error);
    return res.status(500).json({ success: false, message: "Internal server error processing view" });
  }
}

module.exports = router;
