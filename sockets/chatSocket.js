const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/Users");

// Map of userId string -> Set of socketIds (supports multi-device per user)
const userSocketsMap = new Map();

async function resolveUserDoc(idOrUserId) {
  if (!idOrUserId) return null;
  if (mongoose.isValidObjectId(idOrUserId)) {
    const user = await User.findById(idOrUserId).select("_id username name profilePicture isConnected userid").lean();
    if (user) return user;
  }
  return await User.findOne({ userid: idOrUserId }).select("_id username name profilePicture isConnected userid").lean();
}

/**
 * Returns whether a user is currently online (has 1 or more active socket connections)
 */
function isUserOnline(userId) {
  const sockets = userSocketsMap.get(userId.toString());
  return !!(sockets && sockets.size > 0);
}

/**
 * Get active socket IDs for a given user ID
 */
function getUserSocketIds(userId) {
  const sockets = userSocketsMap.get(userId.toString());
  return sockets ? Array.from(sockets) : [];
}

function initChatSockets(io) {
  io.on("connection", (socket) => {
    console.log(`🔌 [Socket.IO] Connected socket: ${socket.id}`);

    let currentUserId = socket.handshake.query?.userId || socket.handshake.auth?.userId;

    if (currentUserId) {
      registerUserSocket(currentUserId, socket, io).catch((err) => console.error("Error registering user socket:", err));
    }

    // 1️⃣ Authenticate Socket User explicitly if not in query/auth
    socket.on("authenticate", async (data) => {
      const userId = data?.userId;
      if (userId) {
        currentUserId = userId;
        await registerUserSocket(userId, socket, io).catch((err) => console.error("Error registering user socket:", err));
      }
    });

    // 2️⃣ Join Conversation Room
    socket.on("join_conversation", ({ conversationId }) => {
      if (conversationId) {
        const roomName = `conv:${conversationId}`;
        socket.join(roomName);
        console.log(`💬 Socket ${socket.id} joined ${roomName}`);
      }
    });

    // 3️⃣ Leave Conversation Room
    socket.on("leave_conversation", ({ conversationId }) => {
      if (conversationId) {
        const roomName = `conv:${conversationId}`;
        socket.leave(roomName);
        console.log(`👋 Socket ${socket.id} left ${roomName}`);
      }
    });

    // 4️⃣ Real-time Message Sending
    socket.on("send_message", async (data, callback) => {
      try {
        const {
          conversationId,
          senderId,
          type = "text",
          text = "",
          mediaUrl = "",
          fileName = "",
          fileSize = 0,
          mimeType = "",
          replyTo = null,
        } = data;

        if (!conversationId || !senderId) {
          if (callback) callback({ success: false, message: "Missing conversationId or senderId" });
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ success: false, message: "Conversation not found" });
          return;
        }

        // Determine initial deliveredTo list based on online participants
        const deliveredTo = [];
        conversation.participants.forEach((partId) => {
          const partStr = partId.toString();
          if (partStr !== senderId.toString() && isUserOnline(partStr)) {
            deliveredTo.push(partId);
          }
        });

        const initialStatus = deliveredTo.length > 0 ? "delivered" : "sent";

        const newMessage = new Message({
          conversation: conversationId,
          sender: senderId,
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

        // Populate sender info
        await newMessage.populate("sender", "username name profilePicture userid");
        if (newMessage.replyTo) {
          await newMessage.populate("replyTo", "text type sender mediaUrl");
        }

        // Update conversation's last message
        conversation.lastMessage = newMessage._id;
        conversation.lastMessageAt = new Date();
        conversation.isDeleted = false;
        conversation.deletedFor = []; // Reset soft deletes for new messages

        // Update unread count for non-senders
        conversation.participants.forEach((partId) => {
          const partStr = partId.toString();
          if (partStr !== senderId.toString()) {
            const currentCount = conversation.unreadCounts.get(partStr) || 0;
            conversation.unreadCounts.set(partStr, currentCount + 1);
          }
        });

        await conversation.save();

        const messageData = newMessage.toObject();

        // Broadcast to conversation room
        io.to(`conv:${conversationId}`).emit("new_message", messageData);

        // Broadcast to participants' personal user rooms (multi-device)
        conversation.participants.forEach((partId) => {
          io.to(`user:${partId.toString()}`).emit("conversation_updated", {
            conversationId,
            lastMessage: messageData,
            updatedAt: conversation.lastMessageAt,
          });
          io.to(`user:${partId.toString()}`).emit("new_message_notification", messageData);
        });

        if (callback) callback({ success: true, data: messageData });

      } catch (err) {
        console.error("❌ [Socket] Error in send_message:", err);
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // 5️⃣ Typing Indicators
    socket.on("typing_start", ({ conversationId, userId, username }) => {
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit("user_typing", {
          conversationId,
          userId,
          username,
        });
      }
    });

    socket.on("typing_stop", ({ conversationId, userId }) => {
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit("user_stopped_typing", {
          conversationId,
          userId,
        });
      }
    });

    // 6️⃣ Delivered Receipts
    socket.on("mark_delivered", async ({ messageId, conversationId, userId }) => {
      try {
        if (!messageId || !userId) return;

        const message = await Message.findById(messageId);
        if (message) {
          const userIdObj = new mongoose.Types.ObjectId(userId);
          const alreadyDelivered = message.deliveredTo.some((id) => id.toString() === userId.toString());

          if (!alreadyDelivered) {
            message.deliveredTo.push(userIdObj);
            if (message.status === "sent") {
              message.status = "delivered";
            }
            await message.save();

            io.to(`conv:${conversationId || message.conversation}`).emit("message_delivered", {
              messageId: message._id,
              conversationId: message.conversation,
              userId,
              status: message.status,
            });
            io.to(`user:${message.sender.toString()}`).emit("message_delivered", {
              messageId: message._id,
              conversationId: message.conversation,
              userId,
              status: message.status,
            });
          }
        }
      } catch (err) {
        console.error("❌ [Socket] Error in mark_delivered:", err);
      }
    });

    // 7️⃣ Read / Seen Receipts
    socket.on("mark_seen", async ({ conversationId, userId }) => {
      try {
        if (!conversationId || !userId) return;

        const userIdObj = new mongoose.Types.ObjectId(userId);

        // Update all un-seen messages in this conversation for this user
        const result = await Message.updateMany(
          {
            conversation: conversationId,
            sender: { $ne: userIdObj },
            seenBy: { $ne: userIdObj },
          },
          {
            $addToSet: { seenBy: userIdObj, deliveredTo: userIdObj },
            $set: { status: "seen" },
          }
        );

        // Reset unread count for this user in the conversation
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.unreadCounts.set(userId.toString(), 0);
          await conversation.save();
        }

        io.to(`conv:${conversationId}`).emit("messages_seen", {
          conversationId,
          seenByUserId: userId,
          modifiedCount: result.modifiedCount,
        });

        if (conversation) {
          conversation.participants.forEach((partId) => {
            io.to(`user:${partId.toString()}`).emit("messages_seen", {
              conversationId,
              seenByUserId: userId,
              modifiedCount: result.modifiedCount,
            });
          });
        }
      } catch (err) {
        console.error("❌ [Socket] Error in mark_seen:", err);
      }
    });

    // 8️⃣ Presence Check Query
    socket.on("check_presence", ({ targetUserId }, callback) => {
      if (targetUserId) {
        const online = isUserOnline(targetUserId);
        if (callback) callback({ userId: targetUserId, isOnline: online });
      }
    });

    // 9️⃣ Disconnect Handler
    socket.on("disconnect", () => {
      console.log(`🔌 [Socket.IO] Disconnected socket: ${socket.id}`);
      if (currentUserId) {
        unregisterUserSocket(currentUserId, socket, io);
      }
    });
  });
}

/**
 * Register a user's socket and handle online status change
 */
async function registerUserSocket(userId, socket, io) {
  const user = await resolveUserDoc(userId);
  const resolvedId = user ? user._id.toString() : userId.toString();

  socket.resolvedUserId = resolvedId;
  socket.join(`user:${resolvedId}`);

  if (!userSocketsMap.has(resolvedId)) {
    userSocketsMap.set(resolvedId, new Set());
  }

  const socketSet = userSocketsMap.get(resolvedId);
  const wasOnline = socketSet.size > 0;
  socketSet.add(socket.id);

  if (!wasOnline) {
    console.log(`🟢 User ${resolvedId} is now ONLINE`);
    io.emit("presence_change", { userId: resolvedId, isOnline: true });

    // Update DB
    User.findByIdAndUpdate(resolvedId, { isConnected: true, lastConnectedAt: new Date() }).catch((e) =>
      console.error("Error updating user connection status:", e.message)
    );
  }
}

/**
 * Unregister a user's socket and handle online status change
 */
function unregisterUserSocket(userId, socket, io) {
  const resolvedId = socket.resolvedUserId || userId.toString();
  const socketSet = userSocketsMap.get(resolvedId);

  if (socketSet) {
    socketSet.delete(socket.id);

    if (socketSet.size === 0) {
      userSocketsMap.delete(resolvedId);
      console.log(`🔴 User ${resolvedId} is now OFFLINE`);
      const lastSeen = new Date();
      io.emit("presence_change", { userId: resolvedId, isOnline: false, lastSeen });

      // Update DB
      User.findByIdAndUpdate(resolvedId, { isConnected: false, lastConnectedAt: lastSeen }).catch((e) =>
        console.error("Error updating user connection status:", e.message)
      );
    }
  }
}

module.exports = {
  initChatSockets,
  isUserOnline,
  getUserSocketIds,
};
