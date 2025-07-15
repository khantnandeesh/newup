import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import sharp from "sharp";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Upload endpoint - PRESERVE ORIGINAL FILENAME
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const originalName = file.originalname;

    // Upload file to Storj with original filename
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: originalName,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        uploadDate: new Date().toISOString(),
        mimetype: file.mimetype
      }
    };

    await storjClient.send(new PutObjectCommand(uploadParams));

    const fileInfo = {
      filename: originalName,
      size: file.size,
      mimetype: file.mimetype,
      uploadDate: new Date().toISOString(),
      downloadUrl: `/f/${originalName}`,
      streamUrl: isVideoFile(originalName) ? `/stream/${originalName}` : null,
      canCompress: isVideoFile(originalName) || isImageFile(originalName),
      compressionCheckUrl: `/can-compress/${originalName}`
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
          return {
            filename: object.Key,
            size: object.Size,
            created: object.LastModified,
            modified: object.LastModified,
            isVideo: isVideoFile(object.Key),
            isImage: isImageFile(object.Key),
            canCompress: isVideoFile(object.Key) || isImageFile(object.Key),
            downloadUrl: `/f/${object.Key}`,
            streamUrl: isVideoFile(object.Key) ? `/stream/${object.Key}` : null,
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

// NEW: File properties endpoint
app.get("/file/:filename/properties", async (req, res) => {
  try {
    const filename = req.params.filename;
    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    
    res.json({
      filename: filename,
      size: headResponse.ContentLength,
      sizeFormatted: formatFileSize(headResponse.ContentLength),
      created: headResponse.LastModified,
      modified: headResponse.LastModified,
      mimetype: headResponse.ContentType,
      isVideo: isVideoFile(filename),
      isImage: isImageFile(filename),
      canCompress: isVideoFile(filename) || isImageFile(filename)
    });
  } catch (error) {
    console.error("Error getting file properties:", error);
    res.status(500).json({ error: "Failed to get file properties" });
  }
});

// NEW: Delete file endpoint
app.delete("/file/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    await storjClient.send(new DeleteObjectCommand(deleteParams));
    res.json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete file: " + error.message });
  }
});

// Download file endpoint
app.get("/f/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const getParams = {
      Bucket: BUCKET_NAME,
      Key: filename
    };

    const response = await storjClient.send(new GetObjectCommand(getParams));

    res.setHeader('Content-Type', getMimeType(filename));
    res.setHeader('Content-Length', response.ContentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

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

// Health check
app.get("/health", async (req, res) => {
  const health = {
    status: "OK",
    timestamp: new Date().toISOString(),
    storage: "Storj.io",
    bucket: BUCKET_NAME
  };

  try {
    const listParams = { Bucket: BUCKET_NAME };
    await storjClient.send(new ListObjectsV2Command(listParams));
    health.storjConnection = "OK";
  } catch (error) {
    health.status = "ERROR";
    health.storjConnection = "FAILED";
    health.error = error.message;
  }

  res.json(health);
});

// Initialize server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
