const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/Users");

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware to resolve the user either from JWT token or provided userId
 */
async function resolveUser(req, res, next) {
  try {
    let extractedUserId = null;

    // 1. Try extracting from Authorization header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token && JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        extractedUserId = decoded.id || decoded._id || decoded.userId || decoded.userid;
      } catch (jwtErr) {
        // Token provided but invalid
      }
    }

    // 2. Fallback to body / query / custom headers
    if (!extractedUserId) {
      extractedUserId =
        req.body.userId ||
        req.body.currentUserId ||
        req.query.userId ||
        req.query.currentUserId ||
        req.headers["x-user-id"];
    }

    if (!extractedUserId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required. Please provide a valid token or userId.",
      });
    }

    // 3. Find User Document in Database
    let user = null;
    if (mongoose.isValidObjectId(extractedUserId)) {
      user = await User.findById(extractedUserId);
    }
    if (!user) {
      user = await User.findOne({ userid: extractedUserId, isDeleted: { $ne: true } });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found or account is deactivated",
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended",
        isSuspended: true,
      });
    }

    req.resolvedUser = user;
    next();
  } catch (error) {
    console.error("❌ Error in resolveUser middleware:", error);
    return res.status(500).json({ success: false, message: "Internal server error during authentication" });
  }
}

module.exports = resolveUser;
