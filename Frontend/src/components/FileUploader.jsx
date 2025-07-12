import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, FileText, CheckCircle, AlertCircle, Loader2, X, Cloud, Zap, Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-react';
import FileCompressionManager from './New';

const FileUploader = () => {
  const [progress, setProgress] = useState(0);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [files, setFiles] = useState([]);
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

  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const fileIdRef = useRef(null);
  const videoRef = useRef(null);

  const CHUNK_SIZE = 16384;

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
      if (Array.isArray(arr)) setFiles(arr);
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
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (channelRef.current) {
      channelRef.current.close();
      channelRef.current = null;
    }
    setUploading(false);
  };

  const upload = async (file) => {
    setProgress(0);
    setLink('');
    setError('');
    setLog([]);
    setUploading(true);
    setCurrentFile(file.name);

    const fileId = crypto.randomUUID();
    fileIdRef.current = fileId;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      const channel = pc.createDataChannel('file-channel', {
        ordered: true,
        maxRetransmits: 3
      });
      channelRef.current = channel;

      channel.onopen = () => {
        addLog('Channel opened - starting upload');
        sendFile(file, channel, fileId);
      };

      channel.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'download') {
            setLink(msg.link);
            fetchFiles();
            addLog('Upload completed successfully');
            cleanup();
          } else if (msg.type === 'error') {
            setError(msg.message);
            addLog('Server error: ' + msg.message);
            cleanup();
          }
        } catch (err) {
          setError('Invalid response from server');
          addLog('Invalid server response');
          cleanup();
        }
      };

      channel.onerror = (e) => {
        setError('Data channel error');
        addLog('Channel error occurred');
        cleanup();
      };

      channel.onclose = () => {
        addLog('Channel closed');
      };

      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          try {
            await fetch('https://newup-4g3z.onrender.com/signal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'candidate',
                candidate: e.candidate,
                id: fileId
              })
            });
            addLog('ICE candidate sent');
          } catch (err) {
            addLog('Failed to send ICE candidate');
          }
        }
      };

      pc.onconnectionstatechange = () => {
        addLog(`Connection state: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('Connection failed');
          cleanup();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      addLog('Created offer');

      const response = await fetch('https://newup-4g3z.onrender.com/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'offer',
          sdp: offer.sdp,
          id: fileId
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: data.sdp
      }));
      addLog('Set remote description');

    } catch (err) {
      setError(err.message);
      addLog('Upload failed: ' + err.message);
      cleanup();
    }
  };

  const sendFile = async (file, channel, fileId) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const totalSize = arrayBuffer.byteLength;
      let offset = 0;

      addLog(`Sending file: ${file.name} (${Math.round(totalSize / 1024)} KB)`);

      const sendChunk = () => {
        if (offset >= totalSize) {
          channel.send(JSON.stringify({
            id: fileId,
            filename: file.name,
            eof: true,
            totalSize: totalSize
          }));
          addLog('File transfer completed');
          return;
        }

        const chunk = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(chunk)));

        channel.send(JSON.stringify({
          id: fileId,
          filename: file.name,
          chunk: base64,
          offset: offset,
          totalSize: totalSize
        }));

        offset += CHUNK_SIZE;
        const progress = Math.min((offset / totalSize) * 100, 100);
        setProgress(progress);

        setTimeout(sendChunk, 10);
      };

      sendChunk();
    } catch (err) {
      setError('Failed to read file: ' + err.message);
      addLog('File read error: ' + err.message);
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
      return <Play className="w-5 h-5 text-red-400" />;
    }
    return <FileText className="w-5 h-5 text-white" />;
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.1),transparent_50%)]"></div>

      <div className="relative z-10 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-3 mb-6">
              <div className="p-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                WebRTC Transfer
              </h1>
            </div>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Ultra-fast peer-to-peer file transfers with built-in video streaming
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Upload Area */}
            <div className="lg:col-span-2">
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-8">
                <div
                  className={`relative border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-500 ${dragActive
                    ? 'border-purple-400 bg-purple-500/10 scale-105'
                    : uploading
                      ? 'border-gray-600 bg-gray-800/20'
                      : 'border-gray-600 hover:border-purple-400 hover:bg-purple-500/5 hover:scale-105'
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

                  <div className="relative">
                    {uploading ? (
                      <div className="space-y-6">
                        <div className="relative">
                          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
                            <Loader2 className="w-10 h-10 text-white animate-spin" />
                          </div>
                          <div className="absolute -inset-4 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full opacity-20 animate-pulse"></div>
                        </div>
                        <div>
                          <p className="text-2xl font-bold mb-2">{Math.round(progress)}%</p>
                          <p className="text-lg text-gray-300">Uploading {currentFile}</p>
                          <div className="w-full bg-gray-700 rounded-full h-2 mt-4 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center transition-all duration-300 ${dragActive ? 'scale-110' : ''}`}>
                          <Cloud className="w-10 h-10 text-white" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold mb-2">
                            {dragActive ? 'Release to Upload' : 'Drop Files Here'}
                          </p>
                          <p className="text-gray-400">
                            or click to browse • Maximum 500MB • Videos supported
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Messages */}
              {link && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 mb-8 backdrop-blur-sm">
                  <div className="flex items-start space-x-4">
                    <div className="p-2 bg-green-500 rounded-full">
                      <CheckCircle className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-green-400 mb-2">Transfer Complete</h3>
                      <p className="text-green-300 mb-4">Your file is ready for download</p>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all duration-300 transform hover:scale-105"
                      >
                        <Download className="w-5 h-5" />
                        <span className="font-semibold">Download Now</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 mb-8 backdrop-blur-sm">
                  <div className="flex items-start space-x-4">
                    <div className="p-2 bg-red-500 rounded-full">
                      <AlertCircle className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-red-400 mb-2">Transfer Failed</h3>
                      <p className="text-red-300">{error}</p>
                    </div>
                    <button
                      onClick={() => setError('')}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              {/* Upload Log */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Live Activity</span>
                </h3>
                <div className="bg-black/20 rounded-2xl p-4 h-64 overflow-y-auto">
                  {log.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Waiting for activity...</p>
                  ) : (
                    <div className="space-y-2">
                      {log.map((entry, index) => (
                        <div key={index} className="text-xs font-mono text-gray-300 p-2 bg-white/5 rounded-lg border border-white/10">
                          {entry}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* File List */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center justify-between">
                  <span>Files ({files.length})</span>
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                </h3>
                <div className="space-y-3 h-64 overflow-y-auto">
                  {files.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500">No files yet</p>
                    </div>
                  ) : (
                    files.map((file, index) => (
                      <div key={file} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-purple-400/50 transition-all duration-300 hover:scale-105">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                              {getFileIcon(file)}
                            </div>
                            <div>
                              <p className="font-medium text-white truncate max-w-32">{file}</p>
                              <p className="text-xs text-gray-400">
                                {isVideoFile(file) ? 'Video' : 'File'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {isVideoFile(file) && (
                              <button
                                onClick={() => openVideoModal(file)}
                                className="p-2 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg hover:from-red-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-110"
                                title="Play Video"
                              >
                                <Play className="w-4 h-4 text-white" />
                              </button>
                            )}
                            <a
                              href={`https://newup-4g3z.onrender.com/f/${file}`}
                              download
                              className="p-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all duration-300 transform hover:scale-110"
                              title="Download"
                            >
                              <Download className="w-4 h-4 text-white" />
                            </a>
                          </div>
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

      {/* Video Modal */}
      {videoModal.open && (
        <div
          id="video-modal"
          className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-6xl">
            {/* Close Button */}
            <button
              onClick={closeVideoModal}
              className="absolute -top-12 right-0 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-300 z-10"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* Video Container */}
            <div className="relative bg-black rounded-2xl overflow-hidden">
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
                      className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-300"
                    >
                      <SkipBack className="w-5 h-5 text-white" />
                    </button>

                    <button
                      onClick={togglePlay}
                      className="p-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full hover:from-purple-600 hover:to-blue-600 transition-all duration-300 transform hover:scale-110"
                    >
                      {videoState.playing ? (
                        <Pause className="w-6 h-6 text-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white" />
                      )}
                    </button>

                    <button
                      onClick={() => skipTime(10)}
                      className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-300"
                    >
                      <SkipForward className="w-5 h-5 text-white" />
                    </button>
                  </div>

                  <div className="flex items-center space-x-4">
                    {/* Volume Control */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={toggleMute}
                        className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-300"
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
                      className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all duration-300"
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
              <h3 className="text-xl font-bold text-white mb-2">{videoModal.file}</h3>
              <p className="text-gray-400">WebRTC Video Stream</p>
            </div>
          </div>
        </div>
      )}

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
      <FileCompressionManager />
    </div>
  );
};

export default FileUploader;