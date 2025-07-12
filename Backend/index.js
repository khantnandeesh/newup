import express from "express";
import wrtc from "@koush/wrtc";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";
import { createReadStream, statSync, existsSync } from "fs";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import archiver from "archiver";
import sharp from "sharp";
import zlib from "zlib";
import { promisify } from "util";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;
const UPLOAD_DIR = join(__dirname, "uploads");
const COMPRESSED_DIR = join(__dirname, "compressed");


app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Ensure directories exist
await fs.mkdir(UPLOAD_DIR, { recursive: true });
await fs.mkdir(COMPRESSED_DIR, { recursive: true });

// Store active connections and their ICE candidates
const connections = new Map();
const iceCandidates = new Map();

// Video file extensions for streaming
const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];

// Image file extensions for compression
const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif'];

// Compressible file extensions
const compressibleExtensions = ['.txt', '.json', '.xml', '.html', '.css', '.js', '.csv', '.log', '.md'];

// Helper function to check if file is a video
const isVideoFile = (filename) => {
  return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
};

// Helper function to check if file is an image
const isImageFile = (filename) => {
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
};

// Helper function to check if file is compressible
const isCompressibleFile = (filename) => {
  return compressibleExtensions.some(ext => filename.toLowerCase().endsWith(ext));
};

// Helper function to get MIME type based on file extension
const getMimeType = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'm4v': 'video/x-m4v',
    '3gp': 'video/3gpp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

app.post("/signal", async (req, res) => {
  try {
    const { type, id, sdp, candidate } = req.body;

    if (!id || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (type === "offer") {
      const pc = new wrtc.RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      connections.set(id, pc);
      iceCandidates.set(id, []);

      // Handle file upload data channel
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        const fileBuffer = new Map(); // Store file chunks
        
        channel.onopen = () => {
          console.log(`Data channel opened for ${id}`);
        };

        channel.onclose = () => {
          console.log(`Data channel closed for ${id}`);
          connections.delete(id);
          iceCandidates.delete(id);
        };

        channel.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data);
            const { id: fileId, filename, chunk, offset, totalSize, eof } = message;

            if (eof) {
              // File transfer complete
              console.log(`File transfer completed: ${filename}`);
              
              // Combine all chunks and save file
              const filePath = join(UPLOAD_DIR, `${fileId}_${filename}`);
              const chunks = fileBuffer.get(fileId) || [];
              
              if (chunks.length > 0) {
                // Sort chunks by offset to ensure correct order
                chunks.sort((a, b) => a.offset - b.offset);
                
                const buffers = chunks.map(c => c.buffer);
                const finalBuffer = Buffer.concat(buffers);
                
                await fs.writeFile(filePath, finalBuffer);
                console.log(`File saved: ${filePath}`);
              }
              
              // Clean up
              fileBuffer.delete(fileId);
              
              // Send download link
              const downloadLink = `http://localhost:${port}/f/${fileId}_${filename}`;
              channel.send(JSON.stringify({
                type: "download",
                link: downloadLink
              }));
              
            } else if (chunk) {
              // Receive file chunk
              const buffer = Buffer.from(chunk, 'base64');
              
              if (!fileBuffer.has(fileId)) {
                fileBuffer.set(fileId, []);
              }
              
              fileBuffer.get(fileId).push({
                offset: offset,
                buffer: buffer
              });
              
              console.log(`Received chunk for ${filename}: ${offset}/${totalSize} bytes`);
            }
            
          } catch (error) {
            console.error("Error processing message:", error);
            channel.send(JSON.stringify({
              type: "error",
              message: "Failed to process file chunk"
            }));
          }
        };

        channel.onerror = (error) => {
          console.error("Data channel error:", error);
        };
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidates = iceCandidates.get(id) || [];
          candidates.push(event.candidate);
          iceCandidates.set(id, candidates);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`Connection state for ${id}: ${pc.connectionState}`);
      };

      // Set remote description and create answer
      await pc.setRemoteDescription(new wrtc.RTCSessionDescription({
        type: "offer",
        sdp: sdp
      }));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      res.json({
        type: "answer",
        sdp: answer.sdp
      });

    } else if (type === "candidate") {
      const pc = connections.get(id);
      if (!pc) {
        return res.status(404).json({ error: "Connection not found" });
      }

      try {
        await pc.addIceCandidate(new wrtc.RTCIceCandidate(candidate));
        res.json({ success: true });
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
        res.status(500).json({ error: error.message });
      }
    } else {
      res.status(400).json({ error: "Unknown signal type" });
    }

  } catch (error) {
    console.error("Signaling error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get ICE candidates for client
app.get('/signal/back/:id', (req, res) => {
  const candidates = iceCandidates.get(req.params.id) || [];
  iceCandidates.set(req.params.id, []); // Clear after sending
  res.json({ candidates });
});

// List uploaded files
app.get('/list', async (req, res) => {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    res.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// **NEW: File compression endpoint**
app.post('/compress/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const { type = 'auto', quality = 80, level = 6 } = req.body;
    
    const filePath = join(UPLOAD_DIR, filename);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const originalStat = statSync(filePath);
    const compressedFilename = `compressed_${Date.now()}_${filename}`;
    const compressedPath = join(COMPRESSED_DIR, compressedFilename);
    
    let compressionResult;
    
    // Determine compression type
    if (type === 'auto') {
      if (isImageFile(filename)) {
        compressionResult = await compressImage(filePath, compressedPath, quality);
      } else if (isCompressibleFile(filename)) {
        compressionResult = await compressFile(filePath, compressedPath, level);
      } else {
        compressionResult = await compressFile(filePath, compressedPath, level);
      }
    } else if (type === 'image' && isImageFile(filename)) {
      compressionResult = await compressImage(filePath, compressedPath, quality);
    } else if (type === 'gzip') {
      compressionResult = await compressFile(filePath, compressedPath, level);
    } else {
      return res.status(400).json({ error: 'Invalid compression type for this file' });
    }
    
    const compressedStat = statSync(compressedPath);
    const compressionRatio = ((originalStat.size - compressedStat.size) / originalStat.size * 100).toFixed(2);
    
    res.json({
      success: true,
      originalSize: originalStat.size,
      compressedSize: compressedStat.size,
      compressionRatio: `${compressionRatio}%`,
      downloadUrl: `/compressed/${compressedFilename}`,
      type: compressionResult.type,
      message: `File compressed successfully. Saved ${compressionRatio}% space.`
    });
    
    console.log(`Compressed ${filename}: ${originalStat.size} → ${compressedStat.size} bytes (${compressionRatio}% reduction)`);
    
  } catch (error) {
    console.error('Compression error:', error);
    res.status(500).json({ error: 'Failed to compress file: ' + error.message });
  }
});

// **NEW: Bulk compression endpoint (create ZIP)**
app.post('/compress-bulk', async (req, res) => {
  try {
    const { files = [], name = 'archive' } = req.body;
    
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided for compression' });
    }
    
    const zipFilename = `${name}_${Date.now()}.zip`;
    const zipPath = join(COMPRESSED_DIR, zipFilename);
    
    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = require('fs').createWriteStream(zipPath);
    
    archive.pipe(output);
    
    let totalOriginalSize = 0;
    
    // Add files to archive
    for (const filename of files) {
      const filePath = join(UPLOAD_DIR, filename);
      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        totalOriginalSize += stat.size;
        archive.file(filePath, { name: filename });
      }
    }
    
    await archive.finalize();
    
    // Wait for the archive to be written
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
    
    const compressedStat = statSync(zipPath);
    const compressionRatio = ((totalOriginalSize - compressedStat.size) / totalOriginalSize * 100).toFixed(2);
    
    res.json({
      success: true,
      originalSize: totalOriginalSize,
      compressedSize: compressedStat.size,
      compressionRatio: `${compressionRatio}%`,
      downloadUrl: `/compressed/${zipFilename}`,
      type: 'zip',
      filesCount: files.length,
      message: `${files.length} files compressed into ZIP archive. Saved ${compressionRatio}% space.`
    });
    
    console.log(`Created ZIP archive: ${zipFilename} (${files.length} files, ${compressionRatio}% reduction)`);
    
  } catch (error) {
    console.error('Bulk compression error:', error);
    res.status(500).json({ error: 'Failed to create ZIP archive: ' + error.message });
  }
});

// **NEW: Download compressed files**
app.get('/compressed/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = join(COMPRESSED_DIR, filename);
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Compressed file not found' });
  }
  
  // Set appropriate headers for download
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  
  createReadStream(filePath).pipe(res);
});

// **NEW: List compressed files**
app.get('/compressed', async (req, res) => {
  try {
    const files = await fs.readdir(COMPRESSED_DIR);
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = join(COMPRESSED_DIR, file);
        const stat = statSync(filePath);
        return {
          filename: file,
          size: stat.size,
          created: stat.birthtime,
          downloadUrl: `/compressed/${file}`
        };
      })
    );
    
    res.json(fileDetails);
  } catch (error) {
    console.error('Error listing compressed files:', error);
    res.status(500).json({ error: 'Failed to list compressed files' });
  }
});

// **NEW: Compression helper functions**
async function compressImage(inputPath, outputPath, quality = 80) {
  try {
    const ext = inputPath.toLowerCase().split('.').pop();
    
    let pipeline = sharp(inputPath);
    
    // Apply compression based on format
    if (ext === 'jpg' || ext === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: parseInt(quality), progressive: true });
    } else if (ext === 'png') {
      pipeline = pipeline.png({ quality: parseInt(quality), progressive: true });
    } else if (ext === 'webp') {
      pipeline = pipeline.webp({ quality: parseInt(quality) });
    } else {
      // Convert to JPEG for other formats
      pipeline = pipeline.jpeg({ quality: parseInt(quality), progressive: true });
    }
    
    await pipeline.toFile(outputPath);
    return { type: 'image', format: ext };
  } catch (error) {
    throw new Error(`Image compression failed: ${error.message}`);
  }
}

async function compressFile(inputPath, outputPath, level = 6) {
  try {
    const gzip = promisify(zlib.gzip);
    const input = await fs.readFile(inputPath);
    const compressed = await gzip(input, { level: parseInt(level) });
    await fs.writeFile(outputPath + '.gz', compressed);
    
    // Rename to original extension + .gz
    await fs.rename(outputPath + '.gz', outputPath);
    
    return { type: 'gzip', level: parseInt(level) };
  } catch (error) {
    throw new Error(`File compression failed: ${error.message}`);
  }
}
app.get('/stream/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = join(UPLOAD_DIR, filename);
    
    // Check if file exists
    let stat;
    try {
      stat = statSync(filePath);
    } catch (error) {
      console.error('File not found:', filePath);
      return res.status(404).json({ error: 'Video file not found' });
    }

    // Check if it's a video file
    if (!isVideoFile(filename)) {
      return res.status(400).json({ error: 'File is not a video' });
    }

    const fileSize = stat.size;
    const range = req.headers.range;
    
    // Set appropriate headers for video streaming
    const mimeType = getMimeType(filename);
    
    if (range) {
      // Handle range requests for video seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      // Create read stream for the requested range
      const stream = createReadStream(filePath, { start, end });
      
      // Set partial content headers
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      stream.pipe(res);
    } else {
      // Serve entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      createReadStream(filePath).pipe(res);
    }
    
    console.log(`Streaming video: ${filename} (${fileSize} bytes)`);
    
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).json({ error: 'Failed to stream video' });
  }
});

// Download file (existing endpoint)
app.get("/f/:filename", async (req, res) => {
  const filePath = join(UPLOAD_DIR, req.params.filename);
  try {
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch (error) {
    res.status(404).json({ error: "File not found" });
  }
});

// **NEW: Get file info endpoint (useful for video metadata)**
app.get('/info/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = join(UPLOAD_DIR, filename);
    
    const stat = statSync(filePath);
    const isVideo = isVideoFile(filename);
    const isImage = isImageFile(filename);
    const isCompressible = isCompressibleFile(filename);
    
    res.json({
      filename: filename,
      size: stat.size,
      isVideo: isVideo,
      isImage: isImage,
      isCompressible: isCompressible,
      mimeType: getMimeType(filename),
      created: stat.birthtime,
      modified: stat.mtime,
      canCompress: isImage || isCompressible || true // All files can be compressed with gzip
    });
    
  } catch (error) {
    console.error('Error getting file info:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    uploadsDir: UPLOAD_DIR
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`🗜️  Compressed files directory: ${COMPRESSED_DIR}`);
  console.log(`🎥 Video streaming available at /stream/:filename`);
  console.log(`📦 File compression available at /compress/:filename`);
});