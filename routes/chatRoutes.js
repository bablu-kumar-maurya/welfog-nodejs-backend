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

    const user1 = await resolveUserDoc(userId);
    const user2 = await resolveUserDoc(targetUserId);

    if (!user1 || !user2) {
      return res.status(404).json({ success: false, message: "One or both users not found" });
    }

    // Check if 1-to-1 conversation already exists
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [user1._id, user2._id] },
    })
      .populate("participants", "username name profilePicture isConnected userid lastConnectedAt")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username name profilePicture userid" },
      });

    if (conversation) {
      // Re-activate conversation if soft-deleted for user
      let updated = false;
      if (conversation.isDeleted) {
        conversation.isDeleted = false;
        updated = true;
      }
      if (conversation.deletedFor && conversation.deletedFor.some((id) => id.toString() === user1._id.toString())) {
        conversation.deletedFor = conversation.deletedFor.filter((id) => id.toString() !== user1._id.toString());
        updated = true;
      }
      if (updated) {
        await conversation.save();
      }

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

    // Resolve all participant ObjectIds
    const participantObjectIds = [creator._id];
    for (const pid of participantIds) {
      const pDoc = await resolveUserDoc(pid);
      if (pDoc && !participantObjectIds.some((id) => id.toString() === pDoc._id.toString())) {
        participantObjectIds.push(pDoc._id);
      }
    }

    if (participantObjectIds.length < 2) {
      return res.status(400).json({ success: false, message: "Group chat requires at least 2 participants" });
    }

    const initialUnread = {};
    participantObjectIds.forEach((id) => {
      initialUnread[id.toString()] = 0;
    });

    const conversation = new Conversation({
      isGroup: true,
      groupName,
      groupAvatar,
      groupDescription,
      groupAdmin: creator._id,
      participants: participantObjectIds,
      unreadCounts: initialUnread,
    });

    await conversation.save();

    await conversation.populate("participants", "username name profilePicture isConnected userid");
    await conversation.populate("groupAdmin", "username name profilePicture userid");

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

async function resolveConversationLastMessage(conv, userId) {
  if (!conv || !userId) return conv;
  const user = await resolveUserDoc(userId);
  if (!user) return conv;

  if (conv.lastMessage && conv.lastMessage.deletedFor) {
    const isDeleted = conv.lastMessage.deletedFor.some(
      (id) => id.toString() === user._id.toString()
    );
    if (isDeleted) {
      const Message = require("../models/Message");
      const actualLastMessage = await Message.findOne({
        conversation: conv._id,
        deletedFor: { $ne: user._id }
      })
      .sort({ createdAt: -1 })
      .populate("sender", "username name profilePicture userid")
      .lean();
      conv.lastMessage = actualLastMessage;
    }
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
      $or: [
        { participants: user._id },
        { exitedUsers: user._id }
      ],
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

    const formatted = await Promise.all(conversations.map(async (conv) => {
      const unread = conv.unreadCounts ? conv.unreadCounts[user._id.toString()] || 0 : 0;

      let isOtherOnline = false;
      if (!conv.isGroup) {
        const otherParticipant = conv.participants.find((p) => p._id.toString() !== user._id.toString());
        if (otherParticipant) {
          isOtherOnline = isUserOnline(otherParticipant._id.toString());
        }
      }

      const resolvedConv = await resolveConversationLastMessage(conv, user._id);

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

    const conversation = await Conversation.findById(conversationId)
      .populate("participants", "username name profilePicture isConnected userid lastConnectedAt")
      .populate("groupAdmin", "username name profilePicture userid")
      .populate("groupCoAdmins", "username name profilePicture userid")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username name profilePicture userid" },
      })
      .lean();

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    let resolvedConversation = conversation;
    if (userId) {
      const user = await resolveUserDoc(userId);
      if (user) {
        const unread = conversation.unreadCounts ? conversation.unreadCounts[user._id.toString()] || 0 : 0;
        conversation.unreadCount = unread;
        resolvedConversation = await resolveConversationLastMessage(conversation, user._id);
      }
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

    const query = {
      conversation: conversationId,
    };

    if (userId) {
      const user = await resolveUserDoc(userId);
      if (user) {
        query.deletedFor = { $ne: user._id };

        const conv = await Conversation.findById(conversationId).select("clearedAt").lean();
        if (conv && conv.clearedAt && conv.clearedAt[user._id.toString()]) {
          query.createdAt = { $gte: conv.clearedAt[user._id.toString()] };
        }
      }
    }

    const totalMessages = await Message.countDocuments(query);

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("sender", "username name profilePicture userid")
      .populate({
        path: "replyTo",
        select: "text type sender mediaUrl fileName",
        populate: { path: "sender", select: "username name" },
      })
      .lean();

    // Reverse to show in chronological order for frontend
    const chronologicalMessages = messages.reverse();

    res.status(200).json({
      success: true,
      messages: chronologicalMessages,
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
// 6️⃣ SEND MESSAGE (REST API Endpoint)
// =========================================================
router.post("/conversations/:conversationId/messages", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      senderId,
      type = "text",
      text = "",
      mediaUrl = "",
      thumbnailUrl = "",
      fileName = "",
      fileSize = 0,
      mimeType = "",
      replyTo = null,
      sharedReel = null,
      sharedProduct = null,
      tempId = null,
    } = req.body;

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ success: false, message: "Invalid conversation ID" });
    }

    if (!senderId) {
      return res.status(400).json({ success: false, message: "senderId is required" });
    }

    const senderDoc = await resolveUserDoc(senderId);
    if (!senderDoc) {
      return res.status(404).json({ success: false, message: "Sender user not found" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    // Bidirectional Block Check for 1-to-1 chats
    let isReceiverBlocked = false;
    let otherUserId = null;
    if (!conversation.isGroup && conversation.participants.length === 2) {
      otherUserId = conversation.participants.find(
        (p) => p.toString() !== senderDoc._id.toString()
      );
      if (otherUserId) {
        const otherDoc = await User.findById(otherUserId).select("blockedUsers").lean();
        const senderBlockedOther = senderDoc.blockedUsers?.some(
          (id) => id.toString() === otherDoc?._id?.toString()
        );
        const otherBlockedSender = otherDoc?.blockedUsers?.some(
          (id) => id.toString() === senderDoc._id.toString()
        );

        if (senderBlockedOther) {
          return res.status(403).json({ success: false, message: "Messaging is blocked between these users" });
        }
        if (otherBlockedSender) {
          isReceiverBlocked = true;
        }
      }
    }

    // Determine initial online delivered list
    const deliveredTo = [];
    conversation.participants.forEach((partId) => {
      const partStr = partId.toString();
      if (partStr !== senderDoc._id.toString() && isUserOnline(partStr)) {
        if (!isReceiverBlocked) {
          deliveredTo.push(partId);
        }
      }
    });

    const initialStatus = deliveredTo.length > 0 ? "delivered" : "sent";

    const newMessage = new Message({
      conversation: conversationId,
      sender: senderDoc._id,
      type,
      text,
      mediaUrl,
      thumbnailUrl,
      fileName,
      fileSize,
      mimeType,
      replyTo: replyTo && mongoose.isValidObjectId(replyTo) ? replyTo : null,
      sharedReel: sharedReel || null,
      sharedProduct: sharedProduct || null,
      status: initialStatus,
      deliveredTo,
      seenBy: [],
      deletedFor: isReceiverBlocked ? [otherUserId] : [],
    });

    await newMessage.save();

    await newMessage.populate("sender", "username name profilePicture userid");
    if (newMessage.replyTo) {
      await newMessage.populate({
        path: "replyTo",
        select: "text type sender mediaUrl fileName",
        populate: { path: "sender", select: "username name profilePicture userid" }
      });
    }

    // Update conversation's last message
    conversation.lastMessage = newMessage._id;
    conversation.lastMessageAt = new Date();
    conversation.isDeleted = false;
    conversation.deletedFor = [];

    // Increment unread count for non-senders
    conversation.participants.forEach((partId) => {
      const partStr = partId.toString();
      if (partStr !== senderDoc._id.toString()) {
        if (!isReceiverBlocked) {
          const currentCount = conversation.unreadCounts.get(partStr) || 0;
          conversation.unreadCounts.set(partStr, currentCount + 1);
        }
      }
    });

    await conversation.save();

    const messageData = newMessage.toObject();
    if (tempId) messageData.tempId = tempId;

    const io = req.app.get("io");
    if (io) {
      // Broadcast to conversation room or only to the sender if blocked
      if (isReceiverBlocked) {
        io.to(`user:${senderDoc._id.toString()}`).emit("new_message", messageData);
      } else {
        io.to(`conv:${conversationId}`).emit("new_message", messageData);
      }

      // Broadcast to participants' personal user rooms (multi-device)
      conversation.participants.forEach((partId) => {
        const pStr = partId.toString();
        if (pStr === senderDoc._id.toString() || !isReceiverBlocked) {
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
// 7️⃣ MEDIA / FILE UPLOAD ENDPOINTS
// =========================================================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided for upload" });
    }

    const folder = req.body.folder || "chat_media";
    let fileBuffer = req.file.buffer;
    let uploadedThumbnailUrl = "";
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

    if (mimeType.startsWith("video/")) {
      console.log("🎥 Generating video thumbnail on backend...");
      try {
        const thumbnailBuffer = await generateVideoThumbnail(req.file.buffer);
        
        // Upload thumbnail
        const thumbFile = {
          originalname: `thumb-${req.file.originalname}.jpg`,
          mimetype: "image/jpeg",
          buffer: thumbnailBuffer
        };
        uploadedThumbnailUrl = await uploadToS3(thumbFile, folder);
      } catch (err) {
        console.warn("Video thumbnail generation failed:", err.message);
      }
    }

    const processedFile = {
      originalname: req.file.originalname,
      mimetype: mimeType,
      buffer: fileBuffer
    };

    const uploadedFileUrl = await uploadToS3(processedFile, folder);

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

    const user = await resolveUserDoc(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    if (action === "for_everyone") {
      // Admin / Global Soft Delete
      conversation.isDeleted = true;
      await conversation.save();

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
    const { userId, action = "for_me" } = req.body; // action: "for_me" | "for_everyone"

    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ success: false, message: "Invalid message ID" });
    }

    const user = await resolveUserDoc(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const message = await Message.findById(messageId);
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

      // Emit real-time update to Socket.IO conversation room
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

    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: user._id },
        seenBy: { $ne: user._id },
      },
      {
        $addToSet: { seenBy: user._id, deliveredTo: user._id },
        $set: { status: "seen" },
      }
    );

    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.unreadCounts.set(user._id.toString(), 0);
      if (user.userid) {
        conversation.unreadCounts.set(user.userid.toString(), 0);
      }
      await conversation.save();
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

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const admin = await resolveUserDoc(adminId);
    const isRequesterAdmin = admin && (conversation.groupAdmin.toString() === admin._id.toString() || (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === admin._id.toString())));
    if (!isRequesterAdmin) {
      return res.status(403).json({ success: false, message: "Only group admin can add participants" });
    }

    for (const pid of participantIds) {
      const pDoc = await resolveUserDoc(pid);
      if (pDoc) {
        if (!conversation.participants.some((id) => id.toString() === pDoc._id.toString())) {
          conversation.participants.push(pDoc._id);
          conversation.unreadCounts.set(pDoc._id.toString(), 0);
        }
        if (conversation.exitedUsers) {
          conversation.exitedUsers = conversation.exitedUsers.filter((id) => id.toString() !== pDoc._id.toString());
        }
        if (conversation.deletedFor) {
          conversation.deletedFor = conversation.deletedFor.filter((id) => id.toString() !== pDoc._id.toString());
        }
      }
    }

    await conversation.save();
    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");

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

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const requester = await resolveUserDoc(requesterId);
    const target = await resolveUserDoc(participantId);

    if (!requester || !target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isSelfRemove = requester._id.toString() === target._id.toString();
    const isAdmin = conversation.groupAdmin.toString() === requester._id.toString() ||
                    (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === requester._id.toString()));

    if (!isSelfRemove && !isAdmin) {
      return res.status(403).json({ success: false, message: "Only admin or member themselves can remove participant" });
    }

    conversation.participants = conversation.participants.filter(
      (id) => id.toString() !== target._id.toString()
    );

    if (conversation.groupCoAdmins) {
      conversation.groupCoAdmins = conversation.groupCoAdmins.filter(
        (id) => id.toString() !== target._id.toString()
      );
    }

    if (!conversation.exitedUsers) {
      conversation.exitedUsers = [];
    }
    if (!conversation.exitedUsers.some((id) => id.toString() === target._id.toString())) {
      conversation.exitedUsers.push(target._id);
    }

    await conversation.save();
    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");

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

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const requester = await resolveUserDoc(requesterId);
    if (!requester) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const isRequesterAdmin = conversation.groupAdmin.toString() === requester._id.toString() ||
                             (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === requester._id.toString()));
    if (!isRequesterAdmin) {
      return res.status(403).json({ success: false, message: "Only group admins can update group info" });
    }

    if (groupAvatar !== undefined) {
      conversation.groupAvatar = groupAvatar;
    }

    if (groupName !== undefined) conversation.groupName = groupName;
    if (groupDescription !== undefined) conversation.groupDescription = groupDescription;

    await conversation.save();
    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");

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
// 9️⃣ GROUP INVITE LINK ROUTES
// =========================================================

// Generate or get S3/Group invite link
router.post("/conversations/:conversationId/invite-link", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { adminId } = req.body;
    console.log(`✉️ [InviteLink] Req conversationId: ${conversationId}, adminId: ${adminId}`);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      console.log(`❌ [InviteLink] Conversation not found: ${conversationId}`);
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }
    if (!conversation.isGroup) {
      console.log(`❌ [InviteLink] Conversation is not a group: ${conversationId}`);
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const admin = await resolveUserDoc(adminId);
    if (!admin) {
      console.log(`❌ [InviteLink] Admin user not resolved for adminId: ${adminId}`);
      return res.status(403).json({ success: false, message: "Only group admin can manage invite links" });
    }

    // Auto-repair groupAdmin if not set
    if (!conversation.groupAdmin && conversation.participants.length > 0) {
      console.log(`⚠️ [InviteLink] groupAdmin is missing. Setting to first participant: ${conversation.participants[0]}`);
      conversation.groupAdmin = conversation.participants[0];
      await conversation.save();
    }

    console.log(`✉️ [InviteLink] GroupAdmin: ${conversation.groupAdmin}, Admin: ${admin._id}`);

    const isRequesterAdmin = admin && (conversation.groupAdmin.toString() === admin._id.toString() || (conversation.groupCoAdmins && conversation.groupCoAdmins.some((id) => id.toString() === admin._id.toString())));
    if (!isRequesterAdmin) {
      console.log(`❌ [InviteLink] Requester ${admin._id} is not an admin`);
      return res.status(403).json({ success: false, message: "Only group admin can manage invite links" });
    }

    // If inviteCode doesn't exist, generate a new one
    if (!conversation.inviteCode) {
      const { v4: uuidv4 } = require("uuid");
      conversation.inviteCode = uuidv4().replace(/-/g, "").substring(0, 16);
      await conversation.save();
      console.log(`✅ [InviteLink] Generated new code: ${conversation.inviteCode}`);
    } else {
      console.log(`✅ [InviteLink] Existing code: ${conversation.inviteCode}`);
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

// Revoke/Delete invite link
router.delete("/conversations/:conversationId/invite-link", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { adminId } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const admin = await resolveUserDoc(adminId);
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

// Resolve S3/Group invite code details
router.get("/groups/invite/:inviteCode", async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { userId } = req.query;

    if (!inviteCode) {
      return res.status(400).json({ success: false, message: "Invite code is required" });
    }

    const conversation = await Conversation.findOne({ inviteCode });
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Invite link is invalid or has been revoked" });
    }

    let isAlreadyMember = false;
    if (userId) {
      const user = await resolveUserDoc(userId);
      if (user) {
        isAlreadyMember = conversation.participants.some((id) => id.toString() === user._id.toString());
      }
    }

    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");

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

// Join group via S3/Group invite code
router.post("/groups/invite/:inviteCode/join", async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { userId } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ success: false, message: "Invite code is required" });
    }

    const conversation = await Conversation.findOne({ inviteCode });
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Invite link is invalid or has been revoked" });
    }

    const user = await resolveUserDoc(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isAlreadyMember = conversation.participants.some((id) => id.toString() === user._id.toString());
    if (isAlreadyMember) {
      return res.status(200).json({
        success: true,
        message: "Already a member of the group",
        conversation,
      });
    }

    // Add user to participants
    conversation.participants.push(user._id);
    conversation.unreadCounts.set(user._id.toString(), 0);

    if (conversation.exitedUsers) {
      conversation.exitedUsers = conversation.exitedUsers.filter((id) => id.toString() !== user._id.toString());
    }
    if (conversation.deletedFor) {
      conversation.deletedFor = conversation.deletedFor.filter((id) => id.toString() !== user._id.toString());
    }

    await conversation.save();

    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");

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

// Get bidirectional block status between two users
router.get("/conversations/block-status/:otherUserId", async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { currentUserId } = req.query;

    if (!currentUserId || !otherUserId) {
      return res.status(400).json({ success: false, message: "Missing currentUserId or otherUserId" });
    }

    const currentUser = await resolveUserDoc(currentUserId);
    const otherUser = await resolveUserDoc(otherUserId);

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

// Promote participant to Co-Admin
router.post("/conversations/:conversationId/co-admins", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { requesterId, targetId } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const requester = await resolveUserDoc(requesterId);
    if (!requester || conversation.groupAdmin.toString() !== requester._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the primary group admin can assign co-admins" });
    }

    const target = await resolveUserDoc(targetId);
    if (!target) {
      return res.status(404).json({ success: false, message: "Target user not found" });
    }

    if (!conversation.participants.some(id => id.toString() === target._id.toString())) {
      return res.status(400).json({ success: false, message: "Target user is not a participant in this group" });
    }

    if (!conversation.groupCoAdmins) {
      conversation.groupCoAdmins = [];
    }

    if (!conversation.groupCoAdmins.some(id => id.toString() === target._id.toString())) {
      conversation.groupCoAdmins.push(target._id);
      await conversation.save();
    }

    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");
    await conversation.populate("groupCoAdmins", "username name profilePicture userid");

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

// Demote participant from Co-Admin
router.delete("/conversations/:conversationId/co-admins/:targetId", async (req, res) => {
  try {
    const { conversationId, targetId } = req.params;
    const { requesterId } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ success: false, message: "Group conversation not found" });
    }

    const requester = await resolveUserDoc(requesterId);
    if (!requester || conversation.groupAdmin.toString() !== requester._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the primary group admin can remove co-admins" });
    }

    const target = await resolveUserDoc(targetId);
    if (!target) {
      return res.status(404).json({ success: false, message: "Target user not found" });
    }

    if (conversation.groupCoAdmins) {
      conversation.groupCoAdmins = conversation.groupCoAdmins.filter(id => id.toString() !== target._id.toString());
      await conversation.save();
    }

    await conversation.populate("participants", "username name profilePicture isConnected userid lastConnectedAt");
    await conversation.populate("groupCoAdmins", "username name profilePicture userid");

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
