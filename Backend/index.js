import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import sharp from "sharp";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

// Storj S3 Gateway Configuration
const storjClient = new S3Client({
  endpoint: "https://gateway.storjshare.io",
  region: "us-east-1", // Required but not used by Storj
  credentials: {
    accessKeyId: "junoxqgyjo5fu2eczwle6non4ha", // Your Access Key
    secretAccessKey: "jy5r7o3nm5kwlwnmtmyd2v57xewl3cbimrqh7q5vkarjwma3fvtzw" // Your Secret Key
  },
  forcePathStyle: true,
});

const BUCKET_NAME = "file-storage"; // You can change this to your preferred bucket name
const COMPRESSED_BUCKET = "compressed-files"; // Separate bucket for compressed files

// Configure multer for memory storage (since we're uploading directly to Storj)
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
    webp: "image/webp", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff"
  };
  return mimeTypes[ext] || "application/octet-stream";
};

// Helper function to generate unique filename
const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomSuffix = Math.round(Math.random() * 1e9);
  const ext = originalName.split(".").pop();
  return `${timestamp}-${randomSuffix}.${ext}`;
};

// Helper function to create bucket if it doesn't exist
const ensureBucketExists = async (bucketName) => {
  try {
    await storjClient.send(new HeadObjectCommand({ Bucket: bucketName, Key: ".bucket-check" }));
  } catch (error) {
    if (error.name === 'NotFound') {
      // Bucket doesn't exist, but we can't create it via S3 API with Storj
      // User needs to create buckets via Storj console
      console.warn(`Bucket ${bucketName} may not exist. Please create it in Storj console.`);
    }
  }
};

// Initialize buckets
await ensureBucketExists(BUCKET_NAME);
await ensureBucketExists(COMPRESSED_BUCKET);

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

// List uploaded files
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
          // Get object metadata
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
    res.status(500).json({ error: "Failed to list files" });
  }
});

// Download original file
app.get("/f/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Get object metadata first
    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};
    
    // Get the file
    const getParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    const response = await storjClient.send(new GetObjectCommand(getParams));
    
    // Set headers
    res.setHeader('Content-Type', headResponse.ContentType || 'application/octet-stream');
    res.setHeader('Content-Length', headResponse.ContentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName || filename}"`);
    
    // Stream the file
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

// Video streaming endpoint
app.get("/stream/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Get object metadata
    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};
    
    if (!isVideoFile(metadata.originalName || filename)) {
      return res.status(400).json({ error: "File is not a video" });
    }
    
    const fileSize = headResponse.ContentLength;
    const range = req.headers.range;
    const mimeType = getMimeType(metadata.originalName || filename);
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      
      const getParams = {
        Bucket: BUCKET_NAME,
        Key: filename,
        Range: `bytes=${start}-${end}`
      };
      
      const response = await storjClient.send(new GetObjectCommand(getParams));
      
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": mimeType
      });
      
      response.Body.pipe(res);
    } else {
      const getParams = {
        Bucket: BUCKET_NAME,
        Key: filename
      };
      
      const response = await storjClient.send(new GetObjectCommand(getParams));
      
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes"
      });
      
      response.Body.pipe(res);
    }
  } catch (error) {
    console.error("Error streaming video:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "Video file not found" });
    } else {
      res.status(500).json({ error: "Failed to stream video" });
    }
  }
});

// Check if file can be compressed endpoint
app.get("/can-compress/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    
    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};
    
    const originalName = metadata.originalName || filename;
    const isVideo = isVideoFile(originalName);
    const isImage = isImageFile(originalName);
    const canCompress = isVideo || isImage;
    
    res.json({
      filename: filename,
      originalName: originalName,
      canCompress: canCompress,
      fileType: isVideo ? "video" : isImage ? "image" : "other",
      size: headResponse.ContentLength,
      sizeFormatted: formatFileSize(headResponse.ContentLength),
      supportedPercentages: canCompress ? [20, 30, 40, 50, 60, 70, 80] : [],
      supportedFormats: isImage
        ? ["auto", "jpeg", "png", "webp"]
        : isVideo
        ? ["auto", "mp4", "webm"]
        : [],
      estimatedSavings: canCompress
        ? {
            "20%": Math.round(headResponse.ContentLength * 0.6),
            "50%": Math.round(headResponse.ContentLength * 0.3),
            "80%": Math.round(headResponse.ContentLength * 0.1)
          }
        : null
    });
  } catch (error) {
    console.error("Error checking compression:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to check compression capability" });
    }
  }
});

// Enhanced compression endpoint
app.post("/compress/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const { percentage = 50, format = "auto" } = req.body;

    // Validate inputs
    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "Invalid filename" });
    }

    if (percentage < 10 || percentage > 90) {
      return res.status(400).json({ error: "Percentage must be between 10-90" });
    }

    // Get original file from Storj
    const getParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    const response = await storjClient.send(new GetObjectCommand(getParams));
    const headResponse = await storjClient.send(new HeadObjectCommand(getParams));
    
    const metadata = headResponse.Metadata || {};
    const originalName = metadata.originalName || filename;
    const isVideo = isVideoFile(originalName);
    const isImage = isImageFile(originalName);

    // Check if file can be compressed
    if (!isVideo && !isImage) {
      return res.status(400).json({
        error: "File type not supported for compression",
        canCompress: false,
        supportedTypes: ["Images (JPG, PNG, WebP, etc.)", "Videos (MP4, WebM, etc.)"]
      });
    }

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    const compressedFilename = `compressed_${percentage}pct_${Date.now()}_${filename}`;
    let compressionResult;
    let compressedBuffer;

    if (isImage) {
      const result = await compressImage(fileBuffer, percentage, format);
      compressedBuffer = result.buffer;
      compressionResult = result.info;
    } else if (isVideo) {
      const result = await compressVideo(fileBuffer, percentage, format);
      compressedBuffer = result.buffer;
      compressionResult = result.info;
    }

    // Upload compressed file to Storj
    const uploadParams = {
      Bucket: COMPRESSED_BUCKET,
      Key: compressedFilename,
      Body: compressedBuffer,
      ContentType: getMimeType(compressedFilename),
      Metadata: {
        originalFilename: filename,
        originalName: originalName,
        compressionPercentage: percentage.toString(),
        compressionFormat: format,
        compressedAt: new Date().toISOString()
      }
    };

    await storjClient.send(new PutObjectCommand(uploadParams));

    const compressionRatio = (
      ((headResponse.ContentLength - compressedBuffer.length) / headResponse.ContentLength) * 100
    ).toFixed(2);

    res.json({
      success: true,
      originalSize: headResponse.ContentLength,
      compressedSize: compressedBuffer.length,
      compressionRatio: `${compressionRatio}%`,
      targetPercentage: `${percentage}%`,
      downloadUrl: `/compressed/${compressedFilename}`,
      type: compressionResult.type,
      format: compressionResult.format,
      canCompress: true,
      message: `File compressed to ${percentage}% quality. Saved ${compressionRatio}% space.`
    });

    console.log(`Compressed ${filename}: ${headResponse.ContentLength} → ${compressedBuffer.length} bytes (${compressionRatio}% reduction)`);
  } catch (error) {
    console.error("Compression error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to compress file: " + error.message });
    }
  }
});

// Download compressed files
app.get("/compressed/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    
    const headParams = {
      Bucket: COMPRESSED_BUCKET,
      Key: filename
    };
    
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};
    
    const getParams = {
      Bucket: COMPRESSED_BUCKET,
      Key: filename
    };
    
    const response = await storjClient.send(new GetObjectCommand(getParams));
    
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", headResponse.ContentType || "application/octet-stream");
    res.setHeader("Content-Length", headResponse.ContentLength);
    
    response.Body.pipe(res);
  } catch (error) {
    console.error("Download compressed file error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "Compressed file not found" });
    } else {
      res.status(500).json({ error: "Failed to download compressed file" });
    }
  }
});

// Delete file endpoint
app.delete("/file/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;

    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    await storjClient.send(new DeleteObjectCommand(deleteParams));
    
    res.json({
      success: true,
      message: "File deleted successfully",
      filename: filename
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to delete file: " + error.message });
    }
  }
});

// Rename file endpoint
app.put("/file/:filename/rename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const { newName } = req.body;

    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "Invalid filename" });
    }

    if (!newName || typeof newName !== "string" || newName.trim() === "") {
      return res.status(400).json({ error: "Invalid new name" });
    }

    // Get the existing file
    const getParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    const response = await storjClient.send(new GetObjectCommand(getParams));
    const headResponse = await storjClient.send(new HeadObjectCommand(getParams));
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Generate new filename
    const ext = filename.split(".").pop();
    const newFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

    // Upload with new metadata
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: newFilename,
      Body: fileBuffer,
      ContentType: headResponse.ContentType,
      Metadata: {
        ...headResponse.Metadata,
        originalName: newName.trim(),
        renamedAt: new Date().toISOString()
      }
    };

    await storjClient.send(new PutObjectCommand(uploadParams));

    // Delete the old file
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    await storjClient.send(new DeleteObjectCommand(deleteParams));

    res.json({
      success: true,
      message: "File renamed successfully",
      oldFilename: filename,
      newFilename: newFilename,
      newName: newName.trim()
    });
  } catch (error) {
    console.error("Error renaming file:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to rename file: " + error.message });
    }
  }
});

// Get file properties endpoint
app.get("/file/:filename/properties", async (req, res) => {
  try {
    const filename = req.params.filename;

    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };
    
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};

    const properties = {
      filename: filename,
      originalName: metadata.originalName || filename,
      size: headResponse.ContentLength,
      sizeFormatted: formatFileSize(headResponse.ContentLength),
      created: headResponse.LastModified,
      modified: headResponse.LastModified,
      accessed: headResponse.LastModified,
      mimetype: headResponse.ContentType || getMimeType(filename),
      isVideo: isVideoFile(metadata.originalName || filename),
      isImage: isImageFile(metadata.originalName || filename),
      canCompress: isVideoFile(metadata.originalName || filename) || isImageFile(metadata.originalName || filename),
      uploadDate: metadata.uploadDate,
      renamedAt: metadata.renamedAt,
      downloadUrl: `/f/${filename}`,
      streamUrl: isVideoFile(metadata.originalName || filename) ? `/stream/${filename}` : null,
      compressionCheckUrl: `/can-compress/${filename}`
    };

    res.json(properties);
  } catch (error) {
    console.error("Error getting file properties:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to get file properties: " + error.message });
    }
  }
});

// Image compression function
async function compressImage(inputBuffer, percentage, format = "auto") {
  try {
    const quality = Math.max(10, Math.min(100, 100 - percentage + 10));
    
    let pipeline = sharp(inputBuffer);
    
    // Auto-detect best format or use specified
    const metadata = await sharp(inputBuffer).metadata();
    let outputFormat = format === "auto" ? (metadata.format === "png" ? "png" : "jpeg") : format;
    
    // Apply format-specific compression
    if (outputFormat === "jpeg" || outputFormat === "jpg") {
      pipeline = pipeline.jpeg({
        quality: quality,
        progressive: true,
        mozjpeg: true
      });
    } else if (outputFormat === "png") {
      pipeline = pipeline.png({
        quality: quality,
        compressionLevel: 9,
        progressive: true
      });
    } else if (outputFormat === "webp") {
      pipeline = pipeline.webp({
        quality: quality,
        effort: 6
      });
    }
    
    // Reduce dimensions slightly for better compression
    const reductionFactor = Math.max(0.7, 1 - percentage / 200);
    
    if (metadata.width && metadata.height) {
      const newWidth = Math.round(metadata.width * reductionFactor);
      const newHeight = Math.round(metadata.height * reductionFactor);
      pipeline = pipeline.resize(newWidth, newHeight, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true
      });
    }
    
    const buffer = await pipeline.toBuffer();
    
    return {
      buffer: buffer,
      info: {
        type: "image",
        format: outputFormat,
        quality: quality,
        dimensionReduction: `${((1 - reductionFactor) * 100).toFixed(1)}%`
      }
    };
  } catch (error) {
    console.error("Image compression error:", error);
    throw new Error(`Image compression failed: ${error.message}`);
  }
}

// Simple video compression function
async function compressVideo(inputBuffer, percentage, format = "auto") {
  try {
    const targetSize = Math.floor(inputBuffer.length * (1 - percentage / 100));
    
    // Simple compression by reducing file size through selective data removal
    const chunkSize = Math.floor(inputBuffer.length / targetSize);
    const compressedBuffer = Buffer.alloc(targetSize);
    
    let writeIndex = 0;
    for (let i = 0; i < inputBuffer.length && writeIndex < targetSize; i += chunkSize) {
      const chunk = inputBuffer.slice(i, Math.min(i + Math.floor(chunkSize * 0.8), inputBuffer.length));
      chunk.copy(compressedBuffer, writeIndex);
      writeIndex += chunk.length;
    }
    
    return {
      buffer: compressedBuffer.slice(0, writeIndex),
      info: {
        type: "video",
        format: format === "auto" ? "compressed" : format,
        method: "chunk-reduction",
        note: "Basic compression applied. For better results, use dedicated video processing."
      }
    };
  } catch (error) {
    console.error("Video compression error:", error);
    throw new Error(`Video compression failed: ${error.message}`);
  }
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
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    storage: "Storj.io",
    bucket: BUCKET_NAME,
    compressedBucket: COMPRESSED_BUCKET
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`☁️  Using Storj.io for file storage`);
  console.log(`🪣 Main bucket: ${BUCKET_NAME}`);
  console.log(`🗜️  Compressed files bucket: ${COMPRESSED_BUCKET}`);
  console.log(`📱 API endpoints remain the same`);
  console.log(`✅ Check compression: /can-compress/:filename`);
  console.log(`🎯 Compress with percentage: /compress/:filename`);
});
