const express = require("express");
const Music = require("../models/Music");
const router = express.Router();
const axios = require("axios");
const mongoose = require("mongoose");
const User = require("../models/Users");
const adminAuth = require("../middleware/adminAuth");
const checkPermission = require("../middleware/checkPermission");
const logUserAction = require("../utils/logUserAction");
const logError = require("../utils/logError");


router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    // 1️⃣ Search local DB
    const localResults = await Music.find({
      title: { $regex: q, $options: "i" },
    }).lean();

    // 2️⃣ Fetch from Audius API
    const searchUrl = `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(
      q
    )}&app_name=welfog`;
    const searchRes = await axios.get(searchUrl);

    const audiusTracks = searchRes.data.data.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.user?.name,
      artwork: track.artwork?.["480x480"] || track.artwork?.["150x150"],
      url: `https://discoveryprovider.audius.co/v1/tracks/${track.id}/stream?app_name=welfog`,
    }));

    // 3️⃣ Filter out duplicates (already in local DB)
    const existingTitles = localResults.map((t) => t.title?.toLowerCase().trim());
    const newAudiusTracks = audiusTracks.filter(
      (t) => !existingTitles.includes(t.title?.toLowerCase().trim())
    );


    // 5️⃣ Combine both — local first, then Audius
    const combinedResults = [
      ...localResults.map((r) => ({
        id: r.audiusId || r._id,
        title: r.title,
        artist: r.artist,
        artwork: r.artwork,
        url: r.url,
      })),
      ...newAudiusTracks,
    ];

    res.json(combinedResults);
  } catch (err) {
    console.error("❌ Error fetching tracks:", err.message);
    err.statusCode = err.statusCode || 500;
    await logError(req, err);
    res.status(500).json({ error: "Failed to fetch music" });
  }
});


router.get("/searchindb", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const music = await Music.find({
      $or: [
        { title: { $regex: q, $options: "i" } },
        { artist: { $regex: q, $options: "i" } }
      ]
    }).limit(10);


    res.json(music);
  } catch (err) {
    err.statusCode = err.statusCode || 500;
    await logError(req, err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/new", async (req, res) => {
  try {
    const { title, artist, url, duration, uploadedBy, thumbnail } = req.body;

    if (!uploadedBy) {
      return res.status(400).json({ message: "uploadedBy required" });
    }

    const user = await User.findById(uploadedBy);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🚫 suspend check
    if (user.isSuspended) {
      return res.status(200).json({
        message: "Music upload ignored"
      });
    }

    if (!title || !url) {
      return res.status(400).json({
        message: "title and url are required"
      });
    }

    // 🔥🔥 DUPLICATE CHECK (MOST IMPORTANT)
    const existingMusic = await Music.findOne({ url });

    if (existingMusic) {
      // ♻️ reuse existing music
      return res.status(200).json({
        message: "Music already exists",
        data: existingMusic._id
      });
    }

    // 🆕 create new music only if not exists
    const newMusic = await Music.create({
      title,
      artist,
      url,
      duration,
      uploadedBy,
      thumbnail
    });

    return res.status(201).json({
      message: "Music Saved Successfully",
      data: newMusic._id
    });

  } catch (error) {
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    console.error("Error in upload music:", error);

    // unique index error safety
    if (error.code === 11000) {
      const existing = await Music.findOne({ url: req.body.url });
      return res.status(200).json({
        message: "Music already exists",
        data: existing?._id
      });
    }

    return res.status(500).json({
      message: "Error Found in Upload Music"
    });
  }
});



router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || "";
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";

    let filter = {};

    // 🔍 Search Filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { artist: { $regex: search, $options: "i" } }
      ];
    }

    // 📅 Date Range Filter
    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include full end day
        filter.createdAt.$lte = end;
      }
    }

    const totalItems = await Music.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const data = await Music.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      page,
      limit,
      totalItems,
      totalPages,
      data
    });

  } catch (error) {
    console.error("Error fetching music:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
);


router.get("/admin-view", adminAuth, checkPermission("VIEW_MUSIC"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || "";
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";

    let filter = {};

    // 🔍 Search Filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { artist: { $regex: search, $options: "i" } }
      ];
    }

    // 📅 Date Range Filter
    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include full end day
        filter.createdAt.$lte = end;
      }
    }

    const totalItems = await Music.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const data = await Music.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      page,
      limit,
      totalItems,
      totalPages,
      data
    });

  } catch (error) {
    console.error("Error fetching music:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
);

//find single music 
router.get("/:id", async (req, res) => {
  try {

    const music = await Music.findById(req.params.id);
    if (!music) return res.status(404).json({ message: "Music not found" });
    res.json(music);
  } catch (err) {
    err.statusCode = err.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ message: "Server error" });
  }
});



router.put("/update/:id", async (req, res) => {
  const { title, artist, thumbnail } = await req.body;
  try {
    const music = await Music.findById(req.params.id);
    if (!music) { res.status(404).json({ message: "Music not found" }) };

    const user = await User.findById(music.uploadedBy);
    if (user?.isSuspended) {
      return res.status(200).json({ message: "Update ignored" });
    }

    if (title) music.title = title;
    if (artist) music.artist = artist;
    if (thumbnail) music.thumbnail = thumbnail;

    const musicSave = await music.save();

    res.status(201).json(
      {
        message: "Update Music",
        title: musicSave.title,
        artist: musicSave.artist,
        id: musicSave._id
      }
    );

  } catch (error) {
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ message: "Error to Update music" });

    console.log(error);
  }
});
// Get music uploads by a specific user(admin)
router.get("/users/:userId/music", async (req, res) => {
  try {
    const music = await Music.find({ uploadedBy: req.params.userId })
      .sort({ createdAt: -1 });

    res.json({ music });
  } catch (err) {
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({ message: "Server error" });
  }
});


// Delete music
router.delete("/delete/:id", adminAuth, checkPermission("DELETE_MUSIC"), async (req, res) => {
  try {
    const musicId = req.params.id;

    // id valid hai ya nahi
    if (!mongoose.Types.ObjectId.isValid(musicId)) {
      return res.status(400).json({ message: "Invalid music id" });
    }

    const music = await Music.findById(musicId);

    if (!music) {
      return res.status(404).json({
        message: "Music not found"
      });
    }

    // DB se delete
    await Music.findByIdAndDelete(musicId);

    res.json({
      success: true,
      message: "Music deleted successfully"
    });

  } catch (error) {
    console.error("Delete music error:", error);
    error.statusCode = error.statusCode || 500;
    await logError(req, error);
    res.status(500).json({
      message: "Server error while deleting music"
    });
  }
});

// Update userid after first login
router.put("/update-userid", async (req, res) => {
  try {
    const { mobile, userid } = req.body;

    if (!mobile || !userid) {
      return res.status(400).json({
        success: false,
        message: "mobile and userid are required"
      });
    }

    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Same hai to update ki zarurat nahi
    if (user.userid === userid) {
      return res.status(200).json({
        success: true,
        message: "Userid already updated",
        user
      });
    }

    const oldUserId = user.userid;

    user.userid = userid;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Userid updated successfully",
      oldUserId,
      newUserId: userid
    });

  } catch (error) {
    console.error("Update userid error:", error);

    if (typeof logError === "function") {
      error.statusCode = error.statusCode || 500;
      await logError(req, error);
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});


module.exports = router;