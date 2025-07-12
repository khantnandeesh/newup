import React, { useState, useEffect } from 'react';
import { FileArchive, Zap, Download, Loader2, CheckCircle, AlertCircle, Package, Trash2, FileText, Image, Archive, Settings, X, Plus, Minus } from 'lucide-react';

const FileCompressionManager = () => {
  const [files, setFiles] = useState([]);
  const [compressedFiles, setCompressedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compressionResults, setCompressionResults] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [bulkArchiveName, setBulkArchiveName] = useState('');
  const [compressionSettings, setCompressionSettings] = useState({
    imageQuality: 80,
    gzipLevel: 6,
    compressionType: 'auto',
    targetSize: null,
  });

  // Fetch uploaded files
  const fetchFiles = async () => {
    try {
      const response = await fetch('https://newup-4g3z.onrender.com/list');
      const fileList = await response.json();

      const filesWithInfo = await Promise.all(
        fileList.map(async (filename) => {
          try {
            const infoResponse = await fetch(`https://newup-4g3z.onrender.com/info/${filename}`);
            const info = await infoResponse.json();
            return { ...info, selected: false };
          } catch (error) {
            return {
              filename,
              size: 0,
              isImage: false,
              isVideo: false,
              isCompressible: false,
              canCompress: true,
              selected: false
            };
          }
        })
      );

      setFiles(filesWithInfo);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  // Fetch compressed files
  const fetchCompressedFiles = async () => {
    try {
      const response = await fetch('https://newup-4g3z.onrender.com/compressed');
      const compressedList = await response.json();
      setCompressedFiles(compressedList);
    } catch (error) {
      console.error('Failed to fetch compressed files:', error);
    }
  };

  useEffect(() => {
    fetchFiles();
    fetchCompressedFiles();
  }, []);

  // Toggle file selection
  const toggleFileSelection = (filename) => {
    setFiles(prev =>
      prev.map(file =>
        file.filename === filename
          ? { ...file, selected: !file.selected }
          : file
      )
    );
  };

  // Select all files
  const selectAllFiles = () => {
    const allSelected = files.every(file => file.selected);
    setFiles(prev =>
      prev.map(file => ({ ...file, selected: !allSelected }))
    );
  };

  // Compress individual file
  const compressFile = async (filename) => {
    setLoading(true);
    try {
      const response = await fetch(`https://newup-4g3z.onrender.com/compress/${filename}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(compressionSettings)
      });
      const result = await response.json();

      if (result.success) {
        setCompressionResults(prev => [...prev, {
          id: Date.now(),
          filename,
          ...result,
          timestamp: new Date().toISOString()
        }]);
        fetchCompressedFiles();
      } else {
        throw new Error(result.error || 'Compression failed');
      }
    } catch (error) {
      setCompressionResults(prev => [...prev, {
        id: Date.now(),
        filename,
        error: error.message,
        timestamp: new Date().toISOString()
      }]);
    }
    setLoading(false);
  };

  // Bulk compress files
  const bulkCompressFiles = async () => {
    const selectedFilenames = files.filter(file => file.selected).map(file => file.filename);

    if (selectedFilenames.length === 0) {
      alert('Please select files to compress');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('https://newup-4g3z.onrender.com/compress-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: selectedFilenames,
          name: bulkArchiveName || 'archive',
          settings: compressionSettings
        })
      });
      const result = await response.json();

      if (result.success) {
        setCompressionResults(prev => [...prev, {
          id: Date.now(),
          filename: 'Bulk Archive',
          ...result,
          timestamp: new Date().toISOString()
        }]);
        fetchCompressedFiles();
        setShowBulkOptions(false);
        setBulkArchiveName('');
        setFiles(prev => prev.map(file => ({ ...file, selected: false })));
      } else {
        throw new Error(result.error || 'Bulk compression failed');
      }
    } catch (error) {
      setCompressionResults(prev => [...prev, {
        id: Date.now(),
        filename: 'Bulk Archive',
        error: error.message,
        timestamp: new Date().toISOString()
      }]);
    }
    setLoading(false);
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get file type icon
  const getFileTypeIcon = (file) => {
    if (file.isImage) return <Image className="w-5 h-5 text-green-400" />;
    if (file.isVideo) return <FileArchive className="w-5 h-5 text-red-400" />;
    return <FileText className="w-5 h-5 text-blue-400" />;
  };

  // Clear results
  const clearResults = () => {
    setCompressionResults([]);
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.1),transparent_50%)]"></div>

      <div className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center space-x-3 mb-6">
              <div className="p-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl">
                <Package className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                File Compression Center
              </h1>
            </div>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Compress your files to save space with advanced image and text compression algorithms
            </p>
          </div>
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Compression Settings */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
                <h3 className="text-2xl font-bold mb-6 flex items-center space-x-3">
                  <Settings className="w-7 h-7 text-purple-400" />
                  <span>Compression Settings</span>
                </h3>

                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Compression Type
                    </label>
                    <select
                      value={compressionSettings.compressionType}
                      onChange={(e) => setCompressionSettings(prev => ({ ...prev, compressionType: e.target.value }))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-400 focus:outline-none"
                    >
                      <option value="auto">Auto Detect</option>
                      <option value="image">Image Only</option>
                      <option value="gzip">GZIP</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Image Quality: {compressionSettings.imageQuality}%
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={compressionSettings.imageQuality}
                      onChange={(e) => setCompressionSettings(prev => ({ ...prev, imageQuality: parseInt(e.target.value) }))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      GZIP Level: {compressionSettings.gzipLevel}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="9"
                      value={compressionSettings.gzipLevel}
                      onChange={(e) => setCompressionSettings(prev => ({ ...prev, gzipLevel: parseInt(e.target.value) }))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Target Size (KB)
                    </label>
                    <input
                      type="number"
                      value={compressionSettings.targetSize || ''}
                      onChange={(e) => setCompressionSettings(prev => ({ ...prev, targetSize: parseInt(e.target.value) }))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-400 focus:outline-none"
                      placeholder="Enter target size"
                    />
                  </div>
                </div>
              </div>
              {/* Files Available for Compression */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold flex items-center space-x-3">
                    <FileArchive className="w-7 h-7 text-blue-400" />
                    <span>Available Files ({files.length})</span>
                  </h3>

                  <div className="flex items-center space-x-4">
                    <button
                      onClick={selectAllFiles}
                      className="px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all duration-300 text-sm font-medium"
                    >
                      {files.every(file => file.selected) ? 'Deselect All' : 'Select All'}
                    </button>

                    <button
                      onClick={() => setShowBulkOptions(!showBulkOptions)}
                      disabled={files.filter(file => file.selected).length === 0}
                      className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl hover:from-purple-600 hover:to-blue-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      <Archive className="w-4 h-4 inline mr-2" />
                      Bulk Compress ({files.filter(file => file.selected).length})
                    </button>
                  </div>
                </div>
                {/* Bulk Compression Options */}
                {showBulkOptions && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-6 mb-6">
                    <h4 className="text-lg font-bold mb-4 text-purple-400">Bulk Compression Options</h4>
                    <div className="flex items-center space-x-4">
                      <input
                        type="text"
                        placeholder="Archive name (optional)"
                        value={bulkArchiveName}
                        onChange={(e) => setBulkArchiveName(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:border-purple-400 focus:outline-none"
                      />
                      <button
                        onClick={bulkCompressFiles}
                        disabled={loading}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all duration-300 disabled:opacity-50 font-medium"
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <Package className="w-5 h-5 inline mr-2" />
                            Create ZIP Archive
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowBulkOptions(false)}
                        className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all duration-300"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
                {/* Files Grid */}
                <div className="grid gap-4 max-h-96 overflow-y-auto">
                  {files.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No files available for compression</p>
                      <p className="text-gray-600 text-sm mt-2">Upload some files first to compress them</p>
                    </div>
                  ) : (
                    files.map((file) => (
                      <div key={file.filename} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-purple-400/50 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={file.selected}
                                onChange={() => toggleFileSelection(file.filename)}
                                className="w-5 h-5 rounded bg-white/10 border-white/20 text-purple-500 focus:ring-purple-500 focus:ring-2"
                              />
                              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                                {getFileTypeIcon(file)}
                              </div>
                            </div>
                            <div>
                              <p className="font-medium text-white truncate max-w-xs">{file.filename}</p>
                              <div className="flex items-center space-x-4 text-sm text-gray-400">
                                <span>{formatFileSize(file.size)}</span>
                                <span className="flex items-center space-x-1">
                                  {file.isImage && <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Image</span>}
                                  {file.isVideo && <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">Video</span>}
                                  {file.isCompressible && <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Text</span>}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => compressFile(file.filename)}
                            disabled={loading}
                            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all duration-300 disabled:opacity-50 font-medium text-sm"
                          >
                            {loading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Zap className="w-4 h-4 inline mr-2" />
                                Compress
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {/* Compression Results */}
              {compressionResults.length > 0 && (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold flex items-center space-x-3">
                      <CheckCircle className="w-7 h-7 text-green-400" />
                      <span>Compression Results</span>
                    </h3>
                    <button
                      onClick={clearResults}
                      className="px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all duration-300 text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4 inline mr-2" />
                      Clear
                    </button>
                  </div>

                  <div className="space-y-4 max-h-64 overflow-y-auto">
                    {compressionResults.map((result) => (
                      <div key={result.id} className={`rounded-xl p-4 border ${result.error ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {result.error ? (
                              <AlertCircle className="w-6 h-6 text-red-400" />
                            ) : (
                              <CheckCircle className="w-6 h-6 text-green-400" />
                            )}
                            <div>
                              <p className="font-medium text-white">{result.filename}</p>
                              {result.error ? (
                                <p className="text-red-300 text-sm">{result.error}</p>
                              ) : (
                                <div className="flex items-center space-x-4 text-sm text-gray-300">
                                  <span>{formatFileSize(result.originalSize)} → {formatFileSize(result.compressedSize)}</span>
                                  <span className="text-green-400 font-medium">-{result.compressionRatio}</span>
                                  <span className="text-purple-400">{result.type}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {!result.error && result.downloadUrl && (
                            <a
                              href={`https://newup-4g3z.onrender.com${result.downloadUrl}`}
                              download
                              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all duration-300 font-medium text-sm"
                            >
                              <Download className="w-4 h-4 inline mr-2" />
                              Download
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Sidebar - Compressed Files */}
            <div className="space-y-8">
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center space-x-2">
                  <Archive className="w-6 h-6 text-green-400" />
                  <span>Compressed Files ({compressedFiles.length})</span>
                </h3>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {compressedFiles.length === 0 ? (
                    <div className="text-center py-8">
                      <Archive className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500">No compressed files yet</p>
                    </div>
                  ) : (
                    compressedFiles.map((file) => (
                      <div key={file.filename} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-green-400/50 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                              <Archive className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium text-white truncate max-w-32">{file.filename}</p>
                              <div className="text-xs text-gray-400">
                                <p>{formatFileSize(file.size)}</p>
                                <p>{new Date(file.created).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </div>

                          <a
                            href={file.downloadUrl}
                            download
                            className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all duration-300 transform hover:scale-110"
                            title="Download"
                          >
                            <Download className="w-4 h-4 text-white" />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: linear-gradient(45deg, #8b5cf6, #3b82f6);
          border-radius: 50%;
          cursor: pointer;
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: linear-gradient(45deg, #8b5cf6, #3b82f6);
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default FileCompressionManager;
