const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

const { initChatSockets } = require("./sockets/chatSocket");
initChatSockets(io);
require("dotenv").config();
require("./config/firebase");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const authenticateToken = require("./middleware/auth");
const checkMaintenance = require("./middleware/checkMaintenance");
const path = require("path");

const rateLimit = require("express-rate-limit");

// 🔥 FFMPEG WASM KE LIYE COOP AUR COEP HEADERS (Top par)
app.use((req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Cross-Origin-Embedder-Policy", "require-corp");
  
  console.log(`\n======================================================`);
  console.log(`📡 [Incoming Request]: ${req.method} ${req.originalUrl || req.url}`);
  console.log(`📋 [Headers]: origin=${req.headers.origin || 'none'}, content-type=${req.headers["content-type"] || 'none'}`);
  console.log(`📱 [Device Headers]: x-android-id=${req.headers["x-android-id"] || 'none'}`);
  
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.use(checkMaintenance);
app.use(cookieParser());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "null",
  "http://localhost:4000",
  "https://supplier.welfog.com",
  "https://welfog-backend.vercel.app",
  "https://play.welfog.com",
];

app.use(cors({
  origin: function (origin, callback) {
    console.log(`🛡️ [CORS Check] Request from Origin: ${origin || 'UNKNOWN/DIRECT'}`);
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ [CORS Check] Origin Allowed: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`🚫 [CORS Check] Origin BLOCKED: ${origin}`);
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-device-id",
    "x-android-id",
    "x-ios-idfv",
    "x-machine-id",
    "Accept"
  ]
}));

app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

const bannedClients = new Map();

app.set("trust proxy", true);

const getClientInfo = (req) => {
  const deviceId =
    req.headers["x-android-id"] ||
    req.headers["x-ios-idfv"] ||
    req.headers["x-machine-id"] ||
    req.headers["x-device-id"] ||
    req.cookies["x-device-id"];

  let ip = req.ip || req.connection.remoteAddress || "unknown_ip";
  if (req.headers["x-forwarded-for"]) {
    ip = req.headers["x-forwarded-for"].split(",")[0].trim();
  }

  return {
    deviceId,
    ip,
  };
};

const PUBLIC_SHARE_ROUTES = [
  "/api/plays/r/",
  "/api/plays/dl/reel/",
  "/api/plays/p/",
  "/api/plays/dl/profile/",
  "/deeplink-test.html"
];

const isPublicShareRoute = (req) => {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  return PUBLIC_SHARE_ROUTES.some((route) => (req.originalUrl || req.path).includes(route));
};

const requireDeviceId = (req, res, next) => {
  console.log(`🔐 [DeviceAuth] Checking authorization for path: ${req.path}`);
  
  // ✅ EXACT FIX FOR FRONTEND UPLOAD CRASH: Pre-flight OPTIONS Bypass
  if (req.method === 'OPTIONS') {
    console.log(`✅ [DeviceAuth] OPTIONS request bypassed.`);
    return next();
  }

  if (req.path === "/") {
    console.log(`✅ [DeviceAuth] Root path bypassed.`);
    return next();
  }

  if (isPublicShareRoute(req)) {
    console.log(`✅ [DeviceAuth] Public share route bypassed.`);
    return next();
  }

  const { deviceId } = getClientInfo(req);
  console.log(`🆔 [DeviceAuth] Extracted DeviceID: ${deviceId ? deviceId : 'MISSING'}`);

  if (!deviceId && req.path.startsWith("/api/")) {
    console.warn(`🚫 [DeviceAuth] ACCESS DENIED! Missing Device ID for ${req.path}`);
    return res.status(403).json({
      message: "Access Denied: Missing Device ID. Direct API access is strictly prohibited."
    });
  }
  
  console.log(`✅ [DeviceAuth] Access granted for ${req.path}`);
  next();
};

app.use(requireDeviceId);

const apiScriptLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const { ip } = getClientInfo(req);
    return `${ip}_${req.path}`;
  },
  handler: (req, res) => {
    const { ip } = getClientInfo(req);
    const twelveHoursInMs = 12 * 60 * 60 * 1000;
    bannedClients.set(ip, Date.now() + twelveHoursInMs);
    console.warn(`🛑 [RateLimit] API Script Limiter triggered for IP: ${ip} on path ${req.path}`);
    res.status(429).json({
      message: "Too many requests from this network. Automated scripts are temporarily blocked for 12 hours.",
    });
  },
});

app.use(apiScriptLimiter);

const checkIPBan = (req, res, next) => {
  const { deviceId, ip } = getClientInfo(req);
  const now = Date.now();
  if (deviceId && bannedClients.has(deviceId)) {
    const unbanTime = bannedClients.get(deviceId);
    if (now < unbanTime) {
      console.warn(`🛑 [BanCheck] Blocked request from BANNED Device ID: ${deviceId}`);
      return res.status(429).json({
        message: "Your device has been temporarily blocked for 12 hours due to suspicious spam activity.",
      });
    } else {
      console.log(`🔓 [BanCheck] Unbanning Device ID: ${deviceId}`);
      bannedClients.delete(deviceId);
    }
  }
  if (bannedClients.has(ip)) {
    const unbanTime = bannedClients.get(ip);
    if (now < unbanTime) {
      console.warn(`🛑 [BanCheck] Blocked request from BANNED IP: ${ip}`);
      return res.status(429).json({
        message: "Your network/IP has been temporarily blocked for 12 hours due to suspicious spam activity.",
      });
    } else {
      console.log(`🔓 [BanCheck] Unbanning IP: ${ip}`);
      bannedClients.delete(ip);
    }
  }
  next();
};

const globalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const { deviceId, ip } = getClientInfo(req);
    const identifier = deviceId || ip;
    return `${identifier}_${req.path}`;
  },
  handler: (req, res) => {
    const { deviceId, ip } = getClientInfo(req);
    const twelveHoursInMs = 12 * 60 * 60 * 1000;
    const unbanTime = Date.now() + twelveHoursInMs;
    if (deviceId) { bannedClients.set(deviceId, unbanTime); }
    bannedClients.set(ip, unbanTime);
    console.warn(`🛑 [RateLimit] Global Limiter triggered for Device: ${deviceId || 'N/A'}, IP: ${ip}`);
    res.status(429).json({
      message: "Too many requests to this endpoint! Your device and network have been blocked for 12 hours to protect the server.",
    });
  },
});

app.use(checkIPBan);
app.use(globalLimiter);

console.log("🔄 Trying to connect to MongoDB...");
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const PORT = process.env.PORT || 4000;

const userRoutes = require("./routes/userRoutes");
const reelRoute = require("./routes/reelRoutes");
const musicRoute = require("./routes/musicRoutes");
const commentRoute = require("./routes/commentRoute");
const notificationRoute = require("./routes/notificationRoutes");
const adminRoute = require("./routes/adminRoutes");
const roleRoutes = require("./routes/roleRoutes");
const shareRoutes = require("./routes/shareRoutes");
const suspendRoutes = require("./routes/suspendRoutes");
const uploadRoute = require("./routes/uploadRoute");
const userblockRoute = require("./routes/userblockRoute");
const chatRoutes = require("./routes/chatRoutes");

console.log("🛤️ Mounting Routes...");
app.use("/api/users", userRoutes);
app.use("/api/reels", reelRoute);
app.use("/api/music", musicRoute);
app.use("/api/comment", commentRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/admin", adminRoute);
app.use("/api/roles", roleRoutes);
app.use("/api/plays", shareRoutes);
app.use("/api/suspend", suspendRoutes);
app.use("/api/uploads", uploadRoute);
app.use("/api/userblocks", userblockRoute);
app.use("/api/chat", chatRoutes);
console.log("✅ All routes mounted.");

app.get("/", (req, res) => {
  res.json({
    "version": "1.0.22",
    status: "Server is running successfully! "
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT} with Socket.IO enabled`);
});