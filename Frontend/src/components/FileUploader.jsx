
import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, Download, FileText, CheckCircle, AlertCircle, Loader2, X,
  Cloud, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Eye, Trash2, Edit3, FolderOpen,
  Monitor, Settings, Filter, Search, Grid, List
} from 'lucide-react';
import FileCompressionManager from './New';

const FileUploader = () => {
  const [progress, setProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showProperties, setShowProperties] = useState(false);
  const [renamingFile, setRenamingFile] = useState(null);
  const [newFileName, setNewFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [videoModal, setVideoModal] = useState({ open: false, file: null, url: '' });
  const [videoState, setVideoState] = useState({
    playing: false,
    muted: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    fullscreen: false
  });
  const [viewMode, setViewMode] = useState('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const videoRef = useRef(null);

  // Video formats that can be played
  const videoFormats = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];

  const isVideoFile = (filename) => {
    return videoFormats.some(format => filename.toLowerCase().endsWith(format));
  };

  const addLog = (msg) => {
    setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch('https://newup-4g3z.onrender.com/list');
      const arr = await res.json();
      console.log('Files from backend:', arr);
      if (Array.isArray(arr)) {
        const formattedFiles = arr.map(item => {
          if (typeof item === 'string') {
            return {
              filename: item,
              originalName: item,
              size: 0,
              isVideo: isVideoFile(item),
              downloadUrl: `/f/${item}`,
              streamUrl: isVideoFile(item) ? `/stream/${item}` : null
            };
          }
          if (item && typeof item === 'object' && item.filename && typeof item.filename === 'string') {
            return item;
          }
          console.warn('Invalid file object:', item);
          return null;
        }).filter(Boolean);

        console.log('Formatted files:', formattedFiles);
        setFiles(formattedFiles);
      }
    } catch (e) {
      console.error('Failed to fetch files:', e);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (uploading) return;

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      upload(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (uploading) return;

    const files = e.target.files;
    if (files && files[0]) {
      upload(files[0]);
    }
  };

  const cleanup = () => {
    setUploading(false);
    setUploadSpeed(0);
  };

  const upload = async (file) => {
    setProgress(0);
    setUploadSpeed(0);
    setLink('');
    setError('');
    setLog([]);
    setUploading(true);
    setCurrentFile(file.name);

    let startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    try {
      addLog(`Starting upload: ${file.name} (${Math.round(file.size / 1024)} KB)`);

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          setProgress(progress);

          const currentTime = Date.now();
          const timeDiff = (currentTime - lastTime) / 1000;
          const bytesDiff = e.loaded - lastLoaded;

          if (timeDiff > 0) {
            const speed = bytesDiff / timeDiff;
            setUploadSpeed(speed);
            addLog(`Upload progress: ${Math.round(progress)}% - Speed: ${formatSpeed(speed)}`);
          }

          lastLoaded = e.loaded;
          lastTime = currentTime;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              setLink(`https://newup-4g3z.onrender.com${response.file.downloadUrl}`);
              fetchFiles();
              addLog('Upload completed successfully');
              setProgress(100);
            } else {
              setError(response.error || 'Upload failed');
              addLog('Upload failed: ' + (response.error || 'Unknown error'));
            }
          } catch (err) {
            setError('Invalid server response');
            addLog('Invalid server response');
          }
        } else {
          setError(`Upload failed with status: ${xhr.status}`);
          addLog(`Upload failed with status: ${xhr.status}`);
        }
        cleanup();
      });

      xhr.addEventListener('error', () => {
        setError('Network error during upload');
        addLog('Network error during upload');
        cleanup();
      });

      xhr.addEventListener('abort', () => {
        setError('Upload was cancelled');
        addLog('Upload was cancelled');
        cleanup();
      });

      xhr.open('POST', 'https://newup-4g3z.onrender.com/upload');
      xhr.send(formData);

    } catch (err) {
      setError(err.message);
      addLog('Upload failed: ' + err.message);
      cleanup();
    }
  };

  const openVideoModal = (file) => {
    const videoUrl = `https://newup-4g3z.onrender.com/stream/${file}`;
    setVideoModal({ open: true, file, url: videoUrl });
    setVideoState(prev => ({ ...prev, playing: false, currentTime: 0 }));
  };

  const closeVideoModal = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setVideoModal({ open: false, file: null, url: '' });
    setVideoState(prev => ({ ...prev, playing: false, fullscreen: false }));
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoState.playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setVideoState(prev => ({ ...prev, playing: !prev.playing }));
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setVideoState(prev => ({ ...prev, muted: !prev.muted }));
    }
  };

  const handleVolumeChange = (e) => {
    const volume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = volume;
      setVideoState(prev => ({ ...prev, volume, muted: volume === 0 }));
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setVideoState(prev => ({ ...prev, currentTime: time }));
    }
  };

  const skipTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const toggleFullscreen = () => {
    const modal = document.getElementById('video-modal');
    if (!videoState.fullscreen) {
      if (modal.requestFullscreen) {
        modal.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setVideoState(prev => ({ ...prev, fullscreen: !prev.fullscreen }));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileIcon = (filename) => {
    if (isVideoFile(filename)) {
      return <Play className="w-4 h-4 text-blue-500" />;
    }
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  const formatSpeed = (bytesPerSecond) => {
    if (bytesPerSecond >= 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    } else if (bytesPerSecond >= 1024) {
      return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    } else {
      return `${bytesPerSecond.toFixed(0)} B/s`;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const viewFileProperties = async (file) => {
    try {
      console.log('Viewing properties for file:', file);

      if (!file || !file.filename || typeof file.filename !== 'string') {
        addLog('Invalid file object: missing or invalid filename');
        return;
      }

      const response = await fetch(`https://newup-4g3z.onrender.com/file/${file.filename}/properties`);
      const properties = await response.json();
      setSelectedFile(properties);
      setShowProperties(true);
    } catch (error) {
      addLog('Failed to get file properties: ' + error.message);
    }
  };

  const deleteFile = async (file) => {
    if (!file || !file.filename || typeof file.filename !== 'string') {
      addLog('Invalid file object: missing or invalid filename');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${file.originalName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`https://newup-4g3z.onrender.com/file/${file.filename}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        addLog(`File deleted: ${file.originalName}`);
        fetchFiles();
      } else {
        const error = await response.json();
        addLog('Failed to delete file: ' + error.error);
      }
    } catch (error) {
      addLog('Failed to delete file: ' + error.message);
    }
  };

  const renameFile = async (file) => {
    if (!file || !file.filename || typeof file.filename !== 'string') {
      addLog('Invalid file object: missing or invalid filename');
      return;
    }

    if (!newFileName.trim()) {
      addLog('Please enter a valid filename');
      return;
    }

    try {
      const response = await fetch(`https://newup-4g3z.onrender.com/file/${file.filename}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: newFileName.trim() })
      });

      if (response.ok) {
        addLog(`File renamed: ${file.originalName} -> ${newFileName.trim()}`);
        setRenamingFile(null);
        setNewFileName('');
        fetchFiles();
      } else {
        const error = await response.json();
        addLog('Failed to rename file: ' + error.error);
      }
    } catch (error) {
      addLog('Failed to rename file: ' + error.message);
    }
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.originalName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' ||
      (filterType === 'video' && file.isVideo) ||
      (filterType === 'document' && !file.isVideo);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">File Manager</h1>
                <p className="text-xs text-gray-500">Secure file upload and management</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <Settings className="w-5 h-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <Monitor className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upload Area */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-200 ${dragActive
                      ? 'border-blue-400 bg-blue-50'
                      : uploading
                        ? 'border-gray-300 bg-gray-50'
                        : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => !uploading && document.getElementById('file-input').click()}
                >
                  <input
                    id="file-input"
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={uploading}
                  />

                  {uploading ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-medium text-gray-900 mb-1">{Math.round(progress)}% Complete</p>
                        <p className="text-sm text-gray-500 mb-2">Uploading {currentFile}</p>
                        {uploadSpeed > 0 && (
                          <p className="text-xs text-gray-400 font-mono">
                            {formatSpeed(uploadSpeed)}
                          </p>
                        )}
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
                          <div
                            className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <Upload className="w-6 h-6 text-blue-600" />
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-medium text-gray-900 mb-1">
                          {dragActive ? 'Drop files here' : 'Upload files'}
                        </p>
                        <p className="text-sm text-gray-500">
                          Drag and drop files here or click to browse
                        </p>
                        <p className="text-xs text-gray-500 mt-3">
                          Maximum file size: 2GB • Supports videos, documents, and images
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Status Messages */}
            {link && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 animate-fadeIn">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 bg-emerald-100 rounded-full p-1">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-emerald-800">Upload successful</h3>
                    <p className="text-sm text-emerald-700 mt-1">Your file has been uploaded and is ready for download.</p>
                    <div className="mt-3">
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                      >
                        <Download className="w-4 h-4 mr-1.5" />
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 animate-fadeIn">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 bg-rose-100 rounded-full p-1">
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-rose-800">Upload failed</h3>
                    <p className="text-sm text-rose-700 mt-1">{error}</p>
                  </div>
                  <button
                    onClick={() => setError('')}
                    className="text-rose-400 hover:text-rose-600 transition-colors duration-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* File Management */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="p-6">
                {/* File Management Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 bg-indigo-100 rounded-lg p-2">
                      <FolderOpen className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Files ({filteredFiles.length})</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-grow sm:flex-grow-0 min-w-[200px]">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search files..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                      />
                    </div>

                    {/* Filter */}
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                    >
                      <option value="all">All files</option>
                      <option value="video">Videos</option>
                      <option value="document">Documents</option>
                    </select>

                    {/* View Toggle */}
                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* File List */}
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-16 px-4">
                    <div className="bg-gray-50 rounded-2xl p-8 max-w-md mx-auto">
                      <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No files found</h3>
                      <p className="text-sm text-gray-500">
                        {searchTerm ? 'No files match your search criteria.' : 'Upload your first file to get started.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-2'}>
                    {filteredFiles.map((file) => (
                      <div
                        key={file.filename}
                        className={`group ${viewMode === 'grid'
                          ? 'border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm bg-white transition-all duration-200'
                          : 'flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-200 transition-all duration-200'
                          }`}
                      >
                        <div className={`flex items-center space-x-3 ${viewMode === 'grid' ? 'mb-3' : 'flex-1 min-w-0'}`}>
                          <div className={`flex-shrink-0 ${viewMode === 'grid' ? 'w-10 h-10' : 'w-8 h-8'} ${file.isVideo ? 'bg-blue-50' : 'bg-indigo-50'} rounded-lg flex items-center justify-center`}>
                            {getFileIcon(file.originalName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{file.originalName}</p>
                            <p className="text-sm text-gray-500">
                              {formatFileSize(file.size)}
                              {file.isVideo && ' • Video'}
                            </p>
                          </div>
                        </div>

                        <div className={`flex items-center space-x-2 ${viewMode === 'grid' ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity duration-200`}>
                          <button
                            onClick={() => viewFileProperties(file)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors duration-200"
                            title="Properties"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {file.isVideo && (
                            <button
                              onClick={() => openVideoModal(file.filename)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                              title="Play video"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}

                          <a
                            href={`https://newup-4g3z.onrender.com/f/${file.filename}`}
                            download
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors duration-200"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>

                          <button
                            onClick={() => deleteFile(file)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Activity Log */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0 bg-indigo-100 rounded-lg p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 8v4l3 3"></path>
                      <circle cx="12" cy="12" r="10"></circle>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 h-64 overflow-y-auto border border-gray-100">
                  {log.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-gray-300 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                      <p className="text-sm text-gray-500">No activity yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {log.map((entry, index) => (
                        <div key={index} className="text-xs font-mono text-gray-600 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                          {entry}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0 bg-indigo-100 rounded-lg p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                      <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Statistics</h3>
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-500">Total Files</span>
                      <span className="text-sm font-medium text-gray-900">{files.length}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-500">Video Files</span>
                      <span className="text-sm font-medium text-gray-900">
                        {files.filter(f => f.isVideo).length}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: files.length ? `${(files.filter(f => f.isVideo).length / files.length) * 100}%` : '0%' }}
                      ></div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-500">Total Size</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatFileSize(files.reduce((acc, file) => acc + file.size, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Properties Modal */}
      {showProperties && selectedFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div
            className="relative w-full max-w-2xl bg-white rounded-2xl p-8 shadow-xl transform transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowProperties(false)}
              className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-all duration-200"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="space-y-6">
              <div className="text-center pb-4 border-b border-gray-100">
                <h2 className="text-2xl font-bold text-gray-900 mb-1">File Properties</h2>
                <p className="text-gray-500">{selectedFile.originalName}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">File Size</p>
                  <p className="text-gray-900 font-semibold">{selectedFile.sizeFormatted}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">File Type</p>
                  <p className="text-gray-900 font-semibold">{selectedFile.mimetype}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">Created</p>
                  <p className="text-gray-900 font-semibold">{new Date(selectedFile.created).toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">Modified</p>
                  <p className="text-gray-900 font-semibold">{new Date(selectedFile.modified).toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-gray-500 text-sm mb-2">File Name</p>
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={renamingFile === selectedFile.filename ? newFileName : selectedFile.originalName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                    disabled={renamingFile !== selectedFile.filename}
                  />
                  {renamingFile === selectedFile.filename ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => renameFile(selectedFile)}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors duration-200 shadow-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setRenamingFile(null);
                          setNewFileName('');
                        }}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 shadow-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setRenamingFile(selectedFile.filename);
                        setNewFileName(selectedFile.originalName);
                      }}
                      className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors duration-200"
                      title="Rename File"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-center space-x-4 pt-4 border-t border-gray-100">
                <a
                  href={`https://newup-4g3z.onrender.com/f/${selectedFile.filename}`}
                  download
                  className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white px-6 py-3 rounded-lg hover:from-indigo-600 hover:to-blue-600 transition-all duration-200 shadow-sm"
                >
                  <Download className="w-5 h-5" />
                  <span>Download</span>
                </a>
                {selectedFile.isVideo && (
                  <button
                    onClick={() => {
                      setShowProperties(false);
                      openVideoModal(selectedFile.filename);
                    }}
                    className="inline-flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 shadow-sm"
                  >
                    <Play className="w-5 h-5" />
                    <span>Play Video</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Modal */}
      {videoModal.open && (
        <div
          id="video-modal"
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="relative w-full max-w-6xl">
            {/* Close Button */}
            <button
              onClick={closeVideoModal}
              className="absolute -top-12 right-0 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-200 z-10"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* Video Container */}
            <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl">
              <video
                ref={videoRef}
                src={videoModal.url}
                className="w-full h-auto max-h-[70vh] object-contain"
                onTimeUpdate={(e) => {
                  setVideoState(prev => ({
                    ...prev,
                    currentTime: e.target.currentTime,
                    buffered: e.target.buffered.length > 0 ? e.target.buffered.end(0) : 0
                  }));
                }}
                onLoadedMetadata={(e) => {
                  setVideoState(prev => ({ ...prev, duration: e.target.duration }));
                }}
                onPlay={() => setVideoState(prev => ({ ...prev, playing: true }))}
                onPause={() => setVideoState(prev => ({ ...prev, playing: false }))}
              />

              {/* Video Controls */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                {/* Progress Bar */}
                <div className="mb-4">
                  <input
                    type="range"
                    min="0"
                    max={videoState.duration || 0}
                    value={videoState.currentTime}
                    onChange={handleSeek}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{formatTime(videoState.currentTime)}</span>
                    <span>{formatTime(videoState.duration)}</span>
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => skipTime(-10)}
                      className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-200"
                    >
                      <SkipBack className="w-5 h-5 text-white" />
                    </button>

                    <button
                      onClick={togglePlay}
                      className="p-3 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full hover:from-indigo-600 hover:to-blue-600 transition-all duration-200 transform hover:scale-110 shadow-lg"
                    >
                      {videoState.playing ? (
                        <Pause className="w-6 h-6 text-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white" />
                      )}
                    </button>

                    <button
                      onClick={() => skipTime(10)}
                      className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-200"
                    >
                      <SkipForward className="w-5 h-5 text-white" />
                    </button>
                  </div>

                  <div className="flex items-center space-x-4">
                    {/* Volume Control */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={toggleMute}
                        className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-200"
                      >
                        {videoState.muted ? (
                          <VolumeX className="w-5 h-5 text-white" />
                        ) : (
                          <Volume2 className="w-5 h-5 text-white" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={videoState.volume}
                        onChange={handleVolumeChange}
                        className="w-20 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>

                    {/* Fullscreen */}
                    <button
                      onClick={toggleFullscreen}
                      className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-200"
                    >
                      {videoState.fullscreen ? (
                        <Minimize className="w-5 h-5 text-white" />
                      ) : (
                        <Maximize className="w-5 h-5 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Video Title */}
            <div className="mt-4 text-center">
              <h3 className="text-xl font-bold text-white mb-1">{videoModal.file}</h3>
              <p className="text-gray-400 text-sm">Streaming Video</p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: linear-gradient(45deg, #6366f1, #3b82f6);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: linear-gradient(45deg, #6366f1, #3b82f6);
          border-radius: 50%;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
      <FileCompressionManager />
    </div>
  );
};

export default FileUploader;