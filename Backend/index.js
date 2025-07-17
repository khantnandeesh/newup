import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import sharp from "sharp";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3"; // FIXED: Added HeadBucketCommand
import { Readable } from "stream";
import { extname, dirname, basename, join } from "path";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from 'fs';

dotenv.config();
let BACKEND_URL="https://newup-4g3z.onrender.com"
const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

// Storj S3 Gateway Configuration
const storjClient = new S3Client({
  endpoint: "https://gateway.storjshare.io",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.STORJ_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORJ_SECRET_ACCESS_KEY
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.STORJ_BUCKET || "file-storage";
const COMPRESSED_BUCKET = process.env.STORJ_COMPRESSED_BUCKET || "compressed-files";
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key_please_change_this";
const USERS_DB_FILE = './users.json';

let users = {};
if (fs.existsSync(USERS_DB_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_DB_FILE, 'utf-8'));
    console.log("Loaded users from", USERS_DB_FILE);
}

const saveUsers = () => {
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users, null, 2), 'utf-8');
};

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 2000 // 2GB limit
  }
});

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

const videoExtensions = [".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv", ".m4v", ".3gp"];
const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif"];
const documentExtensions = [".pdf", ".doc", ".docx", ".txt", ".xlsx", ".xls", ".ppt", ".pptx"];
const audioExtensions = [".mp3", ".wav", ".aac", ".flac"];
const codeExtensions = [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".html", ".css", ".json", ".xml"];
const archiveExtensions = [".zip", ".rar", ".7z", ".tar", ".gz"];
const spreadsheetExtensions = [".xls", ".xlsx", ".csv"];

const getFileExtension = (filename) => filename.toLowerCase().split('.').pop();
const isVideoFile = (filename) => videoExtensions.includes('.' + getFileExtension(filename));
const isImageFile = (filename) => imageExtensions.includes('.' + getFileExtension(filename));
const isDocumentFile = (filename) => documentExtensions.includes('.' + getFileExtension(filename));
const isAudioFile = (filename) => audioExtensions.includes('.' + getFileExtension(filename));
const isCodeFile = (filename) => codeExtensions.includes('.' + getFileExtension(filename));
const isArchiveFile = (filename) => archiveExtensions.includes('.' + getFileExtension(filename));
const isSpreadsheetFile = (filename) => spreadsheetExtensions.includes('.' + getFileExtension(filename));


const getMimeType = (filename) => {
  const ext = getFileExtension(filename);
  const mimeTypes = {
    mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska", m4v: "video/x-m4v", "3gp": "video/3gpp",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff",
    pdf: "application/pdf", txt: "text/plain", html: "text/html", css: "text/css", js: "application/javascript", json: "application/json",
    mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac",
    zip: "application/zip", rar: "application/x-rar-compressed", "7z": "application/x-7z-compressed", tar: "application/x-tar", gz: "application/gzip",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv",
    py: "text/x-python", java: "text/x-java-source", c: "text/x-c", cpp: "text/x-c++src", ts: "application/typescript", tsx: "application/typescript", jsx: "text/jsx"
  };
  return mimeTypes[ext] || "application/octet-stream";
};

const normalizePath = (path) => {
  if (!path) return '';
  return path.replace(/^\/+|\/+$/g, '').replace(/\/\/+/g, '/');
};

const ensureBucketExists = async (bucketName) => {
  try {
    await storjClient.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`✅ Bucket '${bucketName}' exists`);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      console.log(`🔧 Creating bucket '${bucketName}'...`);
      await storjClient.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log(`✅ Bucket '${bucketName}' created successfully`);
      return true;
    }
    throw error;
  }
};

const ensureVaultFolderExists = async (vaultPrefix) => {
  const folderKey = vaultPrefix + '/';
  try {
    await storjClient.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: folderKey }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      console.log(`Creating Storj folder for vault: ${vaultPrefix}`);
      await storjClient.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: folderKey,
        Body: "",
        ContentType: "application/x-directory",
        Metadata: { isFolder: "true", vault: vaultPrefix }
      }));
      return true;
    }
    throw error;
  }
};

const testConnection = async () => {
  console.log('🔍 Testing Storj connection...');
  try {
    const mainBucketOk = await ensureBucketExists(BUCKET_NAME);
    const compressedBucketOk = await ensureBucketExists(COMPRESSED_BUCKET);
    if (!mainBucketOk || !compressedBucketOk) {
      console.error('❌ Required buckets are not available or could not be created.');
      return false;
    }
    console.log('✅ Storj connection successful!');
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return false;
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.status(401).json({ error: "Authentication token required." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    req.userVaultPrefix = user.vaultPrefix;
    next();
  });
};

app.post("/vault/register", async (req, res) => {
  const { vaultNumber, passcode } = req.body;
console.log(req.body);
  if (!vaultNumber || !passcode) {
    return res.status(400).json({ error: "Vault number and passcode are required." });
  }

  const vaultPrefix = `vault_${vaultNumber}`;

  if (users[vaultPrefix]) {
    return res.status(409).json({ error: "Vault number already exists. Please choose another or log in." });
  }

  try {
    const hashedPassword = await bcrypt.hash(passcode, 10);
    users[vaultPrefix] = { hashedPassword };
    saveUsers();

    await ensureVaultFolderExists(vaultPrefix);

    const token = jwt.sign({ vaultPrefix }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, message: "Vault created and logged in.", token });
  } catch (error) {
    console.error("Vault registration error:", error);
    res.status(500).json({ error: "Failed to create vault: " + error.message });
  }
});

app.post("/vault/login", async (req, res) => {
  const { vaultNumber, passcode } = req.body;

  if (!vaultNumber || !passcode) {
    return res.status(400).json({ error: "Vault number and passcode are required." });
  }

  const vaultPrefix = `vault_${vaultNumber}`;
  const user = users[vaultPrefix];

  if (!user) {
    return res.status(401).json({ error: "Vault not found." });
  }

  try {
    if (await bcrypt.compare(passcode, user.hashedPassword)) {
      const token = jwt.sign({ vaultPrefix }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ success: true, message: "Logged in successfully.", token });
    } else {
      res.status(401).json({ error: "Invalid passcode." });
    }
  } catch (error) {
    console.error("Vault login error:", error);
    res.status(500).json({ error: "Failed to login: " + error.message });
  }
});

app.get("/vault/check-auth", authenticateToken, (req, res) => {
  res.json({ authenticated: true, vaultPrefix: req.userVaultPrefix });
});
// REPLACE the existing /preview route in your backend with this one.

app.get("/preview/:filepath(*)", authenticateToken, async (req, res) => {
  // --- Self-contained Helper Functions to prevent scope issues ---
  const videoFormats = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];
  const imageFormats = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.tiff'];
  const textDocumentFormats = ['.doc', '.docx', '.txt', '.xlsx', '.xls', '.ppt', '.pptx']; // Non-renderable docs
  const codeFormats = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json', '.xml'];
  const pdfFormats = ['.pdf'];
  const htmlFormats = ['.html', '.htm'];

  const getFileExtension = (filename) => filename ? filename.toLowerCase().split('.').pop() : '';
  const isVideoFile = (filename) => videoFormats.includes('.' + getFileExtension(filename));
  const isImageFile = (filename) => imageFormats.includes('.' + getFileExtension(filename));
  const isTextDocument = (filename) => textDocumentFormats.includes('.' + getFileExtension(filename));
  const isCodeFile = (filename) => codeFormats.includes('.' + getFileExtension(filename));
  const isPdfFile = (filename) => pdfFormats.includes('.' + getFileExtension(filename));
  const isHtmlFile = (filename) => htmlFormats.includes('.' + getFileExtension(filename));
  // --- End of Helper Functions ---

  try {
    const userVaultPrefix = req.userVaultPrefix;
    const requestedFilePath = decodeURIComponent(req.params.filepath);

    if (!requestedFilePath.startsWith(userVaultPrefix + "/")) {
      return res.status(403).json({ error: "Access denied." });
    }

    const fileName = basename(requestedFilePath);

    // For types that can be rendered via a URL (as a blob)
    if (isImageFile(fileName) || isVideoFile(fileName) || isPdfFile(fileName) || isHtmlFile(fileName)) {
      return res.json({
        type: "url",
        url: `/f/${encodeURIComponent(requestedFilePath)}`,
      });
    }

    // For types that can be previewed as text snippets
    if (isCodeFile(fileName) || isTextDocument(fileName)) {
       const getParams = {
        Bucket: BUCKET_NAME,
        Key: requestedFilePath,
        Range: "bytes=0-4096", // Fetch first 4KB
      };
      const response = await storjClient.send(new GetObjectCommand(getParams));
      const textContent = await response.Body.transformToString("utf-8");
      
      const snippet = textContent.length > 2000 ? textContent.substring(0, 2000) + '...' : textContent;

      return res.json({
        type: "text",
        content: snippet,
      });
    }
    
    // For all other file types, no preview is available.
    return res.json({ type: "none", message: "Preview not available for this file type." });

  } catch (error) {
    console.error("Preview error:", error);
    if (error.name === "NoSuchKey") {
      return res.status(404).json({ type: "error", message: "File not found." });
    }
    return res.status(500).json({ type: "error", message: "Could not load preview." });
  }
});

app.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const userVaultPrefix = req.userVaultPrefix;
    const folderPath = req.body.folderPath ? normalizePath(req.body.folderPath) + '/' : '';
    const originalFileName = file.originalname;
    const filePathInBucket = `${userVaultPrefix}/${folderPath}${originalFileName}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: filePathInBucket,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: originalFileName,
        uploadDate: new Date().toISOString(),
        mimetype: file.mimetype,
        folderPath: folderPath
      }
    };

    await storjClient.send(new PutObjectCommand(uploadParams));

    const fileInfo = {
      path: filePathInBucket,
      name: originalFileName,
      originalName: originalFileName,
      size: file.size,
      mimetype: file.mimetype,
      uploadDate: new Date().toISOString(),
      isFolder: false,
      parentPath: folderPath.slice(0, -1),
      downloadUrl: `/f/${encodeURIComponent(filePathInBucket)}`,
      streamUrl: isVideoFile(originalFileName) ? `/stream/${encodeURIComponent(filePathInBucket)}` : null,
      canCompress: isVideoFile(originalFileName) || isImageFile(originalFileName),
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

app.get("/list", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const { prefix = '' } = req.query;
    const normalizedPrefix = prefix ? normalizePath(prefix) + '/' : '';

    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: `${userVaultPrefix}/${normalizedPrefix}`,
      Delimiter: '/',
      MaxKeys: 1000
    };

    const response = await storjClient.send(new ListObjectsV2Command(listParams));

    const items = [];

    (response.CommonPrefixes || []).forEach(commonPrefix => {
      const fullFolderPath = normalizePath(commonPrefix.Prefix);
      const relativeFolderPath = fullFolderPath.substring(userVaultPrefix.length + 1);
      const folderName = relativeFolderPath.split('/').pop();

      if (folderName) {
        items.push({
          path: fullFolderPath,
          name: folderName,
          isFolder: true,
          size: 0,
          created: null,
          modified: null,
        });
      }
    });

    (response.Contents || []).forEach(object => {
      if (object.Key === `${userVaultPrefix}/` || object.Key.endsWith('/')) {
        return;
      }

      const fileName = basename(object.Key);
      const fileFullPath = object.Key;

      items.push({
        path: fileFullPath,
        name: fileName,
        originalName: object.Metadata?.originalName || fileName,
        size: object.Size,
        created: object.LastModified,
        modified: object.LastModified,
        isVideo: isVideoFile(fileName),
        isImage: isImageFile(fileName),
        isDocument: isDocumentFile(fileName),
        isAudio: isAudioFile(fileName),
        isCode: isCodeFile(fileName),
        isArchive: isArchiveFile(fileName),
        isSpreadsheet: isSpreadsheetFile(fileName),
        isFolder: false,
        downloadUrl: `/f/${encodeURIComponent(fileFullPath)}`,
        streamUrl: isVideoFile(fileName) ? `/stream/${encodeURIComponent(fileFullPath)}` : null,
      });
    });

    const currentDisplayPath = normalizedPrefix.slice(0, -1);
    let parentDisplayPath = null;
    if (currentDisplayPath) {
      const lastSlashIndex = currentDisplayPath.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        parentDisplayPath = currentDisplayPath.substring(0, lastSlashIndex);
      } else {
        parentDisplayPath = '';
      }
    }

    res.json({
      items,
      currentPath: currentDisplayPath,
      parentPath: parentDisplayPath
    });
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files: " + error.message });
  }
});
app.get("/preview/:filepath(*)", async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const requestedFilePath = decodeURIComponent(req.params.filepath);

    if (!requestedFilePath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. File is not in your vault." });
    }

    const fileName = basename(requestedFilePath);
    const fileExtension = getFileExtension(fileName);

    // Fetch object metadata to get ContentType and Size
    const headParams = {
      Bucket: BUCKET_NAME,
      Key: requestedFilePath
    };
    let headResponse;
    try {
        headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    } catch (headError) {
        if (headError.name === 'NotFound') {
            return res.status(404).json({ error: "File not found for preview." });
        }
        console.error("Error fetching head object for preview:", headError); // Log unexpected head errors
        return res.status(500).json({ error: "Failed to get file info for preview: " + headError.message });
    }

    const contentType = headResponse.ContentType || getMimeType(fileName);
    const fileSize = headResponse.ContentLength;

    // Determine preview strategy based on file type
    if (isImageFile(fileName) || isVideoFile(fileName) || fileExtension === 'pdf') {
      res.json({
        success: true,
        type: 'url',
        url: `${BACKEND_URL}/f/${encodeURIComponent(requestedFilePath)}`,
        contentType: contentType,
        message: "URL provided for direct preview embedding."
      });
    } else if (isCodeFile(fileName) || fileExtension === 'txt' || fileExtension === 'json' || fileExtension === 'csv' || fileExtension === 'html') {
        const getParams = {
            Bucket: BUCKET_NAME,
            Key: requestedFilePath,
        };

        // NEW FIX: Only request a range if the file is larger than the desired snippet size
        // Otherwise, fetch the whole file to avoid InvalidRange errors for small files.
        const MAX_PREVIEW_BYTES = 1024 * 5; // Fetch up to 5KB for preview snippet
        if (fileSize > MAX_PREVIEW_BYTES) {
            getParams.Range = `bytes=0-${MAX_PREVIEW_BYTES - 1}`;
        }
        
        let response;
        try {
            response = await storjClient.send(new GetObjectCommand(getParams));
        } catch (getObjectError) {
            console.error(`Error getting object for preview snippet for ${requestedFilePath}:`, getObjectError);
            return res.status(500).json({ error: "Failed to fetch preview snippet: " + getObjectError.message });
        }

        const streamToString = (stream) =>
            new Promise((resolve, reject) => {
                const chunks = [];
                stream.on("data", (chunk) => chunks.push(chunk));
                stream.on("error", reject);
                stream.on("end", () => resolve(Buffer.concat(chunks).toString('utf8')));
            });

        const textContent = await streamToString(response.Body);
        
        res.json({
            success: true,
            type: 'text',
            content: textContent.substring(0, MAX_PREVIEW_BYTES) + (fileSize > MAX_PREVIEW_BYTES ? '...' : ''), 
            contentType: contentType
        });
    } else {
      res.status(400).json({
        error: "No direct preview available for this file type.",
        type: 'none',
        message: "No preview available for this file type." // Added message for frontend
      });
    }

  } catch (error) {
    // Generic catch-all for any other errors in this endpoint
    console.error("Preview endpoint general error:", error);
    res.status(500).json({ error: "Failed to generate preview: " + error.message });
  }
});
app.get("/f/:filepath(*)", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const requestedFilePath = decodeURIComponent(req.params.filepath);

    if (!requestedFilePath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. File is not in your vault." });
    }

    const headParams = {
      Bucket: BUCKET_NAME,
      Key: requestedFilePath
    };
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};
    const originalFileName = metadata.originalName || basename(requestedFilePath);

    const getParams = {
      Bucket: BUCKET_NAME,
      Key: requestedFilePath
    };
    const response = await storjClient.send(new GetObjectCommand(getParams));

    res.setHeader('Content-Type', headResponse.ContentType || getMimeType(originalFileName));
    res.setHeader('Content-Length', headResponse.ContentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${originalFileName}"`);

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

app.get("/stream/:filepath(*)", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const requestedFilePath = decodeURIComponent(req.params.filepath);

    if (!requestedFilePath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. Video is not in your vault." });
    }

    const headParams = {
      Bucket: BUCKET_NAME,
      Key: requestedFilePath
    };
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const fileSize = headResponse.ContentLength;
    const contentType = headResponse.ContentType || getMimeType(requestedFilePath);

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      const getParams = {
        Bucket: BUCKET_NAME,
        Key: requestedFilePath,
        Range: `bytes=${start}-${end}`
      };

      const response = await storjClient.send(new GetObjectCommand(getParams));

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });

      response.Body.pipe(res);
    } else {
      const getParams = {
        Bucket: BUCKET_NAME,
        Key: requestedFilePath
      };
      const response = await storjClient.send(new GetObjectCommand(getParams));

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });

      response.Body.pipe(res);
    }
  } catch (error) {
    console.error("Stream error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to stream file" });
    }
  }
});

app.get("/file/:filepath(*)/properties", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const requestedFilePath = decodeURIComponent(req.params.filepath);

    if (!requestedFilePath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. Not in your vault." });
    }

    const headParams = {
      Bucket: BUCKET_NAME,
      Key: requestedFilePath
    };
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const metadata = headResponse.Metadata || {};
    const fileName = basename(requestedFilePath);

    const fileInfo = {
      path: requestedFilePath,
      name: fileName,
      originalName: metadata.originalName || fileName,
      size: headResponse.ContentLength,
      contentType: headResponse.ContentType,
      created: headResponse.LastModified,
      lastModified: headResponse.LastModified,
      isVideo: isVideoFile(fileName),
      isImage: isImageFile(fileName),
      isDocument: isDocumentFile(fileName),
      isAudio: isAudioFile(fileName),
      isCode: isCodeFile(fileName),
      isArchive: isArchiveFile(fileName),
      isSpreadsheet: isSpreadsheetFile(fileName),
      canCompress: isVideoFile(fileName) || isImageFile(fileName),
      downloadUrl: `/f/${encodeURIComponent(requestedFilePath)}`,
      streamUrl: isVideoFile(fileName) ? `/stream/${encodeURIComponent(requestedFilePath)}` : null,
      metadata: metadata
    };

    res.json(fileInfo);
  } catch (error) {
    console.error("Properties error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File not found" });
    } else {
      res.status(500).json({ error: "Failed to get file properties" });
    }
  }
});

app.delete("/file/:filepath(*)", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const requestedFilePath = decodeURIComponent(req.params.filepath);
    const isFolderDeletion = requestedFilePath.endsWith('/');

    if (!requestedFilePath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. Not in your vault." });
    }
    if (requestedFilePath === userVaultPrefix + '/') {
      return res.status(403).json({ error: "Cannot delete your root vault folder directly. Please contact support." });
    }

    if (isFolderDeletion) {
      const listParams = {
        Bucket: BUCKET_NAME,
        Prefix: requestedFilePath
      };

      const listedObjects = await storjClient.send(new ListObjectsV2Command(listParams));

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        const objectsToDelete = listedObjects.Contents.map(obj => ({ Key: obj.Key }));
        for (const object of objectsToDelete) {
          await storjClient.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: object.Key
          }));
        }
      }
      res.json({ success: true, message: `Folder '${basename(requestedFilePath.slice(0, -1))}' and all its contents deleted successfully` });
    } else {
      const deleteParams = {
        Bucket: BUCKET_NAME,
        Key: requestedFilePath
      };
      await storjClient.send(new DeleteObjectCommand(deleteParams));
      res.json({ success: true, message: `File '${basename(requestedFilePath)}' deleted successfully` });
    }
  } catch (error) {
    console.error("Delete error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "File or folder not found" });
    } else {
      res.status(500).json({ error: "Failed to delete: " + error.message });
    }
  }
});

app.put("/file/:filepath(*)/rename", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const oldFilePath = decodeURIComponent(req.params.filepath);
    const { newName, isFolder } = req.body;

    if (!oldFilePath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. Not in your vault." });
    }
    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      return res.status(400).json({ error: "New name is required" });
    }

    const trimmedNewName = newName.trim();
    const currentDir = dirname(oldFilePath);

    let newFilePath;

    if (isFolder) {
      const oldFolderPath = oldFilePath.endsWith('/') ? oldFilePath : oldFilePath + '/';
      const newFolderPath = currentDir === userVaultPrefix ? `${userVaultPrefix}/${trimmedNewName}/` : `${currentDir}/${trimmedNewName}/`;

      if (!oldFolderPath.startsWith(userVaultPrefix + '/')) {
        return res.status(403).json({ error: "Access denied. Folder not in your vault." });
      }

      const listParams = {
        Bucket: BUCKET_NAME,
        Prefix: oldFolderPath
      };
      const listedObjects = await storjClient.send(new ListObjectsV2Command(listParams));

      const renamePromises = (listedObjects.Contents || []).map(async (obj) => {
        const relativePath = obj.Key.substring(oldFolderPath.length);
        const destinationKey = newFolderPath + relativePath;

        await storjClient.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: destinationKey,
          CopySource: `${BUCKET_NAME}/${encodeURIComponent(obj.Key)}`,
          ContentType: obj.ContentType,
          MetadataDirective: 'COPY',
          TaggingDirective: 'COPY'
        }));

        await storjClient.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key
        }));
      });
      await Promise.all(renamePromises);

      newFilePath = newFolderPath;
    } else {
      const fileExtension = extname(oldFilePath);
      newFilePath = currentDir === userVaultPrefix ? `${userVaultPrefix}/${trimmedNewName}${fileExtension}` : `${currentDir}/${trimmedNewName}${fileExtension}`;

      await storjClient.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: newFilePath,
        CopySource: `${BUCKET_NAME}/${encodeURIComponent(oldFilePath)}`,
        ContentType: getMimeType(newFilePath),
        MetadataDirective: 'COPY',
        TaggingDirective: 'COPY'
      }));

      await storjClient.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: oldFilePath
      }));
    }

    res.json({
      success: true,
      message: `${isFolder ? 'Folder' : 'File'} renamed successfully`,
      oldPath: oldFilePath,
      newPath: newFilePath,
      newName: trimmedNewName
    });
  } catch (error) {
    console.error("Rename error:", error);
    if (error.name === 'NoSuchKey') {
      res.status(404).json({ error: "Item not found" });
    } else {
      res.status(500).json({ error: "Failed to rename item: " + error.message });
    }
  }
});

app.post("/compress/:filepath(*)", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const filepath = decodeURIComponent(req.params.filepath);
    const { percentage = 50, format = "auto" } = req.body;

    if (!filepath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. Not in your vault." });
    }
    if (filepath.endsWith('/')) {
        return res.status(400).json({ error: "Folders cannot be compressed." });
    }
    if (percentage < 10 || percentage > 90) {
      return res.status(400).json({ error: "Percentage must be between 10-90" });
    }

    const getParams = {
      Bucket: BUCKET_NAME,
      Key: filepath
    };
    const response = await storjClient.send(new GetObjectCommand(getParams));
    const fileBuffer = await response.Body.transformToByteArray();

    const fileName = basename(filepath);
    const isVideo = isVideoFile(fileName);
    const isImage = isImageFile(fileName);

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

    const compressedFileName = `compressed_${percentage}pct_${Date.now()}_${fileName}`;
    const compressedFilePath = join(dirname(filepath), compressedFileName);

    let compressedBuffer;
    if (isImage) {
      compressedBuffer = await compressImage(fileBuffer, percentage, format);
    } else if (isVideo) {
      compressedBuffer = await compressVideo(fileBuffer, percentage, format);
    }

    const uploadParams = {
      Bucket: COMPRESSED_BUCKET,
      Key: compressedFilePath,
      Body: compressedBuffer,
      ContentType: getMimeType(compressedFileName),
      Metadata: {
        originalPath: filepath,
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
      downloadUrl: `/compressed/${encodeURIComponent(compressedFilePath)}`,
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

app.get("/can-compress/:filepath(*)", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const filepath = decodeURIComponent(req.params.filepath);

    if (!filepath.startsWith(userVaultPrefix + '/')) {
      return res.status(403).json({ error: "Access denied. Not in your vault." });
    }
    if (filepath.endsWith('/')) {
        return res.status(400).json({ error: "Folders cannot be compressed." });
    }

    const headParams = {
      Bucket: BUCKET_NAME,
      Key: filepath
    };
    const headResponse = await storjClient.send(new HeadObjectCommand(headParams));
    const fileName = basename(filepath);
    const isVideo = isVideoFile(fileName);
    const isImage = isImageFile(fileName);
    const canCompress = isVideo || isImage;

    res.json({
      path: filepath,
      name: fileName,
      originalName: headResponse.Metadata?.originalName || fileName,
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

app.post("/folder", authenticateToken, async (req, res) => {
  try {
    const userVaultPrefix = req.userVaultPrefix;
    const { path } = req.body;

    if (!path || typeof path !== "string") {
      return res.status(400).json({ error: "Invalid folder path" });
    }

    const normalizedPath = normalizePath(path);
    const fullFolderPath = `${userVaultPrefix}/${normalizedPath}/`;

    try {
      await storjClient.send(new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fullFolderPath
      }));
      return res.status(409).json({ error: "Folder with this name already exists at this path." });
    } catch (headError) {
      if (headError.name !== 'NotFound') {
        throw headError;
      }
    }

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fullFolderPath,
      Body: "",
      ContentType: "application/x-directory",
      Metadata: {
        isFolder: "true",
        createdDate: new Date().toISOString(),
        vault: userVaultPrefix
      }
    };

    await storjClient.send(new PutObjectCommand(uploadParams));

    const folder = {
      path: fullFolderPath,
      name: basename(normalizedPath),
      isFolder: true,
      created: new Date().toISOString()
    };

    res.json({
      success: true,
      message: "Folder created successfully",
      folder
    });
  } catch (error) {
    console.error("Create folder error:", error);
    res.status(500).json({ error: "Failed to create folder: " + error.message });
  }
});


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

async function compressVideo(buffer, percentage, format = "auto") {
  console.warn("Basic video compression: This implementation will likely result in an unplayable video. For proper video compression, integrate with FFmpeg.");
  const targetSize = Math.floor(buffer.length * (1 - percentage / 100));
  const compressedBuffer = buffer.slice(0, Math.max(0, targetSize));
  return compressedBuffer;
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

app.get("/health", async (req, res) => {
  const health = {
    status: "OK",
    timestamp: new Date().toISOString(),
    storage: "Storj.io",
    bucket: BUCKET_NAME,
    compressedBucket: COMPRESSED_BUCKET
  };
  try {
    // Corrected: Use HeadBucketCommand for health check to check bucket existence
    await storjClient.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    await storjClient.send(new HeadBucketCommand({ Bucket: COMPRESSED_BUCKET }));
    health.storjConnection = "OK";
  } catch (error) {
    health.status = "ERROR";
    health.storjConnection = "FAILED";
    health.error = error.message;
  }
  res.json(health);
});

app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  console.log("🚀 Starting server...");
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.error("❌ Server cannot start - Storj connection failed");
    console.error("Please check your credentials and environment variables.");
    process.exit(1);
  }
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`☁️ Using Storj.io for file storage`);
    console.log(`🪣 Main bucket: ${BUCKET_NAME}`);
    console.log(`🗜️ Compressed files bucket: ${COMPRESSED_BUCKET}`);
    console.log(`🔑 JWT Secret (make sure this is strong and private): ${JWT_SECRET}`);
    console.log(`💾 User data stored in: ${USERS_DB_FILE}`);
    console.log(`🔍 Health check: /health`);
    console.log(`🚪 Auth Endpoints: /vault/register, /vault/login, /vault/check-auth`);
    console.log(`🔐 Protected Endpoints: /upload, /list, /f/*, /stream/*, /file/*/properties, /file/*, /compress/*, /can-compress/*, /folder`);
  });
}

startServer().catch(console.error);
