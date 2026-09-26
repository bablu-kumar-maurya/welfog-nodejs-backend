const express = require("express");
const router = express.Router();
const Reel = require("../models/Reel"); // Reel Model path ke according set karein
const User = require("../models/Users");
const Hashtag = require("../models/hashtag"); // Naya banaya hua Hashtag model
const mongoose = require("mongoose");
// 3. Auto-complete / Search suggestion API (Regex ke sath)
router.get("/search_suggestions", async (req, res) => {
    try {
        let q = req.query.q || "";
        const viewerId = req.query.viewerId;

        // # remove karo
        q = q.replace(/^#/, "").toLowerCase().trim();

        // ========================================================
        // BLOCKED USERS
        // Sirf decide karne ke liye ki hashtag suggestion
        // visible honi chahiye ya nahi.
        //
        // IMPORTANT:
        // blocked users ki reels count se REMOVE nahi hongi.
        // ========================================================

        let blockedList = [];

        if (viewerId && mongoose.isValidObjectId(viewerId)) {
            const viewer = await User.findById(viewerId)
                .select("_id blockedUsers")
                .lean();

            if (viewer) {
                // Users whom viewer blocked
                const blockedByViewer = viewer.blockedUsers || [];

                // Users who blocked viewer
                const blockedViewerDocs = await User.find({
                    blockedUsers: viewer._id,
                })
                    .select("_id")
                    .lean();

                const blockedViewerIds = blockedViewerDocs.map(
                    (user) => user._id
                );

                // Mutual block list
                blockedList = [
                    ...blockedByViewer,
                    ...blockedViewerIds,
                ];
            }
        }

        // ========================================================
        // CASE 1:
        // User ne sirf "#"
        // ========================================================

        if (!q) {
            const popularHashtags = await Reel.aggregate([
                {
                    $match: {
                        status: "Published",
                        isDeleted: false,
                    },
                },

                {
                    $unwind: "$hashtags",
                },

                {
                    $project: {
                        name: {
                            $toLower: "$hashtags",
                        },

                        user: 1,
                    },
                },

                {
                    $group: {
                        _id: "$name",

                        // 🔥 REAL COUNT
                        // Blocked reels ko count se remove nahi karna
                        count: {
                            $sum: 1,
                        },

                        // Kya is hashtag ko koi non-blocked user
                        // use kar raha hai?
                        hasVisibleReel: {
                            $max: {
                                $cond: [
                                    {
                                        $in: [
                                            "$user",
                                            blockedList,
                                        ],
                                    },
                                    0,
                                    1,
                                ],
                            },
                        },
                    },
                },

                // 🔥 Hashtag tabhi suggestion mein aayega
                // jab kam se kam ek visible reel ho
                {
                    $match: {
                        hasVisibleReel: 1,
                    },
                },

                {
                    $sort: {
                        count: -1,
                    },
                },

                {
                    $limit: 10,
                },

                {
                    $project: {
                        _id: 0,
                        name: "$_id",
                        count: 1,
                    },
                },
            ]);

            return res.status(200).json({
                success: true,
                suggestions: popularHashtags,
            });
        }

        // ========================================================
        // CASE 2:
        // User ne "#bab" / "bab" type kiya
        // ========================================================

        const escapedQuery = q.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const regex = new RegExp(
            "^" + escapedQuery,
            "i"
        );

        const suggestions = await Reel.aggregate([
            // Sirf Published + non-deleted reels
            {
                $match: {
                    status: "Published",
                    isDeleted: false,
                },
            },

            // Hashtags ko individual documents mein convert karo
            {
                $unwind: "$hashtags",
            },

            // User ke search ke according hashtag match karo
            {
                $match: {
                    hashtags: {
                        $regex: regex,
                    },
                },
            },

            {
                $project: {
                    name: {
                        $toLower: "$hashtags",
                    },

                    user: 1,
                },
            },

            // Same hashtag ko group karo
            {
                $group: {
                    _id: "$name",

                    // 🔥 REAL COUNT
                    // Yahan blocked user ki reels bhi count hongi
                    count: {
                        $sum: 1,
                    },

                    // 🔥 Visible reel check
                    hasVisibleReel: {
                        $max: {
                            $cond: [
                                {
                                    $in: [
                                        "$user",
                                        blockedList,
                                    ],
                                },
                                0,
                                1,
                            ],
                        },
                    },
                },
            },

            // Kam se kam ek non-blocked user's reel
            // mein hashtag hona chahiye
            {
                $match: {
                    hasVisibleReel: 1,
                },
            },

            // Most used hashtag first
            {
                $sort: {
                    count: -1,
                },
            },

            // Maximum 10 suggestions
            {
                $limit: 10,
            },

            // Final response
            {
                $project: {
                    _id: 0,
                    name: "$_id",
                    count: 1,
                },
            },
        ]);

        return res.status(200).json({
            success: true,
            suggestions,
        });

    } catch (err) {
        console.error(
            "❌ Hashtag Suggestion Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

router.get("/hashtag_videos", async (req, res) => {
    try {
        const tag = req.query.tag
            ?.replace(/^#/, "")
            .toLowerCase()
            .trim();

        const viewerId = req.query.viewerId;

        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        if (!tag) {
            return res.status(400).json({
                success: false,
                message: "Hashtag parameter (tag) is required"
            });
        }

        // ============================================================
        // 1. BLOCKED USERS
        // ============================================================

        let blockedList = [];

        if (viewerId && mongoose.Types.ObjectId.isValid(viewerId)) {
            const viewer = await User.findById(viewerId)
                .select("blockedUsers")
                .lean();

            // Users blocked by viewer
            const blockedByViewer = viewer?.blockedUsers || [];

            // Users who blocked viewer
            const blockedViewerDocs = await User.find({
                blockedUsers: viewerId
            })
                .select("_id")
                .lean();

            const blockedByOthers = blockedViewerDocs.map(
                user => user._id
            );

            blockedList = [
                ...new Set([
                    ...blockedByViewer.map(id => id.toString()),
                    ...blockedByOthers.map(id => id.toString())
                ])
            ];
        }

        // ============================================================
        // 2. EXACT HASHTAG FILTER
        // ============================================================

        const escapedTag = escapeRegex(tag);

        const hashtagRegex = new RegExp(`^${escapedTag}$`, "i");

        const hashtagFilter = {
            status: "Published",
            isDeleted: false,

            $or: [
                {
                    hashtags: {
                        $regex: hashtagRegex
                    }
                },
                {
                    caption: {
                        $regex: `#${escapedTag}\\b`,
                        $options: "i"
                    }
                }
            ]
        };

        // ============================================================
        // 3. BLOCKED USER FILTER
        // ============================================================

        if (blockedList.length > 0) {
            hashtagFilter.user = {
                $nin: blockedList
            };
        }

        // ============================================================
        // 4. VIDEOS
        // ============================================================

        const videos = await Reel.find(hashtagFilter)
            .select(
                "userid username name videoUrl thumbnailUrl caption likes views createdAt music hashtags"
            )
            .populate("music", "title artist thumbnail")
            .sort({
                views: -1,
                createdAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean();

        // ============================================================
        // 5. TOTAL VIDEOS
        // ============================================================

        const totalVideos = await Reel.countDocuments(hashtagFilter);

        // ============================================================
        // 6. RELATED ACCOUNTS
        // ============================================================

        const relatedAccountRegex = new RegExp(escapedTag, "i");
        const accountFilter = {
            username: {
                $regex: relatedAccountRegex
            }
        };

        // Blocked users ke accounts bhi hide karo
        if (blockedList.length > 0) {
            accountFilter._id = {
                $nin: blockedList
            };
        }

        const accounts = await User.find(accountFilter)
            .select(
                "userid username name profilePicture bio followers following"
            )
            .limit(20)
            .lean();

        // ============================================================
        // 7. RELATED TAGS
        // ============================================================

        const relatedTagMatch = {
            status: "Published",
            isDeleted: false
        };

        // Blocked users ke reels related tags me bhi nahi aayenge
        if (blockedList.length > 0) {
            relatedTagMatch.user = {
                $nin: blockedList
            };
        }

        const relatedTags = await Reel.aggregate([
            {
                $match: relatedTagMatch
            },

            {
                $unwind: "$hashtags"
            },

            {
                $match: {
                    hashtags: {
                        $regex: relatedAccountRegex
                    }
                }
            },

            {
                $project: {
                    tag: {
                        $toLower: "$hashtags"
                    }
                }
            },

            {
                $group: {
                    _id: "$tag",
                    count: {
                        $sum: 1
                    }
                }
            },

            {
                $sort: {
                    count: -1
                }
            },

            {
                $limit: 30
            },

            {
                $project: {
                    _id: 0,
                    tag: "$_id",
                    count: 1
                }
            }
        ]);

        // ============================================================
        // 8. RESPONSE
        // ============================================================

        return res.status(200).json({
            success: true,

            hashtag: tag,

            videos: {
                total: totalVideos,
                currentPage: page,
                limit,
                hasMore: skip + videos.length < totalVideos,
                data: videos
            },

            accounts: {
                total: accounts.length,
                data: accounts
            },

            tags: {
                total: relatedTags.length,
                data: relatedTags
            }
        });

    } catch (err) {
        console.error("❌ Hashtag Videos Error:", err);

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});


/*
 * ============================================================
 * REGEX ESCAPE FUNCTION
 * ============================================================
 */

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
module.exports = router;