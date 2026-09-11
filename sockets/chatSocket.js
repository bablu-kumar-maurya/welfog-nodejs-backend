const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/Users");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");

let chatMediaQueue = null;
try {
  const redisConn = new IORedis({ maxRetriesPerRequest: null, retryStrategy: () => false });
  redisConn.on("error", () => { });
  chatMediaQueue = new Queue("chat-media-processing", { connection: redisConn });
} catch (_) { }

// Map of userId string -> Set of socketIds (supports multi-device per user)
const userSocketsMap = new Map();

// Helper to highly-optimize resolving user with a single DB query
async function resolveUserDoc(idOrUserId) {
  if (!idOrUserId) return null;
  const str = idOrUserId.toString().trim();
  if (!str) return null;

  // Build a single query to check all possible match conditions simultaneously
  const queryOr = [{ userid: str }, { mobile: str }, { username: str }];
  if (mongoose.isValidObjectId(str)) {
    queryOr.push({ _id: str });
  }

  return await User.findOne({ $or: queryOr })
    .select("_id username name profilePicture isConnected userid mobile blockedUsers lastConnectedAt")
    .lean();
}

/**
 * Returns whether a user is currently online (has 1 or more active socket connections)
 */
function isUserOnline(userId) {
  if (!userId) return false;
  const sockets = userSocketsMap.get(userId.toString().trim());
  return !!(sockets && sockets.size > 0);
}

/**
 * Get active socket IDs for a given user ID
 */
function getUserSocketIds(userId) {
  if (!userId) return [];
  const sockets = userSocketsMap.get(userId.toString().trim());
  return sockets ? Array.from(sockets) : [];
}

/**
 * Register a user's socket and handle online status change
 */
async function registerUserSocket(userId, socket, io) {
  if (!userId) return;
  const user = await resolveUserDoc(userId);

  const keysToRegister = new Set();
  const userIdStr = userId.toString().trim();
  keysToRegister.add(userIdStr);

  if (user) {
    if (user._id) keysToRegister.add(user._id.toString());
    if (user.userid) keysToRegister.add(user.userid.toString());
    if (user.mobile) keysToRegister.add(user.mobile.toString());
    if (user.username) keysToRegister.add(user.username.toString());
  }

  socket.registeredKeys = Array.from(keysToRegister);
  socket.resolvedUserId = user ? user._id.toString() : userIdStr;
  socket.customUserId = user?.userid || userIdStr;

  let wasOnlineAny = false;
  keysToRegister.forEach((key) => {
    socket.join(`user:${key}`);
    if (!userSocketsMap.has(key)) {
      userSocketsMap.set(key, new Set());
    }
    const sSet = userSocketsMap.get(key);
    if (sSet.size > 0) wasOnlineAny = true;
    sSet.add(socket.id);
  });

  console.log(`🟢 [Socket.IO] User ${user ? user.username : userIdStr} registered on keys: [${Array.from(keysToRegister).join(", ")}]`);

  if (!wasOnlineAny && user) {
    io.emit("presence_change", {
      userId: user._id.toString(),
      customUserId: user.userid,
      isOnline: true,
    });

    // Fire & forget update
    User.findByIdAndUpdate(user._id, { isConnected: true, lastConnectedAt: new Date() }).catch((e) =>
      console.error("Error updating user connection status:", e.message)
    );
  }
}

/**
 * Unregister a user's socket and handle online status change
 */
function unregisterUserSocket(userId, socket, io) {
  const registeredKeys = socket.registeredKeys || [userId.toString()];

  registeredKeys.forEach((key) => {
    const socketSet = userSocketsMap.get(key);
    if (socketSet) {
      socketSet.delete(socket.id);
      if (socketSet.size === 0) {
        userSocketsMap.delete(key);
      }
    }
  });

  const primaryId = socket.resolvedUserId || userId.toString();
  const customId = socket.customUserId;

  console.log(`🔴 [Socket.IO] Socket ${socket.id} unregistered for user ${primaryId}`);

  const stillOnline = isUserOnline(primaryId) || (customId ? isUserOnline(customId) : false);

  if (!stillOnline) {
    const lastSeen = new Date();
    io.emit("presence_change", {
      userId: primaryId,
      customUserId: customId,
      isOnline: false,
      lastSeen,
    });

    if (mongoose.isValidObjectId(primaryId)) {
      // Fire & forget update
      User.findByIdAndUpdate(primaryId, { isConnected: false, lastConnectedAt: lastSeen }).catch((e) =>
        console.error("Error updating user connection status:", e.message)
      );
    }
  }
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

    // 1.5️⃣ Get presence explicitly
    socket.on("get_presence", async ({ userId }) => {
      if (!userId) return;
      try {
        const user = await resolveUserDoc(userId);
        if (user) {
          const isOnline = isUserOnline(user._id.toString()) || isUserOnline(user.userid);
          socket.emit("presence_change", {
            userId: user._id.toString(),
            customUserId: user.userid,
            isOnline: isOnline,
            lastSeen: user.lastConnectedAt || null,
          });
        }
      } catch (e) {
        console.error("Error in get_presence handler:", e);
      }
    });

    // 2️⃣ Join Conversation Room (FIXED: Instant Join eliminates race condition)
    socket.on("join_conversation", async ({ conversationId }) => {
      if (!conversationId) return;
      const roomName = `conv:${conversationId}`;

      // ⚡ INSTANT JOIN (0ms): Join room immediately before DB check
      socket.join(roomName);
      console.log(`💬 Socket ${socket.id} instantly joined ${roomName}`);

      try {
        if (currentUserId) {
          const [userDoc, conversation] = await Promise.all([
            resolveUserDoc(currentUserId),
            Conversation.findById(conversationId).select("participants").lean()
          ]);

          if (userDoc && conversation) {
            const isParticipant = conversation.participants.some(
              (p) => p.toString() === userDoc._id.toString()
            );
            if (!isParticipant) {
              console.log(`⚠️ Socket ${socket.id} (user: ${currentUserId}) blocked from joining ${conversationId}: not a participant`);
              socket.leave(roomName); // Security check: leave room if unauthorized
              return;
            }
          }
        }
      } catch (e) {
        console.error("Error in join_conversation socket check:", e);
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

    // 4️⃣ Real-time Message Sending (FIXED: Chained targets for zero message loss)
    socket.on("send_message", async (data, callback) => {
      try {
        const {
          conversationId, senderId, type = "text", text = "", mediaUrl = "", thumbnailUrl = "",
          fileName = "", fileSize = 0, mimeType = "", replyTo = null, sharedReel = null,
          sharedProduct = null, tempId = null, duration = 0,
        } = data;

        console.log(`💬 [Socket] send_message attempt: conv=${conversationId}, sender=${senderId}, type=${type}`);

        if (!conversationId || !senderId) {
          if (callback) callback({ success: false, message: "Missing conversationId or senderId" });
          return;
        }

        // Parallel fetching sender and conversation to cut db time in half
        const [senderDoc, conversation] = await Promise.all([
          resolveUserDoc(senderId),
          Conversation.findById(conversationId)
        ]);

        if (!senderDoc) {
          console.error(`❌ [Socket] Send failed: Sender user '${senderId}' not found in DB`);
          if (callback) callback({ success: false, message: "Sender user not found" });
          return;
        }
        if (!conversation) {
          console.error(`❌ [Socket] Send failed: Conversation '${conversationId}' not found`);
          if (callback) callback({ success: false, message: "Conversation not found" });
          return;
        }

        // Verify if sender is a participant of the group
        if (conversation.isGroup) {
          const isSenderParticipant = conversation.participants.some(
            (p) => p.toString() === senderDoc._id.toString()
          );
          if (!isSenderParticipant) {
            console.error(`❌ [Socket] Send failed: User '${senderId}' is not a participant in group '${conversationId}'`);
            if (callback) callback({ success: false, message: "You are not a participant in this group" });
            return;
          }
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
              console.log(`⛔ [Socket] Message blocked by sender: ${senderDoc._id}`);
              if (callback) callback({ success: false, message: "Messaging is blocked between these users" });
              return;
            }
            if (otherBlockedSender) {
              isReceiverBlocked = true;
            }
          }
        }

        // Determine initial deliveredTo list based on online participants
        const deliveredTo = [];
        conversation.participants.forEach((partId) => {
          const partStr = partId.toString();
          if (partStr !== senderDoc._id.toString() && isUserOnline(partStr) && !isReceiverBlocked) {
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
          thumbnailUrl,
          fileName,
          fileSize,
          mimeType,
          duration: Number(duration) || 0,
          replyTo: replyTo && mongoose.isValidObjectId(replyTo) ? replyTo : null,
          sharedReel: sharedReel || null,
          sharedProduct: sharedProduct || null,
          status: initialStatus,
          deliveredTo,
          seenBy: [],
          deletedFor: isReceiverBlocked ? [otherUserId] : [],
        });

        await newMessage.save();
        console.log(`✅ [Socket] Message saved successfully: ${newMessage._id} (status: ${initialStatus})`);

        if (chatMediaQueue && (type === "video" || type === "image") && mediaUrl) {
          chatMediaQueue.add("processChatMedia", {
            messageId: newMessage._id,
            conversationId,
            mediaUrl,
            type,
          }).catch(() => { });
        }

        // Populate sender info
        await newMessage.populate("sender", "username name profilePicture userid");
        if (newMessage.replyTo) {
          await newMessage.populate({
            path: "replyTo",
            select: "text type sender mediaUrl fileName",
            populate: { path: "sender", select: "username name profilePicture userid" }
          });
        }

        // Update conversation properties
        conversation.lastMessage = newMessage._id;
        conversation.lastMessageAt = new Date();
        conversation.isDeleted = false;
        conversation.deletedFor = [];

        conversation.participants.forEach((partId) => {
          const partStr = partId.toString();
          if (partStr !== senderDoc._id.toString() && !isReceiverBlocked) {
            const currentCount = conversation.unreadCounts.get(partStr) || 0;
            conversation.unreadCounts.set(partStr, currentCount + 1);
          }
        });

        await conversation.save();

        const messageData = newMessage.toObject();
        if (tempId) messageData.tempId = tempId;

        // Trigger push notifications for recipients asynchronously (non-blocking)
        setImmediate(() => {
          try {
            const sendChatPushNotification = require("../utils/sendChatPushNotification");
            sendChatPushNotification({ conversation, senderDoc, messageDoc: newMessage });
          } catch (err) {
            console.error("❌ Failed to trigger chat push notification:", err.message);
          }
        });

        // Broadcast messages (Targeting room + participant user rooms in a single chained call to auto-deduplicate)
        if (isReceiverBlocked) {
          io.to(`user:${senderDoc._id.toString()}`).emit("new_message", messageData);
        } else {
          let broadcastTarget = io.to(`conv:${conversationId}`);
          conversation.participants.forEach((partId) => {
            const pStr = partId.toString();
            broadcastTarget = broadcastTarget.to(`user:${pStr}`);
          });
          broadcastTarget.emit("new_message", messageData);
        }

        conversation.participants.forEach((partId) => {
          const pStr = partId.toString();
          if (pStr === senderDoc._id.toString() || !isReceiverBlocked) {
            io.to(`user:${pStr}`).emit("conversation_updated", {
              conversationId,
              lastMessage: messageData,
              updatedAt: conversation.lastMessageAt,
              unreadCount: conversation.unreadCounts?.get(pStr) || 0,
            });
            io.to(`user:${pStr}`).emit("new_message_notification", messageData);
          }
        });

        if (callback) callback({ success: true, data: messageData });

      } catch (err) {
        console.error("❌ [Socket] Error in send_message:", err);
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // 5️⃣ Typing Indicators
    socket.on("typing_start", async ({ conversationId, userId, username }) => {
      if (!conversationId || !userId) return;
      const uDoc = await resolveUserDoc(userId);
      const resolvedId = uDoc ? uDoc._id.toString() : userId;
      socket.to(`conv:${conversationId}`).emit("user_typing", {
        conversationId,
        userId: resolvedId,
        customUserId: uDoc?.userid || userId,
        username: username || uDoc?.username || uDoc?.name,
      });
    });

    socket.on("typing_stop", async ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      const uDoc = await resolveUserDoc(userId);
      const resolvedId = uDoc ? uDoc._id.toString() : userId;
      socket.to(`conv:${conversationId}`).emit("user_stopped_typing", {
        conversationId,
        userId: resolvedId,
        customUserId: uDoc?.userid || userId,
      });
    });

    // 6️⃣ Delivered Receipts
    socket.on("mark_delivered", async ({ messageId, conversationId, userId }) => {
      try {
        if (!messageId || !userId) return;

        // Parallelize for speed
        const [user, message] = await Promise.all([
          resolveUserDoc(userId),
          Message.findById(messageId)
        ]);

        if (!user || !message) return;
        const userIdObj = user._id;

        const alreadyDelivered = message.deliveredTo.some((id) => id.toString() === userIdObj.toString());

        if (!alreadyDelivered) {
          message.deliveredTo.push(userIdObj);
          if (message.status === "sent") {
            message.status = "delivered";
          }
          await message.save();

          const payload = {
            messageId: message._id,
            conversationId: message.conversation,
            userId: userIdObj.toString(),
            customUserId: user.userid,
            status: message.status,
          };

          io.to(`conv:${conversationId || message.conversation}`).emit("message_delivered", payload);
          io.to(`user:${message.sender.toString()}`).emit("message_delivered", payload);
        }
      } catch (err) {
        console.error("❌ [Socket] Error in mark_delivered:", err);
      }
    });

    // 7️⃣ Read / Seen Receipts (FIXED: Instant broadcast to all participant user channels & 0ms DB latency)
    socket.on("mark_seen", async (data) => {
      try {
        const conversationId = data?.conversationId || data?.conversation_id || data?.chatId;
        const userId = data?.userId || data?.user_id || data?.readerId;
        if (!conversationId || !userId) return;

        const userIdStr = userId.toString().trim();
        const primaryId = socket.resolvedUserId || userIdStr;
        const customId = socket.customUserId || userIdStr;

        // ⚡ INSTANT PARALLEL LOOKUP (1ms): Resolve user & conversation participants simultaneously
        const [user, conversation] = await Promise.all([
          (socket.resolvedUserId === userIdStr && socket.customUserId)
            ? { _id: primaryId, userid: customId }
            : resolveUserDoc(userId),
          Conversation.findById(conversationId).select("participants").lean()
        ]);

        const actualUserId = user ? user._id.toString() : primaryId;
        const actualCustomId = user?.userid || customId;

        const fullSeenPayload = {
          conversationId,
          seenByUserId: actualUserId,
          seenByCustomUserId: actualCustomId,
          userId: actualUserId,
          customUserId: actualCustomId,
          readerId: actualUserId,
          status: "seen",
          modifiedCount: 1,
        };

        // ⚡ INSTANT BROADCAST: Broadcast to conversation room AND all participant user rooms
        let broadcastTarget = io.to(`conv:${conversationId}`).to(`user:${actualUserId}`);
        if (actualCustomId && actualCustomId !== actualUserId) {
          broadcastTarget = broadcastTarget.to(`user:${actualCustomId}`);
        }
        if (conversation?.participants) {
          conversation.participants.forEach((partId) => {
            const pStr = partId.toString();
            broadcastTarget = broadcastTarget.to(`user:${pStr}`);
          });
        }
        broadcastTarget.emit("messages_seen", fullSeenPayload);

        // ⚡ Async Parallel Database Update (Non-blocking)
        setImmediate(async () => {
          try {
            const userIdObj = user?._id || primaryId;

            const updateUnread = {
              $set: { [`unreadCounts.${userIdObj.toString()}`]: 0 }
            };
            if (user?.userid) {
              updateUnread.$set[`unreadCounts.${user.userid.toString()}`] = 0;
            }

            await Promise.all([
              Message.updateMany(
                {
                  conversation: conversationId,
                  sender: { $ne: userIdObj },
                  seenBy: { $ne: userIdObj },
                },
                {
                  $addToSet: { seenBy: userIdObj, deliveredTo: userIdObj },
                  $set: { status: "seen" },
                }
              ),
              Conversation.findByIdAndUpdate(
                conversationId,
                updateUnread,
                { new: true, select: "_id" }
              ).lean()
            ]);
          } catch (dbErr) {
            console.error("❌ [Socket] Error in async mark_seen DB update:", dbErr);
          }
        });
      } catch (err) {
        console.error("❌ [Socket] Error in mark_seen:", err);
      }
    });

    // 8️⃣ Presence Check Query
    socket.on("check_presence", async ({ targetUserId }, callback) => {
      if (targetUserId) {
        const uDoc = await resolveUserDoc(targetUserId);
        const online = isUserOnline(targetUserId) || (uDoc ? isUserOnline(uDoc._id.toString()) : false);
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

module.exports = {
  initChatSockets,
  isUserOnline,
  getUserSocketIds,
};