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
    webp: "image/webp", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff"
  };
  return mimeTypes[ext] || "application/octet-stream";
};

const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomSuffix = Math.round(Math.random() * 1e9);
  const ext = originalName.split(".").pop();
  return `${timestamp}-${randomSuffix}.${ext}`;
};

// Enhanced bucket management
const ensureBucketExists = async (bucketName) => {
  try {
    // First, try to list all buckets to see what's available
    const listBucketsCommand = new ListBucketsCommand({});
    const buckets = await storjClient.send(listBucketsCommand);
    
    const bucketNames = buckets.Buckets?.map(b => b.Name) || [];
    console.log(`Available buckets: ${bucketNames.join(', ')}`);
    
    if (bucketNames.includes(bucketName)) {
      console.log(`✅ Bucket '${bucketName}' exists`);
      return true;
    }
    
    // Try to create the bucket
    console.log(`🔧 Creating bucket '${bucketName}'...`);
    const createBucketCommand = new CreateBucketCommand({ Bucket: bucketName });
    await storjClient.send(createBucketCommand);
    console.log(`✅ Bucket '${bucketName}' created successfully`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error with bucket '${bucketName}':`, error.message);
    console.error(`Error name: ${error.name}`);
    console.error(`Error code: ${error.$metadata?.httpStatusCode}`);
    
    if (error.name === 'InvalidAccessKeyId') {
      console.error('🔑 Access key issue detected. Please check:');
      console.error('   - Access key ID is correct');
      console.error('   - Secret access key is correct');
      console.error('   - Access grant has not expired');
      console.error('   - Access grant has proper permissions');
    }
    
    return false;
  }
};

// Test connection function
const testConnection = async () => {
  console.log('🔍 Testing Storj connection...');
  
  try {
    // Test basic connection
    const listBucketsCommand = new ListBucketsCommand({});
    const buckets = await storjClient.send(listBucketsCommand);
    console.log('✅ Connection successful!');
    console.log(`Available buckets: ${buckets.Buckets?.map(b => b.Name).join(', ') || 'None'}`);
    
    // Ensure required buckets exist
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

// Upload endpoint with enhanced error handling
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
    
    if (error.name === 'InvalidAccessKeyId') {
      return res.status(403).json({ 
        error: "Invalid access credentials. Please check your Storj access key and secret." 
      });
    }
    
    res.status(500).json({ error: "Failed to upload file: " + error.message });
  }
});

// Enhanced list endpoint with better error handling
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
    
    if (error.name === 'InvalidAccessKeyId') {
      return res.status(403).json({ 
        error: "Invalid access credentials. Please check your Storj access key and secret." 
      });
    }
    
    if (error.name === 'NoSuchBucket') {
      return res.status(404).json({ 
        error: `Bucket '${BUCKET_NAME}' not found. Please create it in your Storj console.` 
      });
    }
    
    res.status(500).json({ error: "Failed to list files: " + error.message });
  }
});

// Add diagnostic endpoint
app.get("/diagnostic", async (req, res) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      endpoint: "https://gateway.storjshare.io",
      buckets: {
        main: BUCKET_NAME,
        compressed: COMPRESSED_BUCKET
      },
      credentials: {
        accessKeyId: storjClient.config.credentials.accessKeyId,
        secretKeyExists: !!storjClient.config.credentials.secretAccessKey,
        secretKeyLength: storjClient.config.credentials.secretAccessKey.length
      },
      tests: {}
    };

    // Test connection
    try {
      const listBucketsCommand = new ListBucketsCommand({});
      const buckets = await storjClient.send(listBucketsCommand);
      diagnostics.tests.listBuckets = {
        success: true,
        availableBuckets: buckets.Buckets?.map(b => b.Name) || []
      };
    } catch (error) {
      diagnostics.tests.listBuckets = {
        success: false,
        error: error.message,
        errorName: error.name
      };
    }

    // Test main bucket
    try {
      const listObjectsCommand = new ListObjectsV2Command({ 
        Bucket: BUCKET_NAME, 
        MaxKeys: 1 
      });
      const objects = await storjClient.send(listObjectsCommand);
      diagnostics.tests.mainBucket = {
        success: true,
        objectCount: objects.Contents?.length || 0
      };
    } catch (error) {
      diagnostics.tests.mainBucket = {
        success: false,
        error: error.message,
        errorName: error.name
      };
    }

    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({ 
      error: "Diagnostic failed", 
      details: error.message 
    });
  }
});

// Rest of your endpoints remain the same...
// (Download, stream, compress, etc.)

// Download original file
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
    
    res.setHeader('Content-Type', headResponse.ContentType || 'application/octet-stream');
    res.setHeader('Content-Length', headResponse.ContentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName || filename}"`);
    
    const stream = response.Body;
    stream.pipe(res);
    
  } catch (error) {
    console.error("Download error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else if (error.name === 'InvalidAccessKeyId') {
      res.status(403).json({ error: "Invalid access credentials" });
    } else {
      res.status(500).json({ error: "Failed to download file" });
    }
  }
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Health check with connection test
app.get("/health", async (req, res) => {
  const health = {
    status: "OK",
    timestamp: new Date().toISOString(),
    storage: "Storj.io",
    bucket: BUCKET_NAME,
    compressedBucket: COMPRESSED_BUCKET
  };

  try {
    // Quick connection test
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
  
  // Test connection before starting
  const connectionOk = await testConnection();
  
  if (!connectionOk) {
    console.error("❌ Server cannot start - Storj connection failed");
    console.error("Please check your credentials and try again");
    process.exit(1);
  }
  
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`☁️  Using Storj.io for file storage`);
    console.log(`🪣 Main bucket: ${BUCKET_NAME}`);
    console.log(`🗜️  Compressed files bucket: ${COMPRESSED_BUCKET}`);
    console.log(`🔍 Diagnostic endpoint: /diagnostic`);
    console.log(`💚 Health check: /health`);
  });
}

startServer().catch(console.error);
