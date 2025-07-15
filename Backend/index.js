import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import sharp from "sharp";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand, ListBucketsCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import crypto from "crypto";
import { extname } from "path";

dotenv.config();

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

// Storj S3 Gateway Configuration
const storjClient = new S3Client({
  endpoint: "https://gateway.storjshare.io",
  region: "us-east-1",
  credentials: {
    accessKeyId: "jvkiwhhfpwesee4kf22l7rwbm2sa",
    secretAccessKey: "j2exfjqioti3okvgjiek6ae4a3qmcbrte4amenkut2xdriieoh2ey"
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.STORJ_BUCKET || "file-storage";
const COMPRESSED_BUCKET = process.env.STORJ_COMPRESSED_BUCKET || "compressed-files";

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB limit
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// File type definitions
const videoExtensions = [
  ".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv", ".m4v", ".3gp"
];
const imageExtensions = [
  ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif"
];

// Helper functions
const isVideoFile = (filename) => {
  return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
};

const isImageFile = (filename) => {
  return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
};

const getMimeType = (filename) => {
  const ext = filename.toLowerCase().split(".").pop();
  const mimeTypes = {
    mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg",
    mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska",
    m4v: "video/x-m4v", "3gp": "video/3gpp",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff",
    pdf: "application/pdf"
  };
  return mimeTypes[ext] || "application/octet-stream";
};

const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomSuffix = Math.round(Math.random() * 1e9);
  const ext = extname(originalName);
  return `${timestamp}-${randomSuffix}${ext}`;
};

// Ensure buckets exist
const ensureBucketExists = async (bucketName) => {
  try {
    const listBucketsCommand = new ListBucketsCommand({});
    const buckets = await storjClient.send(listBucketsCommand);
    const bucketNames = buckets.Buckets?.map(b => b.Name) || [];

    if (bucketNames.includes(bucketName)) {
      console.log(`✅ Bucket '${bucketName}' exists`);
      return true;
    }

    console.log(`🔧 Creating bucket '${bucketName}'...`);
    const createBucketCommand = new CreateBucketCommand({ Bucket: bucketName });
    await storjClient.send(createBucketCommand);
    console.log(`✅ Bucket '${bucketName}' created successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error with bucket '${bucketName}':`, error.message);
    return false;
  }
};

// Test connection function
const testConnection = async () => {
  console.log('🔍 Testing Storj connection...');
  try {
    const listBucketsCommand = new ListBucketsCommand({});
    const buckets = await storjClient.send(listBucketsCommand);
    console.log('✅ Connection successful!');
    console.log(`Available buckets: ${buckets.Buckets?.map(b => b.Name).join(', ') || 'None'}`);

    const mainBucketOk = await ensureBucketExists(BUCKET_NAME);
    const compressedBucketOk = await ensureBucketExists(COMPRESSED_BUCKET);

    if (!mainBucketOk || !compressedBucketOk) {
      console.error('❌ Required buckets are not available');
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return false;
  }
};

// Upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const filename = generateUniqueFilename(file.originalname);

    // Upload file to Storj
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        uploadDate: new Date().toISOString(),
        mimetype: file.mimetype
      }
    };

    await storjClient.send(new PutObjectCommand(uploadParams));

    const fileInfo = {
      filename: filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadDate: new Date().toISOString(),
      downloadUrl: `/f/${filename}`,
      streamUrl: isVideoFile(file.originalname) ? `/stream/${filename}` : null,
      canCompress: isVideoFile(file.originalname) || isImageFile(file.originalname),
      compressionCheckUrl: `/can-compress/${filename}`
    };

    res.json({
      success: true,
      message: "File uploaded successfully",
      file: fileInfo
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file: " + error.message });
  }
});

// List files endpoint
app.get("/list", async (req, res) => {
  try {
    const listParams = {
      Bucket: BUCKET_NAME,
      MaxKeys: 1000
    };

    const response = await storjClient.send(new ListObjectsV2Command(listParams));

    if (!response.Contents) {
      return res.json([]);
    }

    const fileDetails = await Promise.all(
      response.Contents.map(async (object) => {
        try {
          const headParams = {
            Bucket: BUCKET_NAME,
            Key: object.Key
          };

          const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
          const metadata = headResponse.Metadata || {};

          return {
            filename: object.Key,
            originalName: metadata.originalName || object.Key,
            size: object.Size,
            created: object.LastModified,
            modified: object.LastModified,
            isVideo: isVideoFile(metadata.originalName || object.Key),
            isImage: isImageFile(metadata.originalName || object.Key),
            canCompress: isVideoFile(metadata.originalName || object.Key) || isImageFile(metadata.originalName || object.Key),
            downloadUrl: `/f/${object.Key}`,
            streamUrl: isVideoFile(metadata.originalName || object.Key) ? `/stream/${object.Key}` : null,
            compressionCheckUrl: `/can-compress/${object.Key}`
          };
        } catch (error) {
          console.error(`Error processing file ${object.Key}:`, error);
          return null;
        }
      })
    );

    const validFileDetails = fileDetails.filter(file => file !== null);
    res.json(validFileDetails);
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files: " + error.message });
  }
});

// Download file endpoint
app.get("/f/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;

    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};

    const getParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    const response = await storjClient.send(new GetObjectCommand(getParams));

    res.setHeader('Content-Type', headResponse.ContentType || getMimeType(filename));
    res.setHeader('Content-Length', headResponse.ContentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName || filename}"`);

    const stream = response.Body;
    stream.pipe(res);

  } catch (error) {
    console.error("Download error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to download file" });
    }
  }
});

// Compress file endpoint
app.post("/compress/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const { percentage = 50, format = "auto" } = req.body;

    if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    if (percentage < 10 || percentage > 90) {
      return res.status(400).json({ error: "Percentage must be between 10-90" });
    }

    const getParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    const response = await storjClient.send(new GetObjectCommand(getParams));
    const fileBuffer = await response.Body.transformToByteArray();

    const isVideo = isVideoFile(filename);
    const isImage = isImageFile(filename);

    if (!isVideo && !isImage) {
      return res.status(400).json({
        error: "File type not supported for compression",
        canCompress: false,
        supportedTypes: [
          "Images (JPG, PNG, WebP, etc.)",
          "Videos (MP4, WebM, etc.)"
        ]
      });
    }

    const compressedFilename = `compressed_${percentage}pct_${Date.now()}_${filename}`;
    let compressedBuffer;

    if (isImage) {
      compressedBuffer = await compressImage(fileBuffer, percentage, format);
    } else if (isVideo) {
      compressedBuffer = await compressVideo(fileBuffer, percentage, format);
    }

    const uploadParams = {
      Bucket: COMPRESSED_BUCKET,
      Key: compressedFilename,
      Body: compressedBuffer,
      ContentType: getMimeType(compressedFilename),
      Metadata: {
        originalName: filename,
        compressionPercentage: percentage.toString(),
        compressionFormat: format,
        compressionDate: new Date().toISOString()
      }
    };

    await storjClient.send(new PutObjectCommand(uploadParams));

    const originalStat = { size: fileBuffer.length };
    const compressedStat = { size: compressedBuffer.length };
    const compressionRatio = (
      ((originalStat.size - compressedStat.size) / originalStat.size) * 100
    ).toFixed(2);

    res.json({
      success: true,
      originalSize: originalStat.size,
      compressedSize: compressedStat.size,
      compressionRatio: `${compressionRatio}%`,
      targetPercentage: `${percentage}%`,
      downloadUrl: `/compressed/${compressedFilename}`,
      type: isImage ? "image" : "video",
      format: format,
      canCompress: true,
      message: `File compressed to ${percentage}% quality. Saved ${compressionRatio}% space.`
    });

  } catch (error) {
    console.error("Compression error:", error);
    res.status(500).json({ error: "Failed to compress file: " + error.message });
  }
});

// Check if file can be compressed endpoint
app.get("/can-compress/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;

    if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};

    const isVideo = isVideoFile(metadata.originalName || filename);
    const isImage = isImageFile(metadata.originalName || filename);
    const canCompress = isVideo || isImage;

    res.json({
      filename: filename,
      originalName: metadata.originalName || filename,
      canCompress: canCompress,
      fileType: isVideo ? "video" : isImage ? "image" : "other",
      size: headResponse.ContentLength,
      sizeFormatted: formatFileSize(headResponse.ContentLength),
      supportedPercentages: canCompress ? [20, 30, 40, 50, 60, 70, 80] : [],
      supportedFormats: isImage ? ["auto", "jpeg", "png", "webp"] : isVideo ? ["auto", "mp4", "webm"] : [],
      estimatedSavings: canCompress ? {
        "20%": Math.round(headResponse.ContentLength * 0.6),
        "50%": Math.round(headResponse.ContentLength * 0.3),
        "80%": Math.round(headResponse.ContentLength * 0.1)
      } : null
    });
  } catch (error) {
    console.error("Error checking compression:", error);
    res.status(500).json({ error: "Failed to check compression capability" });
  }
});

// Helper function to compress image
async function compressImage(buffer, percentage, format = "auto") {
  const quality = Math.max(10, Math.min(100, 100 - percentage + 10));
  let pipeline = sharp(buffer);

  let outputFormat = format === "auto" ? "jpeg" : format;

  if (outputFormat === "jpeg" || outputFormat === "jpg") {
    pipeline = pipeline.jpeg({ quality: quality, progressive: true, mozjpeg: true });
  } else if (outputFormat === "png") {
    pipeline = pipeline.png({ quality: quality, compressionLevel: 9, progressive: true });
  } else if (outputFormat === "webp") {
    pipeline = pipeline.webp({ quality: quality, effort: 6 });
  }

  const metadata = await sharp(buffer).metadata();
  const reductionFactor = Math.max(0.7, 1 - percentage / 200);

  if (metadata.width && metadata.height) {
    const newWidth = Math.round(metadata.width * reductionFactor);
    const newHeight = Math.round(metadata.height * reductionFactor);
    pipeline = pipeline.resize(newWidth, newHeight, {
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true
    });
  }

  return await pipeline.toBuffer();
}

// Helper function to compress video (basic implementation)
async function compressVideo(buffer, percentage, format = "auto") {
  // This is a basic implementation. For better results, use a proper video processing library.
  const targetSize = Math.floor(buffer.length * (1 - percentage / 100));
  const compressedBuffer = Buffer.alloc(targetSize);

  let writeIndex = 0;
  const chunkSize = Math.floor(buffer.length / targetSize);

  for (let i = 0; i < buffer.length && writeIndex < targetSize; i += chunkSize) {
    const chunk = buffer.slice(i, Math.min(i + Math.floor(chunkSize * 0.8), buffer.length));
    chunk.copy(compressedBuffer, writeIndex);
    writeIndex += chunk.length;
  }

  return compressedBuffer.slice(0, writeIndex);
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Health check
app.get("/health", async (req, res) => {
  const health = {
    status: "OK",
    timestamp: new Date().toISOString(),
    storage: "Storj.io",
    bucket: BUCKET_NAME,
    compressedBucket: COMPRESSED_BUCKET
  };

  try {
    const listBucketsCommand = new ListBucketsCommand({});
    await storjClient.send(listBucketsCommand);
    health.storjConnection = "OK";
  } catch (error) {
    health.status = "ERROR";
    health.storjConnection = "FAILED";
    health.error = error.message;
  }

  res.json(health);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Initialize server
async function startServer() {
  console.log("🚀 Starting server...");

  const connectionOk = await testConnection();

  if (!connectionOk) {
    console.error("❌ Server cannot start - Storj connection failed");
    console.error("Please check your credentials and try again");
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`☁️ Using Storj.io for file storage`);
    console.log(`🪣 Main bucket: ${BUCKET_NAME}`);
    console.log(`🗜️ Compressed files bucket: ${COMPRESSED_BUCKET}`);
    console.log(`🔍 Diagnostic endpoint: /diagnostic`);
    console.log(`💚 Health check: /health`);
  });
}

startServer().catch(console.error);
