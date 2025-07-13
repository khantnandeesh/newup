import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  Image,
  Video,
  Zap,
  Info,
  ArrowRight,
  FileArchive,
  RefreshCw,
  Trash2,
  X,
  MessageSquare,
  Eye,
  EyeOff,
  Clock
} from 'lucide-react';

const SimpleFileCompression = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressionStatus, setCompressionStatus] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [compressionSettings, setCompressionSettings] = useState({
    percentage: 50,
    format: 'auto'
  });
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  // Add log entry
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      timestamp,
      message,
      type // 'info', 'success', 'error', 'warning'
    };
    setLogs(prev => [logEntry, ...prev]);
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };

  // API base URL
  const API_BASE = 'https://newup-4g3z.onrender.com';

  // Fetch uploaded files
  const fetchFiles = async () => {
    try {
      addLog('Fetching files from server...', 'info');
      const response = await fetch(`${API_BASE}/list`);
      const fileList = await response.json();
      setFiles(fileList);
      addLog(`Found ${fileList.length} files on server`, 'success');
    } catch (error) {
      console.error('Failed to fetch files:', error);
      addLog(`Failed to fetch files: ${error.message}`, 'error');
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // File upload handler
  const handleFileUpload = async (uploadedFiles) => {
    const fileList = Array.from(uploadedFiles);
    setUploading(true);
    addLog(`Starting upload of ${fileList.length} file(s)`, 'info');

    for (const file of fileList) {
      try {
        addLog(`Uploading ${file.name} (${formatFileSize(file.size)})...`, 'info');
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          addLog(`✓ ${file.name} uploaded successfully`, 'success');
          console.log('File uploaded successfully:', result);
        } else {
          const error = await response.json();
          addLog(`✗ Upload failed for ${file.name}: ${error.error || 'Unknown error'}`, 'error');
          console.error('Upload failed for file:', file.name);
        }
      } catch (error) {
        addLog(`✗ Upload error for ${file.name}: ${error.message}`, 'error');
        console.error('Upload error:', error);
      }
    }

    setUploading(false);
    addLog('Upload process completed', 'info');
    fetchFiles(); // Refresh the file list
  };

  // File input change handler
  const handleFileInputChange = (e) => {
    const selectedFiles = e.target.files;
    if (selectedFiles.length > 0) {
      handleFileUpload(selectedFiles);
    }
  };

  // Compress file
  const compressFile = async (filename) => {
    setLoading(true);
    setCompressionStatus(prev => ({ ...prev, [filename]: 'compressing' }));

    try {
      addLog(`Checking compression capability for ${filename}...`, 'info');

      // First check if file can be compressed
      const checkResponse = await fetch(`${API_BASE}/can-compress/${filename}`);
      const checkResult = await checkResponse.json();

      if (!checkResult.canCompress) {
        addLog(`✗ ${filename} cannot be compressed (${checkResult.fileType})`, 'warning');
        setCompressionStatus(prev => ({
          ...prev,
          [filename]: 'error',
          [`${filename}_error`]: 'File type not supported for compression'
        }));
        setLoading(false);
        return;
      }

      // Show warning for video files
      if (checkResult.fileType === 'video') {
        addLog(`⚠️ Video compression may affect playback quality`, 'warning');
      }

      addLog(`✓ ${filename} can be compressed. Starting compression at ${compressionSettings.percentage}%...`, 'info');
      addLog(`Compression settings: ${compressionSettings.percentage}% reduction, format: ${compressionSettings.format}`, 'info');

      const response = await fetch(`${API_BASE}/compress/${filename}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          percentage: compressionSettings.percentage,
          format: compressionSettings.format
        })
      });

      const result = await response.json();

      if (response.ok) {
        addLog(`✓ ${filename} compressed successfully!`, 'success');
        addLog(`Original size: ${formatFileSize(result.originalSize)}`, 'info');
        addLog(`Compressed size: ${formatFileSize(result.compressedSize)}`, 'info');
        addLog(`Space saved: ${result.compressionRatio}`, 'success');
        addLog(`Compression method: ${result.type} (${result.format})`, 'info');

        setCompressionStatus(prev => ({
          ...prev,
          [filename]: 'success',
          [`${filename}_result`]: result
        }));
      } else {
        addLog(`✗ Compression failed for ${filename}: ${result.error}`, 'error');
        setCompressionStatus(prev => ({
          ...prev,
          [filename]: 'error',
          [`${filename}_error`]: result.error
        }));
      }
    } catch (error) {
      addLog(`✗ Compression error for ${filename}: ${error.message}`, 'error');
      setCompressionStatus(prev => ({
        ...prev,
        [filename]: 'error',
        [`${filename}_error`]: error.message
      }));
    }
    setLoading(false);
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Get file type icon
  const getFileTypeIcon = (file) => {
    if (file.isImage) return <Image className="w-5 h-5 text-blue-500" />;
    if (file.isVideo) return <Video className="w-5 h-5 text-red-500" />;
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  // Get compression status indicator
  const getCompressionStatusIndicator = (filename) => {
    const status = compressionStatus[filename];
    const result = compressionStatus[`${filename}_result`];
    const error = compressionStatus[`${filename}_error`];

    if (status === 'compressing') {
      return (
        <div className="flex items-center space-x-2 text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Compressing...</span>
        </div>
      );
    } else if (status === 'success') {
      return (
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Compressed successfully!</span>
          </div>
          <div className="text-xs text-gray-600 space-y-1">
            <div>Saved: {result.compressionRatio}</div>
            <div>Size: {formatFileSize(result.originalSize)} → {formatFileSize(result.compressedSize)}</div>
            {result.note && (
              <div className="text-yellow-600">⚠️ {result.note}</div>
            )}
          </div>
          <a
            href={`${API_BASE}${result.downloadUrl}`}
            download
            className="inline-flex items-center space-x-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm hover:bg-green-200 transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>Download</span>
          </a>
        </div>
      );
    } else if (status === 'error') {
      return (
        <div className="flex items-center space-x-2 text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      );
    }
    return null;
  };

  // Clear compression status
  const clearCompressionStatus = (filename) => {
    setCompressionStatus(prev => {
      const newStatus = { ...prev };
      delete newStatus[filename];
      delete newStatus[`${filename}_result`];
      delete newStatus[`${filename}_error`];
      return newStatus;
    });
    addLog(`Cleared compression status for ${filename}`, 'info');
  };

  // Delete file
  const deleteFile = async (file) => {
    if (!file || !file.filename || typeof file.filename !== 'string') {
      addLog('Invalid file object: missing or invalid filename', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${file.originalName}"?`)) {
      return;
    }

    try {
      addLog(`Deleting file: ${file.originalName}...`, 'info');
      const response = await fetch(`${API_BASE}/file/${file.filename}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        addLog(`✓ File deleted successfully: ${file.originalName}`, 'success');
        fetchFiles(); // Refresh the file list
      } else {
        const error = await response.json();
        addLog(`✗ Failed to delete file: ${error.error}`, 'error');
      }
    } catch (error) {
      addLog(`✗ Delete error: ${error.message}`, 'error');
    }
  };

  // Percentage options
  const percentageOptions = [20, 30, 40, 50, 60, 70, 80];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Simple File Compression</h1>
                <p className="text-sm text-gray-500">Upload files and compress them easily</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={fetchFiles}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                {showLogs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{showLogs ? 'Hide Logs' : 'Show Logs'}</span>
                {logs.length > 0 && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    {logs.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Logs Panel */}
        {showLogs && (
          <div className="mb-6 bg-gray-900 text-gray-100 rounded-lg shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5" />
                <h3 className="font-medium">Activity Logs</h3>
                <span className="text-sm text-gray-400">({logs.length} entries)</span>
              </div>
              <button
                onClick={clearLogs}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Clear All
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-4">
              {logs.length === 0 ? (
                <p className="text-gray-500 text-sm">No activity logs yet...</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start space-x-3 text-sm ${log.type === 'error' ? 'text-red-300' :
                        log.type === 'success' ? 'text-green-300' :
                          log.type === 'warning' ? 'text-yellow-300' :
                            'text-gray-300'
                        }`}
                    >
                      <div className="flex items-center space-x-1 text-xs text-gray-500 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{log.timestamp}</span>
                      </div>
                      <div className="flex-1">
                        {log.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Area - Simplified without drag and drop */}
        <div className="mb-6">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Click to upload files
            </h3>
            <p className="text-gray-500 mb-4">
              Supports images and videos up to 2GB
            </p>
            <input
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Choose Files</span>
            </label>
            {uploading && (
              <div className="mt-4 flex items-center justify-center space-x-2 text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading files...</span>
              </div>
            )}
          </div>
        </div>

        {/* Compression Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Compression Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Compression Level
              </label>
              <div className="grid grid-cols-4 gap-2">
                {percentageOptions.map((percentage) => (
                  <button
                    key={percentage}
                    onClick={() => setCompressionSettings(prev => ({ ...prev, percentage }))}
                    className={`p-2 text-sm rounded-lg border transition-colors ${compressionSettings.percentage === percentage
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    {percentage}%
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Higher percentage = smaller file size
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Output Format
              </label>
              <select
                value={compressionSettings.format}
                onChange={(e) => setCompressionSettings(prev => ({ ...prev, format: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="auto">Auto (Best Format)</option>
                <option value="jpeg">JPEG (Images)</option>
                <option value="png">PNG (Images)</option>
                <option value="webp">WebP (Images)</option>
                <option value="mp4">MP4 (Videos)</option>
                <option value="webm">WebM (Videos)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Files List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Your Files ({files.length})</h2>
          </div>

          <div className="p-6">
            {files.length === 0 ? (
              <div className="text-center py-12">
                <FileArchive className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No files uploaded</h3>
                <p className="text-gray-500">Upload files to start compressing them</p>
              </div>
            ) : (
              <div className="space-y-4">
                {files.map((file) => (
                  <div
                    key={file.filename}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {getFileTypeIcon(file)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.originalName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(file.size)} • {file.canCompress ? 'Compressible' : 'Not compressible'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        {/* Compression Status */}
                        <div className="min-w-0">
                          {getCompressionStatusIndicator(file.filename)}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center space-x-2">
                          {/* Download Original */}
                          <a
                            href={`${API_BASE}${file.downloadUrl}`}
                            download
                            className="inline-flex items-center space-x-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            <span>Original</span>
                          </a>

                          {/* Compression Controls */}
                          {file.canCompress && (
                            <>
                              {!compressionStatus[file.filename] && (
                                <button
                                  onClick={() => compressFile(file.filename)}
                                  disabled={loading}
                                  className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors disabled:opacity-50"
                                >
                                  <Zap className="w-3 h-3" />
                                  <span>Compress</span>
                                </button>
                              )}

                              {compressionStatus[file.filename] && (
                                <button
                                  onClick={() => clearCompressionStatus(file.filename)}
                                  className="inline-flex items-center space-x-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Clear</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* Delete Button */}
                          <button
                            onClick={() => deleteFile(file)}
                            className="inline-flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm hover:bg-red-200 transition-colors"
                            title="Delete file"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Video Stream Link */}
                    {file.isVideo && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <a
                          href={`${API_BASE}${file.streamUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <Video className="w-3 h-3" />
                          <span>Stream Video</span>
                          <ArrowRight className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How it works:</p>
              <ul className="space-y-1 text-blue-700">
                <li>• Upload your images or videos (up to 2GB each)</li>
                <li>• Choose compression level (20-80% size reduction)</li>
                <li>• System checks if compression is possible</li>
                <li>• Download the compressed file instantly</li>
                <li>• Delete files you no longer need</li>
                <li>• Original files are preserved on the server</li>
                <li>• View detailed logs for all operations</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Warning Section for Video Compression */}
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Video Compression Note:</p>
              <p className="text-yellow-700">
                Current video compression is basic and may affect playback quality.
                For production use, consider implementing FFmpeg for proper video encoding.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleFileCompression;