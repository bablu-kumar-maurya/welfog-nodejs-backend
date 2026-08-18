const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const axios = require("axios");
const User = require("../models/Users");

/**
 * Creates a notification.
 * Stores both ObjectId and userid string if available.
 */
const createNotification = async ({
  recipientUserId,
  senderUserId,
  recipientObjectId, // optional ObjectId
  senderObjectId, // optional ObjectId
  type,
  reel = null,
  comment = null,
  message,
}) => {
  console.log("\n========== createNotification Called ==========");
  console.log({
    recipientUserId,                                             
    senderUserId,
    recipientObjectId,
    senderObjectId,
    type,
    reel,
    comment,
    message,
  });

  if (!recipientUserId && !recipientObjectId) {
    console.log("❌ recipientUserId/recipientObjectId missing");
    return;
  }

  if (!senderUserId && !senderObjectId) {
    console.log("❌ senderUserId/senderObjectId missing");
    return;
  }

  // Prevent self-notification
  if (
    (recipientUserId && recipientUserId === senderUserId) ||
    (recipientObjectId &&
      senderObjectId &&
      recipientObjectId.toString() === senderObjectId.toString())
  ) {
    console.log("⚠️ Self notification skipped");
    return;
  }

  try {
    let senderName = "";
    let senderUsername = "";

    try {
      let query = {};
      if (senderObjectId) {
        query._id = senderObjectId;
      } else if (senderUserId) {
        query.userid = senderUserId;
      }

      if (Object.keys(query).length > 0) {
        const senderUser = await User.findOne(query).select("name username");
        if (senderUser) {
          senderName = senderUser.name || "";
          senderUsername = senderUser.username || "";
        }
      }
    } catch (userErr) {
      console.error("⚠️ Failed to fetch sender details for notification:", userErr.message);
    }

    const displayName = senderName || senderUsername || "Someone";
    const formattedMessage = `${displayName} ${message}`;

    console.log("📝 Saving notification to MongoDB...");

    await Notification.create({
      recipient: recipientObjectId,
      sender: senderObjectId,
      recipientUserId: recipientUserId,
      senderUserId: senderUserId,
      type,
      reel,
      comment,
      message: formattedMessage,
      senderName,
      senderUsername,
    });

    console.log("✅ Notification saved in MongoDB");

    const targetUserId = isNaN(Number(recipientUserId)) ? recipientUserId : Number(recipientUserId);
    const notificationId = reel || comment || `${type}_${Date.now()}`;

    const payload = {
      id: notificationId,
      user_id: targetUserId,
      data: {
        Type: "Play",
        id: notificationId,
        message: formattedMessage,
        recipient: recipientObjectId,
        sender: senderObjectId,
        recipientUserId,
        senderUserId,
        play_type: type,
        reel,
        comment,
        senderName,
        senderUsername,
      },
    };

    console.log("\n========== API Payload ==========");
    console.log("recipientUserId :", recipientUserId);
    console.log("Converted user_id :", targetUserId);
    console.log(JSON.stringify(payload, null, 2));

    try {
      console.log("\n📤 Sending notification to API...");

      const response = await axios.post(
        "https://welfogapi.welfog.com/api/notifications",
        payload
      );

      console.log("\n========== API Response ==========");
      console.log("HTTP Status:", response.status);
      console.log(JSON.stringify(response.data, null, 2));

      if (response.data.push) {
        console.log("\n========== PUSH STATUS ==========");
        console.log("Push:", response.data.push);
      }
    } catch (err) {
      console.error("\n========== Notification API Error ==========");
      console.error("HTTP Status:", err.response?.status);
      console.error("Response:");
      console.error(JSON.stringify(err.response?.data, null, 2));
      console.error("Message:", err.message);
    }
  } catch (err) {
    console.error("❌ Notification error:", err.message);
  }
};

module.exports = createNotification;