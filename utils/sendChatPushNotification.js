const axios = require("axios");
const User = require("../models/Users");

/**
 * Sends a push notification for chat messages via welfog production API.
 */
const sendChatPushNotification = async ({
  conversation,
  senderDoc,
  messageDoc,
}) => {
  try {
    const senderName = senderDoc.name || senderDoc.username || "Someone";
    
    let textContent = messageDoc.text || "";
    if (messageDoc.type === "audio") {
      textContent = "🎤 Voice message";
    } else if (messageDoc.type === "image") {
      textContent = "📷 Photo";
    } else if (messageDoc.type === "video") {
      textContent = "🎥 Video";
    } else if (messageDoc.type === "file" || messageDoc.type === "document") {
      textContent = messageDoc.fileName ? `📄 ${messageDoc.fileName}` : "📄 Document";
    } else if (messageDoc.type === "reel") {
      textContent = "🎬 Shared a Reel";
    } else if (messageDoc.type === "product") {
      textContent = "🛍️ Shared a Product";
    }

    if (!textContent) {
      textContent = "Sent a message";
    }

    const isGroup = conversation.isGroup;
    const groupName = conversation.groupName;

    // Send push notification to all participants except the sender
    const recipients = conversation.participants.filter((p) => {
      if (!p) return false;
      const pId = p._id ? p._id.toString() : p.toString();
      const senderId = senderDoc._id ? senderDoc._id.toString() : senderDoc.toString();
      return pId !== senderId;
    });

    for (const recipient of recipients) {
      try {
        if (!recipient) continue;
        const recipientId = recipient._id ? recipient._id : recipient;
        const recipientUser = await User.findById(recipientId).select("userid").lean();
        
        if (!recipientUser || !recipientUser.userid) {
          console.log(`⚠️ Skipping push notification: no user doc or userid found for recipientId: ${recipientId}`);
          continue;
        }

        const rawUserId = recipientUser.userid.toString().trim();
        if (!rawUserId || rawUserId.toLowerCase() === "undefined" || rawUserId.toLowerCase() === "null") {
          console.log(`⚠️ Skipping push notification: recipient userid is invalid: "${rawUserId}"`);
          continue;
        }

        const isReply = !!messageDoc.replyTo;
        const title = isReply
          ? (isGroup && groupName ? `↩️ ${senderName} replied in ${groupName}` : `↩️ ${senderName} replied`)
          : (isGroup && groupName ? groupName : senderName);
        const body = isGroup ? `${senderName}: ${textContent}` : textContent;
        const formattedMessage = isReply
          ? (isGroup
              ? `${senderName} replied in ${groupName}: ${textContent}`
              : `${senderName} replied to you: ${textContent}`)
          : (isGroup
              ? `${senderName} sent a message in ${groupName}: ${textContent}`
              : `${senderName} sent you a message: ${textContent}`);

        const payload = {
          id: `${conversation._id}_${Date.now()}`,
          user_id: isNaN(Number(rawUserId)) ? rawUserId : Number(rawUserId),
          data: {
            Type: "chat", // Must be "Play" to route correctly on production server!
            id: `${conversation._id}_${Date.now()}`,
            message: formattedMessage,
            recipient: recipientId.toString(),
            sender: senderDoc._id.toString(),
            recipientUserId: rawUserId,
            senderUserId: senderDoc.userid || senderDoc._id.toString(),
            play_type: isGroup ? "group_chat" : "chat",
            conversationId: conversation._id.toString(),
            targetUserId: senderDoc.userid || senderDoc._id.toString(),
            senderName: senderName,
            text: textContent,
            isGroup: isGroup ? "true" : "false",
            groupName: groupName || "",
            isReply: isReply ? "true" : "false",
            title: title,
            body: body,
          },
        };

        console.log(`Sending chat push notification payload to user_id ${rawUserId}:`, JSON.stringify(payload, null, 2));

        axios.post("https://welfogapi.welfog.com/api/notifications", payload)
          .catch((err) => {
            console.error(`Failed to send chat push notification to api for user ${rawUserId}:`, err.message);
          });
      } catch (err) {
        console.error(`Error resolving details for recipient:`, err.message);
      }
    }
  } catch (err) {
    console.error("Error in sendChatPushNotification utility:", err.message);
  }
};

module.exports = sendChatPushNotification;
