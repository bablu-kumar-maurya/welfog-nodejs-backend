const mongoose = require("mongoose");

const hashtagSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    count: {
        type: Number,
        default: 1
    },

    // Last time ye hashtag kisi reel me use hua tha
    lastUsedAt: {
        type: Date,
        default: Date.now,
        index: true
    }

});

module.exports = mongoose.model("Hashtag", hashtagSchema);