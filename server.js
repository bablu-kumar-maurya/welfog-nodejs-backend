const express = require("express");
const app = express();
require("dotenv").config();
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
  console.log(`📡 [Incoming Request]: ${req.method} ${req.url}`);
  console.log(`Headers:`, req.headers);
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
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
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
  // ✅ EXACT FIX FOR FRONTEND UPLOAD CRASH: Pre-flight OPTIONS Bypass
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (req.path === "/") return next();
  
  if (isPublicShareRoute(req)) {
      return next(); 
  }

  const { deviceId } = getClientInfo(req);

  if (!deviceId && req.path.startsWith("/api/")) {
    return res.status(403).json({
      message: "Access Denied: Missing Device ID. Direct API access is strictly prohibited."
    });
  }
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
      return res.status(429).json({
        message: "Your device has been temporarily blocked for 12 hours due to suspicious spam activity.",
      });
    } else {
      bannedClients.delete(deviceId);
    }
  }
  if (bannedClients.has(ip)) {
    const unbanTime = bannedClients.get(ip);
    if (now < unbanTime) {
      return res.status(429).json({
        message: "Your network/IP has been temporarily blocked for 12 hours due to suspicious spam activity.",
      });
    } else {
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
    res.status(429).json({
      message: "Too many requests to this endpoint! Your device and network have been blocked for 12 hours to protect the server.",
    });
  },
});

app.use(checkIPBan);
app.use(globalLimiter);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

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

app.get("/", (req, res) => {
  res.json({
     "version": "1.0.19",
    status: "Server is running successfully! "
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});