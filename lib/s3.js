const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner"); // <-- ADDED FOR DIRECT UPLOAD
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const { pipeline } = require("stream/promises");
const path = require("path");  

console.log("DEBUG: Loading AWS Configuration...");
console.log("Bucket Name:", process.env.AWS_BUCKET_NAME);
console.log("Region:", process.env.AWS_REGION);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function guessContentTypeByName(name) {
  const ext = (path.extname(name) || "").toLowerCase();
  switch (ext) {
    case ".m3u8": return "application/vnd.apple.mpegurl";
    case ".ts": return "video/mp2t";
    case ".mp4": return "video/mp4";
    case ".mp3": return "audio/mpeg";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

// =========================================================
// NEW: Generate Pre-signed URL for Direct Mobile Upload
// =========================================================
const generatePresignedUrl = async (filename, fileType, folder) => {
  const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${filename}`;
  const key = `${folder}/${uniqueFileName}`;

  const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
  });

  // Link 15 minutes ke liye valid rahega
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  const rawUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  return { uploadUrl, rawUrl, key };
};

const uploadToS3 = async (file, folder = "uploads", preserveFilename = false) => {
  const safeOriginal = file.originalname || `file-${Date.now()}`;
  const key = preserveFilename
    ? `${folder}/${safeOriginal}`
    : `${folder}/${uuidv4()}-${safeOriginal}`;

  const contentType = file.mimetype || guessContentTypeByName(safeOriginal);

let cacheControl = "public, max-age=31536000, immutable"; 

if (key.endsWith(".m3u8")) {
  cacheControl = "public, max-age=86400, stale-while-revalidate=86400";
}

if (key.endsWith(".ts")) {
  cacheControl = "public, max-age=31536000, immutable";
}

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: contentType,
    CacheControl: cacheControl,
  }));

  const cloudfrontDomain = process.env.CLOUDFRONT_URL;
  return `https://${cloudfrontDomain}/${key}`;
};

const getFileFromS3 = async (key, destinationPath) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });
  const response = await s3.send(command);
  const writeStream = fs.createWriteStream(destinationPath);
  await pipeline(response.Body, writeStream);
};

// Simple file delete (Thumbnails, Audio ke liye)
const deleteFileFromS3 = async (fileUrl) => {
  try {
    if (!fileUrl) return;
    const url = new URL(fileUrl);
    const key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;

    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    }));
    
    console.log("✅ File deleted from S3:", key);
  } catch (error) {
    console.error("❌ S3 Delete Error:", error);
  }
};

// =========================================================
// NEW: Bulk Delete HLS Folder (Reels ke liye zaroori)
// =========================================================
const deleteReelFolderFromS3 = async (reelId) => {
  try {
    if (!reelId) return;
    const prefix = `videos/reels/${reelId}/`;

    // 1. Pehle us folder ke andar ki saari files list karo
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.AWS_BUCKET_NAME,
      Prefix: prefix,
    });
    
    const listedObjects = await s3.send(listCommand);

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    // 2. Un sabhi files ko delete keys ke array me dalo
    const deleteParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Delete: { Objects: [] },
    };

    listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key });
    });

    // 3. Ek sath saari files udda do
    const deleteCommand = new DeleteObjectsCommand(deleteParams);
    await s3.send(deleteCommand);

    if (listedObjects.IsTruncated) {
      // Agar 1000 se zyada files hain, toh function ko wapas call karo
      await deleteReelFolderFromS3(reelId);
    }
    
    console.log(`✅ Entire HLS Folder deleted for Reel: ${reelId}`);
  } catch (error) {
    console.error("❌ S3 Folder Delete Error:", error);
  }
};

module.exports = { 
  s3, 
  generatePresignedUrl, // Exporting new function
  uploadToS3, 
  getFileFromS3, 
  deleteFileFromS3,
  deleteReelFolderFromS3 // Exporting new function
};




// // s3.js
// const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
// const { v4: uuidv4 } = require("uuid");
// const fs = require("fs");
// const { pipeline } = require("stream/promises");
// const path = require("path");

// const s3 = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });

// function guessContentTypeByName(name) {
//   const ext = (path.extname(name) || "").toLowerCase();
//   switch (ext) {
//     case ".m3u8": return "application/vnd.apple.mpegurl";
//     case ".ts": return "video/mp2t";
//     case ".mp4": return "video/mp4";
//     case ".mp3": return "audio/mpeg";
//     case ".jpg":
//     case ".jpeg": return "image/jpeg";
//     case ".png": return "image/png";
//     default: return "application/octet-stream";
//   }
// }

// const uploadToS3 = async (file, folder = "uploads", preserveFilename = false) => {
//   const safeOriginal = file.originalname || `file-${Date.now()}`;
//   const key = preserveFilename
//     ? `${folder}/${safeOriginal}`
//     : `${folder}/${uuidv4()}-${safeOriginal}`;

//   const contentType = file.mimetype || guessContentTypeByName(safeOriginal);

//   // Correct caching logic
//   let cacheControl;

//   if (key.endsWith(".m3u8")) {
//     // 🎯 Playlist should be cached longer for fast play
//     cacheControl = "public, max-age=600, must-revalidate";   // 10 min
//   } 
//   else if (key.endsWith(".ts")) {
//     // 🎯 Segments are immutable
//     cacheControl = "public, max-age=31536000, immutable";
//   } 
//   else {
//     // 🎯 Images / thumbnails / mp4 backups etc.
//     cacheControl = "public, max-age=31536000, immutable";
//   }

//   await s3.send(new PutObjectCommand({
//     Bucket: process.env.AWS_BUCKET_NAME,
//     Key: key,
//     Body: file.buffer,
//     ContentType: contentType,
//     CacheControl: cacheControl,
//   }));

//   const cloudfrontDomain = process.env.CLOUDFRONT_URL;
//   return `https://${cloudfrontDomain}/${key}`;
// };

// const getFileFromS3 = async (key, destinationPath) => {
//   const command = new GetObjectCommand({
//     Bucket: process.env.AWS_BUCKET_NAME,
//     Key: key,
//   });
//   const response = await s3.send(command);
//   const writeStream = fs.createWriteStream(destinationPath);
//   await pipeline(response.Body, writeStream);
// };

// module.exports = { s3, uploadToS3, getFileFromS3 };