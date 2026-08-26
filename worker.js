const mongoose = require('mongoose');
const fs = require("fs");
const path = require("path");
const tmp = require("tmp");
const http = require("http");
const https = require("https");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffprobeStatic = require('ffprobe-static');
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
require('dotenv').config();

// AWS SDK import for deleting raw file
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");

// Apne DB models require karo
const Reel = require("./models/Reel");
const User = require("./models/Users");
const Music = require("./models/Music");
const { uploadToS3, s3, deleteFileFromS3 } = require("./lib/s3"); // S3 client aur upload function
const { generateShortLink } = require("./utils/shortLink");

// DB Connection
console.log("🔄 Trying to connect to MongoDB...");
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Worker connected to MongoDB"))
    .catch(err => console.error("❌ Worker DB Connection Error:", err));

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeStatic.path);
console.log("🎬 FFmpeg paths configured successfully.");

// =================================================================
// === FFMPEG & DOWNLOAD HELPERS ===
// =================================================================
async function compressVideo(inputPath, outputPath) {
    console.log(`🎬 [compressVideo] Started for ${inputPath}`);
    const metadata = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, data) => { if (err) return reject(err); resolve(data); });
    });
    const video = metadata.streams.find(s => s.codec_type === "video");
    const width = video.width; const height = video.height;
    const duration = parseFloat(video.duration);
    const originalSizeMB = (fs.statSync(inputPath).size / (1024 * 1024));
    let crf, bps, scaleFilter;
    if (duration >= 60 && duration <= 180) {
        if (originalSizeMB <= 40) { crf = 23; bps = 1100; }
        else if (originalSizeMB <= 100) { crf = 25; bps = 900; }
        else { crf = 27; bps = 700; }
        scaleFilter = "scale=720:-2";
    } else if (duration < 60) { crf = 20; bps = 1800; scaleFilter = "scale=720:-2"; }
    else if (duration > 180) { crf = 28; bps = 650; scaleFilter = "scale=720:-2"; }
    if (width < 1280) { scaleFilter = "scale=540:-2"; }

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath).videoFilters(scaleFilter).outputOptions([
            "-c:v libx264", `-b:v ${bps}k`, `-maxrate ${bps}k`, `-bufsize ${bps * 2}k`, `-crf ${crf}`,
            "-preset veryfast", "-c:a aac", "-b:a 128k", "-movflags +faststart", "-y"
        ]).save(outputPath)
            .on("end", () => { console.log("✅ [compressVideo] Completed!"); resolve(); })
            .on("error", (err) => { console.error("❌ [compressVideo] Error:", err); reject(err); });
    });
}

async function compressImageToWebP(inputPath, outputPath) {
    console.log(`🖼️ [compressImageToWebP] Starting single-pass WebP compression for: ${inputPath} -> ${outputPath}`);
    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-c:v', 'libwebp',
                '-q:v', '70'
            ])
            .output(outputPath)
            .on('end', () => {
                const stats = fs.statSync(outputPath);
                console.log(`✅ [compressImageToWebP] Compression completed. WebP size: ${(stats.size / 1024).toFixed(2)} KB`);
                resolve();
            })
            .on('error', (err) => {
                console.error("❌ FFmpeg webp compress error:", err);
                reject(err);
            })
            .run();
    });
}


function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) { console.error("❌ [getAudioDuration] Error:", err); return reject(err); }
            const duration = metadata?.format?.duration;
            if (duration && !isNaN(parseFloat(duration))) resolve(Math.round(parseFloat(duration)));
            else resolve(0);
        });
    });
}

function getMediaDurationSec(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) { console.error("❌ [getMediaDurationSec] Error:", err); return reject(err); }
            const duration = parseFloat(metadata?.format?.duration);
            resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
        });
    });
}

function sanitizeCdnUrl(url) {
    if (!url || typeof url !== "string") return "";
    let s = url.trim();
    while (s.length > 0) {
        if (s.endsWith("%22")) { s = s.slice(0, -3).trimEnd(); continue; }
        if (s.endsWith('"') || s.endsWith("'")) { s = s.slice(0, -1).trimEnd(); continue; }
        break;
    }
    return s;
}

async function muxMusicOverVideo({ videoPath, audioPath, outputPath, musicStartSec = 0, durationSec, musicVolume = 1, originalVolume = 0 }) {
    console.log(`🎵 [muxMusicOverVideo] Muxing started. Video: ${videoPath}, Audio: ${audioPath}`);
    const dur = Math.max(0.1, durationSec);
    const seek = Math.max(0, musicStartSec);
    const seekStr = seek.toFixed(3); const durStr = dur.toFixed(3);
    const mv = Math.min(1, Math.max(0, Number(musicVolume) || 0));
    const ov = Math.min(1, Math.max(0, Number(originalVolume) || 0));
    const mixOriginal = ov > 0.01;
    const trimmedMusic = `[1:a]atrim=start=${seekStr}:duration=${durStr},asetpts=PTS-STARTPTS,volume=${mv.toFixed(4)}`;

    return new Promise((resolve, reject) => {
        const cmd = ffmpeg(videoPath).input(audioPath);
        if (mixOriginal) {
            cmd.complexFilter([`[0:a]volume=${ov.toFixed(4)}[orig]`, `${trimmedMusic}[music]`, `[orig][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`]);
        } else {
            cmd.complexFilter([`${trimmedMusic}[aout]`]);
        }
        cmd.outputOptions(["-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-y"]);
        cmd.save(outputPath)
            .on("end", () => { console.log("✅ [muxMusicOverVideo] Muxing completed!"); resolve(); })
            .on("error", (err) => { console.error("❌ [muxMusicOverVideo] Error:", err); reject(err); });
    });
}

async function downloadFileToTemp(url, ext = '.tmp') {
    console.log(`📥 [downloadFileToTemp] Starting download for: ${url.substring(0, 50)}...`);
    const MAX_REDIRECTS = 5; let redirects = 0; let currentUrl = url;
    const tmpFile = tmp.fileSync({ postfix: ext });
    return new Promise((resolve, reject) => {
        function getFile(fileUrl) {
            if (redirects >= MAX_REDIRECTS) {
                tmpFile.removeCallback();
                console.error("❌ [downloadFileToTemp] Exceeded maximum redirects.");
                return reject(new Error('Exceeded maximum redirects.'));
            }
            const getter = (fileUrl.startsWith("http://") ? http : https);
            const req = getter.get(fileUrl, (response) => {
                const statusCode = response.statusCode;
                if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
                    redirects++; currentUrl = new URL(response.headers.location, fileUrl).href;
                    console.log(`🔄 [downloadFileToTemp] Redirecting to: ${currentUrl.substring(0, 50)}...`);
                    response.resume(); return getFile(currentUrl);
                }
                if (statusCode === 200) {
                    const file = fs.createWriteStream(tmpFile.name);
                    response.pipe(file);
                    file.on("finish", () => {
                        file.close(() => {
                            console.log(`✅ [downloadFileToTemp] Download finished. Saved at: ${tmpFile.name}`);
                            resolve(tmpFile);
                        });
                    });
                    file.on("error", (err) => {
                        tmpFile.removeCallback();
                        console.error("❌ [downloadFileToTemp] File write error:", err);
                        reject(err);
                    });
                    return;
                }
                tmpFile.removeCallback();
                console.error(`❌ [downloadFileToTemp] Failed with Status Code: ${statusCode}`);
                return reject(new Error(`Failed to download file, Status Code: ${statusCode}`));
            });
            req.setTimeout(300000, () => {
                req.destroy();
                tmpFile.removeCallback();
                reject(new Error("Download socket timeout after 5 minutes"));
            });
            req.on("error", (err) => {
                tmpFile.removeCallback();
                console.error("❌ [downloadFileToTemp] HTTP request error:", err);
                reject(err);
            });
        }
        getFile(currentUrl);
    });
}

// =================================================================
// === 3. CORE WORKER PROCESSING FUNCTION ===
// =================================================================
async function processReelUpload(jobData, job = null) {
    console.log(`\n======================================================`);
    console.log(`🚀 [WORKER: FULL UPLOAD JOB STARTED for user ${jobData.userid}]`);
    console.log(`🔍 [JOB DATA RECIEVED] Reel ID: ${jobData.reelId}, RawVideoUrl: ${jobData.rawVideoUrl ? "YES" : "NO"}`);

    const { rawVideoUrl, rawThumbnailUrl, videoOriginalname, reelId: existingReelId, externalAudioData, ...reelMetadata } = jobData;

    const {
        user, userid, username, name, caption, musicId,
        videoStartTime, videoEndTime, musicStartTime, musicEndTime,
    } = reelMetadata;
    const musicVol = Math.min(1, Math.max(0, parseFloat(externalAudioData?.musicVolume ?? 1)));
    const originalVol = Math.min(1, Math.max(0, parseFloat(externalAudioData?.originalVolume ?? 0)));

    const tempFiles = [];
    let videoFileWithFinalAudioPath = null;
    let finalMusicId = musicId || null;
    let newReelId = existingReelId;
    let savedReel = null;
    let hlsDir = null;
    let videoHasAudio = false;
    let originalAudioToExtract = false;

    try {
        if (newReelId) {
            console.log(`🔍 Fetching stub reel from DB: ${newReelId}`);
            savedReel = await Reel.findById(newReelId);
            if (!savedReel) {
                console.error(`❌ Reel stub not found in DB: ${newReelId}`);
                throw new Error(`Reel stub not found: ${newReelId}`);
            }
            console.log(`✅ Stub reel found in DB.`);
        }

        console.log("-> 📥 Downloading Raw Video from S3...");
        const inputTmp = await downloadFileToTemp(rawVideoUrl, path.extname(videoOriginalname) || ".mp4");
        tempFiles.push(inputTmp);
        console.log(`✅ Raw Video downloaded to: ${inputTmp.name}`);

        // 📏 Check File Size (Max 200MB limit)
        const rawFileSizeMB = fs.statSync(inputTmp.name).size / (1024 * 1024);
        console.log(`📊 Raw Video File Size: ${rawFileSizeMB.toFixed(2)} MB`);
        if (rawFileSizeMB > 200) {
            console.error(`❌ Raw video file size (${rawFileSizeMB.toFixed(2)}MB) exceeds maximum limit of 200MB.`);
            throw new Error(`Video file size (${rawFileSizeMB.toFixed(2)}MB) exceeds 200MB limit.`);
        }

        if (job && job.updateProgress) await job.updateProgress(20);

        const outputTmp = tmp.fileSync({ postfix: ".mp4" });
        tempFiles.push(outputTmp);

        let videoToCompressPath = inputTmp.name;
        const totalMediaDuration = await getMediaDurationSec(inputTmp.name);
        console.log(`⏱️ Total Media Duration: ${totalMediaDuration.toFixed(2)}s`);

        const videoStartMs = parseFloat(videoStartTime);
        const videoEndMs = parseFloat(videoEndTime);

        let startSec = 0;
        let dur = 0;
        let shouldTrim = false;

        if (Number.isFinite(videoStartMs) && Number.isFinite(videoEndMs)) {
            startSec = Math.max(0, videoStartMs / 1000);
            dur = (videoEndMs - videoStartMs) / 1000;
            if (dur > 0) {
                shouldTrim = true;
                if (dur > 45) {
                    console.log(`⚠️ Trim duration (${dur}s) exceeds 45s maximum limit. Capping to 45s.`);
                    dur = 45;
                }
            }
        }

        // If no valid trim bounds passed, but overall video > 45s, force trim to max 45s
        if (!shouldTrim && totalMediaDuration > 45) {
            console.log(`⚠️ Video duration (${totalMediaDuration.toFixed(2)}s) exceeds 45s maximum limit. Auto-trimming to 45s...`);
            startSec = 0;
            dur = 45;
            shouldTrim = true;
        }

        console.log(`⏱️ Final Trim Decision: shouldTrim=${shouldTrim}, Start=${startSec}s, Duration=${dur}s`);

        if (shouldTrim && dur > 0) {
            console.log(`✂️ Trimming video... Start: ${startSec}s, Duration: ${dur}s`);
            const trimmedTmp = tmp.fileSync({ postfix: ".mp4" });
            tempFiles.push(trimmedTmp);
            await new Promise((resolve, reject) => {
                ffmpeg(inputTmp.name).seekInput(startSec).duration(dur)
                    .outputOptions(["-c", "copy", "-y"])
                    .save(trimmedTmp.name)
                    .on("end", () => { console.log("✅ Video trim complete (copied streams)."); resolve(); })
                    .on("error", (err) => {
                        console.warn("⚠️ Video trim with copy failed, attempting transcode trim fallback...", err.message);
                        ffmpeg(inputTmp.name).seekInput(startSec).duration(dur)
                            .outputOptions([
                                "-c:v", "libx264",
                                "-pix_fmt", "yuv420p",
                                "-c:a", "aac",
                                "-b:a", "128k",
                                "-y"
                            ])
                            .save(trimmedTmp.name)
                            .on("end", () => { console.log("✅ Video trim complete (transcoded fallback)."); resolve(); })
                            .on("error", (err2) => { console.error("❌ Video trim fallback failed:", err2); reject(err2); });
                    });
            });
            videoToCompressPath = trimmedTmp.name;
        }

        console.log("-> ⚡ BYPASSING Backend Compression for Faster Upload...");
        fs.copyFileSync(videoToCompressPath, outputTmp.name);

        videoFileWithFinalAudioPath = outputTmp.name;

        let shouldReplaceAudio = false;
        let audioInputPath = null;
        let audioDuration = 0;

        if (externalAudioData && externalAudioData.url && (!musicId || !mongoose.Types.ObjectId.isValid(musicId))) {
            console.log("[STEP 3.0] 🎵 Processing external audio data from body (new Music track)...");
            try {
                const title = externalAudioData.title || "External Sound";
                const artist = externalAudioData.artist || "Unknown Artist";
                console.log(`🔍 Checking if music exists in DB: Title="${title}", Artist="${artist}"`);
                const existingMusic = await Music.findOne({ title, artist });

                if (existingMusic) {
                    console.log(`✅ Existing music found in DB. ID: ${existingMusic._id}`);
                    finalMusicId = existingMusic._id;
                    shouldReplaceAudio = true;
                    const ext = path.extname(existingMusic.url) || '.mp3';
                    console.log("📥 Downloading existing music file...");
                    const musicTmpObj = await downloadFileToTemp(existingMusic.url, ext);
                    tempFiles.push(musicTmpObj);
                    audioInputPath = musicTmpObj.name;
                } else {
                    console.log("🆕 New external music detected. Downloading...");
                    const ext = path.extname(new URL(externalAudioData.url).pathname) || '.mp3';
                    const musicTmpObj = await downloadFileToTemp(externalAudioData.url, ext);
                    tempFiles.push(musicTmpObj);
                    audioInputPath = musicTmpObj.name;
                    audioDuration = await getAudioDuration(audioInputPath);

                    console.log("📤 Uploading new external music to S3...");
                    const audioBuffer = fs.readFileSync(audioInputPath);
                    const audioUploadResult = await uploadToS3(
                        { buffer: audioBuffer, originalname: `external-sound-${userid}-${Date.now()}${ext}`, mimetype: ext === '.mp3' ? "audio/mp3" : "audio/mpeg" },
                        `audio`
                    );
                    console.log(`✅ New external music uploaded to S3: ${audioUploadResult}`);

                    console.log("💾 Saving new music doc to DB...");
                    const newMusic = new Music({
                        title, artist, url: audioUploadResult, duration: audioDuration,
                        uploadedBy: user, thumbnail: externalAudioData.artwork || "",
                    });
                    const savedMusic = await newMusic.save();
                    finalMusicId = savedMusic._id;
                    shouldReplaceAudio = true;
                    console.log(`✅ New music saved. ID: ${finalMusicId}`);
                }
            } catch (e) {
                console.warn("⚠️ [WARNING] External audio failed:", e.message);
                audioInputPath = null; finalMusicId = musicId || null;
            }
        }

        if (!shouldReplaceAudio && finalMusicId && mongoose.Types.ObjectId.isValid(finalMusicId)) {
            console.log(`🔍 Checking provided musicId: ${finalMusicId}`);
            const musicDoc = await Music.findById(finalMusicId);
            if (musicDoc?.url) {
                console.log("📥 Downloading requested music file from existing ID...");
                const ext = path.extname(musicDoc.url) || '.mp3';
                const musicTmpObj = await downloadFileToTemp(musicDoc.url, ext);
                tempFiles.push(musicTmpObj);
                audioInputPath = musicTmpObj.name;
                shouldReplaceAudio = true;
                console.log("✅ Music file downloaded.");
            }
        }

        if (shouldReplaceAudio) {
            console.log("🔀 Replacing/Muxing audio into video...");
            const replacedTmp = tmp.fileSync({ postfix: ".mp4" });
            tempFiles.push(replacedTmp);
            const videoDurationSec = await getMediaDurationSec(outputTmp.name);
            const musicStartMs = Number.isFinite(parseFloat(musicStartTime)) ? parseFloat(musicStartTime) : 0;
            const musicEndMs = Number.isFinite(parseFloat(musicEndTime)) ? parseFloat(musicEndTime) : 0;
            let muxDurationSec = videoDurationSec;
            if (musicEndMs > musicStartMs) {
                muxDurationSec = Math.min(videoDurationSec, (musicEndMs - musicStartMs) / 1000);
            }
            console.log(`🎵 Mux info - MusicStart: ${musicStartMs}ms, MuxDuration: ${muxDurationSec}s`);
            await muxMusicOverVideo({
                videoPath: outputTmp.name, audioPath: audioInputPath, outputPath: replacedTmp.name,
                musicStartSec: musicStartMs / 1000, durationSec: muxDurationSec, musicVolume: musicVol, originalVolume: originalVol,
            });
            videoFileWithFinalAudioPath = replacedTmp.name;
            videoHasAudio = true;
        } else {
            console.log("🎧 No external audio replace requested. Checking for original audio stream...");

            // 🔥 Check if video has an audio stream, and defer extraction to background
            const hasAudio = await new Promise((resolve) => {
                ffmpeg.ffprobe(outputTmp.name, (err, metadata) => {
                    if (err) {
                        resolve(false);
                    } else {
                        const audioStream = metadata.streams && metadata.streams.find(s => s.codec_type === 'audio');
                        resolve(!!audioStream);
                    }
                });
            });

            if (hasAudio) {
                console.log("🔉 Original audio stream found. Deferring extraction to background...");
                originalAudioToExtract = true;
                videoHasAudio = true;
            } else {
                console.log("🔇 No audio stream found in the uploaded video. Skipping audio extraction.");
                finalMusicId = null;
                videoHasAudio = false;
            }
        }

        console.log("👤 Updating user/reel metadata in DB...");
        const uploaderUser = await User.findById(user);
        if (savedReel) {
            savedReel.music = finalMusicId; savedReel.caption = caption ?? savedReel.caption;
            savedReel.username = username || savedReel.username; savedReel.name = name || savedReel.name;
            await savedReel.save();
            console.log("✅ Reel stub updated with final metadata.");
        }

        try {
            if (uploaderUser && savedReel.shortLinks.length === 0) {
                console.log("🔗 Generating short link for Reel...");
                const { slug, shortLink } = generateShortLink(savedReel._id, uploaderUser.userid);
                savedReel.shortLinks.push({ slug, shortLink, generatedForUser: uploaderUser._id, generatedAt: new Date() });
                await savedReel.save();
                console.log(`✅ Short link generated: ${shortLink}`);
            }
        } catch (shortLinkError) {
            console.warn("⚠️ [WARNING] Failed to generate short link:", shortLinkError.message);
        }

        console.log("[STEP 5] ⚙️ Generating HLS segments (Priority 1: 480p for Instant Live)...");
        hlsDir = path.join(os.tmpdir(), `hls-${newReelId}`);
        fs.mkdirSync(hlsDir, { recursive: true });

        const generateAndUploadVariant = async (variant) => {
            console.log(`🎬 Generating HLS variant: ${variant.name} (${variant.resolution})...`);
            const variantDir = path.join(hlsDir, variant.name);
            fs.mkdirSync(variantDir, { recursive: true });
            const segmentPattern = path.join(variantDir, "segment_%03d.ts").replace(/\\/g, '/');
            const outputPath = path.join(variantDir, "index.m3u8").replace(/\\/g, '/');

            await new Promise((resolve, reject) => {
                const cmd = ffmpeg(videoFileWithFinalAudioPath)
                    .videoFilters(`scale=${variant.resolution}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`)
                    .videoCodec('libx264');

                const outputOptions = [
                    "-pix_fmt", "yuv420p", // downsample 10-bit iPhone HDR to standard 8-bit YUV 4:2:0
                    "-preset", "ultrafast",
                    `-b:v ${variant.videoBitrate}`,
                    `-maxrate ${variant.videoBitrate}`,
                    `-bufsize ${parseInt(variant.videoBitrate) * 2}k`,
                    "-sc_threshold", "0",
                    "-g", `${24 * variant.hlsTime}`,
                    "-keyint_min", `${24 * variant.hlsTime}`,
                    "-force_key_frames", `expr:gte(t,n_forced*${variant.hlsTime})`,
                    "-hls_time", `${variant.hlsTime}`,
                    "-hls_playlist_type", "vod",
                    "-hls_list_size", "0",
                    "-hls_flags", "independent_segments",
                    "-hls_segment_type", "mpegts",
                    `-hls_segment_filename`, segmentPattern,
                    "-f", "hls",
                    "-y",
                ];

                if (videoHasAudio) {
                    cmd.audioCodec('aac');
                    outputOptions.push(`-b:a ${variant.audioBitrate}`);
                } else {
                    cmd.noAudio();
                }

                cmd.addOutputOptions(outputOptions)
                    .output(outputPath)
                    .on("end", () => { console.log(`✅ HLS variant ${variant.name} generation complete.`); resolve(); })
                    .on("error", (err) => { console.error(`❌ HLS variant ${variant.name} error:`, err); reject(err); })
                    .run();
            });

            console.log(`📤 Uploading ${variant.name} HLS segments to S3...`);
            const files = fs.readdirSync(variantDir).filter(f => fs.statSync(path.join(variantDir, f)).isFile());
            const uploadPromises = files.map(file => {
                const filePath = path.join(variantDir, file);
                const buffer = fs.readFileSync(filePath);
                const s3Folder = `videos/reels/${newReelId}/${variant.name}`;
                const mimetype = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".ts") ? "video/mp2t" : "application/octet-stream";
                return uploadToS3({ buffer, originalname: file, mimetype }, s3Folder, true);
            });
            while (uploadPromises.length > 0) {
                await Promise.all(uploadPromises.splice(0, 12));
            }
            console.log(`✅ Upload complete for ${variant.name}`);
        };

        await generateAndUploadVariant({ name: "480p", resolution: "854x480", videoBitrate: "1100k", audioBitrate: "128k", bandwidth: 1400000, hlsTime: 4 });

        console.log("📝 Generating Initial Master Playlist for 480p (m3u8)...");
        const initialMasterPlaylist = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480\n480p/index.m3u8\n`;
        fs.writeFileSync(path.join(hlsDir, "master.m3u8"), initialMasterPlaylist);
        console.log("📤 Uploading Initial Master Playlist (480p) to S3...");
        await uploadToS3({ buffer: fs.readFileSync(path.join(hlsDir, "master.m3u8")), originalname: "master.m3u8", mimetype: "application/vnd.apple.mpegurl" }, `videos/reels/${newReelId}`, true);

        // THUMBNAIL LOGIC
        console.log("🖼️ Processing Thumbnail...");
        let thumbnailUrl = rawThumbnailUrl;
        if (thumbnailUrl) {
            console.log("📸 Downloading and compressing provided rawThumbnailUrl to WebP...");
            try {
                // 1. Download original thumbnail
                const origThumbTmp = await downloadFileToTemp(thumbnailUrl, ".jpg");
                tempFiles.push(origThumbTmp);

                // 2. Prepare temp file for WebP output
                const compressedThumbTmp = tmp.fileSync({ postfix: ".webp" });
                tempFiles.push(compressedThumbTmp);

                // 3. Compress/Convert image to WebP (30-40 KB)
                await compressImageToWebP(origThumbTmp.name, compressedThumbTmp.name);

                // 4. Upload WebP version to S3
                const compressedUrl = await uploadToS3({
                    buffer: fs.readFileSync(compressedThumbTmp.name),
                    originalname: `thumb-${newReelId}.webp`,
                    mimetype: "image/webp"
                }, "thumbnails");

                // 5. Delete original uncompressed thumbnail from S3
                console.log("🗑️ Deleting original uncompressed thumbnail from S3...");
                await deleteFileFromS3(thumbnailUrl);

                // 6. Use the new WebP URL
                thumbnailUrl = compressedUrl;
            } catch (err) {
                console.error("❌ Error converting/compressing thumbnail to WebP, falling back to original:", err);
            }
        } else {
            console.log("📸 Generating thumbnail from video frame...");
            let screenshotTime = 2; // Default to 2.0 seconds to skip fade-ins
            try {
                const duration = await getMediaDurationSec(videoFileWithFinalAudioPath);
                if (duration > 0) {
                    if (duration > 5) {
                        screenshotTime = Math.min(3, duration / 2); // Capture at 3 seconds or midpoint to skip fade-ins
                    } else {
                        screenshotTime = duration / 2; // Midpoint for shorter videos
                    }
                }
            } catch (err) {
                console.error("⚠️ Failed to check duration for thumbnail capture, defaulting to 2s:", err);
            }

            const thumbTmp = tmp.fileSync({ postfix: ".jpg" });
            tempFiles.push(thumbTmp);
            await new Promise((resolve, reject) => {
                ffmpeg(videoFileWithFinalAudioPath).screenshots({ timestamps: [screenshotTime], filename: path.basename(thumbTmp.name), folder: path.dirname(thumbTmp.name) })
                    .on("end", () => { console.log(`✅ Thumbnail frame captured at ${screenshotTime}s.`); resolve(); })
                    .on("error", (err) => { console.error("❌ Thumbnail capture error:", err); reject(err); });
            });

            // Convert and compress the generated thumbnail to WebP
            const compressedThumbTmp = tmp.fileSync({ postfix: ".webp" });
            tempFiles.push(compressedThumbTmp);
            await compressImageToWebP(thumbTmp.name, compressedThumbTmp.name);

            console.log("📤 Uploading generated compressed WebP thumbnail to S3...");
            thumbnailUrl = await uploadToS3({
                buffer: fs.readFileSync(compressedThumbTmp.name),
                originalname: `thumb-${newReelId}.webp`,
                mimetype: "image/webp"
            }, "thumbnails");
        }

        if (!musicId && finalMusicId) {
            console.log(`💾 Updating music document with thumbnail...`);
            await Music.findByIdAndUpdate(finalMusicId, { thumbnail: thumbnailUrl });
        }

        console.log("💾 Updating Reel DB document to 'Published'...");
        const videoUrl = `https://${process.env.CLOUDFRONT_URL}/videos/reels/${newReelId}/master.m3u8`;
        savedReel.videoUrl = sanitizeCdnUrl(videoUrl);
        savedReel.thumbnailUrl = sanitizeCdnUrl(thumbnailUrl);
        savedReel.status = 'Published';
        savedReel.qualityVariants = ["480p"];
        await savedReel.save();
        console.log("===== 🟢 [PRIORITY DONE: REEL IS PUBLISHED & LIVE AT 480P!] =====");

        console.log("⚙️ Starting background generation of remaining qualities (720p)...");
        (async () => {
            try {
                // 🎧 Background Audio Extraction
                if (originalAudioToExtract) {
                    console.log("🔉 [BACKGROUND] Original audio stream found. Extracting...");
                    const extractedAudioTmp = tmp.fileSync({ postfix: ".mp3" });
                    tempFiles.push(extractedAudioTmp);
                    await new Promise((resolve, reject) => {
                        ffmpeg(outputTmp.name).outputOptions(["-vn", "-c:a libmp3lame", "-b:a 128k", "-y"])
                            .save(extractedAudioTmp.name)
                            .on("end", () => { console.log("✅ [BACKGROUND] Original audio extracted."); resolve(); })
                            .on("error", (err) => { console.error("❌ [BACKGROUND] Audio extraction error:", err); reject(err); });
                    });

                    console.log("📤 [BACKGROUND] Uploading extracted original audio to S3...");
                    const audioBuffer = fs.readFileSync(extractedAudioTmp.name);
                    const audioUploadResult = await uploadToS3(
                        { buffer: audioBuffer, originalname: `original-sound-${userid}-${Date.now()}.mp3`, mimetype: "audio/mp3" }, `audio`
                    );

                    let originalAudioDuration = 0;
                    const videoDurationMs = (parseFloat(videoEndTime) - parseFloat(videoStartTime));
                    if (!isNaN(videoDurationMs) && videoDurationMs > 0) originalAudioDuration = Math.round(videoDurationMs / 1000);

                    console.log("💾 [BACKGROUND] Saving original audio as new Music doc...");
                    const newMusic = new Music({
                        title: caption ? `${caption.substring(0, 50)}... (Original Sound)` : "Original Video Sound",
                        artist: name || username || 'Unknown User', url: audioUploadResult,
                        duration: originalAudioDuration, uploadedBy: user, thumbnail: thumbnailUrl || '',
                    });
                    const savedMusic = await newMusic.save();
                    finalMusicId = savedMusic._id;
                    console.log(`✅ [BACKGROUND] Original audio saved. ID: ${finalMusicId}`);

                    // Update Reel with the new music ID reference
                    await Reel.findByIdAndUpdate(newReelId, { music: finalMusicId });
                }

                const remainingVariants = [
                    { name: "720p", resolution: "1280x720", videoBitrate: "2000k", audioBitrate: "160k", bandwidth: 2500000, hlsTime: 4 }
                ];
                for (const variant of remainingVariants) {
                    await generateAndUploadVariant(variant);
                }

                console.log("📝 Updating Master Playlist on S3 to include 720p (HD)...");
                const updatedMasterPlaylist = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480\n480p/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\n720p/index.m3u8\n`;
                fs.writeFileSync(path.join(hlsDir, "master.m3u8"), updatedMasterPlaylist);
                await uploadToS3({ buffer: fs.readFileSync(path.join(hlsDir, "master.m3u8")), originalname: "master.m3u8", mimetype: "application/vnd.apple.mpegurl" }, `videos/reels/${newReelId}`, true);

                console.log("💾 Updating Reel DB document with all quality variants...");
                await Reel.findByIdAndUpdate(newReelId, { $addToSet: { qualityVariants: "720p" } });
                console.log("===== 🎉 [BACKGROUND: FULL UPLOAD SUCCESS - ALL QUALITIES READY] =====");

                // ========================================================
                // 🗑️ STORAGE OPTIMIZATION: Delete Raw MP4 from S3 after processing
                // ========================================================
                try {
                    if (rawVideoUrl) {
                        const urlObj = new URL(rawVideoUrl);
                        const rawKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                        console.log(`🧹 Cleaning up S3 in background... Deleting raw file: ${rawKey}`);

                        await s3.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: decodeURIComponent(rawKey),
                        }));
                        console.log("✅ Raw MP4 deleted successfully! Storage space saved.");
                    }
                } catch (deleteError) {
                    console.error("⚠ Non-blocking Error: Raw MP4 delete nahi ho payi in background:", deleteError.message);
                }
            } catch (bgError) {
                console.error("❌ Background processing error:", bgError.message || bgError);
            } finally {
                console.log("🧹 Running background local cleanup for temp files...");
                tempFiles.forEach((t) => {
                    try { if (t) t.removeCallback(); } catch (e) { console.error("Temp file delete err in background:", e); }
                });
                if (hlsDir) {
                    try { fs.rmSync(hlsDir, { recursive: true, force: true }); } catch (e) { console.error("HLS dir delete err in background:", e); }
                }
                console.log("✅ Background cleanup done.\n");
            }
        })();

        return savedReel;

    } catch (err) {
    console.error("\n===== ❌ [WORKER: FULL UPLOAD FATAL ERROR] =====");
    console.error(err.stack || err.message || err);
    if (newReelId) {
        console.log(`⚠️ Updating Reel ${newReelId} status to 'failed' in DB...`);
        await Reel.findByIdAndUpdate(newReelId, { status: 'failed', error: err.message });
    }
    tempFiles.forEach((t) => {
        try { if (t) t.removeCallback(); } catch (e) { }
    });
    if (hlsDir) {
        try { fs.rmSync(hlsDir, { recursive: true, force: true }); } catch (e) { }
    }
    throw err;
}
}

// Start BullMQ Worker
const redisConnection = new IORedis({ maxRetriesPerRequest: null });

redisConnection.on('connect', () => console.log("✅ Worker connected to Redis"));
redisConnection.on('error', (err) => console.error("❌ Redis connection error:", err));

const worker = new Worker('reel-processing', async job => {
    console.log(`\n🔔 Worker picked up job ID: ${job.id}`);
    await processReelUpload(job.data, job);
}, {
    connection: redisConnection,
    concurrency: 4,
    lockDuration: 600000, // 10 minutes (600,000 ms) lock duration to prevent job stalling on 30s+ / 50MB-100MB videos
    stalledInterval: 30000,
    maxStalledCount: 3
}); // concurrency 4 means it processes 4 videos simultaneously

worker.on('active', job => { console.log(`▶️ Job ${job.id} is now ACTIVE.`); });
worker.on('completed', job => { console.log(`🏁 Job ${job.id} has COMPLETED successfully!`); });
worker.on('failed', (job, err) => { console.error(`❌ Job ${job.id} has FAILED with error: ${err.message}`); });
worker.on('error', err => { console.error(`⚠️ Worker caught an error:`, err); });
worker.on('stalled', (jobId) => { console.warn(`⚠️ Job ${jobId} has stalled!`); });

const chatWorker = new Worker('chat-media-processing', async job => {
    console.log(`\n💬 [ChatWorker] Processing chat media for job ID: ${job.id}`);
    const { messageId, mediaUrl, type } = job.data;
    console.log(`✅ [ChatWorker] Completed chat media processing for message ${messageId} (${type})`);
}, { connection: redisConnection, concurrency: 4 });

chatWorker.on('active', job => { console.log(`▶️ [ChatWorker] Job ${job.id} is now ACTIVE.`); });
chatWorker.on('completed', job => { console.log(`🏁 [ChatWorker] Job ${job.id} completed.`); });
chatWorker.on('failed', (job, err) => { console.error(`❌ [ChatWorker] Job ${job.id} failed: ${err.message}`); });

console.log("🚀 Background Worker is running and waiting for jobs (Reels & Chat Media)...");