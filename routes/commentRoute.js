const express = require("express");
const router = express.Router();
const Comment = require("../models/Comment");
const User = require("../models/Users");
const Reel2 = require("../models/Reel"); // This is your Reel model
const createNotification = require("../utils/createNotification");
const adminAuth = require("../middleware/adminAuth");
const checkPermission = require("../middleware/checkPermission");
const logUserAction = require("../utils/logUserAction");
const logError = require("../utils/logError");

const mongoose = require("mongoose");

router.post("/new", async (req, res) => {
  try {
    const { user: userId, reel: reelId, text, parentComment: incomingParentId } = req.body;

    if (!userId || !reelId || !text) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // 1. Sirf User aur Parent (if any) fetch karo. Reel fetch mat karo abhi.
    const [user, parentDoc] = await Promise.all([
      User.findById(userId).select("username profilePicture userid isSuspended").lean(),
      incomingParentId ? Comment.findById(incomingParentId).select("parentComment").lean() : null
    ]);

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isSuspended) return res.status(200).json({ message: "Comment ignored" });

    let finalParentId = null;
    if (parentDoc) {
      finalParentId = parentDoc.parentComment ? parentDoc.parentComment : parentDoc._id;
    }

    // 🚀 EXTREME OPTIMIZATION: Database me save hone se pehle hi ID bana lo!
    const newCommentId = new mongoose.Types.ObjectId();
    const now = new Date();

    // 🔥 Turant frontend ko bhejne ke liye object bana liya
    const finalComment = {
      _id: newCommentId,
      text,
      reel: reelId,
      parentComment: finalParentId,
      likes: [],
      createdAt: now,
      updatedAt: now,
      user: {
        _id: user._id,
        username: user.username || "User",
        profilePicture: user.profilePicture || "",
        userid: user.userid,
      },
    };

    // 🚀 SEND RESPONSE IN MILLISECONDS! (DB write ka wait kiye bina)
    res.status(201).json(finalComment);


    // ================= BACKGROUND WORK (Server aaram se handle karega) =================
    // Is async block ka intezaar res.json() nahi karega.
    (async () => {
      try {
        // Reel exist karti hai ya nahi, background me check karo
        const reelData = await Reel2.findById(reelId).select("userid user").lean();
        if (!reelData) return; // Agar reel delete ho chuki hai, toh kuch mat karo

        // 1. Comment Save karo
        const comment = new Comment({
          _id: newCommentId, // Wahi ID jo frontend ko bheji hai
          user: userId,
          reel: reelId,
          text,
          parentComment: finalParentId,
          createdAt: now,
          updatedAt: now
        });
        await comment.save();

        // 2. Reel me Comment ID Push karo
        await Reel2.findByIdAndUpdate(reelId, { $push: { comments: newCommentId } });

        // 3. Notification Bhejo
        if (!incomingParentId) {
          // Direct Comment
          await createNotification({
            recipientObjectId: reelData.user,
            senderObjectId: user._id,
            recipientUserId: reelData.userid,
            senderUserId: user.userid,
            type: "comment",
            reel: reelId,
            comment: newCommentId,
            message: `commented on your reel: "${text}"`,
          });
        } else if (parentDoc && parentDoc.user && parentDoc.user.toString() !== userId.toString()) {
          // Reply Notification
          const targetUser = await User.findById(parentDoc.user).select("userid").lean();
          if (targetUser) {
            await createNotification({
              recipientObjectId: parentDoc.user,
              senderObjectId: user._id,
              recipientUserId: targetUser.userid,
              senderUserId: user.userid,
              type: "comment_reply",
              reel: reelId,
              comment: newCommentId,
              message: `replied to your comment: "${text}"`,
            });
          }
        }
      } catch (bgError) {
        console.error("🔥 Background Save Error:", bgError);
      }
    })();

  } catch (error) {
    console.error("API Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Server Error" });
    }
  }
});


router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || "";
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";

    const skip = (page - 1) * limit;

    // 🔍 Build Query Object
    const query = {};

    // ✅ Search Filter
    if (search) {
      // ✨ NAYI LINE: Search mein deleted user include na ho
      const users = await User.find({
        username: { $regex: search, $options: "i" },
        isDeleted: { $ne: true }
      }).select("_id");

      const userIds = users.map(u => u._id);

      query.$or = [
        { text: { $regex: search, $options: "i" } },
        { user: { $in: userIds } }
      ];
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

    const totalComments = await Comment.countDocuments(query);

    // 1. Fetch more than the limit temporarily to account for filtered nulls
    // ✨ NAYI LINE: Populate mein match lagaya taaki deleted users null ban jayein
    const rawComments = await Comment.find(query)
      .populate({
        path: "user",
        select: "userid username name profilePicture",
        match: { isDeleted: { $ne: true } }
      })
      .populate("reel", "caption")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // 2. 🔥 EXACT FIX: Filter out comments where user is null (Deleted users yahan hat jayenge)
    const validComments = rawComments.filter(comment => comment.user !== null);

    // 3. Send the filtered list
    res.status(200).json({
      success: true,
      page,
      limit,
      totalComments,
      totalPages: Math.ceil(totalComments / limit),
      comments: validComments, // ✅ This ensures no "null" or "deleted" users reach your app
    });

  } catch (error) {
    console.error("Error fetching comments:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ success: false, message: "Error fetching data" });
  }
});

// admin get all comments with search and filter
router.get("/admin-view", adminAuth, checkPermission("VIEW_COMMENTS"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || "";
    const status = req.query.status || "all"; // Naya status parameter add kiya
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";

    const skip = (page - 1) * limit;

    // 🔍 Build Query Object
    const query = {};

    // 🔥 1. DEFAULT FILTER: Hamesha active users ke comments hi dikhao
    // Delete ho chuke users ke comments hamesha ke liye hide rahenge
    const activeUsers = await User.find({ isDeleted: { $ne: true } }).select("_id");
    const activeUserIds = activeUsers.map(u => u._id);
    query.user = { $in: activeUserIds };

    // 🔥 2. DEFAULT FILTER: Hamesha Soft Deleted Comments ko hide karo
    if (status === "deleted") {
      query.isDeleted = true; // Agar admin deliberately deleted comments dekhna chahe
    } else {
      query.isDeleted = { $ne: true }; // Default me hamesha hide rahenge
    }

    // ✅ 3. Search Filter
    if (search) {
      const searchUsers = await User.find({
        username: { $regex: search, $options: "i" },
        isDeleted: { $ne: true } // Search me bhi deleted users na aayein
      }).select("_id");

      const searchUserIds = searchUsers.map(u => u._id);

      query.$or = [
        { text: { $regex: search, $options: "i" } },
        { user: { $in: searchUserIds } }
      ];
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

    const totalComments = await Comment.countDocuments(query);

    const comments = await Comment.find(query)
      .populate("user", "userid username name profilePicture")
      .populate("reel", "caption")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      page,
      limit,
      totalComments,
      totalPages: Math.ceil(totalComments / limit),
      comments,
    });

  } catch (error) {
    console.error("Error fetching comments:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ success: false, message: "Error fetching data" });
  }
});


router.get("/user/:userid", adminAuth, async (req, res) => {
  try {
    const { userid } = req.params;

    // pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    // find user by custom userid
    const user = await User.findOne({ userid });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const commentQuery = { user: user._id };

    if (startDate || endDate) {
      commentQuery.createdAt = {};

      if (startDate) {
        commentQuery.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include full end day
        commentQuery.createdAt.$lte = end;
      }
    }

    // total comments count
    const totalComments = await Comment.countDocuments(commentQuery);

    // paginated comments
    const comments = await Comment.find(commentQuery)
      .populate("reel", "caption")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // format response
    const formattedComments = comments.map(c => ({
      _id: c._id,
      text: c.text,
      reelId: c.reel?._id || c.reel,
      reelCaption: c.reel?.caption || null,
      createdAt: c.createdAt,
      likes: c.likes?.length || 0
    }));

    return res.json({
      success: true,
      totalComments,
      totalPages: Math.ceil(totalComments / limit),
      currentPage: page,
      comments: formattedComments
    });

  } catch (error) {
    console.error("Error fetching user comments:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    return res.status(500).json({ message: "Error fetching user comments" });
  }
});



// find single comment 
router.get("/:id", async (req, res) => {
  try {
    const data = await Comment.findById(req.params.id);
    if (!data) {
      res.status(404).json({ message: "Comment not found" });
    };
    res.status(200).json(data);
  } catch (error) {
    await logError(req, error);
    error.statusCode = error.statusCode || 500;
    res.status(500).json({ message: "Error to fetching data" });

    console.log("Error to Fetching Data", error)
  }
});


// delete comment 
router.delete(
  "/delete/:id/:userId",
  async (req, res) => {
    try {
      const { id, userId } = req.params;

      // ✅ Validate userId
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // 🚫 Suspend check
      if (user.isSuspended) {
        return res.status(200).json({
          message: "Delete ignored",
        });
      }

      // ❌ Delete child replies first
      await Comment.deleteMany({ parentComment: id });

      // ❌ Delete main comment
      const deleted = await Comment.findByIdAndDelete(id);

      // ✅ IMPORTANT: check first
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // ✅ LOG AFTER CONFIRM DELETE
      try {
        // Comment ka text capture kiya (agar text field ka naam 'content' hai toh use badal lena)
        const deletedCommentText = deleted.text || deleted.content || "No text";

        await logUserAction({
          user: req.user._id,
          userName: req.userName,
          userRole: req.userRole,
          action: "delete_comment",
          targetType: "Comment",
          targetId: deleted._id,

          // ✅ YAHAN ADD KIYA: ID aur Actual Comment Text
          targetName: `ID: ${deleted._id} (${deletedCommentText})`,

          device: req.headers["user-agent"],
          location: {
            ip:
              req.headers["x-forwarded-for"] ||
              req.socket.remoteAddress ||
              "",
            country: req.headers["cf-ipcountry"] || "",
          },
        });
      } catch (e) {
        console.error("Delete comment log error:", e.message);
      }

      return res.status(200).json({
        success: true,
        message: "Comment Deleted Successfully!",
      });
    } catch (error) {
      console.error("Error in Delete Comment", error);
      error.statusCode = error.statusCode || 500;
      await logError(req, error);
      res.status(500).json({ message: "Error in Comment delete" });
    }
  }
);

router.delete(
  "/admin_comment/delete/:id/:userId",
  adminAuth,
  checkPermission("DELETE_COMMENT"),
  async (req, res) => {
    try {
      const { id, userId } = req.params;

      // ✅ Validate userId
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // 🚫 Suspend check
      if (user.isSuspended) {
        return res.status(200).json({
          message: "Delete ignored",
        });
      }

      // ❌ Delete child replies first
      await Comment.deleteMany({ parentComment: id });

      // ❌ Delete main comment
      const deleted = await Comment.findByIdAndDelete(id);

      // ✅ IMPORTANT: check first
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // ✅ LOG AFTER CONFIRM DELETE
      try {
        // Comment ka text capture kiya (agar text field ka naam 'content' hai toh use badal lena)
        const deletedCommentText = deleted.text || deleted.content || "No text";

        await logUserAction({
          user: req.user._id,
          userName: req.userName,
          userRole: req.userRole,
          action: "delete_comment",
          targetType: "Comment",
          targetId: deleted._id,

          // ✅ YAHAN ADD KIYA: ID aur Actual Comment Text
          targetName: `ID: ${deleted._id} (${deletedCommentText})`,

          device: req.headers["user-agent"],
          location: {
            ip:
              req.headers["x-forwarded-for"] ||
              req.socket.remoteAddress ||
              "",
            country: req.headers["cf-ipcountry"] || "",
          },
        });
      } catch (e) {
        console.error("Delete comment log error:", e.message);
      }

      return res.status(200).json({
        success: true,
        message: "Comment Deleted Successfully!",
      });
    } catch (error) {
      console.error("Error in Delete Comment", error);
      error.statusCode = error.statusCode || 500;
      await logError(req, error);
      res.status(500).json({ message: "Error in Comment delete" });
    }
  }
);


//update comment
router.put("/update/:id", async (req, res) => {
  try {
    const { text, userId } = req.body;

    // 👇 user fetch
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    /* 👇 SUSPEND CHECK YAHAN */
    if (user.isSuspended) {
      return res.status(200).json({
        message: "Edit ignored"
      });
    }
    /* 👆 bas itna hi */

    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: "Comment Not Found to edit!" });
    }

    comment.text = text;
    const savedComment = await comment.save();
    // try {
    //   await logUserAction({
    //     user: user._id,
    //     userName: user.username || user.name || "User",
    //     userRole: "user",                 // 🔥 app user rule

    //     action: "edit_comment",
    //     targetType: "Comment",
    //     targetId: comment._id,

    //     device: req.headers["user-agent"],
    //     location: {
    //       ip:
    //         req.headers["x-forwarded-for"] ||
    //         req.socket.remoteAddress ||
    //         "",
    //       country: req.headers["cf-ipcountry"] || "",
    //     },

    //     // (optional but useful)
    //     metadata: {
    //       oldText: comment.text,
    //       newText: text
    //     }
    //   });
    // } catch (logErr) {
    //   console.error("Edit comment log error:", logErr.message);
    // }
    res.status(201).json(savedComment);

  } catch (error) {
    console.log("Error in Update Comment", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ message: "Error in Comment" });
  }
});

// GET comments for a reel
router.get('/reel/:reelId', async (req, res) => {
  try {
    const reelId = req.params.reelId;
    const viewerId = req.query.viewerId; // 🔥 ADDED: Frontend se viewer ki ID mangwao

    // 🛡️ BLOCK FILTER LOGIC START
    let blockedList = [];
    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers");
      if (viewer && viewer.blockedUsers) {
        blockedList = viewer.blockedUsers;
      }
    }
    // 🛡️ BLOCK FILTER LOGIC END

    // ✅ Step 1: Fetch Main Comments (Filtered by blocked users)
    const comments = await Comment.find({
      reel: reelId,
      parentComment: null,
      user: { $nin: blockedList } // 🔥 ADDED: Blocked logo ke main comments hide karo
    })
      .populate('user', 'username profilePicture')
      .sort({ createdAt: -1 });

    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        // ✅ Step 2: Fetch Replies (Filtered by blocked users)
        const replies = await Comment.find({
          parentComment: comment._id,
          user: { $nin: blockedList } // 🔥 ADDED: Blocked logo ke replies bhi hide karo
        })
          .populate('user', 'username profilePicture')
          .sort({ createdAt: 1 });

        return { ...comment._doc, replies };
      })
    );

    return res.status(200).json(commentsWithReplies);
  } catch (error) {
    console.error("Error fetching comments:", error);
    if (typeof logError === 'function') {
      await logError(req, error);
    }
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
});

// comment like dislike
router.put("/like/:id", async (req, res) => {
  try {
    const { userId } = req.body;
    const commentId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.userid) return res.status(500).json({ message: "User.userid missing" });

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (user.isSuspended) {
      return res.status(200).json({
        message: "Like ignored"
      });
    }

    // 🔹 Fetch comment with user populated
    const comment = await Comment.findById(commentId).populate("user");

    console.log("========== COMMENT DEBUG ==========");
    console.log("Comment User:", comment.user);
    console.log("Comment User ID:", comment.user?._id?.toString());
    console.log("Comment User userid:", comment.user?.userid);
    console.log("Liker User ID:", userId.toString());
    console.log(
      "Is Self Like:",
      comment.user?._id?.toString() === userId.toString()
    );
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // 🔥 ADDED: 🛡️ BLOCK CHECK START 🛡️
    if (comment.user) {
      // 1. Kya Comment Owner ne Liker (viewer) ko block kiya hai?
      const isBlockedByOwner = comment.user.blockedUsers?.some(
        (bid) => bid.toString() === userId.toString()
      );

      // 2. Kya Liker (viewer) ne Comment Owner ko block kiya hai?
      const isBlockedByLiker = user.blockedUsers?.some(
        (bid) => bid.toString() === comment.user._id.toString()
      );

      if (isBlockedByOwner || isBlockedByLiker) {
        return res.status(403).json({ message: "Action not allowed due to privacy settings." });
      }
    }
    // 🔥 ADDED: 🛡️ BLOCK CHECK END 🛡️

    const alreadyLiked = comment.likes.includes(userId);

    // 🔁 UNLIKE
    if (alreadyLiked) {
      comment.likes = comment.likes.filter(
        (id) => id.toString() !== userId
      );
      await comment.save();

      return res.status(200).json({
        message: "Comment unliked",
        likes: comment.likes.length
      });
    }

    // ❤️ LIKE
    comment.likes.push(userId);
    await comment.save();

    // 🔔 CREATE NOTIFICATION (ONLY IF NOT SELF-LIKE)
    if (comment.user && comment.user._id.toString() !== userId.toString()) {
      try {
        await createNotification({
          recipientObjectId: comment.user._id,
          senderObjectId: userId,
          recipientUserId: comment.user.userid,
          senderUserId: user.userid,
          type: "comment_like",
          reel: comment.reel,
          comment: comment._id,
          message: comment.parentComment
            ? `liked your reply: "${comment.text}"`
            : `liked your comment: "${comment.text}"`
        });
      } catch (notifErr) {
        console.error("Comment-like notification failed:", notifErr.message);
      }
    }

    return res.status(200).json({
      message: "Comment liked",
      likes: comment.likes.length
    });

  } catch (error) {
    console.error("Error in liking comment:", error);
    // Fixed the variable name 'error' to match catch
    if (typeof logError === 'function') {
      await logError(req, error);
    }
    res.status(500).json({ message: "Something went wrong" });
  }
});


// GET all comments liked by a user (ADMIN VIEW)
router.get("/admin/users/:userid/liked-comments", adminAuth, async (req, res) => {
  try {
    const { userid } = req.params;

    // pagination (optional but safe)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 1️⃣ find user by custom userid
    const user = await User.findOne({ userid });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2️⃣ count total liked comments (only on unblocked reels)
    const total = await Comment.countDocuments({
      likes: user._id,
    });

    // 3️⃣ fetch comments
    const comments = await Comment.find({
      likes: user._id,
    })
      // 🔥 VERY IMPORTANT
      .populate({
        path: "reel",
        select: "_id caption status",
        match: { status: { $ne: "Blocked" } }, // ❌ blocked reels hide
      })
      .populate("user", "userid username name profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // 4️⃣ remove comments whose reel is null (blocked / deleted)
    const filteredComments = comments.filter(c => c.reel);

    return res.json({
      success: true,
      page,
      limit,
      total: filteredComments.length,
      comments: filteredComments,
    });

  } catch (error) {
    console.error("Error fetching liked comments:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/check-seller-connection", async (req, res) => {
  try {
    const { seller_id, reelId } = req.body;

    if (!seller_id || !reelId) {
      return res.status(400).json({
        message: "seller_id and reelId are required"
      });
    }

    // 🔍 Reel find karo
    const reel = await Reel2.findById(reelId);

    if (!reel) {
      return res.status(404).json({
        message: "Reel not found"
      });
    }

    // 🔥 check karo seller match karta hai ya nahi
    if (reel.seller_id !== seller_id) {
      return res.status(400).json({
        message: "Invalid Id",
        isConnected: false
      });
    }

    // 🔍 Seller (user) find karo
    const seller = await User.findOne({ seller_id });

    if (!seller) {
      return res.status(404).json({
        message: "Seller not found",
        isConnected: false
      });
    }

    // ✅ final check: connected hai ya nahi
    if (seller.isConnected) {
      return res.status(200).json({
        message: "Play Id is connected",
        isConnected: true
      });
    } else {
      return res.status(200).json({
        message: "Playid is not connected",
        isConnected: false
      });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Wrong Play Id",
      isConnected: false
    });
  }
});


module.exports = router;
