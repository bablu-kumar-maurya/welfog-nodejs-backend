const express = require("express");
const mongoose = require('mongoose');
const router = express.Router();
const Comment = require("../models/Comment");
const Reel = require("../models/Reel");
const User = require("../models/Users");
const Music = require("../models/Music");
const multer = require("multer");
const logUserAction = require("../utils/logUserAction");
const fs = require("fs");
const path = require("path");
const tmp = require("tmp");
const { uploadToS3 } = require("../lib/s3");
const adminAuth = require("../middleware/adminAuth");
const checkPermission = require("../middleware/checkPermission");
const createNotification = require("../utils/createNotification");
const logError = require("../utils/logError");
const { generateShortLink } = require("../utils/shortLink");
const ReelInteraction = require('../models/ReelInteraction');

// ===== NEW: REDIS & QUEUE SETUP =====
console.log("🔄 [ROUTER] Setting up Redis Queue connection...");
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
// Default Redis connection (Localhost). Agar production par ho toh actual Redis URL dalna.
const redisConnection = new IORedis({ maxRetriesPerRequest: null });
const reelQueue = new Queue('reel-processing', { connection: redisConnection });
console.log("✅ [ROUTER] Redis Queue (reel-processing) initialized.");
// =====================================

// S3 Presigned URL Generator ke liye AWS SDK zaroori hai
// (Make sure you have @aws-sdk/client-s3 installed if using AWS v3)
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }
});

// =================================================================
// === NEW ROUTE: GENERATE PRESIGNED URL FOR DIRECT S3 UPLOAD ===
// =================================================================
router.post("/generate-upload-url", async (req, res) => {
    console.log("\n=======================================================");
    console.log("📡 [POST /generate-upload-url] API Hit!");
    console.log("📦 Request Body:", req.body);

    try {
        const { filename, fileType, isThumbnail, fileSize } = req.body;
        if (!filename || !fileType) {
            console.warn("⚠️ [generate-upload-url] Missing filename or fileType in request.");
            return res.status(400).json({ success: false, message: "filename and fileType are required" });
        }

        if (fileSize && Number(fileSize) > 200 * 1024 * 1024) {
            console.warn(`⚠️ [generate-upload-url] File size ${fileSize} exceeds maximum limit of 200MB.`);
            return res.status(400).json({ success: false, message: "File size exceeds maximum allowed limit of 200MB." });
        }

        const folder = isThumbnail ? "thumbnails/raw" : "videos/raw";
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${filename}`;
        const key = `${folder}/${uniqueFileName}`;

        console.log(`🔑 Generating S3 Key: ${key}`);

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            ContentType: fileType,
        });

        console.log("⏳ Requesting Presigned URL from AWS S3...");
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

        const rawUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        console.log("✅ Presigned URL generated successfully!");
        res.status(200).json({
            success: true,
            uploadUrl,
            rawUrl,
            key
        });
    } catch (err) {
        console.error("❌ Error generating presigned URL:", err);
        res.status(500).json({ success: false, message: "Could not generate upload URL" });
    }
});


router.post("/full-upload", async (req, res) => {
    console.log("\n=======================================================");
    console.log("📡 [POST /full-upload] API Hit!");
    console.log("📋 HEADERS =", req.headers["content-type"]);

    try {
        // Ab frontend multer (FormData) ki jagah JSON bheja karega S3 URLs ke sath
        const {
            user, userid, username, name, caption, musicId, audioData,
            videoStartTime, videoEndTime, musicStartTime, musicEndTime,
            rawVideoUrl, rawThumbnailUrl, videoOriginalname
        } = req.body;

        console.log(`📦 Parsed Body - User: ${user}, VideoUrl: ${rawVideoUrl ? "YES" : "NO"}, ThumbUrl: ${rawThumbnailUrl ? "YES" : "NO"}`);

        let uploaderUser = null;

        console.log("🔍 Validating User in Database...");
        if (user && mongoose.isValidObjectId(user)) {
            uploaderUser = await User.findById(user).select("isSuspended").lean();
        }

        if (!uploaderUser && userid) {
            uploaderUser = await User.findOne({ userid }).select("isSuspended").lean();
        }

        if (uploaderUser?.isSuspended) {
            console.warn(`⚠️ User is suspended. Upload blocked for user: ${user || userid}`);
            return res.status(403).json({
                success: false,
                message: "Your account is suspended. You cannot upload videos."
            });
        }

        let parsedAudioData = null;
        if (audioData) {
            try {
                parsedAudioData = typeof audioData === 'string' ? JSON.parse(audioData) : audioData;
            } catch (e) {
                console.error("❌ Error parsing audioData:", e);
                await logError(req, e);
            }
        }

        if (!user || !rawVideoUrl) {
            console.warn("⚠️ Missing mandatory fields: user or rawVideoUrl");
            return res.status(400).json({
                success: false,
                message: "User or rawVideoUrl missing! Ensure video is uploaded to S3 first."
            });
        }

        let currentUsername = username || "";
        let currentName = name || "";

        try {
            let dbUser = null;
            if (userid && mongoose.isValidObjectId(userid)) {
                dbUser = await User.findById(userid).select("username name").lean();
            }
            if (!dbUser) {
                dbUser = await User.findOne({ $or: [{ userid: userid }, { userid: user }, { _id: user }] }).select("username name").lean();
            }
            if (dbUser && dbUser.username) currentUsername = dbUser.username;
            if (dbUser && dbUser.name) currentName = dbUser.name;
        } catch (err) {
            console.warn("⚠ Could not fetch latest username from DB:", err.message);
        }

        const uploaderUserDoc = await User.findById(user).select("seller_id userseller_id").lean();

        // Save Stub Reel immediately so user sees "Processing"
        console.log("💾 Creating Stub Reel in Database...");
        const stubReel = new Reel({
            user,
            userid,
            username: currentUsername,
            name: currentName,
            caption,
            music: musicId && mongoose.Types.ObjectId.isValid(musicId) ? musicId : null,
            videoUrl: "",
            thumbnailUrl: rawThumbnailUrl || "",
            status: "Processing",
            qualityVariants: [],
            seller_id: uploaderUserDoc?.seller_id || "",
            userseller_id: uploaderUserDoc?.userseller_id || "",
        });
        const savedStub = await stubReel.save();
        console.log(`✅ Stub Reel Saved Successfully! ID: ${savedStub._id}`);

        // Prepare job data for background worker
        const jobData = {
            rawVideoUrl,               // Direct S3 url instead of buffer
            rawThumbnailUrl,           // Direct S3 url instead of buffer
            videoOriginalname: videoOriginalname || "video.mp4",
            reelId: savedStub._id.toString(),
            user,
            userid,
            username: currentUsername,
            name: currentName,
            caption,
            musicId,
            videoStartTime,
            videoEndTime,
            musicStartTime,
            musicEndTime,
            externalAudioData: parsedAudioData,
        };

        // Add to Redis Queue instead of processing locally
        console.log("⚙️ Pushing job data to Redis Queue (reel-processing)...");
        await reelQueue.add('process-reel-job', jobData, { removeOnComplete: true, removeOnFail: false });
        console.log("✅ Job successfully pushed to Queue!");

        console.log("-> Responding to frontend with 202 Accepted.");
        return res.status(202).json({
            success: true,
            message: "Upload initiated. Video is queued for processing asynchronously.",
            status: "processing",
            reel: {
                id: savedStub._id,
                _id: savedStub._id,
                status: savedStub.status,
                caption: savedStub.caption,
                thumbnailUrl: savedStub.thumbnailUrl,
                qualityVariants: savedStub.qualityVariants || [],
            },
        });

    } catch (err) {
        console.error("===== ❌ [FULL UPLOAD API ERROR] =====");
        console.error(err);
        err.statusCode = err.statusCode || 500;
        await logError(req, err);
        res.status(500).json({
            success: false,
            message: "Server error during reel upload initiation.",
        });
    }
});


router.post("/", upload.single("file"), async (req, res) => {
    console.log("\n📡 [POST /] File Upload API Hit!");
    try {
        if (!req.file) {
            console.warn("⚠️ No file uploaded in request.");
            return res.status(400).json({
                message: "No file uploaded",
                success: false
            });
        }

        const folder = req.body.folder || "uploads";
        console.log(`📁 Upload Target Folder: ${folder}, File Type: ${req.file.mimetype}`);

        if (req.file.mimetype.startsWith("video/")) {
            console.log("🎬 Video file detected. Starting local compression...");
            const inputTmp = tmp.fileSync({ postfix: path.extname(req.file.originalname) });
            fs.writeFileSync(inputTmp.name, req.file.buffer);

            const outputTmp = tmp.fileSync({ postfix: ".mp4" });

            // Note: Tumhe worker.js me bhi compressVideo rakha hai, agar yahan route me zaroorat hai toh function yahan define karna padega (jaise pehle tha)
            // But main code flow ke liye as it is rakha hai.
            await compressVideo(inputTmp.name, outputTmp.name);
            console.log("✅ Local video compression done.");

            const compressedBuffer = fs.readFileSync(outputTmp.name);

            console.log("📤 Uploading compressed video to S3...");
            const uploadedFileUrl = await uploadToS3(
                { buffer: compressedBuffer, originalname: "compressed-" + req.file.originalname, mimetype: "video/mp4" },
                folder
            );

            inputTmp.removeCallback();
            outputTmp.removeCallback();

            console.log("✅ Video S3 URL:", uploadedFileUrl);
            return res.status(200).json({
                message: "Video compressed & uploaded successfully!",
                success: true,
                file: uploadedFileUrl
            });

        } else {
            console.log("🖼️ Image/Other file detected. Uploading to S3 directly...");
            const uploadedFileUrl = await uploadToS3(req.file, folder);
            console.log("✅ File S3 URL:", uploadedFileUrl);

            return res.status(200).json({
                message: "File uploaded successfully!",
                success: true,
                file: uploadedFileUrl
            });
        }

    } catch (error) {
        console.error("❌ Error on file upload:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({
            message: "Error on file upload!",
            success: false
        });
    }
});

router.post("/upload", async (req, res) => {
    console.log("\n📡 [POST /upload] Legacy Upload API Hit!");
    try {
        const data = await req.body;
        console.log("📦 Request Body:", data);

        if (!data.user || !data.videoUrl) {
            console.warn("⚠️ User ID or Video Url missing!");
            res.status(400).json({ message: "User ID or Video Url missing!" });
        }

        console.log("💾 Saving Reel to Database...");
        const newReel = new Reel(
            data
        );

        const savedReel = await newReel.save();
        console.log(`✅ Reel Saved! ID: ${savedReel._id}`);

        try {
            const uploaderUser = await User.findById(savedReel.user);
            if (uploaderUser && savedReel.userid) {
                console.log("🔗 Generating short link...");
                const { slug, shortLink } = generateShortLink(savedReel._id, savedReel.userid);
                savedReel.shortLinks.push({
                    slug,
                    shortLink,
                    generatedForUser: uploaderUser._id,
                    generatedAt: new Date()
                });
                await savedReel.save();
                console.log(`✅ Short link generated and saved for reel ${savedReel._id}: ${shortLink}`);
            }
        } catch (shortLinkError) {
            console.warn("⚠️ Failed to generate short link (non-blocking):", shortLinkError.message);
        }

        if (typeof savedReel.videoUrl === "string" && savedReel.videoUrl.toLowerCase().includes(".mp4")) {
            console.log("🎬 MP4 detected, updating status to Processing...");
            await Reel.findByIdAndUpdate(savedReel._id, { status: "Processing" });
            // Queue ko push kar sakte ho yaha bhi agar HLS conversion karna hai
            // convertMp4UrlToHlsAndUpdateReel(savedReel._id, savedReel.videoUrl).catch(() => { });
            return res.status(202).json({
                message: "Reel saved. Video is being optimized for streaming.",
                data: { id: savedReel._id, savedReel }
            });
        }

        try {
            console.log("📝 Logging user action...");
            await logUserAction({
                user: savedReel.user,
                action: "upload_reel",
                targetType: "Reel",
                targetId: savedReel._id,
                device: req.headers["user-agent"],
                location: {
                    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
                    country: req.headers["cf-ipcountry"] || "",
                    city: "",
                    pincode: ""
                }
            });
        } catch (logError) {
            console.error("⚠️ Log error (non-blocking):", logError.message);
        }

        console.log("✅ Sending final success response.");
        res.status(201).json({
            message: "Reels Saved Successfully",
            data: {
                id: savedReel._id,
                savedReel
            }
        });

    } catch (error) {
        console.error("❌ Error in upload reel:", error);
        res.status(500).json({ message: "An Error occure in Upload Reel!" });
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
    }
});


router.get("/by-music/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.query.currentUserId || req.query.viewerId; // Frontend se viewerId ya currentUserId bhej dena

        // 1️⃣ Validate music id
        if (!id || id === "null" || id === "undefined") {
            return res.status(400).json({
                message: "Valid Music ID is required"
            });
        }

        let query = {
            music: id,
            status: { $ne: "Blocked" }   // 👈 IMPORTANT LINE
        };

        // 🔥 ADDED: MUTUAL BLOCK FILTER LOGIC START 🔥
        if (currentUserId) {
            let viewer = null;
            if (mongoose.isValidObjectId(currentUserId)) {
                viewer = await User.findById(currentUserId).select("blockedUsers").lean();
            }
            if (!viewer) {
                viewer = await User.findOne({ userid: currentUserId }).select("blockedUsers").lean();
            }

            if (viewer) {
                const blockedList = viewer.blockedUsers || [];
                const blockers = await User.find({ blockedUsers: viewer._id }).select("_id").lean();
                const usersWhoBlockedMe = blockers.map(b => b._id);

                const allBlocked = [...blockedList, ...usersWhoBlockedMe];

                if (allBlocked.length > 0) {
                    query.user = { $nin: allBlocked }; // Blocked logo ki reels music list se hide
                }
            }
        }
        // 🔥 ADDED: MUTUAL BLOCK FILTER LOGIC END 🔥

        // 2️⃣ Find reels using this music
        const reels = await Reel.find(query)
            .populate("music")                 // music details
            .populate("user", "username")      // reel owner username
            .populate("comments");             // comments

        // 3️⃣ No reels found
        if (!reels || reels.length === 0) {
            return res.status(404).json({
                message: "No reels found for this music"
            });
        }

        // 4️⃣ Success response
        return res.status(200).json({
            message: "Reels fetched successfully",
            data: reels
        });

    } catch (error) {
        console.error("Error fetching reels by music:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        return res.status(500).json({
            message: "Error fetching reels",
            error: error.message
        });
    }
});


router.get(
    "/",

    async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 8;
            const search = req.query.search || "";
            const status = req.query.status || "all";
            const startDate = req.query.startDate || "";
            const endDate = req.query.endDate || "";

            const skip = (page - 1) * limit;

            // ✅ BUILD QUERY
            const query = {};

            // 🔍 SEARCH FILTER
            if (search) {
                query.$or = [
                    { caption: { $regex: search, $options: "i" } },
                    { username: { $regex: search, $options: "i" } }
                ];
            }

            // 🎯 STATUS FILTER
            if (status !== "all") {
                query.status = status;
            }

            // 📅 DATE RANGE FILTER
            if (startDate || endDate) {
                query.createdAt = {};

                if (startDate) {
                    query.createdAt.$gte = new Date(startDate);
                }

                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999); // full end day include
                    query.createdAt.$lte = end;
                }
            }

            // ✅ TOTAL COUNT (WITH FILTER)
            const total = await Reel.countDocuments(query);

            // ✅ FETCH DATA
            const reels = await Reel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            res.status(200).json({
                data: reels,
                total: total,
                page,
                limit,
            });

        } catch (error) {
            console.error("Error fetching reels:", error);
            error.statusCode = error.statusCode || 500;
            await logError(req, error);
            res.status(500).json({
                message: "Error fetching reels",
            });
        }
    }
);

router.get(
    "/admin_reels",
    adminAuth,
    checkPermission("VIEW_REELS"),
    async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 8;
            const search = req.query.search || "";
            const status = req.query.status || "all";
            const startDate = req.query.startDate || "";
            const endDate = req.query.endDate || "";

            const skip = (page - 1) * limit;

            // ✅ BUILD QUERY
            const query = {};

            // 🔥 1. DEFAULT FILTER: Hamesha Deleted Users ki reels hide karo
            // Iske liye ab frontend se 'activeUsersOnly' bhejne ki zaroorat nahi hai.
            const activeUsers = await User.find({ isDeleted: { $ne: true } }).select("_id");
            const activeUserIds = activeUsers.map(user => user._id);

            // Reel sirf active users ki hi aayegi
            query.user = { $in: activeUserIds };

            // 🔥 2. DEFAULT FILTER: Hamesha Soft Deleted Reels ko hide karo
            // Agar aap status explicitly "deleted" bhejte ho tabhi dikhega
            if (status === "deleted") {
                query.isDeleted = true;
            } else {
                query.isDeleted = { $ne: true };
            }

            // 🔍 3. SEARCH FILTER
            if (search) {
                query.$or = [
                    { caption: { $regex: search, $options: "i" } },
                    { username: { $regex: search, $options: "i" } }
                ];
            }

            // 🎯 4. STATUS FILTER (Agar status 'deleted' ya 'all' ke alawa kuch aur hai jaise 'active')
            if (status !== "all" && status !== "deleted") {
                query.status = status;
            }

            // 📅 5. DATE RANGE FILTER
            if (startDate || endDate) {
                query.createdAt = {};

                if (startDate) {
                    query.createdAt.$gte = new Date(startDate);
                }

                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999); // full end day include
                    query.createdAt.$lte = end;
                }
            }

            // ✅ TOTAL COUNT (WITH FILTER)
            const total = await Reel.countDocuments(query);

            // ✅ FETCH DATA
            const reels = await Reel.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            res.status(200).json({
                data: reels,
                total: total,
                page,
                limit,
            });

        } catch (error) {
            console.error("Error fetching reels:", error);
            error.statusCode = error.statusCode || 500;
            await logError(req, error);
            res.status(500).json({
                message: "Error fetching reels",
            });
        }
    }
);

router.get("/shownew", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || "2", 10);
        const excludeStr = req.query.exclude;
        const currentUserId = req.query.userId;
        const direction = req.query.direction || "next";

        if (!currentUserId) {
            return res.status(400).json({ message: "Missing userId" });
        }

        // 🚀 MICRO-OPTIMIZATION 1: Ek hi object me matchStage start karein
        const matchStage = {
            isDeleted: { $ne: true },
            status: { $ne: "Blocked" }
        };

        const excludedReelIds = [];

        // Exclude Array ko fast process karna aur Crash se bachana
        if (excludeStr) {
            const excludeArr = excludeStr.split(",");
            for (let i = 0; i < excludeArr.length; i++) {
                const id = excludeArr[i].trim();
                // 🔥 CRASH PREVENTION: Sirf valid ID hi MongoDB filter me jayegi
                if (id && mongoose.isValidObjectId(id)) {
                    excludedReelIds.push(new mongoose.Types.ObjectId(id));
                }
            }
        }

        // 🚀 MICRO-OPTIMIZATION 2: Smart Viewer Query Builder
        const isIdValid = mongoose.isValidObjectId(currentUserId);
        const viewerQuery = isIdValid
            ? { $or: [{ _id: currentUserId }, { userid: currentUserId }] }
            : { userid: currentUserId };

        const viewer = await User.findOne(viewerQuery)
            .select("blockedUsers isDeleted profilePicture _id")
            .lean();

        let currentUserIdStr = currentUserId.toString();
        let currentUserProfilePic = "";

        if (viewer) {
            if (viewer.isDeleted) {
                return res.status(403).json({ message: "Your account is deleted. Access denied." });
            }

            currentUserIdStr = viewer._id.toString();
            currentUserProfilePic = viewer.profilePicture || "";

            // Parallel DB calls
            const [blockers, notInterestedInteractions] = await Promise.all([
                User.find({ blockedUsers: viewer._id }).select("_id").lean(),
                ReelInteraction.find({ user: viewer._id, action: "not_interested" })
                    .select("reel")
                    .sort({ createdAt: -1 })
                    .limit(200)
                    .lean()
            ]);

            // 🚀 MICRO-OPTIMIZATION 3: Spread Operator (...) ki jagah Direct Push
            // (Spread operator bade arrays me RAM zyada khata hai aur slow hota hai)
            const allExcludedUsers = [];
            const blockedList = viewer.blockedUsers || [];

            for (let i = 0; i < blockedList.length; i++) {
                allExcludedUsers.push(blockedList[i]);
            }
            for (let i = 0; i < blockers.length; i++) {
                allExcludedUsers.push(blockers[i]._id);
            }

            if (allExcludedUsers.length > 0) {
                matchStage.user = { $nin: allExcludedUsers };
            }

            // Not Interested reels ko seedha excludedReelIds me add kar do
            for (let i = 0; i < notInterestedInteractions.length; i++) {
                excludedReelIds.push(notInterestedInteractions[i].reel);
            }
        }

        // Agar koi bhi exclude karne wali reel mili hai toh matchStage me add karein
        if (excludedReelIds.length > 0) {
            matchStage._id = { $nin: excludedReelIds };
        }

        // 🎬 Aggregate random reels
        const reels = await Reel.aggregate([
            { $match: matchStage },
            { $sample: { size: limit } }
        ]);

        // 🔥 Populate
        await User.populate(reels, {
            path: "user",
            select: "profilePicture followers seller_id userseller_id"
        });

        // 🚀 MICRO-OPTIMIZATION 4: Fast FOR Loop ki jagah .map()
        // Node.js engine basic for-loop ko callback functions (.map, .some) se zyada tez execute karta hai
        const reelsWithFollow = new Array(reels.length); // Memory pehle hi allocate kar di

        for (let i = 0; i < reels.length; i++) {
            const reel = reels[i];
            const owner = (reel.user && reel.user._id) ? reel.user : {};

            let isFollowing = false;
            if (owner.followers && owner.followers.length > 0) {
                for (let j = 0; j < owner.followers.length; j++) {
                    if (owner.followers[j].toString() === currentUserIdStr) {
                        isFollowing = true;
                        break; // Jaise hi follower mil jaye, loop rok do (Fast)
                    }
                }
            }

            reelsWithFollow[i] = {
                ...reel,
                user: owner._id ? owner._id.toString() : reel.user,
                isFollowing: isFollowing,
                currentUserProfilePic: currentUserProfilePic,
                reelUserProfilePic: owner.profilePicture || "",
                seller_id: reel.seller_id || owner.seller_id || "",
                userseller_id: reel.userseller_id || owner.userseller_id || "",
            };
        }

        return res.json({ reels: reelsWithFollow, direction });

    } catch (e) {
        console.error("Error fetching reels:", e);
        if (!res.headersSent) {
            e.statusCode = e.statusCode || 500;
            return res.status(500).json({ message: "Error fetching reels" });
        }
    }
});
router.post("/view", async (req, res) => {
    try {
        const { reelId, userId } = req.body;

        if (!reelId || !userId) {
            return res.status(400).json({ message: "reelId and userId are required" });
        }

        if (!mongoose.isValidObjectId(reelId)) {
            return res.status(400).json({ message: "Invalid reelId" });
        }

        // Fetch user with blockedUsers for block check
        let user = null;
        if (mongoose.isValidObjectId(userId)) {
            user = await User.findById(userId).select("isSuspended blockedUsers").lean();
        }
        if (!user) {
            user = await User.findOne({ userid: userId }).select("isSuspended blockedUsers").lean();
        }

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isSuspended) {
            return res.status(200).json({
                message: "View ignored"
            });
        }

        // 🔥 ADDED: MUTUAL BLOCK CHECK START 🔥
        const currentReel = await Reel.findById(reelId).select("user").lean();
        if (!currentReel) {
            return res.status(404).json({ message: "Reel not found" });
        }

        if (currentReel.user) {
            const owner = await User.findById(currentReel.user).select("blockedUsers").lean();

            const hasOwnerBlockedViewer = owner?.blockedUsers?.some(bid => bid.toString() === user._id.toString());
            const hasViewerBlockedOwner = user.blockedUsers?.some(bid => bid.toString() === currentReel.user.toString());

            if (hasOwnerBlockedViewer || hasViewerBlockedOwner) {
                // View ko silently ignore kar diya taaki frontend player crash na ho
                return res.status(200).json({ message: "View ignored due to privacy" });
            }
        }
        // 🔥 ADDED: MUTUAL BLOCK CHECK END 🔥

        // Atomically add user to viewsdata only if not present, and increment views only in that case
        const updated = await Reel.findOneAndUpdate(
            { _id: reelId, viewsdata: { $ne: user._id } },
            { $addToSet: { viewsdata: user._id }, $inc: { views: 1 } },
            { new: true }
        );

        if (!updated) {
            // Either reel not found, or user already counted (can't distinguish without another query)
            const reelExists = await Reel.exists({ _id: reelId });
            if (!reelExists) return res.status(404).json({ message: "Reel not found" });
            return res.status(200).json({ message: "View already counted" });
        }

        return res.status(200).json({
            message: "View added",
            views: updated.views,
        });
    } catch (error) {
        console.error("Error incrementing reel view:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Error incrementing reel view" });
    }
});

router.get("/current/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { currentUserId } = req.query; // current logged-in user

        // 1️⃣ Validate Reel ID
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid reel ID" });
        }

        // 2️⃣ Fetch reel
        const currentReel = await Reel.findById(id).lean();
        if (!currentReel) {
            return res.status(404).json({ message: "Reel not found!" });
        }

        // 🔥 3️⃣ BLOCK CHECK (MOST IMPORTANT)
        if (currentReel.status === "Blocked") {
            return res.status(404).json({ message: "Reel not available" });
        }

        // Resolve viewer to support string userid fallback
        let viewer = null;
        if (currentUserId) {
            if (mongoose.isValidObjectId(currentUserId)) {
                viewer = await User.findById(currentUserId).select("blockedUsers profilePicture").lean();
            }
            if (!viewer) {
                viewer = await User.findOne({ userid: currentUserId }).select("blockedUsers profilePicture").lean();
            }
        }

        // 🔥 ADDED: MUTUAL BLOCK CHECK START 🔥
        if (viewer && currentReel.user) {
            const owner = await User.findById(currentReel.user).select("blockedUsers").lean();

            if (owner) {
                const hasViewerBlockedOwner = viewer.blockedUsers?.some(bid => bid.toString() === currentReel.user.toString());
                const hasOwnerBlockedViewer = owner.blockedUsers?.some(bid => bid.toString() === viewer._id.toString());

                if (hasViewerBlockedOwner || hasOwnerBlockedViewer) {
                    return res.status(404).json({ message: "Reel not available" });
                }
            }
        }
        // 🔥 ADDED: MUTUAL BLOCK CHECK END 🔥

        // 4️⃣ Fetch current user's profile picture
        const currentUserProfilePic = viewer?.profilePicture || "";

        // 5️⃣ Fetch reel owner info
        const reelOwner = await User.findById(
            currentReel.user,
            "profilePicture followers"
        ).lean();

        const reelUserProfilePic = reelOwner?.profilePicture || "";

        // 6️⃣ Check follow status
        const currentUserIdStr = viewer ? viewer._id.toString() : (currentUserId ? currentUserId.toString() : "");
        const isFollowing = reelOwner?.followers?.some(
            (followerId) => followerId.toString() === currentUserIdStr
        );

        // 7️⃣ Final response object
        const reelWithProfiles = {
            ...currentReel,
            reelUserProfilePic,
            currentUserProfilePic,
            isFollowing: !!isFollowing,
        };

        // 8️⃣ Send response
        res.status(200).json(reelWithProfiles);

    } catch (error) {
        console.error("Error in /current/:id →", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/admin_current/:id", adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { currentUserId } = req.query; // current logged-in user

        // 1️⃣ Validate Reel ID
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid reel ID" });
        }

        // 2️⃣ Fetch reel
        const currentReel = await Reel.findById(id).lean();
        if (!currentReel) {
            return res.status(404).json({ message: "Reel not found!" });
        }

        // 🔥 3️⃣ BLOCK CHECK (MOST IMPORTANT)
        if (currentReel.status === "Blocked") {
            return res.status(404).json({ message: "Reel not available" });
        }

        // 4️⃣ Fetch current user's profile picture
        let currentUserProfilePic = "";
        if (currentUserId && mongoose.isValidObjectId(currentUserId)) {
            const currentUser = await User.findById(
                currentUserId,
                "profilePicture"
            ).lean();
            currentUserProfilePic = currentUser?.profilePicture || "";
        }

        // 5️⃣ Fetch reel owner info
        const reelOwner = await User.findById(
            currentReel.user,
            "profilePicture followers"
        ).lean();

        const reelUserProfilePic = reelOwner?.profilePicture || "";

        // 6️⃣ Check follow status
        const isFollowing = reelOwner?.followers?.some(
            (followerId) => followerId.toString() === currentUserId
        );

        // 7️⃣ Final response object
        const reelWithProfiles = {
            ...currentReel,
            reelUserProfilePic,
            currentUserProfilePic,
            isFollowing: !!isFollowing,
        };

        // 8️⃣ Send response
        res.status(200).json(reelWithProfiles);

    } catch (error) {
        console.error("Error in /current/:id →", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Server error" });
    }
});

// Get other reels
router.get("/others/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            limit = 10,
            skip = 0,
            excludeId,
            reelType,
            currentUserId,
            musicId,
            playableOnly,
        } = req.query;

        const onlyPlayable =
            playableOnly === "1" ||
            playableOnly === "true" ||
            playableOnly === true;

        let query = {};

        // 🔥 BLOCKED REELS HIDE (USER SIDE)
        query.status = onlyPlayable ? "Published" : { $ne: "Blocked" };

        if (onlyPlayable) {
            query.videoUrl = { $exists: true, $nin: ["", null] };
            // 480p goes live first; 720p is added in the background.
            query.qualityVariants = { $in: ["480p", "720p"] };
        }

        let resolvedTargetUserId = null;
        if (reelType !== "liked" && reelType !== "music") {
            let cleanUserId = userId || "";
            if (cleanUserId.startsWith("@")) {
                cleanUserId = cleanUserId.substring(1);
            }

            let targetUser = null;
            if (mongoose.isValidObjectId(cleanUserId)) {
                targetUser = await User.findById(cleanUserId).lean();
            }
            if (!targetUser && mongoose.isValidObjectId(userId)) {
                targetUser = await User.findById(userId).lean();
            }
            if (!targetUser) {
                targetUser = await User.findOne({ userid: cleanUserId }).lean();
            }
            if (!targetUser) {
                targetUser = await User.findOne({ userid: userId }).lean();
            }
            if (!targetUser) {
                targetUser = await User.findOne({ username: cleanUserId }).lean();
            }
            if (!targetUser) {
                targetUser = await User.findOne({ username: userId }).lean();
            }
            if (!targetUser) {
                return res.status(200).json([]);
            }
            resolvedTargetUserId = targetUser._id;
        }

        // 🎯 Decide which reels to fetch
        if (reelType === "liked") {
            if (!currentUserId) {
                return res.status(400).json({
                    message: "currentUserId is required for liked reels"
                });
            }
            query.likes = currentUserId;

        } else if (reelType === "music") {
            if (!musicId) {
                return res.status(400).json({
                    message: "musicId is required for music reels"
                });
            }
            query.music = musicId;

        } else {
            query.user = resolvedTargetUserId;
        }

        // Resolve currentUserId / viewer to handle string userid
        let viewer = null;
        if (currentUserId) {
            if (mongoose.isValidObjectId(currentUserId)) {
                viewer = await User.findById(currentUserId).select("blockedUsers profilePicture").lean();
            }
            if (!viewer) {
                viewer = await User.findOne({ userid: currentUserId }).select("blockedUsers profilePicture").lean();
            }
        }

        // 🔥 ADDED: MUTUAL BLOCK FILTER LOGIC START 🔥
        if (viewer) {
            const blockedList = viewer.blockedUsers || [];
            const blockers = await User.find({ blockedUsers: viewer._id }).select("_id").lean();
            const usersWhoBlockedMe = blockers.map(b => b._id);
            const allBlocked = [...blockedList, ...usersWhoBlockedMe];

            if (allBlocked.length > 0) {
                if (query.user) {
                    // Agar specific profile dekh rahe hain, aur wo block hai, toh seedha empty return
                    const isBlocked = allBlocked.some(bid => bid.toString() === query.user.toString());
                    if (isBlocked) {
                        return res.status(200).json([]);
                    }
                } else {
                    // Agar Liked ya Music reels dekh rahe hain, toh blocked owners ki reels nikal do
                    query.user = { $nin: allBlocked };
                }
            }
        }
        // 🔥 ADDED: MUTUAL BLOCK FILTER LOGIC END 🔥

        if (viewer) {
            const notInterested = await ReelInteraction.find({
                user: viewer._id,
                action: "not_interested"
            }).select("reel").lean();

            if (notInterested.length > 0) {
                const notInterestedIds = notInterested.map(
                    i => new mongoose.Types.ObjectId(i.reel)
                );

                if (query._id) {
                    query._id = {
                        ...query._id,
                        $nin: [...(query._id.$nin || []), ...notInterestedIds]
                    };
                } else {
                    query._id = { $nin: notInterestedIds };
                }
            }
        }

        // 🚫 Exclude a reel (for infinite scroll) — FIXED
        if (excludeId) {
            const excludeObjectId = new mongoose.Types.ObjectId(excludeId);

            if (query._id) {
                query._id = {
                    ...query._id,
                    $ne: excludeObjectId
                };
            } else {
                query._id = { $ne: excludeObjectId };
            }
        }

        // 📦 Fetch reels
        const reels = await Reel.find(query)
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .lean();

        if (!reels.length) {
            return res.status(200).json([]);
        }

        // 👤 Fetch current user's profile picture
        const currentUserProfilePic = viewer?.profilePicture || "";
        const currentUserIdStr = viewer ? viewer._id.toString() : (currentUserId ? currentUserId.toString() : "");

        // 🔁 Enhance reels with follow status + profile pics
        const enhancedReels = await Promise.all(
            reels.map(async (reel) => {
                const reelOwner = await User.findById(
                    reel.user,
                    "profilePicture followers"
                ).lean();

                const reelUserProfilePic = reelOwner?.profilePicture || "";

                const isFollowing = reelOwner?.followers?.some(
                    (followerId) =>
                        followerId.toString() === currentUserIdStr
                );

                return {
                    ...reel,
                    reelUserProfilePic,
                    currentUserProfilePic,
                    isFollowing: !!isFollowing,
                };
            })
        );

        res.status(200).json(enhancedReels);

    } catch (error) {
        console.error(error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Server error" });
    }
});


//delete video
router.delete("/delete/:reelId/:userid", async (req, res) => {
    try {
        const { reelId, userid } = req.params;

        // 1️⃣ Validate reelId
        if (!mongoose.isValidObjectId(reelId)) {
            return res.status(400).json({ message: "Invalid reel id" });
        }

        // 2️⃣ Find reel
        const reel = await Reel.findById(reelId);
        if (!reel) {
            return res.status(404).json({ message: "Reel not found" });
        }

        // 3️⃣ OWNER CHECK (✅ FIXED: Using reel.user and .toString() to match your test URL)
        if (reel.user.toString() !== userid) {
            return res.status(403).json({
                message: "You are not allowed to delete this reel"
            });
        }

        // 4️⃣ LOG (✅ ObjectId)
        try {
            await logUserAction({
                user: req.user._id, // Assumes you have auth middleware setting req.user
                userName: req.userName,
                userRole: req.userRole,
                action: "delete_reel",
                targetType: "Reel",
                targetId: reelId,
                targetName: `Reel ID: ${reelId}`,
                device: req.headers["user-agent"],
                location: {
                    ip:
                        req.headers["x-forwarded-for"] ||
                        req.socket.remoteAddress ||
                        "",
                    country: req.headers["cf-ipcountry"] || "",
                }
            });
        } catch (e) {
            console.error("Log error:", e.message);
        }

        // 5️⃣ Delete comments
        await Comment.deleteMany({ reel: reelId });

        // 6️⃣ Delete reel
        await reel.deleteOne();

        return res.status(200).json({
            success: true,
            message: "Reel + comments + likes + views deleted successfully"
        });

    } catch (error) {
        console.error("Delete reel error:", error);
        // Fallback status code if error.statusCode is undefined
        const statusCode = error.statusCode || 500;

        // Log error if the function exists
        if (typeof logError === 'function') {
            await logError(req, error);
        }

        return res.status(statusCode).json({ message: "Error deleting reel" });
    }
});

router.delete("/admin_delete/:reelId/:userid", adminAuth,
    checkPermission("DELETE_REEL"), async (req, res) => {
        try {
            const { reelId, userid } = req.params;

            // 1️⃣ Validate reelId
            if (!mongoose.isValidObjectId(reelId)) {
                return res.status(400).json({ message: "Invalid reel id" });
            }

            // 2️⃣ Find reel
            const reel = await Reel.findById(reelId);
            if (!reel) {
                return res.status(404).json({ message: "Reel not found" });
            }

            // 3️⃣ OWNER CHECK (string based)
            if (reel.userid !== userid) {
                return res.status(403).json({
                    message: "You are not allowed to delete this reel"
                });
            }

            // 4️⃣ LOG (✅ ObjectId)
            try {
                await logUserAction({
                    user: req.user._id,
                    userName: req.userName,
                    userRole: req.userRole,
                    action: "delete_reel",
                    targetType: "Reel",
                    targetId: reelId,
                    targetName: `Reel ID: ${reelId}`,
                    device: req.headers["user-agent"],
                    location: {
                        ip:
                            req.headers["x-forwarded-for"] ||
                            req.socket.remoteAddress ||
                            "",
                        country: req.headers["cf-ipcountry"] || "",
                    }
                });
            } catch (e) {
                console.error("Log error:", e.message);
            }

            // 5️⃣ Delete comments
            await Comment.deleteMany({ reel: reelId });

            // 6️⃣ Delete reel
            await reel.deleteOne();

            return res.status(200).json({
                success: true,
                message: "Reel + comments + likes + views deleted successfully"
            });

        } catch (error) {
            error.statusCode = error.statusCode || 500;
            console.error("Delete reel error:", error);
            await logError(req, error);
            return res.status(500).json({ message: "Error deleting reel" });
        }
    });

router.put("/update/:id", async (req, res) => {
    try {
        const { videoUrl, thumbnailUrl, caption, duration, music } = await req.body;
        const video = await Reel.findById(req.params.id);
        if (!video) { res.status(404).json({ message: "Video not found!" }) };
        if (videoUrl) { video.videoUrl = videoUrl };
        if (thumbnailUrl) { video.thumbnailUrl = thumbnailUrl };
        if (caption) { video.caption = caption };
        if (duration) { video.duration = duration };
        if (music) { video.music = music };

        const updatedReel = await video.save();


        // Safely log user action (even if log fails, app continues)
        try {
            await logUserAction({
                user: video.user,
                action: "update_reel",
                targetType: "Reel",
                targetId: req.params.id,
                device: req.headers["user-agent"],
                location: {
                    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
                    country: req.headers["cf-ipcountry"] || "",
                    city: "", // Optional: Use IP geolocation later
                    pincode: ""
                }
            });
        } catch (logError) {
            console.error("Log error (non-blocking):", logError.message);
        }
        res.status(200).json({
            _id: updatedReel._id,
            videoUrl: updatedReel.videoUrl,
            thumbnailUrl: updatedReel.thumbnailUrl,
            caption: updatedReel.caption,
            duration: updatedReel.duration,
            music: updatedReel.music,
        });


    } catch (error) {
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({
            message: "Error in updation!"
        });
        console.log("Error in updateion reel", error);
    }
});

// Like or Unlike a Reel
router.put("/like/:id", async (req, res) => {
    console.log("========== LIKE API ==========");
    console.log("BODY:", req.body);
    console.log("REEL ID:", req.params.id);
    try {
        const { userId } = req.body; // who is liking
        const reelId = req.params.id;

        if (!userId) return res.status(400).json({ message: "User ID is required" });

        // ✅ Fetch user
        let user = null;
        if (mongoose.isValidObjectId(userId)) {
            user = await User.findById(userId);
        }
        if (!user) {
            user = await User.findOne({ userid: userId });
        }
        console.log("========== USER ==========");
        console.log("User ObjectId:", user?._id);
        console.log("User UserId:", user?.userid);
        console.log("User Suspended:", user?.isSuspended);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!user.userid) return res.status(500).json({ message: "User.userid missing" });

        if (user.isSuspended) {
            // user reel dekh sakta hai, but like/unlike count nahi badhega
            return res.status(200).json({
                message: "Like ignored"
            });
        }

        // ✅ Fetch reel
        const reel = await Reel.findById(reelId);
        console.log("========== REEL ==========");
        console.log("Reel ObjectId:", reel?._id);
        console.log("Reel Owner ObjectId:", reel?.user);
        console.log("Reel Owner UserId:", reel?.userid);
        console.log("Likes Before:", reel?.likes);
        if (!reel) return res.status(404).json({ message: "Reel not found" });
        if (!reel.userid) return res.status(500).json({ message: "Reel.userid missing" });

        // 🔥 ADDED: MUTUAL BLOCK CHECK START 🔥
        if (reel.user) {
            const owner = await User.findById(reel.user).select("blockedUsers").lean();

            const hasOwnerBlockedViewer = owner?.blockedUsers?.some(bid => bid.toString() === user._id.toString());
            const hasViewerBlockedOwner = user.blockedUsers?.some(bid => bid.toString() === reel.user.toString());

            if (hasOwnerBlockedViewer || hasViewerBlockedOwner) {
                return res.status(403).json({ message: "Action not allowed due to privacy settings." });
            }
        }
        // 🔥 ADDED: MUTUAL BLOCK CHECK END 🔥

        const alreadyLiked = reel.likes.includes(user._id);
        console.log("========== LIKE STATUS ==========");
        console.log("Already Liked:", alreadyLiked);
        if (alreadyLiked) {
            // ❌ UNLIKE (NO NOTIFICATION)
            console.log("👉 UNLIKE FLOW");
            reel.likes = reel.likes.filter(id => id.toString() !== user._id.toString());
            await reel.save();
            console.log("Returning Response: Reel unliked");
            return res.status(200).json({
                message: "Reel unliked",
                likes: reel.likes.length
            });

        } else {
            // ❤️ LIKE
            reel.likes.push(user._id);
            await reel.save();

            // 🔔 CREATE LIKE NOTIFICATION
            console.log("========== NOTIFICATION ==========");
            try {

                console.log("Creating like notification:", {
                    recipientUserId: reel.userid,
                    senderUserId: user.userid,
                    type: "like",
                    reel: reelId
                });

                await createNotification({
                    recipientObjectId: reel.user,   // Mongo ObjectId of reel owner
                    senderObjectId: user._id,       // Mongo ObjectId of liker
                    recipientUserId: reel.userid,   // userid string
                    senderUserId: user.userid,      // userid string
                    type: "like",
                    reel: reelId,
                    message: "liked your video"
                });
                console.log("✅ Notification Function Completed");
            } catch (notifError) {
                console.error("Like notification failed:", notifError.message);
            }
            console.log("Returning Response: Reel liked");

            return res.status(200).json({
                message: "Reel liked",
                likes: reel.likes.length
            });
        }

    } catch (error) {
        console.error("Error in liking/unliking reel:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Something went wrong" });
    }
});

// return total likes of all users
router.get("/totallikes", adminAuth, async (req, res) => {
    try {
        // Sirf likes field uthao (fast)
        const reels = await Reel.find({}, "likes");

        let totalLikes = 0;

        for (const reel of reels) {
            totalLikes += reel.likes.length;
        }

        res.status(200).json({
            totalLikes, // 👈 ALL USERS TOTAL LIKES
        });
    } catch (error) {
        console.error("Error fetching total likes:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Server error" });
    }
});

// return this api total views of all users
router.get("/totalviews", adminAuth, async (req, res) => {
    try {
        // Sirf views field uthao (fast query)
        const reels = await Reel.find({}, "views");

        let totalViews = 0;

        for (const reel of reels) {
            totalViews += reel.views || 0;
        }

        res.status(200).json({
            totalViews, // 👈 ALL USERS TOTAL VIEWS
        });
    } catch (error) {
        console.error("Error fetching total views:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Server error" });
    }
});


router.put("/block/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body;
        // action = "block" | "unblock"

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid reel id" });
        }

        if (!["block", "unblock"].includes(action)) {
            return res.status(400).json({ message: "Invalid action" });
        }

        let updateData = {};

        if (action === "block") {
            updateData = {
                status: "Blocked",
                blockedAt: new Date(),                 // ✅ auto time
                blockReason: reason || "Policy violation"
            };
        } else {
            updateData = {
                status: "Published",
                blockedAt: null,                       // ✅ reset
                blockReason: null
            };
        }

        const reel = await Reel.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );
        try {
            await logUserAction({
                user: req.user._id,
                userName: req.userName,
                userRole: req.userRole,

                action: action === "block" ? "block_reel" : "unblock_reel",

                targetType: "Reel",
                targetId: reel._id,
                targetName: `Reel ID: ${reel._id}`,
                device: req.headers["user-agent"],
                location: {
                    ip:
                        req.headers["x-forwarded-for"] ||
                        req.socket.remoteAddress ||
                        "",
                    country: req.headers["cf-ipcountry"] || "",
                },
            });
        } catch (e) {
            console.error("Log error:", e.message);
        }
        if (!reel) {
            return res.status(404).json({ message: "Reel not found" });
        }

        return res.status(200).json({
            success: true,
            message: `Reel ${action === "block" ? "blocked" : "unblocked"} successfully`,
            reel
        });

    } catch (error) {
        console.error("Error blocking/unblocking reel:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        res.status(500).json({ message: "Server error" });
    }
});


router.put("/admin_block/:id", adminAuth,
    checkPermission("BLOCK_REEL"), async (req, res) => {
        try {
            const { id } = req.params;
            const { action, reason } = req.body;
            // action = "block" | "unblock"

            if (!mongoose.isValidObjectId(id)) {
                return res.status(400).json({ message: "Invalid reel id" });
            }

            if (!["block", "unblock"].includes(action)) {
                return res.status(400).json({ message: "Invalid action" });
            }

            let updateData = {};

            if (action === "block") {
                updateData = {
                    status: "Blocked",
                    blockedAt: new Date(),                 // ✅ auto time
                    blockReason: reason || "Policy violation"
                };
            } else {
                updateData = {
                    status: "Published",
                    blockedAt: null,                       // ✅ reset
                    blockReason: null
                };
            }

            const reel = await Reel.findByIdAndUpdate(
                id,
                updateData,
                { new: true }
            );
            try {
                await logUserAction({
                    user: req.user._id,
                    userName: req.userName,
                    userRole: req.userRole,

                    action: action === "block" ? "block_reel" : "unblock_reel",

                    targetType: "Reel",
                    targetId: reel._id,
                    targetName: `Reel ID: ${reel._id}`,
                    device: req.headers["user-agent"],
                    location: {
                        ip:
                            req.headers["x-forwarded-for"] ||
                            req.socket.remoteAddress ||
                            "",
                        country: req.headers["cf-ipcountry"] || "",
                    },
                });
            } catch (e) {
                console.error("Log error:", e.message);
            }
            if (!reel) {
                return res.status(404).json({ message: "Reel not found" });
            }

            return res.status(200).json({
                success: true,
                message: `Reel ${action === "block" ? "blocked" : "unblocked"} successfully`,
                reel
            });

        } catch (error) {
            console.error("Error blocking/unblocking reel:", error);
            error.statusCode = error.statusCode || 500;
            await logError(req, error);
            res.status(500).json({ message: "Server error" });
        }
    });

router.get("/admin/users/:userid/liked-reels", adminAuth, async (req, res) => {
    try {
        const { userid } = req.params;

        // pagination params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const skip = (page - 1) * limit;

        // 1️⃣ Find the user admin clicked
        const user = await User.findOne({ userid });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2️⃣ Count total liked reels
        const total = await Reel.countDocuments({
            likes: user._id,
        });

        // 3️⃣ Fetch paginated liked reels
        const reels = await Reel.find({
            likes: user._id,
        })
            .populate("user", "userid username profilePicture")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return res.json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: skip + reels.length < total,
            reels,
        });
    } catch (error) {
        console.error("Error fetching liked reels:", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        return res.status(500).json({ message: "Server error" });
    }
});


router.get("/users/:userId/music", adminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const page = Number(req.query.page) || 1;
        const limit = 8;
        const skip = (page - 1) * limit;

        // safety check
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid userId" });
        }

        const totalItems = await Music.countDocuments({
            uploadedBy: userId
        });

        const music = await Music.find({
            uploadedBy: userId
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            music,
            pagination: {
                totalItems,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                limit
            }
        });
    } catch (err) {
        console.error("Fetch user music error:", err);
        err.statusCode = err.statusCode || 500;
        await logError(req, err);
        res.status(500).json({ message: "Failed to fetch user music" });
    }
});

module.exports = router;