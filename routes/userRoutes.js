const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/Users");
const Music = require("../models/Music");
const Reel4test = require("../models/Reel");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const logUserAction = require("../utils/logUserAction");
const Reel = require("../models/Reel");
const UserLog = require("../models/UserLog");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const createNotification = require("../utils/createNotification");
const Comment = require("../models/Comment");
const adminAuth = require("../middleware/adminAuth");
const checkPermission = require("../middleware/checkPermission");
const logError = require("../utils/logError");
const axios = require("axios");
const mongoose = require("mongoose");
const ReelInteraction = require("../models/ReelInteraction");

router.post("/", async (req, res) => {
  try {
    let {
      userid,
      mobile,
      name,
      username,
      email,
      profilePicture,
      bio,
      seller_id,
      userseller_id,
      isConnected,
    } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number is required" });
    }
    mobile = mobile.replace(/\D/g, "");

    // ✨ SABSE PEHLE USER FIND KARO (Username check karne se bhi pehle)
    let existingUser = await User.findOne({ mobile });

    // ==========================================
    // 1. DELETED USER CHECK (Recovery Logic)
    // ==========================================
    if (existingUser && existingUser.isDeleted) {
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const timePassed =
        Date.now() - new Date(existingUser.deletedAt).getTime();

      if (timePassed <= thirtyDays) {
        // Yahan Frontend ko pata chal jayega ki account recover karna hai
        return res.status(403).json({
          message: "Your account is deactivated. Do you want to reactivate it?",
          needsReactivation: true,
          mobile: existingUser.mobile,
        });
      } else {
        // 30 Din ke baad aaya hai - Archive kar do taaki naya ban sake
        const timestamp = Date.now();
        existingUser.mobile = `${existingUser.mobile}_hidden_${timestamp}`;
        existingUser.username = `${existingUser.username}_hidden_${timestamp}`;
        if (existingUser.email) {
          existingUser.email = `${existingUser.email}_hidden_${timestamp}`;
        }
        existingUser.isPermanentlyHidden = true;
        await existingUser.save();
        existingUser = null;
      }
    }

    // ==========================================
    // 2. EXISTING ACTIVE USER LOGIN
    // ==========================================
    if (existingUser) {
      // Agar user login ke time koi naya profile update bhej raha hai
      if (username && existingUser.username !== username.toLowerCase().trim()) {
        const formattedUsername = username.toLowerCase().trim();

        // ✨ UPDATED: Regex check to block symbols & spaces but ALLOW underscores
        const usernameRegex = /^[a-z0-9_]+$/;
        if (!usernameRegex.test(formattedUsername)) {
          return res
            .status(400)
            .json({
              message:
                "Username can only contain letters, numbers, and underscores. Spaces or other symbols are not allowed.",
            });
        }

        const usernameTaken = await User.findOne({
          username: formattedUsername,
        });
        if (usernameTaken)
          return res
            .status(400)
            .json({ message: "This username is already taken" });
        existingUser.username = formattedUsername;
      }

      if (name) existingUser.name = name;
      if (email) existingUser.email = email;
      if (profilePicture) existingUser.profilePicture = profilePicture;
      if (bio) existingUser.bio = bio;

      // 🔥 FIX: Yahan seller_id aur userseller_id update karna zaroori hai! 🔥
      if (seller_id) existingUser.seller_id = seller_id;
      if (userseller_id) existingUser.userseller_id = userseller_id;

      if (typeof isConnected !== "undefined") {
        existingUser.isConnected = isConnected;
        existingUser.lastConnectedAt = new Date();
      }

      await existingUser.save();

      return res.status(200).json({
        message: "User logged in successfully",
        _id: existingUser._id,
        userid: existingUser.userid,
        username: existingUser.username,
        name: existingUser.name,
        isConnected: existingUser.isConnected,
        mobile: existingUser.mobile,
        profilePicture: existingUser.profilePicture,
        bio: existingUser.bio,
        followers: existingUser.followers,
        following: existingUser.following,
        seller_id: existingUser.seller_id, // Response me wapas bhej do
        userseller_id: existingUser.userseller_id, // Response me wapas bhej do
      });
    }

    // ==========================================
    // 3. FRESH NAYA ACCOUNT (New Registration)
    // ==========================================
    // Agar existingUser nahi hai, TABHI hum username demand karenge!
    if (!username) {
      return res
        .status(400)
        .json({ message: "Username is required to create a new account" });
    }

    username = username.toLowerCase().trim();
    if (username.length < 3 || username.length > 20) {
      return res
        .status(400)
        .json({ message: "Username must be 3-20 characters" });
    }

    // ✨ UPDATED: Regex check to block symbols & spaces but ALLOW underscores for new accounts
    const usernameRegex = /^[a-z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res
        .status(400)
        .json({
          message:
            "Username can only contain letters, numbers, and underscores. Spaces or other symbols are not allowed.",
        });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const newUser = new User({
      userid: uuidv4(),
      mobile,
      username,
      name: name || "",
      email: email || "",
      profilePicture: profilePicture || "",
      bio: bio || "",
      isConnected: isConnected || false,
    });

    if (seller_id) newUser.seller_id = seller_id;
    if (userseller_id) newUser.userseller_id = userseller_id;

    const savedUser = await newUser.save();

    return res.status(201).json({
      message: "User registered successfully",
      _id: savedUser._id,
      userid: savedUser.userid,
      username: savedUser.username,
      mobile: savedUser.mobile,
      seller_id: savedUser.seller_id,
      userseller_id: savedUser.userseller_id,
    });
  } catch (error) {
    console.error("Error processing user:", error);
    if (error.code === 11000) {
      const key = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `${key} already exists` });
    }
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const status = req.query.status || "";
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";

    // 🔍 Build Query Object
    const query = {};

    // ✅ Search Filter
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { userid: { $regex: search, $options: "i" } },
      ];
    }

    // ✅ Status Filter
    if (status === "active") {
      query.isSuspended = false;
    }

    if (status === "suspended") {
      query.isSuspended = true;
    }

    // ✅ Date Range Filter
    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include full end day
        query.createdAt.$lte = end;
      }
    }

    // ✅ Total AFTER filters
    const total = await User.countDocuments(query);

    // ✅ Paginated + filtered users
    const users = await User.find(query, "-passwordHash")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get(
  "/admin_users",
  adminAuth,
  checkPermission("VIEW_USERS"),
  async (req, res) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 15;
      const skip = (page - 1) * limit;

      const search = req.query.search || "";
      const status = req.query.status || "";
      const startDate = req.query.startDate || "";
      const endDate = req.query.endDate || "";

      // 🔍 Build Query Object
      const query = {};

      // ✅ 1. Soft Delete Filter (NAYA CODE)
      // Agar status explicitly "deleted" nahi hai, toh deleted users ko hide rakho
      if (status === "deleted") {
        query.isDeleted = true;
      } else {
        query.isDeleted = { $ne: true };
      }

      // ✅ 2. Search Filter
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { userid: { $regex: search, $options: "i" } },
        ];
      }

      // ✅ 3. Status Filter (Active / Suspended)
      if (status === "active") {
        query.isSuspended = false;
      } else if (status === "suspended") {
        query.isSuspended = true;
      }

      // ✅ 4. Date Range Filter
      if (startDate || endDate) {
        query.createdAt = {};

        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }

        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999); // include full end day
          query.createdAt.$lte = end;
        }
      }

      // ✅ Total AFTER filters
      const total = await User.countDocuments(query);

      // ✅ Paginated + filtered users
      const users = await User.find(query, "-passwordHash")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      res.status(200).json({
        data: users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      error.statusCode = error.statusCode || 500;
      await logError(req, error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// search users and videos
router.get("/search_populer", async (req, res) => {
  try {
    const query = req.query?.query?.trim() || "";
    const userPage = parseInt(req.query.userPage) || 1;
    const videoPage = parseInt(req.query.videoPage) || 1;
    const userLimit = parseInt(req.query.userLimit) || 10;
    const videoLimit = parseInt(req.query.videoLimit) || 20;

    const userSkip = (userPage - 1) * userLimit;
    const videoSkip = (videoPage - 1) * videoLimit;

    // 🔥 Viewer ID
    const viewerId = req.query.viewerId;

    let blockedList = [];
    let notInterestedReelsList = [];

    if (viewerId) {
      try {
        // ✅ Fetch Viewer
        const viewer = await User.findById(viewerId).select("blockedUsers");

        if (viewer) {
          // ✅ Users blocked by viewer
          const blockedByViewer = viewer.blockedUsers || [];

          // ✅ Users who blocked viewer
          const blockedViewerDocs = await User.find({
            blockedUsers: viewer._id,
          }).select("_id");

          const blockedViewerIds = blockedViewerDocs.map((u) => u._id);

          // ✅ Merge both lists
          blockedList = [...blockedByViewer, ...blockedViewerIds];
        }

        // 🔥 Not Interested Reels
        const notInterestedDocs = await ReelInteraction.find({
          user: viewerId,
          action: "not_interested",
        })
          .select("reel")
          .lean();

        if (notInterestedDocs.length > 0) {
          notInterestedReelsList = notInterestedDocs.map((doc) => doc.reel);
        }
      } catch (err) {
        console.error(
          "Invalid Viewer ID or error fetching viewer details:",
          err.message,
        );
      }
    }

    // ✅ CASE 1: Explore Page
    if (!query) {
      const videos = await Reel.find({
        status: "Published",

        // ✅ Hide blocked users reels both side
        user: { $nin: blockedList },

        // ✅ Hide not interested reels
        _id: { $nin: notInterestedReelsList },
      })
        .select(
          "userid username name videoUrl thumbnailUrl caption likes views createdAt music",
        )
        .populate("music", "title artist thumbnail")
        .sort({ views: -1, createdAt: -1 })
        .skip(videoSkip)
        .limit(videoLimit);

      const hasMoreVideos = videos.length === videoLimit;

      return res.status(200).json({
        users: [],
        videos,
        hasMoreUsers: false,
        hasMoreVideos,
        currentPage: videoPage,
        totalPerPage: videoLimit,
      });
    }

    // ✅ CASE 2: Search
    const hasUserPagination = !!req.query.userPage;
    const hasVideoPagination = !!req.query.videoPage;

    let users = [];
    let videos = [];

    let hasMoreUsers = false;
    let hasMoreVideos = false;

    // 🔍 USER SEARCH
    if (hasUserPagination) {
      users = await User.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },

            // ✅ Hide blocked users both side
            _id: { $nin: blockedList },
            $or: [
              {
                username: {
                  $regex: query,
                  $options: "i",
                },
              },

              // { name: { $regex: query, $options: "i" } },
            ],
          },
        },

        {
          $addFields: {
            followersCount: {
              $size: {
                $ifNull: ["$followers", []],
              },
            },
          },
        },

        {
          $sort: {
            followersCount: -1,
            createdAt: -1,
            _id: 1,
          },
        },

        { $skip: userSkip },

        { $limit: userLimit },

        {
          $project: {
            userid: 1,
            username: 1,
            name: 1,
            profilePicture: 1,
            bio: 1,
            followersCount: 1,
          },
        },
      ]);

      hasMoreUsers = users.length === userLimit;
    }

    // 🎬 VIDEO SEARCH
    if (hasVideoPagination) {
      const videoQuery = [
        {
          username: {
            $regex: query,
            $options: "i",
          },
        },

        {
          name: {
            $regex: query,
            $options: "i",
          },
        },

        {
          caption: {
            $regex: query,
            $options: "i",
          },
        },
      ];

      // 🎵 Match Music
      const matchedMusic = await Music.find({
        title: {
          $regex: query,
          $options: "i",
        },
      }).select("_id");

      if (matchedMusic.length > 0) {
        videoQuery.push({
          music: {
            $in: matchedMusic.map((m) => m._id),
          },
        });
      }
      videos = await Reel.find({
        $or: videoQuery,
        status: "Published",
        user: { $nin: blockedList },
        _id: { $nin: notInterestedReelsList },
      })
        .select(
          "userid username name videoUrl thumbnailUrl caption likes views createdAt music",
        )
        .populate("music", "title artist thumbnail")
        .sort({ views: -1, createdAt: -1 })
        .skip(videoSkip)
        .limit(videoLimit);
      hasMoreVideos = videos.length === videoLimit;
    }
    return res.status(200).json({
      users,
      videos,
      hasMoreUsers,
      hasMoreVideos,
      currentUserPage: userPage,
      currentVideoPage: videoPage,
      userLimit,
      videoLimit,
    });
  } catch (err) {
    console.error("❌ Search API Error:", err);

    err.statusCode = err.statusCode || 500;

    await logError(req, err);

    res.status(500).json({
      message: "Server error",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.query.viewerId;

    // 1. Fetch user (Populate waisa hi rakha hai, koi logic cut nahi kiya)
    const user = await User.findOne({
      userid: id,
      isDeleted: { $ne: true },
    })
      .populate({
        path: "followers",
        select: "userid username name profilePicture",
        match: { isDeleted: { $ne: true } },
      })
      .populate({
        path: "following",
        select: "userid username name profilePicture",
        match: { isDeleted: { $ne: true } },
      })
      .select("-passwordHash");

    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. 🛡️ Block Check Logic (Solid Version)
    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers");

      const hasViewerBlockedTarget = viewer?.blockedUsers?.some(
        (bid) => bid.toString() === user._id.toString(),
      );
      const hasTargetBlockedViewer = user.blockedUsers?.some(
        (bid) => bid.toString() === viewerId.toString(),
      );

      if (hasViewerBlockedTarget || hasTargetBlockedViewer) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    // 3. Post count & Response
    const postCount = await Reel.countDocuments({ user: user._id });

    res.json({
      _id: user._id,
      userid: user.userid,
      username: user.username,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      profilePicture: user.profilePicture,
      bio: user.bio,
      isConnected: user.isConnected,
      seller_id: user.seller_id,
      userseller_id: user.userseller_id,

      // ⭐ FIX: Second API ki tarah yahan isko wapas IDs ka array bana diya 
      // taaki tumhara UI ka "Follow/Following" button theek se kaam kare
      followers: user.followers.map(f => f._id),
      following: user.following.map(f => f._id),

      // ⭐ NAYA: Populated data ko yahan safe rakh liya hai, in case aage avatar dikhane ho
      followersDetails: user.followers,
      followingDetails: user.following,

      followersCount: user.followers.length,
      followingCount: user.following.length,

      isSuspended: user.isSuspended,
      createdAt: user.createdAt,
      postCount,
    });
  } catch (err) {
    console.error("Error fetching user data:", err);
    if (typeof logError === "function") {
      await logError(req, err);
    }
    res.status(500).json({ message: "Server error" });
  }
});
// get user posts with pagination
router.get("/userpost/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const viewerId = req.query.viewerId;

    let limit = parseInt(req.query.limit) || 12;
    let skip = parseInt(req.query.skip) || 0;

    if (limit < 1 || limit > 50) limit = 10;
    if (skip < 0) skip = 0;

    // 👤 Fetch user
    const user = await User.findOne({
      _id: userId,
      isDeleted: { $ne: true },
    }).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔒 BLOCK CHECK
    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers");

      const hasViewerBlockedTarget = viewer?.blockedUsers?.some(
        (bid) => bid.toString() === userId,
      );

      const hasTargetBlockedViewer = user.blockedUsers?.some(
        (bid) => bid.toString() === viewerId,
      );

      if (hasViewerBlockedTarget || hasTargetBlockedViewer) {
        return res.status(404).json({
          message: "User not found",
          reels: [],
          postCount: 0,
        });
      }
    }

    // 🔥 BASE QUERY
    let query = { user: userId };

    // 🔥 INTEREST FILTER LOGIC
    if (viewerId && mongoose.isValidObjectId(viewerId)) {
      const interactions = await ReelInteraction.find({
        user: viewerId,
      }).lean();

      const notInterestedIds = interactions
        .filter((i) => i.action === "not_interested")
        .map((i) => new mongoose.Types.ObjectId(i.reel));

      const interestedIds = interactions
        .filter((i) => i.action === "interested")
        .map((i) => new mongoose.Types.ObjectId(i.reel));

      // ❌ Remove not interested reels
      if (notInterestedIds.length > 0) {
        query._id = {
          ...(query._id || {}),
          $nin: notInterestedIds,
        };
      }

      // ⭐ OPTIONAL: Only show interested reels (agar chaho toggle laga sakte ho)
      // Example: ?onlyInterested=true
      if (req.query.onlyInterested === "true" && interestedIds.length > 0) {
        query._id = {
          ...(query._id || {}),
          $in: interestedIds,
        };
      }
    }

    // 📊 Count
    const totalCount = await Reel.countDocuments(query);

    // 🎬 Fetch reels
    const reels = await Reel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const hasMore = skip + reels.length < totalCount;

    res.json({
      user: user.toObject(),
      postCount: totalCount,
      reels,
      hasMore,
    });
  } catch (err) {
    console.error("Error fetching user reels:", err);
    err.statusCode = err.statusCode || 500;
    await logError(req, err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/admin_userpost/:id", adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;

    let limit = parseInt(req.query.limit) || 12;
    let skip = parseInt(req.query.skip) || 0;

    if (limit < 1 || limit > 50) limit = 10;
    if (skip < 0) skip = 0;

    const user = await User.findById(userId).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔥 Filter: Sirf active reels ko count karo
    const query = { user: userId, isDeleted: { $ne: true } };

    const totalCount = await Reel.countDocuments(query);

    const reels = await Reel.find(query) // 🔥 Filter applied here
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const hasMore = skip + reels.length < totalCount;

    res.json({
      user: user.toObject(),
      postCount: totalCount,
      reels,
      hasMore,
    });
  } catch (err) {
    console.error("Error fetching user reels:", err);
    err.statusCode = err.statusCode || 500;
    await logError(req, err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET all followers of a user (ADMIN)
router.get("/:userid/followers", adminAuth, async (req, res) => {
  try {
    const { userid } = req.params;

    const user = await User.findOne({ userid }).populate({
      path: "followers",
      select: "userid username name profilePicture",
      match: { isDeleted: { $ne: true } }, // 🔥 FILTER: Jo user delete nahi hue, sirf unko lao
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Kyunki populate filter laga ke data la rha hai,
    // to followers array me ab sirf ACTIVE users hi bachenge
    // jisse length (total count) apne aap theek ho jayegi.
    return res.json({
      success: true,
      total: user.followers.length,
      followers: user.followers,
    });
  } catch (error) {
    console.error("Error fetching followers:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    return res.status(500).json({ message: "Error fetching followers" });
  }
});

// GET all following of a specific user (ADMIN VIEW)
router.get("/admin/users/:userid/following", adminAuth, async (req, res) => {
  try {
    const { userid } = req.params;

    const user = await User.findOne({ userid }).populate({
      path: "following",
      select: "userid username name profilePicture",
      match: { isDeleted: { $ne: true } }, // 🔥 FILTER: Sirf active users dikhao
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      total: user.following.length,
      following: user.following,
    });
  } catch (error) {
    console.error("Error fetching following:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    return res.status(500).json({ message: "Server error" });
  }
});

// get user liked posts
router.get("/userlikedposts/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const viewerId = req.query.viewerId;

    let limit = parseInt(req.query.limit) || 10;
    let skip = parseInt(req.query.skip) || 0;

    if (limit < 1 || limit > 50) limit = 10;
    if (skip < 0) skip = 0;

    // 🔥 BLOCK CHECK
    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers");
      const targetUser = await User.findById(userId).select("blockedUsers");

      const viewerBlocked = viewer?.blockedUsers?.some(
        (id) => id.toString() === userId,
      );

      const targetBlocked = targetUser?.blockedUsers?.some(
        (id) => id.toString() === viewerId,
      );

      if (viewerBlocked || targetBlocked) {
        // ❗ 403 hata diya, 200 return karo
        return res.status(200).json({
          totalLikes: 0,
          count: 0,
          reels: [],
          hasMore: false,
          blocked: true, // 👈 extra flag (frontend ke liye useful)
          message: "User is blocked",
        });
      }
    }

    // 🔢 TOTAL count
    const totalLikes = await Reel.countDocuments({ likes: userId });

    // 📦 DATA
    const likedReels = await Reel.find({ likes: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "username name profilePicture");

    const hasMore = skip + likedReels.length < totalLikes;

    res.status(200).json({
      totalLikes,
      count: likedReels.length,
      reels: likedReels,
      hasMore,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/userfollowing/:id", async (req, res) => {
  try {
    const user = await User.findOne({
      userid: req.params.id,
      isDeleted: { $ne: true }, // Main user active hona chahiye
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const viewerId = req.query.viewerId;

    let viewer = null;
    let blockedList = [];

    if (viewerId) {
      viewer = await User.findById(viewerId).select("blockedUsers");

      if (viewer) {
        // ✅ 1. Users jo Viewer ne block kiye hain
        const blockedByViewer = viewer.blockedUsers.map((id) => id.toString());

        // ✅ 2. Users jinhone Viewer ko block kiya hai (Bi-directional Check)
        const blockedViewerDocs = await User.find({
          blockedUsers: viewer._id,
        }).select("_id");
        const blockedViewerIds = blockedViewerDocs.map((u) => u._id.toString());

        // Merge dono lists
        blockedList = [...blockedByViewer, ...blockedViewerIds];
      }
    }

    // 🔒 FULL BLOCK (Instagram style) - Agar current user aur target ke beech block hai
    const isBlocked =
      (viewer &&
        viewer.blockedUsers.some(
          (id) => id.toString() === user._id.toString(),
        )) ||
      user.blockedUsers.some((id) => id.toString() === viewerId?.toString());

    if (isBlocked) {
      return res.json({
        ...user.toObject(),
        followers: [],
        following: [],
        message: "You cannot view this user's connections",
      });
    }

    // 🔁 FETCH CLEAN USER WITH POPULATE + FILTERS
    const cleanUser = await User.findById(user._id)
      .populate({
        path: "followers",
        select: "userid username name profilePicture",
        match: { isDeleted: { $ne: true } }, 
      })
      .populate({
        path: "following",
        select: "userid username name profilePicture",
        match: { isDeleted: { $ne: true } }, 
      });

    // ✅ FIX: Mongoose document ko pehle Plain JS Object banao!
    const response = cleanUser.toObject();

    // ✅ FIX: Ab Plain Object par filtering apply karo
    if (blockedList.length > 0) {
      response.followers = response.followers.filter(
        (f) => !blockedList.includes(f._id.toString()),
      );

      response.following = response.following.filter(
        (f) => !blockedList.includes(f._id.toString()),
      );
    }

    // Update Counts
    response.followersCount = response.followers.length;
    response.followingCount = response.following.length;

    return res.json(response);
  } catch (err) {
    console.error("Cleanup error:", err);
    err.statusCode = err.statusCode || 500;
    
    if (typeof logError === "function") {
        await logError(req, err);
    }
    
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/bymobile/:mobile", async (req, res) => {
  try {
    const viewerId = req.query.viewerId; // 🔥 Viewer ID frontend se

    const user = await User.findOne({
      mobile: req.params.mobile,
      isDeleted: { $ne: true },
    }).select("-passwordHash");

    if (!user) return res.status(404).json({ message: "User not found" });

    // 🛡️ BLOCK CHECK START
    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers");

      // Dono side se check karo
      const hasViewerBlockedTarget = viewer?.blockedUsers?.some(
        (bid) => bid.toString() === user._id.toString(),
      );
      const hasTargetBlockedViewer = user.blockedUsers?.some(
        (bid) => bid.toString() === viewerId.toString(),
      );

      if (hasViewerBlockedTarget || hasTargetBlockedViewer) {
        return res.status(404).json({ message: "User not found" });
      }
    }
    // 🛡️ BLOCK CHECK END

    res.json(user);
  } catch (err) {
    console.error("Error finding user by mobile:", err);
    await logError(req, err);
    res.status(500).json({ message: "Server error" });
  }
});

// find user by email
router.get("/byemailapp/:email", async (req, res) => {
  try {
    const user = await User.findOne({
      email: req.params.email,
      isDeleted: { $ne: true },
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    await logError(req, err);
    err.statusCode = err.statusCode || 500;
    res.status(500).json({ message: "Server error" });
  }
});

// delete user
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isDeleted) {
      return res.status(400).json({
        message: "Account is already scheduled for deletion.",
      });
    }

    const deletedUserName =
      user.userName || user.username || user.name || "Unknown User";

    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    await Promise.all([
      // ✅ 1. LIKES DELETE
      Reel.updateMany({ likes: userId }, { $pull: { likes: userId } }),

      // ✅ 2. VIEWS DELETE
      Reel.updateMany(
        { viewsdata: userId },
        {
          $pull: { viewsdata: userId },
          $inc: { views: -1 },
        },
      ),

      // ✅ 3. COMMENTS SOFT DELETE
      Comment.updateMany(
        { user: userId },
        { isDeleted: true, deletedAt: new Date() },
      ),

      // 🔥 4. NAYA FIX: REELS SOFT DELETE (Taaki API crash na ho)
      Reel.updateMany(
        { user: userId },
        { isDeleted: true }
      ),
    ]);

    try {
      await logUserAction({
        user: req.user ? req.user._id : userId,
        userName: req.user ? req.user.username : deletedUserName,
        userRole: req.userRole || "User",
        action: "soft_delete_user",
        targetType: "User",
        targetId: userId,
        targetName: deletedUserName,
        device: req.headers["user-agent"],
        location: {
          ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
          country: req.headers["cf-ipcountry"] || "",
        },
      });
    } catch (e) {
      console.error("Soft delete user log error:", e.message);
    }

    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    res.json({
      message: `Account deactivated successfully.`,
      details: `Your account will be deactivated. If you log in before ${thirtyDaysLater.toDateString()}, your data will be restored. After this date, logging in will create a fresh account (your old data remains securely archived).`,
      scheduledDeletionDate: thirtyDaysLater,
    });
  } catch (err) {
    console.error("Error softly deleting user:", err);
    err.statusCode = err.statusCode || 500;
    // await logError(req, err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete(
  "/admin_users/:id",
  adminAuth,
  checkPermission("DELETE_USER"),
  async (req, res) => {
    try {
      const userId = req.params.id;

      // 1. User find karo (delete hone se pehle)
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Agar account pehle se deleted hai toh error do
      if (user.isDeleted) {
        return res.status(400).json({
          message: "Account is already scheduled for deletion.",
        });
      }

      // 2. User ka naam save karo (response aur logs ke liye)
      const deletedUserName =
        user.userName || user.username || user.name || "Unknown User";

      // 3. User ko Soft Delete karo
      user.isDeleted = true;
      user.deletedAt = new Date();
      await user.save();

      // 4. Update Other Data (Ab Shares, Followers, Following Hard Delete Nahi Honge)
      await Promise.all([
        // ✅ 1. Comments ko Soft Delete karo (Thappa lagao)
        Comment.updateMany(
          { user: userId },
          { isDeleted: true, deletedAt: new Date() },
        ),

        // ✅ 2. LIKES DELETE (Jaisa aapne pehle bola tha ki ye hatne chahiye)
        Reel.updateMany({ likes: userId }, { $pull: { likes: userId } }),

        // ✅ 3. VIEWS DELETE (Jaisa aapne pehle bola tha)
        Reel.updateMany(
          { viewsdata: userId },
          {
            $pull: { viewsdata: userId },
            $inc: { views: -1 },
          },
        ),

        // ❌ Yahan se Followers, Following aur Shares ka code HATA diya gaya hai.
        // Iska matlab wo IDs array mein safe rahengi (Soft Delete jaisa behave karengi).
        // Account restore hone par sab wapas mil jayega!
      ]);

      // 5. Activity log mein save karo
      try {
        await logUserAction({
          user: req.user._id,
          userName: req.userName,
          userRole: req.userRole,
          action: "soft_delete_user",
          targetType: "User",
          targetId: userId,
          targetName: deletedUserName,
          device: req.headers["user-agent"],
          location: {
            ip:
              req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
            country: req.headers["cf-ipcountry"] || "",
          },
        });
      } catch (e) {
        console.error("Soft delete user log error:", e.message);
      }

      // 6. 30 din baad ki date nikal lo
      const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // 7. Admin ko success message bhej do
      res.json({
        message: `User ${deletedUserName} deactivated successfully by Admin.`,
        details: `The account will be permanently deleted on ${thirtyDaysLater.toDateString()}.`,
        scheduledDeletionDate: thirtyDaysLater,
      });
    } catch (err) {
      console.error("Error softly deleting user by admin:", err);
      err.statusCode = err.statusCode || 500;
      await logError(req, err);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// follow to user
router.put("/:id/follow", async (req, res) => {
  const { userId } = req.body;

  if (userId === req.params.id)
    return res.status(400).json({ message: "You can't follow yourself" });

  try {
    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(userId);
    if (!userToFollow || !currentUser)
      return res.status(404).json({ message: "User not found" });

    if (currentUser.isSuspended) {
      return res.status(200).json({
        message: "Action ignored",
      });
    }

    if (!userToFollow.followers.includes(userId)) {
      userToFollow.followers.push(userId);
      currentUser.following.push(req.params.id);

      await userToFollow.save();
      await currentUser.save();

      // ✅ Create notification with ObjectId + userid
      await createNotification({
        recipientObjectId: userToFollow._id,
        senderObjectId: currentUser._id,
        recipientUserId: userToFollow.userid,
        senderUserId: currentUser.userid,
        type: "follow",
        message: "started following you",
      });

      return res.json({ message: "User followed" });
    } else {
      return res.status(400).json({ message: "Already following" });
    }
  } catch (err) {
    console.error("Follow error:", err);
    err.statusCode = err.statusCode || 500;
    await logError(req, err);
    return res.status(500).json({ message: "Server error" });
  }
});

// unfollow user
router.put("/:id/unfollow", async (req, res) => {
  const { userId } = req.body;
  try {
    const userToUnfollow = await User.findById(req.params.id);
    const currentUser = await User.findById(userId);

    if (!userToUnfollow || !currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (currentUser.isSuspended) {
      return res.status(200).json({
        message: "Action ignored",
      });
    }

    if (userToUnfollow.followers.includes(userId)) {
      userToUnfollow.followers.pull(userId);
      currentUser.following.pull(req.params.id);
      await userToUnfollow.save();
      await currentUser.save();

      // Safely log user action (even if log fails, app continues)
      try {
        await logUserAction({
          user: userId,
          action: "unfollow_user",
          targetType: "User",
          targetId: req.params.id,
          device: req.headers["user-agent"],
          location: {
            ip:
              req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
            country: req.headers["cf-ipcountry"] || "",
            city: "", // Optional: Use IP geolocation later
            pincode: "",
          },
        });
      } catch (logError) {
        console.error("Log error (non-blocking):", logError.message);
      }
      res.json({ message: "User unfollowed" });
    } else {
      res.status(400).json({ message: "You are not following this user" });
    }
  } catch (err) {
    await logError(req, err);
    err.statusCode = err.statusCode || 500;
    res.status(500).json({ message: "Server error" });
  }
});

// remove follower
router.put("/:id/remove-follower", async (req, res) => {
  const { userId } = req.body; // userId = the user to remove from followers
  const targetUserId = req.params.id; // id = the profile owner (you)
  console.log(targetUserId);

  if (userId === targetUserId) {
    return res.status(400).json({ message: "You can't remove yourself" });
  }

  try {
    const targetUser = await User.findById(targetUserId); // profile owner
    const followerUser = await User.findById(userId); // the one who follows

    if (!targetUser || !followerUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.isSuspended) {
      return res.status(200).json({
        message: "Action ignored",
      });
    }

    if (targetUser.followers.includes(userId)) {
      // Remove follower from your followers list
      targetUser.followers.pull(userId);
      // Remove yourself from their following list
      followerUser.following.pull(targetUserId);

      await targetUser.save();
      await followerUser.save();

      // Safely log user action
      try {
        await logUserAction({
          user: targetUserId, // you (the profile owner) initiated this
          action: "remove_follower",
          targetType: "User",
          targetId: userId, // the follower being removed
          device: req.headers["user-agent"],
          location: {
            ip:
              req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
            country: req.headers["cf-ipcountry"] || "",
            city: "",
            pincode: "",
          },
        });
      } catch (logError) {
        console.error("Log error (non-blocking):", logError.message);
      }

      return res.json({ message: "Follower removed successfully" });
    } else {
      return res
        .status(400)
        .json({ message: "This user is not your follower" });
    }
  } catch (err) {
    console.error("Remove follower error:", err);
    err.statusCode = err.statusCode || 500;
    await logError(req, err);
    return res.status(500).json({ message: "Server error" });
  }
});

// update user

router.put("/:id", async (req, res) => {
  const {
    username,
    name,
    email,
    mobile,
    profilePicture,
    bio,
    currentPassword,
    newPassword,
    isSuspended,
    suspendReason, // ✨ ADDED: Ye nikalna zaroori tha warna error aata
  } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const targetUserName = user.username || "Unknown User";

    // Password update logic (Same as before)
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch)
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    // ✨ ADDED: Username ko lower case aur trim karne ka logic
    const formattedUsername = username
      ? username.toLowerCase().trim()
      : undefined;

    // 🔹 Check karo kya Name ya Username change ho raha hai
    const isNameChanged =
      (name && name !== user.name) ||
      (formattedUsername && formattedUsername !== user.username);

    // Fields update
    // ✨ ADDED: Username validation logic (Strict rules and Uniqueness check)
    if (formattedUsername && formattedUsername !== user.username) {
      const usernameRegex = /^[a-z0-9_]+$/;
      if (!usernameRegex.test(formattedUsername)) {
        return res
          .status(400)
          .json({
            message:
              "Username can only contain letters, numbers, and underscores. Spaces or other symbols are not allowed.",
          });
      }

      // Check agar ye naya username kisi aur ka toh nahi
      const usernameTaken = await User.findOne({ username: formattedUsername });
      if (
        usernameTaken &&
        usernameTaken._id.toString() !== user._id.toString()
      ) {
        return res
          .status(400)
          .json({ message: "This username is already taken" });
      }

      user.username = formattedUsername;
    }

    if (name) user.name = name;
    if (profilePicture) user.profilePicture = profilePicture;
    if (bio) user.bio = bio;

    if (typeof isSuspended === "boolean") {
      user.isSuspended = isSuspended;

      if (isSuspended) {
        user.suspendReason = suspendReason || "No reason provided";
        user.suspendedBy = req.user._id;
        user.suspendedAt = new Date();
      } else {
        // reactivate pe clear kar sakta hai (optional)
        user.suspendReason = "";
        user.suspendedBy = null;
        user.suspendedAt = null;
      }
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        return res.status(400).json({ message: "Invalid email format" });
      user.email = email;
    }

    if (mobile) {
      const mobileRegex = /^[0-9]{10}$/;
      if (!mobileRegex.test(mobile))
        return res
          .status(400)
          .json({ message: "Mobile number must be 10 digits" });
      user.mobile = mobile;
    }

    const updatedUser = await user.save();

    // 🔥 MAIN LOGIC: External API Call
    // Agar Name/Username change hua hai AUR user connected hai
    if (
      isNameChanged &&
      updatedUser.isConnected === true &&
      updatedUser.seller_id
    ) {
      try {
        await axios.post(
          "https://supplier.welfog.com/api/playlinks/sellerplay",
          {
            seller_id: updatedUser.seller_id,
            play_profile_user_name: updatedUser.username,
            play_profile_name: updatedUser.name,
          },
        );
        console.log("External API updated successfully");
      } catch (apiErr) {
        // Hum response block nahi karenge agar external API fail ho jaye,
        // bas log karenge.
        console.error("External API Update Failed:", apiErr.message);
      }
    }

    // Suspend Log Logic (Same as before)
    try {
      if (typeof isSuspended === "boolean") {
        await logUserAction({
          user: req.user._id,
          userName: req.userName,
          userRole: req.userRole,
          action: isSuspended ? "account_suspended" : "account_reactivated",
          targetType: "User",
          targetId: user._id,
          targetName: targetUserName,
          device: req.headers["user-agent"],
          location: {
            ip:
              req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
            country: req.headers["cf-ipcountry"] || "",
          },
        });
      }
    } catch (e) {
      console.error("User suspend log error:", e.message);
    }

    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      name: updatedUser.name,
      email: updatedUser.email,
      profilePicture: updatedUser.profilePicture,
      bio: updatedUser.bio,
      isSuspended: updatedUser.isSuspended,
      mobile: updatedUser.mobile,
      isConnected: updatedUser.isConnected,
      seller_id: updatedUser.seller_id,
      createdAt: updatedUser.createdAt,
    });
  } catch (err) {
    console.error("Update error:", err);
    await logError(req, err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/admin_users/:id",
  adminAuth,
  checkPermission("SUSPEND_USER"),
  async (req, res) => {
    const {
      username,
      name,
      email,
      mobile,
      profilePicture,
      bio,
      currentPassword,
      newPassword,
      isSuspended,
      suspendReason,
    } = req.body;

    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      // ✅ PEHLA ADD: User ka username capture kiya log ke liye
      const targetUserName = user.username || user.userName || "Unknown User";

      // Update password if needed
      if (currentPassword && newPassword) {
        const isMatch = await bcrypt.compare(
          currentPassword,
          user.passwordHash,
        );
        if (!isMatch)
          return res
            .status(400)
            .json({ message: "Current password is incorrect" });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.passwordHash = hashedPassword;
      }

      // ✨ ADDED: Username validation logic (Strict rules and Uniqueness check)
      if (username) {
        const formattedUsername = username.toLowerCase().trim();

        const usernameRegex = /^[a-z0-9_]+$/;
        if (!usernameRegex.test(formattedUsername)) {
          return res
            .status(400)
            .json({
              message:
                "Username can only contain letters, numbers, and underscores. Spaces or other symbols are not allowed.",
            });
        }

        // Check agar ye naya username kisi aur ka toh nahi
        const usernameTaken = await User.findOne({
          username: formattedUsername,
        });
        if (
          usernameTaken &&
          usernameTaken._id.toString() !== user._id.toString()
        ) {
          return res
            .status(400)
            .json({ message: "This username is already taken" });
        }

        user.username = formattedUsername;
      }

      // Update other fields
      if (name) user.name = name;
      if (profilePicture) user.profilePicture = profilePicture;
      if (bio) user.bio = bio;

      if (typeof isSuspended === "boolean") {
        user.isSuspended = isSuspended;

        if (isSuspended) {
          user.suspendReason = suspendReason || "No reason provided";
          user.suspendedBy = req.userName;
          user.suspendedAt = new Date();
        } else {
          // reactivate pe clear kar sakta hai (optional)
          user.suspendReason = "";
          user.suspendedBy = null;
          user.suspendedAt = null;
        }
      }

      // Validate email
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // normal email validation
        if (!emailRegex.test(email)) {
          return res.status(400).json({ message: "Invalid email format" });
        }
        user.email = email;
      }

      // Validate mobile number (only 10 digits allowed)
      if (mobile) {
        const mobileRegex = /^[0-9]{10}$/; // exactly 10 digits
        if (!mobileRegex.test(mobile)) {
          return res
            .status(400)
            .json({ message: "Mobile number must be exactly 10 digits" });
        }
        user.mobile = mobile;
      }

      const updatedUser = await user.save();

      try {
        if (typeof isSuspended === "boolean") {
          await logUserAction({
            user: req.user._id,
            userName: req.userName,
            userRole: req.userRole,

            action: isSuspended ? "account_suspended" : "account_reactivated",

            targetType: "User",
            targetId: user._id, // ✅ jisko suspend / unsuspend kiya

            // ✅ DUSRA ADD: Target Name pass kiya dashboard ke liye
            targetName: targetUserName,
            metadata: {
              reason: suspendReason || "",
            },
            device: req.headers["user-agent"],
            location: {
              ip:
                req.headers["x-forwarded-for"] ||
                req.socket.remoteAddress ||
                "",
              country: req.headers["cf-ipcountry"] || "",
            },
          });
        }
      } catch (e) {
        console.error("User suspend log error:", e.message);
      }

      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        name: updatedUser.name,
        email: updatedUser.email,
        profilePicture: updatedUser.profilePicture,
        bio: updatedUser.bio,
        isSuspended: updatedUser.isSuspended,
        mobile: updatedUser.mobile,
        createdAt: updatedUser.createdAt,
      });
    } catch (err) {
      console.error("Update error:", err);
      err.statusCode = err.statusCode || 500;
      await logError(req, err);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// Get comprehensive user activity details
router.get("/:id/activity", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, category, page = 1, limit = 10 } = req.query;

    // Find user by _id or userid
    const user = await User.findOne({
      $or: [{ _id: id }, { userid: id }],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = user._id;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const activities = [];

    // 1. User Logs (login history, actions)
    const logFilter = { user: userId, ...dateFilter };
    if (category === "authentication" || category === "moderation") {
      if (category === "authentication") {
        logFilter.action = { $in: ["login", "logout"] };
      } else if (category === "moderation") {
        logFilter.action = {
          $in: ["report_reel", "account_suspended", "account_reactivated"],
        };
      }
    }

    const userLogs = await UserLog.find(logFilter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) * 2); // Get more to account for other sources

    userLogs.forEach((log) => {
      // Mask IP address for privacy (show only last octet)
      const location = log.location ? { ...log.location } : {};
      if (location.ip) {
        const ipParts = location.ip.split(".");
        if (ipParts.length === 4) {
          location.ip = `***.***.***.${ipParts[3]}`;
        } else {
          location.ip = "***.***.***.***";
        }
      }

      activities.push({
        type: "log",
        category: getCategoryFromAction(log.action),
        timestamp: log.createdAt,
        action: log.action,
        metadata: {
          device: log.device,
          browser: log.browser,
          location: location,
          targetType: log.targetType,
          targetId: log.targetId,
          ...log.metadata,
        },
      });
    });

    // 2. Reels (Posts, Liked Reels, Commented Reels)
    if (!category || category === "content" || category === "social") {
      // User's own reels
      const userReels = await Reel.find({ user: userId, ...dateFilter })
        .sort({ createdAt: -1 })
        .limit(100);

      userReels.forEach((reel) => {
        activities.push({
          type: "reel",
          category: "content",
          timestamp: reel.createdAt,
          action: "upload_reel",
          metadata: {
            reelId: reel._id,
            status: reel.status,
            caption: reel.caption,
            views: reel.views,
            likes: reel.likes?.length || 0,
            blockedAt: reel.blockedAt,
            blockReason: reel.blockReason,
          },
        });

        // Status changes
        if (reel.status === "Blocked" && reel.blockedAt) {
          activities.push({
            type: "reel",
            category: "moderation",
            timestamp: reel.blockedAt,
            action: "block_reel",
            metadata: {
              reelId: reel._id,
              reason: reel.blockReason,
              caption: reel.caption,
            },
          });
        }

        // Updated reels
        if (
          reel.updatedAt &&
          reel.updatedAt.getTime() !== reel.createdAt.getTime()
        ) {
          activities.push({
            type: "reel",
            category: "content",
            timestamp: reel.updatedAt,
            action: "edit_reel",
            metadata: {
              reelId: reel._id,
              caption: reel.caption,
            },
          });
        }
      });

      // Liked reels
      const likedReels = await Reel.find({
        likes: userId,
        ...dateFilter,
      })
        .sort({ createdAt: -1 })
        .limit(100);

      likedReels.forEach((reel) => {
        // Find when user liked it (approximate from reel creation or use a more sophisticated method)
        activities.push({
          type: "reel_like",
          category: "social",
          timestamp: reel.updatedAt || reel.createdAt,
          action: "like_reel",
          metadata: {
            reelId: reel._id,
            authorId: reel.user,
            authorUsername: reel.username,
            caption: reel.caption,
          },
        });
      });
    }

    // 3. Comments (Comments made, Liked comments, Replies)
    if (!category || category === "social" || category === "content") {
      // Comments made by user
      const userComments = await Comment.find({ user: userId, ...dateFilter })
        .populate("reel", "caption username")
        .sort({ createdAt: -1 })
        .limit(100);

      userComments.forEach((comment) => {
        activities.push({
          type: "comment",
          category: "social",
          timestamp: comment.createdAt,
          action: comment.parentComment ? "reply_comment" : "comment",
          metadata: {
            commentId: comment._id,
            reelId: comment.reel?._id || comment.reel,
            reelCaption: comment.reel?.caption,
            text: comment.text,
            likes: comment.likes?.length || 0,
            isReply: !!comment.parentComment,
            parentCommentId: comment.parentComment,
          },
        });
      });

      // Liked comments (need to check all comments)
      const allComments = await Comment.find({
        likes: userId,
        ...dateFilter,
      })
        .populate("reel", "caption username")
        .sort({ createdAt: -1 })
        .limit(100);

      allComments.forEach((comment) => {
        activities.push({
          type: "comment_like",
          category: "social",
          timestamp: comment.updatedAt || comment.createdAt,
          action: "like_comment",
          metadata: {
            commentId: comment._id,
            reelId: comment.reel?._id || comment.reel,
            text: comment.text,
            authorId: comment.user,
          },
        });
      });
    }

    // 4. Followers and Following
    if (!category || category === "social") {
      // Get followers list
      const followers = await User.find({ _id: { $in: user.followers } })
        .select("username name profilePicture createdAt")
        .sort({ createdAt: -1 });

      followers.forEach((follower) => {
        activities.push({
          type: "follower",
          category: "social",
          timestamp: follower.createdAt, // Approximate
          action: "follow_user",
          metadata: {
            userId: follower._id,
            username: follower.username,
            name: follower.name,
            profilePicture: follower.profilePicture,
          },
        });
      });

      // Get following list
      const following = await User.find({ _id: { $in: user.following } })
        .select("username name profilePicture createdAt")
        .sort({ createdAt: -1 });

      following.forEach((followed) => {
        activities.push({
          type: "following",
          category: "social",
          timestamp: followed.createdAt, // Approximate
          action: "follow_user",
          metadata: {
            userId: followed._id,
            username: followed.username,
            name: followed.name,
            profilePicture: followed.profilePicture,
          },
        });
      });
    }

    // 5. Music uploads
    if (!category || category === "content") {
      const musicUploads = await Music.find({
        uploadedBy: userId,
        ...dateFilter,
      })
        .sort({ createdAt: -1 })
        .limit(100);

      musicUploads.forEach((music) => {
        activities.push({
          type: "music",
          category: "content",
          timestamp: music.createdAt,
          action: "upload_music",
          metadata: {
            musicId: music._id,
            title: music.title,
            artist: music.artist,
          },
        });
      });
    }

    // 6. Account lifecycle
    activities.push({
      type: "account",
      category: "authentication",
      timestamp: user.createdAt,
      action: "account_created",
      metadata: {
        username: user.username,
        name: user.name,
      },
    });

    if (user.isSuspended) {
      // Approximate suspension time (could be enhanced with actual log)
      activities.push({
        type: "account",
        category: "moderation",
        timestamp: user.updatedAt || user.createdAt,
        action: "account_suspended",
        metadata: {},
      });
    }

    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const total = activities.length;
    const paginatedActivities = activities.slice(skip, skip + parseInt(limit));

    // Get summary counts
    const summary = {
      totalPosts: await Reel.countDocuments({ user: userId }),
      totalLikedReels: await Reel.countDocuments({ likes: userId }),
      totalComments: await Comment.countDocuments({ user: userId }),
      totalLikedComments: await Comment.countDocuments({ likes: userId }),
      totalFollowers: user.followers?.length || 0,
      totalFollowing: user.following?.length || 0,
      totalMusicUploads: await Music.countDocuments({ uploadedBy: userId }),
      totalLogins: await UserLog.countDocuments({
        user: userId,
        action: "login",
      }),
    };

    res.json({
      user: {
        _id: user._id,
        userid: user.userid,
        username: user.username,
        name: user.name,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
        isSuspended: user.isSuspended,
      },
      summary,
      activities: paginatedActivities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching user activity:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ message: "Server error" });
  }
});

// Helper function to categorize actions
function getCategoryFromAction(action) {
  if (
    [
      "login",
      "logout",
      "account_created",
      "account_suspended",
      "account_reactivated",
    ].includes(action)
  ) {
    return "authentication";
  }
  if (
    [
      "report_reel",
      "block_reel",
      "account_suspended",
      "account_reactivated",
    ].includes(action)
  ) {
    return "moderation";
  }
  if (
    [
      "upload_reel",
      "delete_reel",
      "edit_reel",
      "upload_music",
      "delete_music",
    ].includes(action)
  ) {
    return "content";
  }
  if (
    [
      "like_reel",
      "unlike_reel",
      "comment",
      "reply_comment",
      "like_comment",
      "follow_user",
      "unfollow_user",
    ].includes(action)
  ) {
    return "social";
  }
  return "other";
}

router.post("/external/suspend-user", async (req, res) => {
  try {
    const { userId, isSuspended, reason, suspendedBy } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }

    const user = await User.findOne({ userid: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (typeof isSuspended === "boolean") {
      user.isSuspended = isSuspended;

      if (isSuspended) {
        user.suspendReason = reason || "No reason provided";
        user.suspendedBy = suspendedBy || "external_admin";
        user.suspendedAt = new Date();
      } else {
        user.suspendReason = "";
        user.suspendedBy = null;
        user.suspendedAt = null;
      }
    }

    await user.save();

    // 🔥 log bhi kar
    await logUserAction({
      user: suspendedBy || "external",
      action: isSuspended ? "account_suspended" : "account_reactivated",
      targetType: "User",
      targetId: user._id,
      targetName: user.username,
      metadata: {
        reason: reason || "",
        source: "shopping_app",
      },
    });

    res.json({
      success: true,
      message: `User ${isSuspended ? "suspended" : "activated"} successfully`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/action/disconnect-seller", async (req, res) => {
  try {
    const { seller_id } = req.body;

    if (!seller_id) {
      return res.status(400).json({ message: "Seller ID is required" });
    }

    const updatedUser = await User.findOneAndUpdate(
      { seller_id: seller_id },
      {
        $set: {
          seller_id: "",
          userseller_id: "",
          isConnected: false,
        },
      },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ message: "User not found with this seller_id" });
    }

    res.status(200).json({
      success: true,
      message: "Seller disconnected and IDs cleared",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/reactivate", async (req, res) => {
  try {
    let { mobile } = req.body; // Frontend ko yahan username bhejne ki zaroorat hi nahi hai

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    mobile = mobile.replace(/\D/g, "");
    const existingUser = await User.findOne({ mobile });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!existingUser.isDeleted) {
      return res.status(400).json({ message: "Account is already active." });
    }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const timePassed = Date.now() - new Date(existingUser.deletedAt).getTime();

    // Check if 30 days limit is crossed
    if (timePassed > thirtyDays) {
      return res.status(400).json({
        message:
          "Reactivation period has expired. Please log in normally to create a fresh account.",
      });
    }

    // ✨ 1. RESTORE ACCOUNT
    existingUser.isDeleted = false;
    existingUser.deletedAt = null;
    await existingUser.save();

    // ✨ 2. RESTORE COMMENTS
    await Comment.updateMany(
      { user: existingUser._id },
      { $set: { isDeleted: false, deletedAt: null } },
    );

    // ✨ 3. RETURN FULL USER DATA (Taaki frontend direct login karwa de)
    return res.status(200).json({
      message: "Account reactivated and logged in successfully",
      _id: existingUser._id,
      userid: existingUser.userid,
      username: existingUser.username,
      name: existingUser.name,
      isConnected: existingUser.isConnected,
      seller_id: existingUser.seller_id,
      userseller_id: existingUser.userseller_id,
      mobile: existingUser.mobile,
      email: existingUser.email,
      profilePicture: existingUser.profilePicture,
      bio: existingUser.bio,
      followers: existingUser.followers,
      following: existingUser.following,
      isSuspended: existingUser.isSuspended,
      createdAt: existingUser.createdAt,
    });
  } catch (error) {
    console.error("Error reactivating user:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
