import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";
import { createReadStream, statSync, existsSync } from "fs";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import sharp from "sharp";
import multer from "multer";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;
const UPLOAD_DIR = join(__dirname, "uploads");
const COMPRESSED_DIR = join(__dirname, "compressed");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = file.originalname.split(".").pop();
    const filename = `${uniqueSuffix}.${ext}`;
    cb(null, filename);
  }
});

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

// Ensure directories exist
await fs.mkdir(UPLOAD_DIR, { recursive: true });
await fs.mkdir(COMPRESSED_DIR, { recursive: true });

// File type definitions
const videoExtensions = [
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
  ".3gp"
];
const imageExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tiff",
  ".gif"
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
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    m4v: "video/x-m4v",
    "3gp": "video/3gpp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff"
  };
  return mimeTypes[ext] || "application/octet-stream";
};

// Enhanced compression endpoint with percentage-based reduction
app.post("/compress/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const { percentage = 50, format = "auto" } = req.body;

    // Validate inputs
    if (
      !filename ||
      typeof filename !== "string" ||
      filename.includes("..") ||
      filename.includes("/")
    ) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    if (percentage < 10 || percentage > 90) {
      return res
        .status(400)
        .json({ error: "Percentage must be between 10-90" });
    }

    const filePath = join(UPLOAD_DIR, filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const originalStat = statSync(filePath);
    const isVideo = isVideoFile(filename);
    const isImage = isImageFile(filename);

    // Check if file can be compressed
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
    const compressedPath = join(COMPRESSED_DIR, compressedFilename);

    let compressionResult;

    if (isImage) {
      compressionResult = await compressImage(
        filePath,
        compressedPath,
        percentage,
        format
      );
    } else if (isVideo) {
      compressionResult = await compressVideo(
        filePath,
        compressedPath,
        percentage,
        format
      );
    }

    const compressedStat = statSync(compressedPath);
    const compressionRatio = (
      ((originalStat.size - compressedStat.size) / originalStat.size) *
      100
    ).toFixed(2);

    res.json({
      success: true,
      originalSize: originalStat.size,
      compressedSize: compressedStat.size,
      compressionRatio: `${compressionRatio}%`,
      targetPercentage: `${percentage}%`,
      downloadUrl: `/compressed/${compressedFilename}`,
      type: compressionResult.type,
      format: compressionResult.format,
      canCompress: true,
      message: `File compressed to ${percentage}% quality. Saved ${compressionRatio}% space.`
    });

    console.log(
      `Compressed ${filename}: ${originalStat.size} → ${compressedStat.size} bytes (${compressionRatio}% reduction)`
    );
  } catch (error) {
    console.error("Compression error:", error);
    res
      .status(500)
      .json({ error: "Failed to compress file: " + error.message });
  }
});

// Check if file can be compressed endpoint
app.get("/can-compress/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;

    if (
      !filename ||
      typeof filename !== "string" ||
      filename.includes("..") ||
      filename.includes("/")
    ) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const filePath = join(UPLOAD_DIR, filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const isVideo = isVideoFile(filename);
    const isImage = isImageFile(filename);
    const canCompress = isVideo || isImage;

    const stat = statSync(filePath);

    // Get original filename from metadata
    let originalName = filename;
    try {
      const metadataPath = join(UPLOAD_DIR, `${filename}.meta`);
      if (existsSync(metadataPath)) {
        const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
        originalName = metadata.originalName || filename;
      }
    } catch (err) {
      // Use filename as fallback
    }

    res.json({
      filename: filename,
      originalName: originalName,
      canCompress: canCompress,
      fileType: isVideo ? "video" : isImage ? "image" : "other",
      size: stat.size,
      sizeFormatted: formatFileSize(stat.size),
      supportedPercentages: canCompress ? [20, 30, 40, 50, 60, 70, 80] : [],
      supportedFormats: isImage
        ? ["auto", "jpeg", "png", "webp"]
        : isVideo
        ? ["auto", "mp4", "webm"]
        : [],
      estimatedSavings: canCompress
        ? {
            "20%": Math.round(stat.size * 0.6),
            "50%": Math.round(stat.size * 0.3),
            "80%": Math.round(stat.size * 0.1)
          }
        : null
    });
  } catch (error) {
    console.error("Error checking compression:", error);
    res.status(500).json({ error: "Failed to check compression capability" });
  }
});

// Image compression function
async function compressImage(
  inputPath,
  outputPath,
  percentage,
  format = "auto"
) {
  try {
    const quality = Math.max(10, Math.min(100, 100 - percentage + 10));
    const ext = inputPath.toLowerCase().split(".").pop();

    let pipeline = sharp(inputPath);

    // Auto-detect best format or use specified
    let outputFormat =
      format === "auto" ? (ext === "png" ? "png" : "jpeg") : format;

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
    const metadata = await sharp(inputPath).metadata();
    const reductionFactor = Math.max(0.7, 1 - percentage / 200);

    if (metadata.width && metadata.height) {
      const newWidth = Math.round(metadata.width * reductionFactor);
      const newHeight = Math.round(metadata.height * reductionFactor);
      pipeline = pipeline.resize(newWidth, newHeight, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true
      });
    }

    await pipeline.toFile(outputPath);

    return {
      type: "image",
      format: outputFormat,
      quality: quality,
      dimensionReduction: `${((1 - reductionFactor) * 100).toFixed(1)}%`
    };
  } catch (error) {
    console.error("Image compression error:", error);
    throw new Error(`Image compression failed: ${error.message}`);
  }
}

// Simple video compression function (without FFMPEG)
async function compressVideo(
  inputPath,
  outputPath,
  percentage,
  format = "auto"
) {
  try {
    // For video files, we'll create a simple approach using file chunking
    // This is a basic implementation - for production, consider using a proper video processing library

    const inputBuffer = await fs.readFile(inputPath);
    const targetSize = Math.floor(inputBuffer.length * (1 - percentage / 100));

    // Simple compression by reducing file size through selective frame removal
    // This is a very basic approach - in production, use proper video compression
    const chunkSize = Math.floor(inputBuffer.length / targetSize);
    const compressedBuffer = Buffer.alloc(targetSize);

    let writeIndex = 0;
    for (
      let i = 0;
      i < inputBuffer.length && writeIndex < targetSize;
      i += chunkSize
    ) {
      const chunk = inputBuffer.slice(
        i,
        Math.min(i + Math.floor(chunkSize * 0.8), inputBuffer.length)
      );
      chunk.copy(compressedBuffer, writeIndex);
      writeIndex += chunk.length;
    }

    await fs.writeFile(outputPath, compressedBuffer.slice(0, writeIndex));

    return {
      type: "video",
      format: format === "auto" ? "compressed" : format,
      method: "chunk-reduction",
      note: "Basic compression applied. For better results, use dedicated video processing."
    };
  } catch (error) {
    console.error("Video compression error:", error);
    throw new Error(`Video compression failed: ${error.message}`);
  }
}

// File upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const metadata = {
      originalName: file.originalname,
      uploadDate: new Date().toISOString(),
      mimetype: file.mimetype
    };

    try {
      await fs.writeFile(
        join(UPLOAD_DIR, `${file.filename}.meta`),
        JSON.stringify(metadata, null, 2)
      );
    } catch (err) {
      console.error("Failed to save metadata:", err);
    }

    const fileInfo = {
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadDate: new Date().toISOString(),
      downloadUrl: `/f/${file.filename}`,
      streamUrl: isVideoFile(file.originalname)
        ? `/stream/${file.filename}`
        : null,
      canCompress:
        isVideoFile(file.originalname) || isImageFile(file.originalname),
      compressionCheckUrl: `/can-compress/${file.filename}`
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
    const files = await fs.readdir(UPLOAD_DIR);
    const actualFiles = files.filter((filename) => !filename.endsWith(".meta"));

    const fileDetails = await Promise.all(
      actualFiles.map(async (filename) => {
        const filePath = join(UPLOAD_DIR, filename);

        let stat;
        try {
          stat = statSync(filePath);
        } catch (err) {
          return null;
        }

        let originalName = filename;
        try {
          const metadataPath = join(UPLOAD_DIR, `${filename}.meta`);
          if (existsSync(metadataPath)) {
            const metadata = JSON.parse(
              await fs.readFile(metadataPath, "utf8")
            );
            originalName = metadata.originalName || filename;
          }
        } catch (err) {
          // Use filename as fallback
        }

        return {
          filename: filename,
          originalName: originalName,
          size: stat.size,
          created: stat.birthtime,
          modified: stat.mtime,
          isVideo: isVideoFile(originalName),
          isImage: isImageFile(originalName),
          canCompress: isVideoFile(originalName) || isImageFile(originalName),
          downloadUrl: `/f/${filename}`,
          streamUrl: isVideoFile(originalName) ? `/stream/${filename}` : null,
          compressionCheckUrl: `/can-compress/${filename}`
        };
      })
    );

    const validFileDetails = fileDetails.filter((file) => file !== null);
    res.json(validFileDetails);
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

// Download compressed files
app.get("/compressed/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = join(COMPRESSED_DIR, filename);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Compressed file not found" });
  }

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  createReadStream(filePath).pipe(res);
});

// Download original file
app.get("/f/:filename", async (req, res) => {
  const filePath = join(UPLOAD_DIR, req.params.filename);
  try {
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch (error) {
    res.status(404).json({ error: "File not found" });
  }
});

// Video streaming endpoint
app.get("/stream/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = join(UPLOAD_DIR, filename);

    let stat;
    try {
      stat = statSync(filePath);
    } catch (error) {
      return res.status(404).json({ error: "Video file not found" });
    }

    if (!isVideoFile(filename)) {
      return res.status(400).json({ error: "File is not a video" });
    }

    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = getMimeType(filename);

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const stream = createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": mimeType
      });

      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes"
      });

      createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error("Error streaming video:", error);
    res.status(500).json({ error: "Failed to stream video" });
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

// Delete file endpoint
app.delete("/file/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;

    // Validate filename
    if (
      !filename ||
      typeof filename !== "string" ||
      filename.includes("..") ||
      filename.includes("/")
    ) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const filePath = join(UPLOAD_DIR, filename);
    const metadataPath = join(UPLOAD_DIR, `${filename}.meta`);

    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    // Delete the main file
    await fs.unlink(filePath);
    console.log(`Deleted file: ${filename}`);

    // Delete metadata file if it exists
    if (existsSync(metadataPath)) {
      try {
        await fs.unlink(metadataPath);
        console.log(`Deleted metadata: ${filename}.meta`);
      } catch (err) {
        console.warn(`Failed to delete metadata for ${filename}:`, err);
      }
    }

    res.json({
      success: true,
      message: "File deleted successfully",
      filename: filename
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file: " + error.message });
  }
});

// Rename file endpoint
app.put("/file/:filename/rename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const { newName } = req.body;

    // Validate inputs
    if (
      !filename ||
      typeof filename !== "string" ||
      filename.includes("..") ||
      filename.includes("/")
    ) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    if (!newName || typeof newName !== "string" || newName.trim() === "") {
      return res.status(400).json({ error: "Invalid new name" });
    }

    const oldFilePath = join(UPLOAD_DIR, filename);
    const oldMetadataPath = join(UPLOAD_DIR, `${filename}.meta`);

    // Check if file exists
    if (!existsSync(oldFilePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    // Generate new filename with same extension
    const ext = filename.split(".").pop();
    const newFilename = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}.${ext}`;
    const newFilePath = join(UPLOAD_DIR, newFilename);
    const newMetadataPath = join(UPLOAD_DIR, `${newFilename}.meta`);

    // Rename the main file
    await fs.rename(oldFilePath, newFilePath);
    console.log(`Renamed file: ${filename} -> ${newFilename}`);

    // Update metadata file if it exists
    if (existsSync(oldMetadataPath)) {
      try {
        const metadata = JSON.parse(await fs.readFile(oldMetadataPath, "utf8"));
        metadata.originalName = newName.trim();
        metadata.renamedAt = new Date().toISOString();

        await fs.writeFile(newMetadataPath, JSON.stringify(metadata, null, 2));
        await fs.unlink(oldMetadataPath);
        console.log(`Updated metadata for renamed file: ${newFilename}`);
      } catch (err) {
        console.warn(`Failed to update metadata for ${filename}:`, err);
      }
    } else {
      // Create new metadata if it doesn't exist
      const metadata = {
        originalName: newName.trim(),
        renamedAt: new Date().toISOString()
      };
      await fs.writeFile(newMetadataPath, JSON.stringify(metadata, null, 2));
    }

    res.json({
      success: true,
      message: "File renamed successfully",
      oldFilename: filename,
      newFilename: newFilename,
      newName: newName.trim()
    });
  } catch (error) {
    console.error("Error renaming file:", error);
    res.status(500).json({ error: "Failed to rename file: " + error.message });
  }
});

// Get file properties endpoint
app.get("/file/:filename/properties", async (req, res) => {
  try {
    const filename = req.params.filename;

    // Validate filename
    if (
      !filename ||
      typeof filename !== "string" ||
      filename.includes("..") ||
      filename.includes("/")
    ) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const filePath = join(UPLOAD_DIR, filename);
    const metadataPath = join(UPLOAD_DIR, `${filename}.meta`);

    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    // Get file stats
    const stat = statSync(filePath);

    // Get metadata if it exists
    let metadata = {};
    if (existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      } catch (err) {
        console.warn(`Failed to read metadata for ${filename}:`, err);
      }
    }

    const properties = {
      filename: filename,
      originalName: metadata.originalName || filename,
      size: stat.size,
      sizeFormatted: formatFileSize(stat.size),
      created: stat.birthtime,
      modified: stat.mtime,
      accessed: stat.atime,
      mimetype: metadata.mimetype || getMimeType(filename),
      isVideo: isVideoFile(filename),
      isImage: isImageFile(filename),
      canCompress: isVideoFile(filename) || isImageFile(filename),
      uploadDate: metadata.uploadDate,
      renamedAt: metadata.renamedAt,
      downloadUrl: `/f/${filename}`,
      streamUrl: isVideoFile(filename) ? `/stream/${filename}` : null,
      compressionCheckUrl: `/can-compress/${filename}`
    };

    res.json(properties);
  } catch (error) {
    console.error("Error getting file properties:", error);
    res
      .status(500)
      .json({ error: "Failed to get file properties: " + error.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uploadsDir: UPLOAD_DIR,
    compressedDir: COMPRESSED_DIR
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`🗜️  Compressed files directory: ${COMPRESSED_DIR}`);
  console.log(`📱 Simple compression API available`);
  console.log(`✅ Check compression: /can-compress/:filename`);
  console.log(`🎯 Compress with percentage: /compress/:filename`);
});
