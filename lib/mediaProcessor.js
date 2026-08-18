const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");
const fs = require("fs-extra");
const path = require("path");
const tmp = require("tmp");

// Set paths to static binaries
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Compress an image buffer using sharp
 * @param {Buffer} buffer 
 * @returns {Promise<Buffer>}
 */
async function compressImage(buffer) {
  try {
    return await sharp(buffer)
      .resize({ width: 1200, withoutEnlargement: true }) // limit max dimensions
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
  } catch (error) {
    console.error("Error compressing image with sharp:", error);
    return buffer; // Fallback to original buffer
  }
}

/**
 * Extract a thumbnail from a video file path and return the buffer
 * @param {string} videoPath 
 * @returns {Promise<Buffer>}
 */
function extractVideoThumbnail(videoPath) {
  return new Promise((resolve, reject) => {
    const tempImg = tmp.fileSync({ postfix: ".jpg" });
    
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ["00:00:01"],
        filename: path.basename(tempImg.name),
        folder: path.dirname(tempImg.name),
        size: "640x?"
      })
      .on("end", async () => {
        try {
          const buffer = await fs.readFile(tempImg.name);
          const compressed = await compressImage(buffer);
          await fs.remove(tempImg.name);
          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

/**
 * Compress a video buffer using fluent-ffmpeg
 * Returns compressed video buffer & generated compressed thumbnail buffer
 * @param {Buffer} videoBuffer 
 * @returns {Promise<{videoBuffer: Buffer, thumbnailBuffer: Buffer}>}
 */
async function compressVideo(videoBuffer) {
  const tempInput = tmp.fileSync({ postfix: ".mp4" });
  const tempOutput = tmp.fileSync({ postfix: ".mp4" });

  try {
    await fs.writeFile(tempInput.name, videoBuffer);

    // Compress video using ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(tempInput.name)
        .output(tempOutput.name)
        .videoCodec("libx264")
        .audioCodec("aac")
        .size("?x720") // Scale to 720p height maintaining aspect ratio
        .videoBitrate("1500k")
        .audioBitrate("128k")
        .outputOptions([
          "-preset fast",
          "-crf 28",
          "-movflags +faststart" // optimized for web streaming
        ])
        .on("end", resolve)
        .on("error", (err) => {
          console.error("FFmpeg Video Compression Error:", err);
          reject(err);
        })
        .run();
    });

    const compressedVideoBuffer = await fs.readFile(tempOutput.name);
    
    // Generate thumbnail
    let thumbnailBuffer;
    try {
      thumbnailBuffer = await extractVideoThumbnail(tempInput.name);
    } catch (err) {
      console.warn("Could not generate video thumbnail:", err.message);
      // Fallback: simple 1x1 black pixel image buffer
      thumbnailBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64"
      );
    }

    // Clean up temp files
    await fs.remove(tempInput.name);
    await fs.remove(tempOutput.name);

    return {
      videoBuffer: compressedVideoBuffer,
      thumbnailBuffer
    };
  } catch (error) {
    console.error("Error in video compression workflow:", error);
    // Cleanup if any temp file exists
    fs.remove(tempInput.name).catch(() => {});
    fs.remove(tempOutput.name).catch(() => {});
    throw error;
  }
}

/**
 * Generate a thumbnail buffer from a video buffer
 * @param {Buffer} videoBuffer 
 * @returns {Promise<Buffer>}
 */
async function generateVideoThumbnail(videoBuffer) {
  const tempInput = tmp.fileSync({ postfix: ".mp4" });
  try {
    await fs.writeFile(tempInput.name, videoBuffer);
    const thumbnailBuffer = await extractVideoThumbnail(tempInput.name);
    await fs.remove(tempInput.name);
    return thumbnailBuffer;
  } catch (error) {
    console.error("Error generating video thumbnail:", error);
    await fs.remove(tempInput.name).catch(() => {});
    // Fallback: simple 1x1 black pixel image buffer
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64"
    );
  }
}

module.exports = {
  compressImage,
  compressVideo,
  generateVideoThumbnail
};
