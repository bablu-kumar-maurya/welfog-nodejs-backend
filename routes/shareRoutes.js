const { generateShortLink } = require("../utils/shortLink");
const express = require("express");
const router = express.Router();
const User = require("../models/Users"); 
const path = require("path");
const Reel = require("../models/Reel");
const logError = require("../utils/logError");
const logUserAction = require("../utils/logUserAction"); 
require("dotenv").config();

const os = require("os");
const DESKTOP = path.join(os.homedir(), "Desktop");

router.get('/deeplink-test.html', (req, res) => {
    res.sendFile(path.join(DESKTOP, 'deeplink-test.html'));
});

router.get('/r/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        // ✅ FULL reelId + UUID safe
        const match = slug.match(/^([a-f0-9]{24})-(.+)$/i);
        if (!match) {
            return res.status(400).send("Invalid slug format");
        }

        const reelId = match[1];
        const ownerUserId = decodeURIComponent(match[2]);

        const reel = await Reel.findById(reelId);
        if (!reel) return res.status(404).send("Reel not found");

        // ✅ 🔥 FIX: STRING COMPARE (UUID / number dono handle karega)
        if (String(reel.userid) !== String(ownerUserId)) {
            return res.status(404).send("Invalid user");
        }

        await Reel.findByIdAndUpdate(reel._id, {
            $inc: { plays: 1 }
        });

        return res.redirect(
            `${process.env.BASE_URL}/api/plays/dl/reel/${reel._id}/user/${reel.userid}`
        );

    } catch (err) {
        console.error("Error in /r/:slug →", err);
        err.statusCode = err.statusCode || 500;
        await logError(req, err);
        res.status(500).send("Server error");
    }
});




router.get('/dl/reel/:reelId/user/:userId', (req, res) => {
    const { reelId, userId } = req.params;

    const deepLink = `welfog://Play/sepreel/${reelId}?u=${userId}`;

    const playStoreUrl =
        `https://play.google.com/store/apps/details?id=com.welfog.app` +
        `&referrer=${encodeURIComponent(`reelId=${reelId}&userId=${userId}`)}`;

    const html = `
<html>
<head>
<script>
    let openApp = true;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) openApp = false;
    });

    window.location.href = "${deepLink}";

    setTimeout(() => {
        if (openApp) window.location.href = "${playStoreUrl}";
    }, 3000);
</script>
</head>
<body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;text-align:center;">
    Opening WELFOG App...<br><br>
    If not installed, Play Store will open.
</body>
</html>
    `;

    res.send(html);
});

router.get('/reel/:reelId/share/:userId', async (req, res) => {
    try {
        const { reelId } = req.params;

        const reel = await Reel.findById(reelId);
        if (!reel) return res.status(404).send("Reel not found");

        const { slug, shortLink } = generateShortLink(
            reel._id,
            reel.userid
        );

        if (!reel.shortLinks || reel.shortLinks.length === 0) {
            reel.shortLinks.push({
                slug,
                shortLink,
                generatedForUser: reel.user,
                generatedAt: new Date()
            });
            await reel.save();
        }

        return res.json({ shortLink });

    } catch (error) {
        console.error("Error generating short link →", error);
        error.statusCode = error.statusCode || 500;
        await logError(req, error);
        return res.status(500).send("Server error");
    }
});

router.get('/admin/fix-shortlinks-v2', async (req, res) => {
    try {
        const reels = await Reel.find({}, { _id: 1, userid: 1, user: 1 });

        for (const reel of reels) {
            const slug = `${reel._id}-${encodeURIComponent(reel.userid)}`;
            const shortLink = `https://api.welfog.com/api/plays/r/${slug}`;

            await Reel.updateOne(
                { _id: reel._id },
                {
                    $set: {
                        shortLinks: [{
                            slug,
                            shortLink,
                            generatedForUser: reel.user,
                            generatedAt: new Date()
                        }]
                    }
                }
            );
        }

        res.send("✅ All shortLinks upgraded to FULL reelId");

    } catch (err) {
        console.error(err);
        err.statusCode = err.statusCode || 500;
        await logError(req, err);
        res.status(500).send("Migration error");
    }
});


router.get('/profile/:userId/share', async (req, res) => {
    try {
        const { userId } = req.params;

        // User ko database me dhoondo
        const targetUser = await User.findById(userId);
        
        if (!targetUser || targetUser.isDeleted || targetUser.isSuspended) {
            return res.status(404).json({ message: "User not found or suspended" });
        }

        // Clean shortlink generate karo (e.g., /api/plays/p/rohit123)
        const shortLink = `${process.env.BASE_URL}/api/plays/p/${targetUser.username}`;

        return res.json({ shortLink });

    } catch (error) {
        console.error("Error generating profile short link →", error);
        error.statusCode = error.statusCode || 500;
        return res.status(500).send("Server error");
    }
});

// =======================================================
// 2. HANDLE PROFILE LINK (Browser / WhatsApp link click)
// =======================================================
router.get('/p/:username', async (req, res) => {
    try {
        const { username } = req.params;

        // Username se user find karo
        const user = await User.findOne({ username });
        
        if (!user || user.isDeleted || user.isSuspended) {
            return res.status(404).send("User not found or account deactivated");
        }

        // Reel ki tarah isko bhi Deep Link wale HTML page par bhej do
        return res.redirect(
            `${process.env.BASE_URL}/api/plays/dl/profile/${user.userid}`
        );

    } catch (err) {
        console.error("Error in /p/:username →", err);
        res.status(500).send("Server error");
    }
});

// =======================================================
// 3. RENDER DEEP LINK HTML (App open karega ya Play Store)
// =======================================================
router.get('/dl/profile/:userid', (req, res) => {
    const { userid } = req.params;

    // App me Profile open karne ka Deep Link scheme (Check your App Code)
    const deepLink = `welfog://Profile/${userid}`;

    // Play Store link with referrer (taaki install ke baad sidha profile khule)
    const playStoreUrl =
        `https://play.google.com/store/apps/details?id=com.welfog.app` +
        `&referrer=${encodeURIComponent(`profileId=${userid}`)}`;

    const html = `
<html>
<head>
<script>
    let openApp = true;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) openApp = false;
    });

    window.location.href = "${deepLink}";

    setTimeout(() => {
        if (openApp) window.location.href = "${playStoreUrl}";
    }, 3000);
</script>
</head>
<body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;text-align:center;">
    Opening WELFOG Profile...<br><br>
    If not installed, Play Store will open.
</body>
</html>
    `;

    res.send(html);
});

module.exports = router;