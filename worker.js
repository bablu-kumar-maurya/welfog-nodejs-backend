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
const { uploadToS3, s3 } = require("./lib/s3"); // S3 client aur upload function
const { generateShortLink } = require("./utils/shortLink");

// DB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Worker connected to MongoDB"))
    .catch(err => console.error("Worker DB Connection Error:", err));

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// =================================================================
// === FFMPEG & DOWNLOAD HELPERS ===
// =================================================================
async function compressVideo(inputPath, outputPath) {
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
        ]).save(outputPath).on("end", resolve).on("error", reject);
    });
}

function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const duration = metadata?.format?.duration;
            if (duration && !isNaN(parseFloat(duration))) resolve(Math.round(parseFloat(duration)));
            else resolve(0);
        });
    });
}

function getMediaDurationSec(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
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
            cmd.complexFilter([ `[0:a]volume=${ov.toFixed(4)}[orig]`, `${trimmedMusic}[music]`, `[orig][music]amix=inputs=2:duration=first:dropout_transition=0[aout]` ]);
        } else {
            cmd.complexFilter([`${trimmedMusic}[aout]`]);
        }
        cmd.outputOptions([ "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-y" ]);
        cmd.save(outputPath).on("end", resolve).on("error", reject);
    });
}

async function downloadFileToTemp(url, ext = '.tmp') {
    const MAX_REDIRECTS = 5; let redirects = 0; let currentUrl = url;
    const tmpFile = tmp.fileSync({ postfix: ext });
    return new Promise((resolve, reject) => {
        function getFile(fileUrl) {
            if (redirects >= MAX_REDIRECTS) { tmpFile.removeCallback(); return reject(new Error('Exceeded maximum redirects.')); }
            const getter = (fileUrl.startsWith("http://") ? http : https);
            getter.get(fileUrl, (response) => {
                const statusCode = response.statusCode;
                if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
                    redirects++; currentUrl = new URL(response.headers.location, fileUrl).href; 
                    response.resume(); return getFile(currentUrl); 
                }
                if (statusCode === 200) {
                    const file = fs.createWriteStream(tmpFile.name);
                    response.pipe(file);
                    file.on("finish", () => { file.close(() => resolve(tmpFile)); });
                    file.on("error", (err) => { tmpFile.removeCallback(); reject(err); });
                    return;
                }
                tmpFile.removeCallback(); return reject(new Error(`Failed to download file, Status Code: ${statusCode}`));
            }).on("error", (err) => { tmpFile.removeCallback(); reject(err); });
        }
        getFile(currentUrl);
    });
}

// =================================================================
// === 3. CORE WORKER PROCESSING FUNCTION ===
// =================================================================
async function processReelUpload(jobData) {
    console.log(`===== [WORKER: FULL UPLOAD JOB STARTED for user ${jobData.userid}] =====`);
    
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

    try {
        if (newReelId) {
            savedReel = await Reel.findById(newReelId);
            if (!savedReel) throw new Error(`Reel stub not found: ${newReelId}`);
        }

        console.log("-> Downloading Raw Video from S3...");
        const inputTmp = await downloadFileToTemp(rawVideoUrl, path.extname(videoOriginalname) || ".mp4");
        tempFiles.push(inputTmp);

        const outputTmp = tmp.fileSync({ postfix: ".mp4" });
        tempFiles.push(outputTmp);

        let videoToCompressPath = inputTmp.name;
        const videoStartMs = parseFloat(videoStartTime);
        const videoEndMs = parseFloat(videoEndTime);
        if (Number.isFinite(videoStartMs) && Number.isFinite(videoEndMs)) {
            const startSec = videoStartMs / 1000;
            const dur = (videoEndMs - videoStartMs) / 1000;
            if (dur > 0) {
                const trimmedTmp = tmp.fileSync({ postfix: ".mp4" });
                tempFiles.push(trimmedTmp);
                await new Promise((resolve, reject) => {
                    ffmpeg(inputTmp.name).seekInput(startSec).duration(dur)
                        .outputOptions(["-c", "copy", "-y"])
                        .save(trimmedTmp.name).on("end", resolve).on("error", reject);
                });
                videoToCompressPath = trimmedTmp.name;
            }
        }

        console.log("-> ⚡ BYPASSING Backend Compression for Faster Upload...");
        fs.copyFileSync(videoToCompressPath, outputTmp.name);

        videoFileWithFinalAudioPath = outputTmp.name;

        let shouldReplaceAudio = false;
        let audioInputPath = null;
        let audioDuration = 0; 

        if (externalAudioData && externalAudioData.url && (!musicId || !mongoose.Types.ObjectId.isValid(musicId))) {
            console.log("[STEP 3.0] Processing external audio data from body (new Music track)...");
            try {
                const title = externalAudioData.title || "External Sound";
                const artist = externalAudioData.artist || "Unknown Artist";
                const existingMusic = await Music.findOne({ title, artist });

                if (existingMusic) {
                    finalMusicId = existingMusic._id;
                    shouldReplaceAudio = true;
                    const ext = path.extname(existingMusic.url) || '.mp3';
                    const musicTmpObj = await downloadFileToTemp(existingMusic.url, ext);
                    tempFiles.push(musicTmpObj);
                    audioInputPath = musicTmpObj.name;  
                } else {
                    const ext = path.extname(new URL(externalAudioData.url).pathname) || '.mp3';
                    const musicTmpObj = await downloadFileToTemp(externalAudioData.url, ext);
                    tempFiles.push(musicTmpObj);
                    audioInputPath = musicTmpObj.name;
                    audioDuration = await getAudioDuration(audioInputPath);

                    const audioBuffer = fs.readFileSync(audioInputPath);
                    const audioUploadResult = await uploadToS3(
                        { buffer: audioBuffer, originalname: `external-sound-${userid}-${Date.now()}${ext}`, mimetype: ext === '.mp3' ? "audio/mp3" : "audio/mpeg" },
                        `audio`
                    );

                    const newMusic = new Music({
                        title, artist, url: audioUploadResult, duration: audioDuration,
                        uploadedBy: user, thumbnail: externalAudioData.artwork || "",
                    });
                    const savedMusic = await newMusic.save();
                    finalMusicId = savedMusic._id;
                    shouldReplaceAudio = true;
                }
            } catch (e) {
                console.warn("[WARNING] External audio failed:", e.message);
                audioInputPath = null; finalMusicId = musicId || null;
            }
        }

        if (!shouldReplaceAudio && finalMusicId && mongoose.Types.ObjectId.isValid(finalMusicId)) {
            const musicDoc = await Music.findById(finalMusicId);
            if (musicDoc?.url) {
                const ext = path.extname(musicDoc.url) || '.mp3';
                const musicTmpObj = await downloadFileToTemp(musicDoc.url, ext);
                tempFiles.push(musicTmpObj);
                audioInputPath = musicTmpObj.name;
                shouldReplaceAudio = true;
            }
        }
        
        if (shouldReplaceAudio) {
            const replacedTmp = tmp.fileSync({ postfix: ".mp4" });
            tempFiles.push(replacedTmp);
            const videoDurationSec = await getMediaDurationSec(outputTmp.name);
            const musicStartMs = Number.isFinite(parseFloat(musicStartTime)) ? parseFloat(musicStartTime) : 0;
            const musicEndMs = Number.isFinite(parseFloat(musicEndTime)) ? parseFloat(musicEndTime) : 0;
            let muxDurationSec = videoDurationSec;
            if (musicEndMs > musicStartMs) {
                muxDurationSec = Math.min(videoDurationSec, (musicEndMs - musicStartMs) / 1000);
            }
            await muxMusicOverVideo({
                videoPath: outputTmp.name, audioPath: audioInputPath, outputPath: replacedTmp.name,
                musicStartSec: musicStartMs / 1000, durationSec: muxDurationSec, musicVolume: musicVol, originalVolume: originalVol,
            });
            videoFileWithFinalAudioPath = replacedTmp.name;
        } else {
            const extractedAudioTmp = tmp.fileSync({ postfix: ".mp3" });
            tempFiles.push(extractedAudioTmp);
            await new Promise((resolve, reject) => {
                ffmpeg(outputTmp.name).outputOptions(["-vn", "-c:a libmp3lame", "-b:a 128k", "-y"])
                    .save(extractedAudioTmp.name).on("end", resolve).on("error", reject);
            });
            const audioBuffer = fs.readFileSync(extractedAudioTmp.name);
            const audioUploadResult = await uploadToS3(
                { buffer: audioBuffer, originalname: `original-sound-${userid}-${Date.now()}.mp3`, mimetype: "audio/mp3" }, `audio`
            );
            let originalAudioDuration = 0;
            const videoDurationMs = (parseFloat(videoEndTime) - parseFloat(videoStartTime));
            if (!isNaN(videoDurationMs) && videoDurationMs > 0) originalAudioDuration = Math.round(videoDurationMs / 1000);

            const newMusic = new Music({
                title: caption ? `${caption.substring(0, 50)}... (Original Sound)` : "Original Video Sound",
                artist: name || username || 'Unknown User', url: audioUploadResult,
                duration: originalAudioDuration, uploadedBy: user, thumbnail: '',
            });
            const savedMusic = await newMusic.save();
            finalMusicId = savedMusic._id;
        }

        const uploaderUser = await User.findById(user);
        if (savedReel) {
            savedReel.music = finalMusicId; savedReel.caption = caption ?? savedReel.caption;
            savedReel.username = username || savedReel.username; savedReel.name = name || savedReel.name;
            await savedReel.save();
        } 

        try {
            if (uploaderUser && savedReel.shortLinks.length === 0) {
                const { slug, shortLink } = generateShortLink(savedReel._id, uploaderUser.userid);
                savedReel.shortLinks.push({ slug, shortLink, generatedForUser: uploaderUser._id, generatedAt: new Date() });
                await savedReel.save();
            }
        } catch (shortLinkError) {
            console.warn("[WARNING] Failed to generate short link:", shortLinkError.message);
        }

        console.log("[STEP 5] Generating HLS segments (Priority 1: 480p for Instant Live)...");
        hlsDir = path.join(os.tmpdir(), `hls-${newReelId}`);
        fs.mkdirSync(hlsDir, { recursive: true });

        const generateAndUploadVariant = async (variant) => {
            const variantDir = path.join(hlsDir, variant.name);
            fs.mkdirSync(variantDir, { recursive: true });
            const segmentPattern = path.join(variantDir, "segment_%03d.ts").replace(/\\/g, '/');
            const outputPath = path.join(variantDir, "index.m3u8").replace(/\\/g, '/');

            await new Promise((resolve, reject) => {
                ffmpeg(videoFileWithFinalAudioPath)
                    .videoFilters(`scale=${variant.resolution}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`)
                    .videoCodec('libx264').audioCodec('aac')
                    .addOutputOptions([
                        "-preset", "veryfast", `-b:v ${variant.videoBitrate}`, `-maxrate ${variant.videoBitrate}`, `-bufsize ${parseInt(variant.videoBitrate) * 2}k`, `-b:a ${variant.audioBitrate}`,
                        "-sc_threshold", "0", "-g", `${24 * variant.hlsTime}`, "-keyint_min", `${24 * variant.hlsTime}`, "-force_key_frames", `expr:gte(t,n_forced*${variant.hlsTime})`,
                        "-hls_time", `${variant.hlsTime}`, "-hls_playlist_type", "vod", "-hls_list_size", "0", "-hls_flags", "independent_segments", "-hls_segment_type", "mpegts",
                        `-hls_segment_filename`, segmentPattern, "-f", "hls", "-y",
                    ])
                    .output(outputPath).on("end", resolve).on("error", reject).run();
            });

            const files = fs.readdirSync(variantDir).filter(f => fs.statSync(path.join(variantDir, f)).isFile());
            const uploadPromises = files.map(file => {
                const filePath = path.join(variantDir, file);
                const buffer = fs.readFileSync(filePath);
                const s3Folder = `videos/reels/${newReelId}/${variant.name}`; 
                const mimetype = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".ts") ? "video/mp2t" : "application/octet-stream";
                return uploadToS3({ buffer, originalname: file, mimetype }, s3Folder, true);
            });
            while (uploadPromises.length > 0) { await Promise.all(uploadPromises.splice(0, 4)); }
        };

        await generateAndUploadVariant({ name: "480p", resolution: "854x480", videoBitrate: "1100k", audioBitrate: "128k", bandwidth: 1400000, hlsTime: 2 });

        const masterPlaylistContent = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:BANDWIDTH=380000,RESOLUTION=426x240\n240p/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480\n480p/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\n720p/index.m3u8\n`;
        fs.writeFileSync(path.join(hlsDir, "master.m3u8"), masterPlaylistContent);
        await uploadToS3({ buffer: fs.readFileSync(path.join(hlsDir, "master.m3u8")), originalname: "master.m3u8", mimetype: "application/vnd.apple.mpegurl" }, `videos/reels/${newReelId}`, true);

        // THUMBNAIL LOGIC
        let thumbnailUrl = rawThumbnailUrl; 
        if (!thumbnailUrl) {
            const thumbTmp = tmp.fileSync({ postfix: ".jpg" });
            tempFiles.push(thumbTmp);
            await new Promise((resolve, reject) => {
                ffmpeg(videoFileWithFinalAudioPath).screenshots({ timestamps: [0], filename: path.basename(thumbTmp.name), folder: path.dirname(thumbTmp.name), size: "640x?" }).on("end", resolve).on("error", reject);
            });
            thumbnailUrl = await uploadToS3({ buffer: fs.readFileSync(thumbTmp.name), originalname: `thumb-${newReelId}.jpg`, mimetype: "image/jpeg" }, "thumbnails");
        }

        if (!musicId && finalMusicId) await Music.findByIdAndUpdate(finalMusicId, { thumbnail: thumbnailUrl });

        const videoUrl = `https://${process.env.CLOUDFRONT_URL}/videos/reels/${newReelId}/master.m3u8`;
        savedReel.videoUrl = sanitizeCdnUrl(videoUrl);
        savedReel.thumbnailUrl = sanitizeCdnUrl(thumbnailUrl);
        savedReel.status = 'Published'; 
        savedReel.qualityVariants = ["480p"];
        await savedReel.save();
        console.log("===== 🟢 [PRIORITY DONE: REEL IS PUBLISHED & LIVE!] =====");

        const remainingVariants = [
            { name: "240p", resolution: "426x240", videoBitrate: "350k", audioBitrate: "64k", bandwidth: 450000, hlsTime: 2 },
            { name: "720p", resolution: "1280x720", videoBitrate: "2000k", audioBitrate: "160k", bandwidth: 2500000, hlsTime: 2 }
        ];
        for (const variant of remainingVariants) await generateAndUploadVariant(variant);

        await Reel.findByIdAndUpdate(newReelId, { $addToSet: { qualityVariants: { $each: ["240p", "720p"] } } });
        console.log("===== [WORKER: FULL UPLOAD SUCCESS - ALL QUALITIES READY] =====");

        // ========================================================
        // 🗑️ STORAGE OPTIMIZATION: Delete Raw MP4 from S3 after processing
        // ========================================================
        try {
            if (rawVideoUrl) {
                const urlObj = new URL(rawVideoUrl);
                const rawKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                console.log(`🧹 Cleaning up S3... Deleting raw file: ${rawKey}`);
                
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: decodeURIComponent(rawKey),
                }));
                console.log("✅ Raw MP4 deleted successfully! Storage space saved.");
            }
        } catch (deleteError) {
            console.error("⚠ Non-blocking Error: Raw MP4 delete nahi ho payi:", deleteError.message);
        }

    } catch (err) {
        console.error("===== [WORKER: FULL UPLOAD ERROR] =====", err);
        if (newReelId) await Reel.findByIdAndUpdate(newReelId, { status: 'failed', error: err.message });
        throw err;
    } finally {
        tempFiles.forEach((t) => { try { if (t) t.removeCallback(); } catch (e) {} });
        if (hlsDir) { try { fs.rmSync(hlsDir, { recursive: true, force: true }); } catch (e) {} }
    }
}

// Start BullMQ Worker
const redisConnection = new IORedis({ maxRetriesPerRequest: null }); 
const worker = new Worker('reel-processing', async job => {
    await processReelUpload(job.data);
}, { connection: redisConnection, concurrency: 5 }); // concurrency 5 means it processes 5 videos simultaneously

worker.on('completed', job => { console.log(`Job ${job.id} has completed!`); });
worker.on('failed', (job, err) => { console.error(`Job ${job.id} has failed with ${err.message}`); });

console.log("🚀 Background Worker is running and waiting for jobs...");