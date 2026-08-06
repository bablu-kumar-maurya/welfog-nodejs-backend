const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/Users");
const { uploadToS3, generatePresignedUrl } = require("../lib/s3");
const { isUserOnline } = require("../sockets/chatSocket");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// Helper to helper-resolve user (either _id ObjectId or userid string)
async function resolveUserDoc(idOrUserId) {
  if (!idOrUserId) return null;
  if (mongoose.isValidObjectId(idOrUserId)) {
    const user = await User.findById(idOrUserId).select("_id username name profilePicture isConnected userid").lean();
    if (user) return user;
  }
  return await User.findOne({ userid: idOrUserId }).select("_id username name profilePicture isConnected userid").lean();
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
      .populate("participants", "username name profilePicture isConnected userid")
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

    await conversation.populate("participants", "username name profilePicture isConnected userid");

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
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate("participants", "username name profilePicture isConnected userid")
      .populate("groupAdmin", "username name profilePicture userid")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username name profilePicture userid" },
      })
      .lean();

    const formatted = conversations.map((conv) => {
      const unread = conv.unreadCounts ? conv.unreadCounts[user._id.toString()] || 0 : 0;

      let isOtherOnline = false;
      if (!conv.isGroup) {
        const otherParticipant = conv.participants.find((p) => p._id.toString() !== user._id.toString());
        if (otherParticipant) {
          isOtherOnline = isUserOnline(otherParticipant._id.toString());
        }
      }

      return {
        ...conv,
        unreadCount: unread,
        isOtherOnline,
      };
    });

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
      .populate("participants", "username name profilePicture isConnected userid")
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

    if (userId) {
      const user = await resolveUserDoc(userId);
      if (user) {
        const unread = conversation.unreadCounts ? conversation.unreadCounts[user._id.toString()] || 0 : 0;
        conversation.unreadCount = unread;
      }
    }

    res.status(200).json({
      success: true,
      conversation,
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
      isDeleted: { $ne: true },
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
      fileName = "",
      fileSize = 0,
      mimeType = "",
      replyTo = null,
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

    // Determine initial online delivered list
    const deliveredTo = [];
    conversation.participants.forEach((partId) => {
      const partStr = partId.toString();
      if (partStr !== senderDoc._id.toString() && isUserOnline(partStr)) {
        deliveredTo.push(partId);
      }
    });

    const initialStatus = deliveredTo.length > 0 ? "delivered" : "sent";

    const newMessage = new Message({
      conversation: conversationId,
      sender: senderDoc._id,
      type,
      text,
      mediaUrl,
      fileName,
      fileSize,
      mimeType,
      replyTo: replyTo && mongoose.isValidObjectId(replyTo) ? replyTo : null,
      status: initialStatus,
      deliveredTo,
      seenBy: [],
    });

    await newMessage.save();

    await newMessage.populate("sender", "username name profilePicture userid");
    if (newMessage.replyTo) {
      await newMessage.populate("replyTo", "text type sender mediaUrl");
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
        const currentCount = conversation.unreadCounts.get(partStr) || 0;
        conversation.unreadCounts.set(partStr, currentCount + 1);
      }
    });

    await conversation.save();

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: newMessage,
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
    const uploadedFileUrl = await uploadToS3(req.file, folder);

    res.status(200).json({
      success: true,
      message: "File uploaded successfully to S3",
      fileUrl: uploadedFileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
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
      await message.save();

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
    if (!admin || conversation.groupAdmin.toString() !== admin._id.toString()) {
      return res.status(403).json({ success: false, message: "Only group admin can add participants" });
    }

    for (const pid of participantIds) {
      const pDoc = await resolveUserDoc(pid);
      if (pDoc && !conversation.participants.some((id) => id.toString() === pDoc._id.toString())) {
        conversation.participants.push(pDoc._id);
        conversation.unreadCounts.set(pDoc._id.toString(), 0);
      }
    }

    await conversation.save();
    await conversation.populate("participants", "username name profilePicture isConnected userid");

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
    const isAdmin = conversation.groupAdmin.toString() === requester._id.toString();

    if (!isSelfRemove && !isAdmin) {
      return res.status(403).json({ success: false, message: "Only admin or member themselves can remove participant" });
    }

    conversation.participants = conversation.participants.filter(
      (id) => id.toString() !== target._id.toString()
    );

    await conversation.save();
    await conversation.populate("participants", "username name profilePicture isConnected userid");

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
    if (!requester || !conversation.participants.some((id) => id.toString() === requester._id.toString())) {
      return res.status(403).json({ success: false, message: "Only group members can update group info" });
    }

    if (groupName !== undefined) conversation.groupName = groupName;
    if (groupAvatar !== undefined) conversation.groupAvatar = groupAvatar;
    if (groupDescription !== undefined) conversation.groupDescription = groupDescription;

    await conversation.save();
    await conversation.populate("participants", "username name profilePicture isConnected userid");

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

module.exports = router;
