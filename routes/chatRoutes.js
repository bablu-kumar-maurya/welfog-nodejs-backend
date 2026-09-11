const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/Users");
const { uploadToS3, generatePresignedUrl } = require("../lib/s3");
const { isUserOnline } = require("../sockets/chatSocket");
const { compressImage, compressVideo, generateVideoThumbnail } = require("../lib/mediaProcessor");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// Helper to helper-resolve user (either _id ObjectId, userid string, mobile, or username)
async function resolveUserDoc(idOrUserId) {
  if (!idOrUserId) return null;
  const str = idOrUserId.toString().trim();
  if (!str) return null;

  // 1. Try finding by custom string `userid` first
  let user = await User.findOne({ userid: str })
    .select("_id username name profilePicture isConnected userid mobile blockedUsers")
    .lean();

  if (user) return user;

  // 2. If not found by userid and valid ObjectId, check by _id
  if (mongoose.isValidObjectId(str)) {
    user = await User.findById(str)
      .select("_id username name profilePicture isConnected userid mobile blockedUsers")
      .lean();
    if (user) return user;
  }

  // 3. Fallback check by mobile or username
  user = await User.findOne({ $or: [{ mobile: str }, { username: str }] })
    .select("_id username name profilePicture isConnected userid mobile blockedUsers")
    .lean();

  return user;
}

// =========================================================
// 1️⃣ ONE-TO-ONE CONVERSATION (Get existing or auto-create)
// =========================================================
router.post("/conversations/one-to-one", async (req, res) => {
  try {
    const { userId, targetUserId } = req.body;

    if (!userId || !targetUserId) {
      return res.status(400).json({ success: false, message: "Both userId and targetUserId are required" });
    }

    if (userId === targetUserId) {
      return res.status(400).json({ success: false, message: "Cannot create conversation with yourself" });
    }

    // 🚀 OPTIMIZATION 1: Fetch both users in parallel (Saves ~50% wait time here)
    const [user1, user2] = await Promise.all([
      resolveUserDoc(userId),
      resolveUserDoc(targetUserId)
    ]);

    if (!user1 || !user2) {
      return res.status(404).json({ success: false, message: "One or both users not found" });
    }

    // 🚀 OPTIMIZATION 2: Find WITHOUT populating first. (Query runs much faster)
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [user1._id, user2._id] },
    });

    if (conversation) {
      // Re-activate conversation if soft-deleted for user
      let updated = false;

      if (conversation.isDeleted) {
        conversation.isDeleted = false;
        updated = true;
      }

      const user1IdStr = user1._id.toString(); // Store once to avoid recalculating in loop

      if (conversation.deletedFor && conversation.deletedFor.some((id) => id.toString() === user1IdStr)) {
        conversation.deletedFor = conversation.deletedFor.filter((id) => id.toString() !== user1IdStr);
        updated = true;
      }

      // Save raw document first (Faster than saving a populated document)
      if (updated) {
        await conversation.save();
      }

      // 🚀 OPTIMIZATION 3: Populate ONLY after saving and right before sending response
      await conversation.populate([
        { path: "participants", select: "username name profilePicture isConnected userid lastConnectedAt" },
        { path: "lastMessage", populate: { path: "sender", select: "username name profilePicture userid" } }
      ]);

      return res.status(200).json({
        success: true,
        message: "Existing conversation retrieved",
        conversation,
      });
    }

    // Create new 1-on-1 conversation
    conversation = new Conversation({
      isGroup: false,
      participants: [user1._id, user2._id],
      unreadCounts: {
        [user1._id.toString()]: 0,
        [user2._id.toString()]: 0,
      },
    });

    await conversation.save();

    // Populate after creation
    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");

    return res.status(201).json({
      success: true,
      message: "Conversation created successfully",
      conversation,
    });

  } catch (error) {
    console.error("Error in /conversations/one-to-one:", error);
    res.status(500).json({ success: false, message: "Failed to process conversation" });
  }
});

// =========================================================
// 2️⃣ GROUP CONVERSATION CREATION
// =========================================================
// =========================================================
router.post("/conversations/group", async (req, res) => {
  try {
    const { creatorId, groupName, groupAvatar = "", groupDescription = "", participantIds = [] } = req.body;

    if (!creatorId || !groupName) {
      return res.status(400).json({ success: false, message: "creatorId and groupName are required" });
    }

    const creator = await resolveUserDoc(creatorId);
    if (!creator) {
      return res.status(404).json({ success: false, message: "Creator user not found" });
    }

    // 🚀 OPTIMIZATION: Fetch all participants in parallel instead of one-by-one loop
    const pDocs = await Promise.all(participantIds.map(pid => resolveUserDoc(pid)));

    const participantObjectIdsMap = new Map();
    participantObjectIdsMap.set(creator._id.toString(), creator._id); // Add creator

    pDocs.forEach(pDoc => {
      if (pDoc) {
        participantObjectIdsMap.set(pDoc._id.toString(), pDoc._id);
      }
    });

    const participantObjectIds = Array.from(participantObjectIdsMap.values());

    if (participantObjectIds.length < 2) {
      return res.status(400).json({ success: false, message: "Group chat requires at least 2 participants" });
    }

    const initialUnread = {};
    const initialJoinedAt = {};
    const now = new Date();

    participantObjectIds.forEach((id) => {
      initialUnread[id.toString()] = 0;
      initialJoinedAt[id.toString()] = now;
    });

    const conversation = new Conversation({
      isGroup: true,
      groupName,
      groupAvatar,
      groupDescription,
      groupAdmin: creator._id,
      participants: participantObjectIds,
      unreadCounts: initialUnread,
      joinedAt: initialJoinedAt,
    });

    await conversation.save();

    // 🚀 OPTIMIZATION: Populate in parallel
    await Promise.all([
      conversation.populate("participants", "username name profilePicture isConnected userid"),
      conversation.populate("groupAdmin", "username name profilePicture userid")
    ]);

    res.status(201).json({
      success: true,
      message: "Group conversation created successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error in /conversations/group:", error);
    res.status(500).json({ success: false, message: "Failed to create group conversation" });
  }
});

// 🚀 OPTIMIZATION: Modified to accept full user object directly to avoid N+1 DB queries in loops
async function resolveConversationLastMessage(conv, userOrId) {
  if (!conv || !userOrId) return conv;

  // If we already passed the full user document, use it. Otherwise, fetch it.
  const user = userOrId._id ? userOrId : await resolveUserDoc(userOrId);
  if (!user) return conv;

  const userIdStr = user._id.toString();
  let filterDate = null;

  if (conv.joinedAt && conv.joinedAt[userIdStr]) {
    filterDate = new Date(conv.joinedAt[userIdStr]);
  }
  if (conv.clearedAt && conv.clearedAt[userIdStr]) {
    const clearDate = new Date(conv.clearedAt[userIdStr]);
    if (!filterDate || clearDate > filterDate) {
      filterDate = clearDate;
    }
  }

  let needQueryNewLast = false;
  if (conv.lastMessage) {
    if (conv.lastMessage.deletedFor) {
      const isDeleted = conv.lastMessage.deletedFor.some((id) => id.toString() === userIdStr);
      if (isDeleted) needQueryNewLast = true;
    }

    if (filterDate) {
      const msgCreatedAt = conv.lastMessage.createdAt ? new Date(conv.lastMessage.createdAt) : null;
      if (msgCreatedAt && msgCreatedAt < filterDate) {
        needQueryNewLast = true;
      }
    }
  }

  if (needQueryNewLast) {
    const Message = require("../models/Message");
    const query = {
      conversation: conv._id,
      deletedFor: { $ne: user._id }
    };
    if (filterDate) {
      query.createdAt = { $gte: filterDate };
    }
    const actualLastMessage = await Message.findOne(query)
      .sort({ createdAt: -1 })
      .populate("sender", "username name profilePicture userid")
      .lean();
    conv.lastMessage = actualLastMessage;
  }

  return conv;
}

// =========================================================
// 3️⃣ GET USER CONVERSATIONS LIST
// =========================================================
router.get("/conversations", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId query parameter is required" });
    }

    const user = await resolveUserDoc(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const conversations = await Conversation.find({
      participants: user._id,
      isDeleted: { $ne: true },
      deletedFor: { $ne: user._id },
    })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .populate("participants", "username name profilePicture isConnected userid lastConnectedAt")
      .populate("groupAdmin", "username name profilePicture userid")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username name profilePicture userid" },
      })
      .lean();

    const userIdStr = user._id.toString();

    // 🚀 OPTIMIZATION: Pass the 'user' object directly to resolveConversationLastMessage
    const formatted = await Promise.all(conversations.map(async (conv) => {
      const unread = conv.unreadCounts ? conv.unreadCounts[userIdStr] || 0 : 0;

      let isOtherOnline = false;
      if (!conv.isGroup) {
        const otherParticipant = conv.participants.find((p) => p._id.toString() !== userIdStr);
        if (otherParticipant) {
          isOtherOnline = isUserOnline(otherParticipant._id.toString());
        }
      }

      // Passed `user` instead of `user._id` to save hundreds of DB calls
      const resolvedConv = await resolveConversationLastMessage(conv, user);

      return {
        ...resolvedConv,
        unreadCount: unread,
        isOtherOnline,
      };
    }));

    res.status(200).json({
      success: true,
      conversations: formatted,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ success: false, message: "Failed to fetch conversations" });
  }
});

// =========================================================
// 4️⃣ GET SINGLE CONVERSATION DETAILS
// =========================================================
router.get("/conversations/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.query;

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: "Invalid conversation ID" });
    }

    // 🚀 OPTIMIZATION: Fetch Conversation and User in parallel
    const [conversation, user] = await Promise.all([
      Conversation.findById(conversationId)
        .populate("participants", "username name profilePicture isConnected userid lastConnectedAt")
        .populate("groupAdmin", "username name profilePicture userid")
        .populate("groupCoAdmins", "username name profilePicture userid")
        .populate({
          path: "lastMessage",
          populate: { path: "sender", select: "username name profilePicture userid" },
        })
        .lean(),
      userId ? resolveUserDoc(userId) : null
    ]);

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    let resolvedConversation = conversation;
    if (user) {
      const unread = conversation.unreadCounts ? conversation.unreadCounts[user._id.toString()] || 0 : 0;
      conversation.unreadCount = unread;
      resolvedConversation = await resolveConversationLastMessage(conversation, user);
    }

    res.status(200).json({
      success: true,
      conversation: resolvedConversation,
    });
  } catch (error) {
    console.error("Error fetching conversation details:", error);
    res.status(500).json({ success: false, message: "Failed to fetch conversation details" });
  }
});

// =========================================================
// 5️⃣ GET PAGINATED CONVERSATION MESSAGES
// =========================================================
router.get("/conversations/:conversationId/messages", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, page = 1, limit = 30 } = req.query;

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: "Invalid conversation ID" });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const query = { conversation: conversationId };

    if (userId) {
      // 🚀 OPTIMIZATION: Fetch user and conversation at the same time
      const [user, conversation] = await Promise.all([
        resolveUserDoc(userId),
        Conversation.findById(conversationId).select("participants joinedAt clearedAt").lean() // Using lean & select for speed
      ]);

      if (user) {
        if (!conversation) {
          return res.status(404).json({ success: false, message: "Conversation not found" });
        }

        const userIdStr = user._id.toString();
        const isParticipant = conversation.participants.some((p) => p.toString() === userIdStr);

        if (!isParticipant) {
          return res.status(403).json({ success: false, message: "You are not a participant in this conversation" });
        }

        query.deletedFor = { $ne: user._id };

        let filterDate = null;
        if (conversation.joinedAt && conversation.joinedAt[userIdStr]) {
          filterDate = conversation.joinedAt[userIdStr];
        }
        if (conversation.clearedAt && conversation.clearedAt[userIdStr]) {
          const clearDate = conversation.clearedAt[userIdStr];
          if (!filterDate || clearDate > filterDate) {
            filterDate = clearDate;
          }
        }
        if (filterDate) {
          query.createdAt = { $gte: filterDate };
        }
      }
    }

    // 🚀 OPTIMIZATION: Fetch total count AND messages simultaneously
    const [totalMessages, messages] = await Promise.all([
      Message.countDocuments(query),
      Message.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("sender", "username name profilePicture userid")
        .populate({
          path: "replyTo",
          select: "text type sender mediaUrl fileName",
          populate: { path: "sender", select: "username name" },
        })
        .lean()
    ]);

    res.status(200).json({
      success: true,
      messages: messages.reverse(), // Chronological order
      pagination: {
        total: totalMessages,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalMessages / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
});

// =========================================================
// 6️⃣ SEND MESSAGE (REST API Endpoint) -> 🚀 MASSIVELY OPTIMIZED
// =========================================================
router.post("/conversations/:conversationId/messages", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      senderId, type = "text", text = "", mediaUrl = "", thumbnailUrl = "",
      fileName = "", fileSize = 0, mimeType = "", replyTo = null,
      sharedReel = null, sharedProduct = null, tempId = null, duration = 0,
    } = req.body;

    if (!mongoose.isValidObjectId(conversationId) || !senderId) {
      return res.status(400).json({ success: false, message: "Invalid payload data" });
    }

    // 🚀 OPTIMIZATION 1: Fetch Sender and Conversation together
    const [senderDoc, conversation] = await Promise.all([
      resolveUserDoc(senderId),
      Conversation.findById(conversationId)
    ]);

    if (!senderDoc || !conversation) {
      return res.status(404).json({ success: false, message: "Sender or Conversation not found" });
    }

    const senderIdStr = senderDoc._id.toString();

    let isReceiverBlocked = false;
    let otherUserId = null;

    if (!conversation.isGroup && conversation.participants.length === 2) {
      otherUserId = conversation.participants.find((p) => p.toString() !== senderIdStr);

      if (otherUserId) {
        // Find other user only if it's a 1-on-1 chat
        const otherDoc = await User.findById(otherUserId).select("blockedUsers").lean();

        const senderBlockedOther = senderDoc.blockedUsers?.some((id) => id.toString() === otherUserId.toString());
        const otherBlockedSender = otherDoc?.blockedUsers?.some((id) => id.toString() === senderIdStr);

        if (senderBlockedOther) {
          return res.status(403).json({ success: false, message: "Messaging is blocked between these users" });
        }
        if (otherBlockedSender) {
          isReceiverBlocked = true;
        }
      }
    }

    const deliveredTo = [];
    conversation.participants.forEach((partId) => {
      const partStr = partId.toString();
      if (partStr !== senderIdStr && isUserOnline(partStr) && !isReceiverBlocked) {
        deliveredTo.push(partId);
      }
    });

    const newMessage = new Message({
      conversation: conversationId,
      sender: senderDoc._id,
      type, text, mediaUrl, thumbnailUrl, fileName, fileSize, mimeType,
      duration: Number(duration) || 0,
      replyTo: replyTo && mongoose.isValidObjectId(replyTo) ? replyTo : null,
      sharedReel: sharedReel || null,
      sharedProduct: sharedProduct || null,
      status: deliveredTo.length > 0 ? "delivered" : "sent",
      deliveredTo,
      seenBy: [],
      deletedFor: isReceiverBlocked ? [otherUserId] : [],
    });

    // 🚀 OPTIMIZATION 2: Save message first (we need its ID)
    await newMessage.save();

    // Prepare message population
    const populateQuery = [{ path: "sender", select: "username name profilePicture userid" }];
    if (newMessage.replyTo) {
      populateQuery.push({
        path: "replyTo",
        select: "text type sender mediaUrl fileName",
        populate: { path: "sender", select: "username name profilePicture userid" }
      });
    }

    // Update conversation metadata
    conversation.lastMessage = newMessage._id;
    conversation.lastMessageAt = new Date();
    conversation.isDeleted = false;
    conversation.deletedFor = [];

    conversation.participants.forEach((partId) => {
      const partStr = partId.toString();
      if (partStr !== senderIdStr && !isReceiverBlocked) {
        const currentCount = conversation.unreadCounts.get(partStr) || 0;
        conversation.unreadCounts.set(partStr, currentCount + 1);
      }
    });

    // 🚀 OPTIMIZATION 3: Save conversation AND populate message at the EXACT SAME TIME!
    await Promise.all([
      newMessage.populate(populateQuery),
      conversation.save()
    ]);

    const messageData = newMessage.toObject();
    if (tempId) messageData.tempId = tempId;

    // Trigger push notifications
    try {
      const sendChatPushNotification = require("../utils/sendChatPushNotification");
      sendChatPushNotification({ conversation, senderDoc, messageDoc: newMessage }); // Fire and forget
    } catch (err) {
      console.error("❌ Failed to trigger chat push notification:", err.message);
    }

    // Socket Emissions (Instant)
    const io = req.app.get("io");
    if (io) {
      if (isReceiverBlocked) {
        io.to(`user:${senderIdStr}`).emit("new_message", messageData);
      } else {
        let broadcastTarget = io.to(`conv:${conversationId}`);
        conversation.participants.forEach((partId) => {
          broadcastTarget = broadcastTarget.to(`user:${partId.toString()}`);
        });
        broadcastTarget.emit("new_message", messageData);
      }

      conversation.participants.forEach((partId) => {
        const pStr = partId.toString();
        if (pStr === senderIdStr || !isReceiverBlocked) {
          io.to(`user:${pStr}`).emit("conversation_updated", {
            conversationId,
            lastMessage: messageData,
            updatedAt: conversation.lastMessageAt,
            unreadCount: conversation.unreadCounts ? (conversation.unreadCounts.get(pStr) || 0) : 0,
          });
          io.to(`user:${pStr}`).emit("new_message_notification", messageData);
        }
      });
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: messageData,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
});
// =========================================================
// 7️⃣ MEDIA / FILE UPLOAD ENDPOINTS (🚀 OPTIMIZED FOR FAST S3 UPLINK)
// =========================================================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided for upload" });
    }

    const folder = req.body.folder || "chat_media";
    let fileBuffer = req.file.buffer;
    let mimeType = req.file.mimetype;

    // Fallback: If mimetype is application/octet-stream, guess from file extension
    if ((mimeType === "application/octet-stream" || !mimeType) && req.file.originalname) {
      const nameLower = req.file.originalname.toLowerCase();
      if (nameLower.endsWith(".mp4") || nameLower.endsWith(".mov") || nameLower.endsWith(".avi") || nameLower.endsWith(".mkv") || nameLower.endsWith(".webm") || nameLower.endsWith(".3gp")) {
        mimeType = "video/mp4";
      } else if (nameLower.endsWith(".jpg") || nameLower.endsWith(".jpeg") || nameLower.endsWith(".png") || nameLower.endsWith(".webp") || nameLower.endsWith(".gif")) {
        mimeType = "image/jpeg";
      }
    }

    const processedFile = {
      originalname: req.file.originalname,
      mimetype: mimeType,
      buffer: fileBuffer
    };

    let uploadMainPromise = uploadToS3(processedFile, folder);
    let uploadThumbPromise = Promise.resolve("");

    if (mimeType.startsWith("video/")) {
      console.log("🎥 Generating video thumbnail on backend...");
      try {
        const thumbnailBuffer = await generateVideoThumbnail(req.file.buffer);
        const thumbFile = {
          originalname: `thumb-${req.file.originalname}.jpg`,
          mimetype: "image/jpeg",
          buffer: thumbnailBuffer
        };
        // Prepare thumb upload promise without awaiting immediately
        uploadThumbPromise = uploadToS3(thumbFile, folder);
      } catch (err) {
        console.warn("Video thumbnail generation failed:", err.message);
      }
    }

    // 🚀 OPTIMIZATION: Upload main file and thumbnail to S3 simultaneously in parallel
    const [uploadedFileUrl, uploadedThumbnailUrl] = await Promise.all([
      uploadMainPromise,
      uploadThumbPromise
    ]);

    res.status(200).json({
      success: true,
      message: "File uploaded successfully to S3",
      fileUrl: uploadedFileUrl,
      thumbnailUrl: uploadedThumbnailUrl || null,
      fileName: req.file.originalname,
      fileSize: fileBuffer.length,
      mimeType: mimeType,
    });
  } catch (error) {
    console.error("Error uploading chat file:", error);
    res.status(500).json({ success: false, message: "File upload failed" });
  }
});

router.post("/presigned-url", async (req, res) => {
  try {
    const { filename, fileType, folder = "chat_media" } = req.body;
    if (!filename || !fileType) {
      return res.status(400).json({ success: false, message: "filename and fileType are required" });
    }

    const presignedData = await generatePresignedUrl(filename, fileType, folder);

    res.status(200).json({
      success: true,
      ...presignedData,
    });
  } catch (error) {
    console.error("Error generating presigned URL for chat:", error);
    res.status(500).json({ success: false, message: "Failed to generate presigned upload URL" });
  }
});

// =========================================================
// 8️⃣ SOFT DELETE CONVERSATION & CLEAR HISTORY
// =========================================================
router.delete("/conversations/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, action = "for_me" } = req.body; // action: "for_me" | "for_everyone"

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: "Invalid conversation ID" });
    }

    // 🚀 OPTIMIZATION: Fetch user and conversation in parallel
    const [user, conversation] = await Promise.all([
      resolveUserDoc(userId),
      Conversation.findById(conversationId)
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    if (action === "for_everyone") {
      // Admin / Global Soft Delete
      if (conversation.isGroup) {
        const isAdmin = (conversation.groupAdmin && conversation.groupAdmin.toString() === user._id.toString()) ||
          (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === user._id.toString()));
        if (!isAdmin) {
          return res.status(403).json({ success: false, message: "Only group admins can delete the group for everyone" });
        }
      } else {
        const isParticipant = conversation.participants.some((id) => id.toString() === user._id.toString());
        if (!isParticipant) {
          return res.status(403).json({ success: false, message: "You are not a participant in this conversation" });
        }
      }
      conversation.isDeleted = true;
      await conversation.save();

      // Force all sockets in the conversation room to leave immediately
      const io = req.app.get("io");
      if (io) {
        const convRoom = `conv:${conversationId}`;
        io.in(convRoom).socketsLeave(convRoom);
        console.log(`🔌 Closed conversation room ${convRoom} for all users`);
      }

      return res.status(200).json({
        success: true,
        message: "Conversation deleted for everyone",
      });
    } else {
      // Soft Delete For Me
      if (!conversation.deletedFor.some((id) => id.toString() === user._id.toString())) {
        conversation.deletedFor.push(user._id);
      }
      if (!conversation.clearedAt) conversation.clearedAt = new Map();
      conversation.clearedAt.set(user._id.toString(), new Date());

      await conversation.save();

      return res.status(200).json({
        success: true,
        message: "Conversation deleted for you",
      });
    }
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ success: false, message: "Failed to delete conversation" });
  }
});

// =========================================================
// 9️⃣ SOFT DELETE SINGLE MESSAGE ("for_me" or "for_everyone")
// =========================================================
router.delete("/messages/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, action = "for_me" } = req.body;

    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ success: false, message: "Invalid message ID" });
    }

    // 🚀 OPTIMIZATION: Fetch user and message in parallel
    const [user, message] = await Promise.all([
      resolveUserDoc(userId),
      Message.findById(messageId)
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (action === "for_everyone") {
      if (message.sender.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only delete your own messages for everyone" });
      }
      message.isDeleted = true;
      message.text = "This message was deleted.";
      message.mediaUrl = "";
      message.thumbnailUrl = "";
      await message.save();

      const io = req.app.get("io");
      if (io) {
        io.to(`conv:${message.conversation}`).emit("message_deleted", {
          messageId: message._id,
          conversationId: message.conversation,
          deletedForEveryone: true
        });
      }

      return res.status(200).json({
        success: true,
        message: "Message deleted for everyone",
        data: message,
      });
    } else {
      if (!message.deletedFor.some((id) => id.toString() === user._id.toString())) {
        message.deletedFor.push(user._id);
        await message.save();
      }

      return res.status(200).json({
        success: true,
        message: "Message deleted for you",
      });
    }
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ success: false, message: "Failed to delete message" });
  }
});

// =========================================================
// 🔟 MARK CONVERSATION READ / SEEN
// =========================================================
router.put("/conversations/:conversationId/read", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: "Invalid conversation ID" });
    }

    const user = await resolveUserDoc(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userObjId = user._id;
    const userIdStr = userObjId.toString();

    // 🚀 OPTIMIZATION: Run Message bulk update and Conversation fetch simultaneously
    const [_, conversation] = await Promise.all([
      Message.updateMany(
        {
          conversation: conversationId,
          sender: { $ne: userObjId },
          seenBy: { $ne: userObjId },
        },
        {
          $addToSet: { seenBy: userObjId, deliveredTo: userObjId },
          $set: { status: "seen" },
        }
      ),
      Conversation.findById(conversationId)
    ]);

    if (conversation) {
      conversation.unreadCounts.set(userIdStr, 0);
      if (user.userid) {
        conversation.unreadCounts.set(user.userid.toString(), 0);
      }
      await conversation.save();

      // Emit real-time messages_seen socket event to sender and all participants
      const io = req.app.get("io");
      if (io) {
        const seenPayload = {
          conversationId,
          seenByUserId: userIdStr,
          seenByCustomUserId: user.userid || userIdStr,
          userId: userIdStr,
          customUserId: user.userid || userIdStr,
          readerId: userIdStr,
          status: "seen",
        };

        let broadcastTarget = io.to(`conv:${conversationId}`);
        conversation.participants.forEach((partId) => {
          broadcastTarget = broadcastTarget.to(`user:${partId.toString()}`);
        });
        broadcastTarget.emit("messages_seen", seenPayload);
      }
    }

    res.status(200).json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ success: false, message: "Failed to mark messages as read" });
  }
});

// =========================================================
// 1️⃣1️⃣ GROUP MANAGEMENT (Add/Remove members, Update Info)
// =========================================================
router.post("/conversations/:conversationId/participants", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { adminId, participantIds = [] } = req.body;

    // 🚀 OPTIMIZATION: Fetch conversation, admin, and all target participants simultaneously
    const [conversation, admin, pDocs] = await Promise.all([
      Conversation.findById(conversationId),
      resolveUserDoc(adminId),
      Promise.all(participantIds.map((pid) => resolveUserDoc(pid)))
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const isRequesterAdmin = admin && (conversation.groupAdmin.toString() === admin._id.toString() || (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === admin._id.toString())));
    if (!isRequesterAdmin) {
      return res.status(403).json({ success: false, message: "Only group admin can add participants" });
    }

    pDocs.forEach((pDoc) => {
      if (pDoc) {
        const pStr = pDoc._id.toString();
        if (!conversation.participants.some((id) => id.toString() === pStr)) {
          conversation.participants.push(pDoc._id);
          conversation.unreadCounts.set(pStr, 0);
          if (!conversation.joinedAt) conversation.joinedAt = new Map();
          conversation.joinedAt.set(pStr, new Date());
        }
        if (conversation.exitedUsers) {
          conversation.exitedUsers = conversation.exitedUsers.filter((id) => id.toString() !== pStr);
        }
        if (conversation.deletedFor) {
          conversation.deletedFor = conversation.deletedFor.filter((id) => id.toString() !== pStr);
        }
      }
    });

    await conversation.save();
    await conversation.populate([
      { path: "participants", select: "username name profilePicture isConnected userid lastConnectedAt" },
      { path: "groupAdmin", select: "username name profilePicture userid" },
      { path: "groupCoAdmins", select: "username name profilePicture userid" }
    ]);

    res.status(200).json({
      success: true,
      message: "Participants added successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error adding group participants:", error);
    res.status(500).json({ success: false, message: "Failed to add participants" });
  }
});

router.delete("/conversations/:conversationId/participants/:participantId", async (req, res) => {
  try {
    const { conversationId, participantId } = req.params;
    const { requesterId } = req.body;

    // 🚀 OPTIMIZATION: Concurrent fetching
    const [conversation, requester, target] = await Promise.all([
      Conversation.findById(conversationId),
      resolveUserDoc(requesterId),
      resolveUserDoc(participantId)
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    if (!requester || !target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isSelfRemove = requester._id.toString() === target._id.toString();
    const isAdmin = conversation.groupAdmin.toString() === requester._id.toString() ||
      (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === requester._id.toString()));

    if (!isSelfRemove && !isAdmin) {
      return res.status(403).json({ success: false, message: "Only admin or member themselves can remove participant" });
    }

    const targetStr = target._id.toString();

    conversation.participants = conversation.participants.filter(
      (id) => id.toString() !== targetStr
    );

    if (conversation.groupCoAdmins) {
      conversation.groupCoAdmins = conversation.groupCoAdmins.filter(
        (id) => id.toString() !== targetStr
      );
    }

    if (!conversation.exitedUsers) {
      conversation.exitedUsers = [];
    }
    if (!conversation.exitedUsers.some((id) => id.toString() === targetStr)) {
      conversation.exitedUsers.push(target._id);
    }

    await conversation.save();
    await conversation.populate([
      { path: "participants", select: "username name profilePicture isConnected userid lastConnectedAt" },
      { path: "groupAdmin", select: "username name profilePicture userid" },
      { path: "groupCoAdmins", select: "username name profilePicture userid" }
    ]);

    const io = req.app.get("io");
    if (io) {
      const targetRoom = `user:${targetStr}`;
      const convRoom = `conv:${conversationId}`;
      io.in(targetRoom).socketsLeave(convRoom);
      console.log(`🔌 Forced user ${targetStr} sockets to leave room ${convRoom}`);
    }

    res.status(200).json({
      success: true,
      message: "Participant removed successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error removing group participant:", error);
    res.status(500).json({ success: false, message: "Failed to remove participant" });
  }
});

router.put("/conversations/:conversationId/group-info", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { requesterId, groupName, groupAvatar, groupDescription } = req.body;

    // 🚀 OPTIMIZATION: Parallel fetching
    const [conversation, requester] = await Promise.all([
      Conversation.findById(conversationId),
      resolveUserDoc(requesterId)
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    if (!requester) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isRequesterAdmin = conversation.groupAdmin.toString() === requester._id.toString() ||
      (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === requester._id.toString()));
    if (!isRequesterAdmin) {
      return res.status(403).json({ success: false, message: "Only group admins can update group info" });
    }

    if (groupAvatar !== undefined) conversation.groupAvatar = groupAvatar;
    if (groupName !== undefined) conversation.groupName = groupName;
    if (groupDescription !== undefined) conversation.groupDescription = groupDescription;

    await conversation.save();
    await conversation.populate([
      { path: "participants", select: "username name profilePicture isConnected userid lastConnectedAt" },
      { path: "groupAdmin", select: "username name profilePicture userid" },
      { path: "groupCoAdmins", select: "username name profilePicture userid" }
    ]);

    res.status(200).json({
      success: true,
      message: "Group info updated successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error updating group info:", error);
    res.status(500).json({ success: false, message: "Failed to update group info" });
  }
});

// =========================================================
// 1️⃣2️⃣ GROUP INVITE LINK ROUTES
// =========================================================

router.post("/conversations/:conversationId/invite-link", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { adminId } = req.body;

    // 🚀 OPTIMIZATION: Concurrent fetching
    const [conversation, admin] = await Promise.all([
      Conversation.findById(conversationId),
      resolveUserDoc(adminId)
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    if (!admin) {
      return res.status(403).json({ success: false, message: "Only group admin can manage invite links" });
    }

    if (!conversation.groupAdmin && conversation.participants.length > 0) {
      conversation.groupAdmin = conversation.participants[0];
      await conversation.save();
    }

    const isRequesterAdmin = conversation.groupAdmin.toString() === admin._id.toString() ||
      (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === admin._id.toString()));
    if (!isRequesterAdmin) {
      return res.status(403).json({ success: false, message: "Only group admin can manage invite links" });
    }

    if (!conversation.inviteCode) {
      const { v4: uuidv4 } = require("uuid");
      conversation.inviteCode = uuidv4().replace(/-/g, "").substring(0, 16);
      await conversation.save();
    }

    res.status(200).json({
      success: true,
      inviteCode: conversation.inviteCode,
    });
  } catch (error) {
    console.error("Error managing invite link:", error);
    res.status(500).json({ success: false, message: "Failed to manage invite link" });
  }
});

router.delete("/conversations/:conversationId/invite-link", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { adminId } = req.body;

    const [conversation, admin] = await Promise.all([
      Conversation.findById(conversationId),
      resolveUserDoc(adminId)
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const isRequesterAdmin = admin && (conversation.groupAdmin && (conversation.groupAdmin.toString() === admin._id.toString() || (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === admin._id.toString()))));
    if (!isRequesterAdmin) {
      return res.status(403).json({ success: false, message: "Only group admin can revoke invite links" });
    }

    conversation.inviteCode = "";
    await conversation.save();

    res.status(200).json({
      success: true,
      message: "Invite link revoked successfully",
    });
  } catch (error) {
    console.error("Error revoking invite link:", error);
    res.status(500).json({ success: false, message: "Failed to revoke invite link" });
  }
});

router.get("/groups/invite/:inviteCode", async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { userId } = req.query;

    if (!inviteCode) {
      return res.status(400).json({ success: false, message: "Invite code is required" });
    }

    // 🚀 OPTIMIZATION: Fetch conversation and user simultaneously
    const [conversation, user] = await Promise.all([
      Conversation.findOne({ inviteCode }).populate("participants", "username name profilePicture isConnected userid lastConnectedAt"),
      userId ? resolveUserDoc(userId) : null
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Invite link is invalid or has been revoked" });
    }

    let isAlreadyMember = false;
    if (user) {
      isAlreadyMember = conversation.participants.some((p) => p._id.toString() === user._id.toString());
    }

    res.status(200).json({
      success: true,
      groupName: conversation.groupName,
      groupAvatar: conversation.groupAvatar,
      memberCount: conversation.participants.length,
      isAlreadyMember,
      participants: conversation.participants,
    });
  } catch (error) {
    console.error("Error fetching invite details:", error);
    res.status(500).json({ success: false, message: "Failed to fetch invite details" });
  }
});

router.post("/groups/invite/:inviteCode/join", async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { userId } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ success: false, message: "Invite code is required" });
    }

    // 🚀 OPTIMIZATION: Parallel lookup
    const [conversation, user] = await Promise.all([
      Conversation.findOne({ inviteCode }),
      resolveUserDoc(userId)
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Invite link is invalid or has been revoked" });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userIdStr = user._id.toString();
    const isAlreadyMember = conversation.participants.some((id) => id.toString() === userIdStr);

    if (isAlreadyMember) {
      return res.status(200).json({
        success: true,
        message: "Already a member of the group",
        conversation,
      });
    }

    conversation.participants.push(user._id);
    conversation.unreadCounts.set(userIdStr, 0);
    if (!conversation.joinedAt) conversation.joinedAt = new Map();
    conversation.joinedAt.set(userIdStr, new Date());

    if (conversation.exitedUsers) {
      conversation.exitedUsers = conversation.exitedUsers.filter((id) => id.toString() !== userIdStr);
    }
    if (conversation.deletedFor) {
      conversation.deletedFor = conversation.deletedFor.filter((id) => id.toString() !== userIdStr);
    }

    await conversation.save();
    await conversation.populate([
      { path: "participants", select: "username name profilePicture isConnected userid lastConnectedAt" },
      { path: "groupAdmin", select: "username name profilePicture userid" },
      { path: "groupCoAdmins", select: "username name profilePicture userid" }
    ]);

    res.status(200).json({
      success: true,
      message: "Joined group successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error joining group:", error);
    res.status(500).json({ success: false, message: "Failed to join group" });
  }
});

// =========================================================
// 1️⃣3️⃣ BLOCK STATUS & CO-ADMIN MANAGEMENT
// =========================================================

router.get("/conversations/block-status/:otherUserId", async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { currentUserId } = req.query;

    if (!currentUserId || !otherUserId) {
      return res.status(400).json({ success: false, message: "Missing currentUserId or otherUserId" });
    }

    // 🚀 OPTIMIZATION: Fetch both users simultaneously
    const [currentUser, otherUser] = await Promise.all([
      resolveUserDoc(currentUserId),
      resolveUserDoc(otherUserId)
    ]);

    if (!currentUser || !otherUser) {
      return res.status(200).json({
        success: true,
        isThemBlockedByMe: false,
        isMeBlockedByThem: false,
        isBlocked: false,
      });
    }

    const isThemBlockedByMe = currentUser.blockedUsers?.some(
      (id) => id.toString() === otherUser._id.toString()
    ) || false;

    const isMeBlockedByThem = otherUser.blockedUsers?.some(
      (id) => id.toString() === currentUser._id.toString()
    ) || false;

    res.status(200).json({
      success: true,
      isThemBlockedByMe,
      isMeBlockedByThem,
      isBlocked: isThemBlockedByMe || isMeBlockedByThem,
    });
  } catch (error) {
    console.error("Error checking block status:", error);
    res.status(500).json({ success: false, message: "Failed to check block status" });
  }
});

router.post("/conversations/:conversationId/co-admins", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { requesterId, targetId } = req.body;

    // 🚀 OPTIMIZATION: Parallel execution
    const [conversation, requester, target] = await Promise.all([
      Conversation.findById(conversationId),
      resolveUserDoc(requesterId),
      resolveUserDoc(targetId)
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    if (!requester || conversation.groupAdmin.toString() !== requester._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the primary group admin can assign co-admins" });
    }

    if (!target) {
      return res.status(404).json({ success: false, message: "Target user not found" });
    }

    const targetStr = target._id.toString();

    if (!conversation.participants.some(id => id.toString() === targetStr)) {
      return res.status(400).json({ success: false, message: "Target user is not a participant in this group" });
    }

    if (!conversation.groupCoAdmins) {
      conversation.groupCoAdmins = [];
    }

    if (!conversation.groupCoAdmins.some(id => id.toString() === targetStr)) {
      conversation.groupCoAdmins.push(target._id);
      await conversation.save();
    }

    await conversation.populate([
      { path: "participants", select: "username name profilePicture isConnected userid lastConnectedAt" },
      { path: "groupAdmin", select: "username name profilePicture userid" },
      { path: "groupCoAdmins", select: "username name profilePicture userid" }
    ]);

    res.status(200).json({
      success: true,
      message: "User promoted to co-admin successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error promoting to co-admin:", error);
    res.status(500).json({ success: false, message: "Failed to promote user to co-admin" });
  }
});

router.delete("/conversations/:conversationId/co-admins/:targetId", async (req, res) => {
  try {
    const { conversationId, targetId } = req.params;
    const { requesterId } = req.body;

    // 🚀 OPTIMIZATION: Parallel execution
    const [conversation, requester, target] = await Promise.all([
      Conversation.findById(conversationId),
      resolveUserDoc(requesterId),
      resolveUserDoc(targetId)
    ]);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    if (!requester || conversation.groupAdmin.toString() !== requester._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the primary group admin can remove co-admins" });
    }

    if (!target) {
      return res.status(404).json({ success: false, message: "Target user not found" });
    }

    const targetStr = target._id.toString();

    if (conversation.groupCoAdmins) {
      conversation.groupCoAdmins = conversation.groupCoAdmins.filter(id => id.toString() !== targetStr);
      await conversation.save();
    }

    await conversation.populate([
      { path: "participants", select: "username name profilePicture isConnected userid lastConnectedAt" },
      { path: "groupAdmin", select: "username name profilePicture userid" },
      { path: "groupCoAdmins", select: "username name profilePicture userid" }
    ]);

    res.status(200).json({
      success: true,
      message: "User demoted from co-admin successfully",
      conversation,
    });
  } catch (error) {
    console.error("Error demoting co-admin:", error);
    res.status(500).json({ success: false, message: "Failed to demote user" });
  }
});

module.exports = router;