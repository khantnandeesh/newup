import React, { useState, useRef, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie'; // For managing cookies
import {
  Upload, Download, FileText, CheckCircle, AlertCircle, Loader2, X,
  Cloud, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Eye, Trash2, Edit3, FolderOpen,
  Monitor, Settings, Filter, Search, Grid, List, ChevronRight, Home, Plus, Info, Share2, Star, Clock, HelpCircle,
  FileImage, FileVideo, FileJson, FileCode, FileSpreadsheet, FileArchive, FileMusic, LogOut, Key
} from 'lucide-react';

const BACKEND_URL = "https://newup-4g3z.onrender.com";
const VAULT_TOKEN_COOKIE_NAME = 'vaultToken';

const FileUploader = () => {
  // --- State Declarations ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [vaultNumberInput, setVaultNumberInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showProperties, setShowProperties] = useState(false);
  const [renamingItem, setRenamingItem] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [videoModal, setVideoModal] = useState({ open: false, item: null, url: '' });
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
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([{ name: 'My Drive', path: '' }]);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, item: null });

  const [hoveredItem, setHoveredItem] = useState(null);
  const [previewCoords, setPreviewCoords] = useState({ x: 0, y: 0 });
  const previewTimeoutRef = useRef(null);

  // NEW: State for preview content and its loading state
  const [previewContent, setPreviewContent] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const currentPreviewAbortController = useRef(null);


  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [fetchPath, setFetchPath] = useState('');

  const [showNewMenu, setShowNewMenu] = useState(false);
  const newButtonRef = useRef(null);

  const [activeUploads, setActiveUploads] = useState({});
  const uploadXHRs = useRef({});
  const uploadCleanupTimeouts = useRef({}); // New ref to manage cleanup timeouts

  // --- DERIVED STATE: IMPORTANT CHANGE HERE ---
  // Now, only 'uploading' status contributes to the 'isAnyUploading' flag
  const uploadingFiles = Object.values(activeUploads).filter(u => u.status === 'uploading');
  const isAnyUploading = uploadingFiles.length > 0;

  // Use a separate variable to check if *any* file is still being processed/handled (including server-side)
  const isAnyFileBeingProcessed = Object.values(activeUploads).some(u => u.status === 'uploading' || u.status === 'file_sent');

  const overallProgress = isAnyUploading
    ? (uploadingFiles.reduce((sum, upload) => sum + upload.progress, 0) / uploadingFiles.length)
    : 0; // This will now correctly show 0% if only file_sent remain
  
  const overallSpeed = isAnyUploading
    ? uploadingFiles.reduce((sum, upload) => sum + upload.speed, 0)
    : 0;
  
  const completedUploadsCount = Object.values(activeUploads).filter(u => u.status === 'completed').length;
  const totalUploadsStarted = Object.keys(activeUploads).length; // Total files ever added to the upload queue
  const areAllUploadsFinished = totalUploadsStarted > 0 && Object.values(activeUploads).every(u => u.status === 'completed' || u.status === 'failed' || u.status === 'aborted');


  const videoRef = useRef(null);
  const contextMenuRef = useRef(null);

  // --- Constant Data / Helper Functions (can be defined here or outside component) ---
  const videoFormats = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];
  const imageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const documentFormats = ['.pdf', '.doc', '.docx', '.txt', '.xlsx', '.xls', '.ppt', '.pptx'];
  const audioFormats = ['.mp3', '.wav', '.aac', '.flac'];
  const codeFormats = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json', '.xml'];
  const archiveFormats = ['.zip', '.rar', '.7z', '.tar', '.gz'];
  const spreadsheetFormats = ['.xls', '.xlsx', '.csv'];
  const pdfFormats = ['.pdf']; // New: for PDF identification
  const htmlFormats = ['.html', '.htm']; // New: for HTML identification

  const getFileExtension = (filename) => filename.toLowerCase().split('.').pop();
  const isVideoFile = (filename) => videoFormats.includes('.' + getFileExtension(filename));
  const isImageFile = (filename) => imageFormats.includes('.' + getFileExtension(filename));
  const isDocumentFile = (filename) => documentFormats.includes('.' + getFileExtension(filename));
  const isAudioFile = (filename) => audioFormats.includes('.' + getFileExtension(filename));
  const isCodeFile = (filename) => codeFormats.includes('.' + getFileExtension(filename));
  const isArchiveFile = (filename) => archiveFormats.includes('.' + getFileExtension(filename));
  const isSpreadsheetFile = (filename) => spreadsheetFormats.includes('.' + getFileExtension(filename));
  const isPdfFile = (filename) => pdfFormats.includes('.' + getFileExtension(filename)); // New helper
  const isHtmlFile = (filename) => htmlFormats.includes('.' + getFileExtension(filename)); // New helper

  const addLog = (msg) => {
    setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  let formatSpeed = (bytesPerSecond) => {
    if (bytesPerSecond >= 1024 * 1024) { return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`; }
    else if (bytesPerSecond >= 1024) { return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`; }
    else { return `${bytesPerSecond.toFixed(0)} B/s`; }
  };
  let formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  // --- Callback Functions (defined after states and derived states) ---
  const getAuthHeaders = useCallback(() => {
    const token = Cookies.get(VAULT_TOKEN_COOKIE_NAME);
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const performFetchItems = useCallback(async (path) => {
    const headers = getAuthHeaders();
    if (Object.keys(headers).length === 0) {
      return;
    }

    try {
      addLog(`Fetching items for path: ${path || 'root'}`);
      const res = await fetch(`${BACKEND_URL}/list?prefix=${encodeURIComponent(path)}`, {
        headers: headers,
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          Cookies.remove(VAULT_TOKEN_COOKIE_NAME);
          setIsAuthenticated(false);
          setAuthError('Session expired or unauthorized. Please log in again.');
          addLog('Session expired or unauthorized. Forcing re-login.');
          return;
        }
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      if (data && Array.isArray(data.items)) {
        const formattedItems = data.items.map(item => {
          const displayName = item.name || (item.path ? item.path.split('/').filter(Boolean).pop() : 'Unknown');
          const isFile = !item.isFolder;

          return {
            ...item,
            name: displayName,
            originalName: item.originalName || displayName,
            isVideo: isFile ? isVideoFile(displayName) : false,
            isImage: isFile ? isImageFile(displayName) : false,
            isDocument: isFile ? isDocumentFile(displayName) : false,
            isAudio: isFile ? isAudioFile(displayName) : false,
            isCode: isFile ? isCodeFile(displayName) : false,
            isArchive: isFile ? isArchiveFile(displayName) : false,
            isSpreadsheet: isFile ? isSpreadsheetFile(displayName) : false,
            isPdf: isFile ? isPdfFile(displayName) : false, // New: PDF flag
            isHtml: isFile ? isHtmlFile(displayName) : false, // New: HTML flag
            downloadUrl: isFile ? `${BACKEND_URL}/f/${encodeURIComponent(item.path)}` : null,
            streamUrl: isFile && isVideoFile(displayName) ? `${BACKEND_URL}/stream/${encodeURIComponent(item.path)}` : null
          };
        });

        const sortedItems = formattedItems.sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });

        setItems(sortedItems);
        setCurrentPath(data.currentPath || '');
        setParentPath(data.parentPath);

        const newBreadcrumbs = [{ name: 'My Drive', path: '' }];
        if (data.currentPath) {
          const parts = data.currentPath.split('/').filter(Boolean);
          parts.forEach((part, index) => {
            const pathSegment = parts.slice(0, index + 1).join('/');
            newBreadcrumbs.push({ name: part, path: pathSegment });
          });
        }
        setBreadcrumbs(newBreadcrumbs);
      } else {
        console.warn('Invalid response format:', data);
        setItems([]);
        setCurrentPath('');
        setParentPath(null);
        setBreadcrumbs([{ name: 'My Drive', path: '' }]);
      }
    } catch (e) {
      console.error('Failed to fetch items:', e);
      setItems([]);
      addLog('Failed to fetch items: ' + e.message);
    }
  }, [getAuthHeaders]);


  const setAuthenticatedSession = useCallback((authenticated, token = null) => {
    setIsAuthenticated(authenticated);
    if (authenticated) {
      if (token) {
        Cookies.set(VAULT_TOKEN_COOKIE_NAME, token, { expires: 3650, secure: false, sameSite: 'Lax' });
      }
      addLog('Authentication successful.');
      setFetchTrigger(prev => prev + 1);
      setFetchPath('');
    } else {
      Cookies.remove(VAULT_TOKEN_COOKIE_NAME);
      setItems([]);
      setLog([]);
      setCurrentPath('');
      setParentPath(null);
      setBreadcrumbs([{ name: 'My Drive', path: '' }]);
      addLog('Authentication cleared.');
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    setAuthLoading(true);
    const token = Cookies.get(VAULT_TOKEN_COOKIE_NAME);
    if (token) {
      try {
        const response = await fetch(`${BACKEND_URL}/vault/check-auth`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          setAuthenticatedSession(true);
        } else {
          setAuthenticatedSession(false);
          addLog('Authentication cookie invalid or expired. Please log in.');
        }
      } catch (err) {
        setAuthenticatedSession(false);
        addLog('Failed to verify authentication token: ' + err.message);
      }
    } else {
      setAuthenticatedSession(false);
    }
    setAuthLoading(false);
  }, [setAuthenticatedSession]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthenticated && !authLoading && fetchTrigger > 0) {
      performFetchItems(fetchPath);
    }
  }, [isAuthenticated, authLoading, fetchTrigger, fetchPath, performFetchItems]);

  // --- NEW: Refined Effect to clean up completed/failed uploads after a delay ---
  useEffect(() => {
    const activeTimeouts = uploadCleanupTimeouts.current; // Get ref to object storing timeouts

    Object.keys(activeUploads).forEach(fileId => {
      const upload = activeUploads[fileId];
      // If it's a finished status AND it hasn't been scheduled for cleanup yet
      if ((upload.status === 'completed' || upload.status === 'failed' || upload.status === 'aborted') && !activeTimeouts[fileId]) {
        activeTimeouts[fileId] = setTimeout(() => {
          setActiveUploads(prev => {
            const newState = { ...prev };
            delete newState[fileId]; // Remove the entry
            return newState;
          });
          delete activeTimeouts[fileId]; // Remove from ref once timeout fires
        }, 5000); // Clear after 5 seconds
      } else if (upload.status === 'uploading' || upload.status === 'file_sent' || upload.status === 'pending') {
        // If it's an active status, ensure any pending cleanup for it is cancelled
        if (activeTimeouts[fileId]) {
          clearTimeout(activeTimeouts[fileId]);
          delete activeTimeouts[fileId];
        }
      }
    });

    // Cleanup function for the effect: clear ALL pending timeouts if component unmounts
    return () => {
      Object.values(activeTimeouts).forEach(clearTimeout);
      uploadCleanupTimeouts.current = {}; // Reset the ref object
    };
  }, [activeUploads]); // Dependency: re-run effect whenever activeUploads changes


  const handleAuth = async (endpoint) => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/vault/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vaultNumber: vaultNumberInput, passcode: passcodeInput }),
      });

      const data = await response.json();
      if (response.ok) {
        setAuthenticatedSession(true, data.token);
        addLog(`Successfully ${endpoint === 'register' ? 'registered' : 'logged in'} to vault: ${vaultNumberInput}`);
      } else {
        setAuthError(data.error || 'Authentication failed.');
        addLog(`Authentication failed: ${data.error || 'Unknown error'}`);
        setAuthenticatedSession(false);
      }
    } catch (err) {
      setAuthError('Network error or server unreachable.');
      addLog('Authentication network error: ' + err.message);
      setAuthenticatedSession(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthenticatedSession(false);
    setVaultNumberInput('');
    setPasscodeInput('');
    addLog('Logged out successfully.');
  };

  const navigateToFolder = (path) => {
    setSearchTerm('');
    setFilterType('all');
    setFetchPath(path);
    setFetchTrigger(prev => prev + 1);
  };

  const navigateUp = () => {
    if (parentPath !== null) {
      navigateToFolder(parentPath);
    } else {
      navigateToFolder('');
    }
  };

  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (isAnyUploading) { // This check now uses the refined 'isAnyUploading'
      addLog("Uploads already in progress. Please wait or clear.");
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      files.forEach(file => upload(file));
    }
  };

  const handleFileSelect = (e) => {
    if (isAnyUploading) { // This check now uses the refined 'isAnyUploading'
      addLog("Uploads already in progress. Please wait or clear.");
      return;
    }
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      files.forEach(file => upload(file));
    }
    e.target.value = '';
  };


  const upload = async (file) => {
    const fileId = `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setActiveUploads(prev => ({
      ...prev,
      [fileId]: {
        name: file.name,
        progress: 0,
        speed: 0,
        status: 'pending',
        message: 'Waiting...'
      }
    }));

    try {
      addLog(`Starting upload: ${file.name} (${formatFileSize(file.size)})`);
      const formData = new FormData();
      formData.append('file', file);
      if (currentPath) { formData.append('folderPath', currentPath); }

      const xhr = new XMLHttpRequest();
      uploadXHRs.current[fileId] = xhr;
      let lastLoaded = 0;
      let lastTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          const currentTime = Date.now();
          const timeDiff = (currentTime - lastTime) / 1000;
          const bytesDiff = e.loaded - lastLoaded;
          const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

          setActiveUploads(prev => ({
            ...prev,
            [fileId]: { ...prev[fileId], progress: progress, speed: speed, status: 'uploading', message: `${Math.round(progress)}% - ${formatSpeed(speed)}` }
          }));

          lastLoaded = e.loaded;
          lastTime = currentTime;
        }
      });
      xhr.addEventListener('load', () => {
        // File bytes have been sent to the server. Now await server response.
        setActiveUploads(prev => ({
          ...prev,
          [fileId]: { ...prev[fileId], progress: 100, speed: 0, status: 'file_sent', message: 'Processing on server...' }
        }));
      });
      xhr.addEventListener('readystatechange', () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.success) {
                setLink(`${BACKEND_URL}${response.file.downloadUrl}`);
                setActiveUploads(prev => ({
                  ...prev,
                  [fileId]: { ...prev[fileId], progress: 100, status: 'completed', message: 'Upload successful!' }
                }));
                addLog(`Upload of ${file.name} completed successfully`);
                setFetchPath(currentPath); // Only refresh view on successful completion
                setFetchTrigger(prev => prev + 1);
              } else {
                setActiveUploads(prev => ({
                  ...prev,
                  [fileId]: { ...prev[fileId], progress: 100, status: 'failed', message: response.error || 'Server processing failed' }
                }));
                addLog(`Upload of ${file.name} failed: ` + (response.error || 'Unknown server error'));
              }
            } catch (err) {
              setActiveUploads(prev => ({
                ...prev,
                [fileId]: { ...prev[fileId], progress: 100, status: 'failed', message: 'Invalid server response' }
              }));
              addLog(`Invalid server response for ${file.name}: ` + err.message);
            }
          } else {
            setActiveUploads(prev => ({
              ...prev,
              [fileId]: { ...prev[fileId], progress: 0, speed: 0, status: 'failed', message: `Server error: ${xhr.status}` }
            }));
            addLog(`Upload of ${file.name} failed with HTTP status: ${xhr.status}`);
          }
          delete uploadXHRs.current[fileId];
        }
      });
      xhr.addEventListener('error', () => {
        setActiveUploads(prev => ({
          ...prev,
          [fileId]: { ...prev[fileId], progress: 0, speed: 0, status: 'failed', message: 'Network error' }
        }));
        addLog(`Network error during upload of ${file.name}`);
        delete uploadXHRs.current[fileId];
      });
      xhr.addEventListener('abort', () => {
        setActiveUploads(prev => ({
          ...prev,
          [fileId]: { ...prev[fileId], progress: 0, speed: 0, status: 'aborted', message: 'Upload cancelled' }
        }));
        addLog(`Upload of ${file.name} was cancelled`);
        delete uploadXHRs.current[fileId];
      });

      xhr.open('POST', `${BACKEND_URL}/upload`);
      xhr.setRequestHeader('Authorization', getAuthHeaders().Authorization || '');
      xhr.send(formData);
    } catch (err) {
      setActiveUploads(prev => ({
        ...prev,
        [fileId]: { ...prev[fileId], progress: 0, speed: 0, status: 'failed', message: err.message }
      }));
      addLog(`Upload of ${file.name} failed: ` + err.message);
      delete uploadXHRs.current[fileId];
    }
  };

  const viewItemProperties = async (item) => {
    try {
      if (item.isFolder) {
        setSelectedItem({
          name: item.name,
          path: item.path,
          isFolder: true,
          created: item.created || new Date().toISOString(),
          lastModified: item.modified || new Date().toISOString(),
          sizeFormatted: 'N/A'
        });
        setShowProperties(true);
        addLog(`Viewing properties for folder: ${item.name}`);
        return;
      }
      addLog(`Getting properties for: ${item.name}`);
      const response = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(item.path)}/properties`, {
        headers: getAuthHeaders(),
      });
      const properties = await response.json();
      if (!response.ok) throw new Error(properties.error || 'Failed to get properties');
      setSelectedItem({
        ...properties,
        sizeFormatted: formatFileSize(properties.size)
      });
      setShowProperties(true);
    } catch (error) {
      addLog('Failed to get item properties: ' + error.message);
      setError('Failed to get item properties: ' + error.message);
    }
  };

  const handleDownload = async (e, item) => {
    e.stopPropagation();

    if (!item.downloadUrl) {
      addLog(`Cannot download ${item.name}: No download URL available.`);
      setError(`Cannot download ${item.name}: No download URL available.`);
      return;
    }

    addLog(`Initiating download for ${item.name}...`);
    try {
      const response = await fetch(item.downloadUrl, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download ${item.name}: ${response.status} - ${errorText}`);
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = item.name;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8''|[^; codecs=]+'?)?([^;"\n]*?)['"]?$/i);
        if (filenameMatch && filenameMatch[1]) {
          try {
              filename = decodeURIComponent(filenameMatch[1]);
          } catch (e) {
              filename = filenameMatch[1];
          }
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addLog(`Download started for ${item.name}`);
    } catch (err) {
      addLog(`Download failed for ${item.name}: ${err.message}`);
      setError(`Download failed for ${item.name}: ${err.message}`);
    }
  };

  const deleteItem = async (item) => {
    if (!item || !item.path) { addLog('Invalid item object: missing path'); return; }

    const itemType = item.isFolder ? 'folder' : 'file';
    const itemName = item.name;

    if (!confirm(`Are you sure you want to delete this ${itemType}: "${itemName}"?${item.isFolder ? '\nThis will delete all files and subfolders inside it!' : ''}`)) {
      return;
    }

    try {
      addLog(`Attempting to delete ${itemType}: ${itemName}`);
      const response = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(item.path)}${item.isFolder ? '/' : ''}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        addLog(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} deleted: ${itemName}`);
        setFetchPath(currentPath);
        setFetchTrigger(prev => prev + 1);
      } else {
        const errorData = await response.json();
        addLog(`Failed to delete ${itemType}: ${errorData.error || 'Unknown error'}`);
        setError(`Failed to delete ${itemType}: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      addLog(`Failed to delete ${itemType}: ${error.message}`);
      setError(`Failed to delete ${itemType}: ${error.message}`);
    }
  };

  const renameItem = async (itemToRename) => {
    if (!itemToRename || !itemToRename.path) { addLog('Invalid item object: missing path'); return; }
    if (!newItemName.trim() || newItemName.trim() === itemToRename.name) {
      addLog('Please enter a new valid name different from the current one.');
      return;
    }
    try {
      addLog(`Renaming ${itemToRename.isFolder ? 'folder' : 'file'}: ${itemToRename.name} to ${newItemName.trim()}`);
      const response = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(itemToRename.path)}/rename`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({ newName: newItemName.trim(), isFolder: itemToRename.isFolder })
      });
      if (response.ok) {
        addLog(`Item renamed: ${itemToRename.name} -> ${newItemName.trim()}`);
        setRenamingItem(null);
        setNewItemName('');
        setShowProperties(false);
        setFetchPath(currentPath);
        setFetchTrigger(prev => prev + 1);
      } else {
        const errorData = await response.json();
        addLog('Failed to rename item: ' + errorData.error);
        setError('Failed to rename item: ' + errorData.error);
      }
    } catch (error) {
      addLog('Failed to rename item: ' + error.message);
      setError('Failed to rename item: ' + error.message);
    }
  };

  const createFolder = async () => {
    console.log("createFolder function called.");
    const folderName = prompt('Enter new folder name:');
    if (!folderName || !folderName.trim()) { addLog('Folder name cannot be empty.'); return; }

    try {
      addLog(`Attempting to create folder: ${folderName.trim()}`);
      const folderPath = currentPath ? `${currentPath}/${folderName.trim()}` : folderName.trim();

      const response = await fetch(`${BACKEND_URL}/folder`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({ path: folderPath })
      });

      if (response.ok) {
        const result = await response.json();
        addLog(`Folder created: ${result.folder.name}`);
        setFetchPath(currentPath);
        setFetchTrigger(prev => prev + 1);
      } else {
        const errorData = await response.json();
        addLog('Failed to create folder: ' + (errorData.error || 'Unknown error'));
        setError('Failed to create folder: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      addLog('Failed to create folder: ' + error.message);
      setError('Failed to create folder: ' + error.message);
    }
  };

  const openVideoModal = (item) => {
    if (!item.streamUrl) { addLog('No stream URL available for this item.'); return; }
    setVideoModal({ open: true, item, url: item.streamUrl });
    setVideoState(prev => ({ ...prev, playing: false, currentTime: 0 }));
  };
  const closeVideoModal = () => {
    if (videoRef.current) { videoRef.current.pause(); }
    setVideoModal({ open: false, item: null, url: '' });
    setVideoState(prev => ({ ...prev, playing: false, fullscreen: false }));
  };
  const togglePlay = () => {
    if (videoRef.current) {
      if (videoState.playing) { videoRef.current.pause(); } else { videoRef.current.play(); }
      setVideoState(prev => ({ ...prev, playing: !prev.playing }));
    }
  };
  const toggleMute = () => {
    if (videoRef.current) { videoRef.current.muted = !videoRef.current.muted; setVideoState(prev => ({ ...prev, muted: !prev.muted })); }
  };
  const handleVolumeChange = (e) => {
    const volume = parseFloat(e.target.value);
    if (videoRef.current) { videoRef.current.volume = volume; setVideoState(prev => ({ ...prev, volume, muted: volume === 0 })); }
  };
  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) { videoRef.current.currentTime = time; setVideoState(prev => ({ ...prev, currentTime: time })); }
  };
  const skipTime = (seconds) => { if (videoRef.current) { videoRef.current.currentTime += seconds; } };
  const toggleFullscreen = () => {
    const modal = document.getElementById('video-modal');
    if (!videoState.fullscreen) {
      if (modal.requestFullscreen) { modal.requestFullscreen(); }
    } else {
      if (document.exitFullscreen) { document.exitFullscreen(); }
    }
    setVideoState(prev => ({ ...prev, fullscreen: !prev.fullscreen }));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileIcon = (item) => {
    if (item.isFolder) {
      return <FolderOpen className="w-full h-full text-blue-400" />;
    }
    if (item.isImage) {
      return <FileImage className="w-full h-full text-purple-400" />;
    }
    if (item.isVideo) {
      return <FileVideo className="w-full h-full text-red-400" />;
    }
    if (item.isAudio) {
      return <FileMusic className="w-full h-full text-green-400" />;
    }
    if (item.isSpreadsheet) {
        return <FileSpreadsheet className="w-full h-full text-emerald-400" />;
    }
    if (item.isCode) {
        return <FileCode className="w-full h-full text-yellow-400" />;
    }
    if (item.isArchive) {
        return <FileArchive className="w-full h-full text-orange-400" />;
    }
    if (item.isDocument) { // This now covers general documents, PDFs and HTML will have specific icons below
        const ext = getFileExtension(item.name);
        if (ext === 'pdf') {
            return <FileText className="w-full h-full text-red-500" />;
        }
        return <FileText className="w-full h-full text-gray-400" />;
    }
    if (item.isPdf) { // Specific icon for PDF
      return <FileText className="w-full h-full text-red-500" />;
    }
    if (item.isHtml) { // Specific icon for HTML
      return <FileCode className="w-full h-full text-blue-300" />; // Or a web icon if you have one
    }
    return <FileText className="w-full h-full text-gray-400" />;
  };

    // Corrected duplication of formatSpeed and formatFileSize
    // let formatSpeed = (bytesPerSecond) => { ... }; (already defined above)
    // let formatFileSize = (bytes) => { ... }; (already defined above)

  const filteredItems = items.filter(item => {
    const nameToSearch = item.name || item.originalName || '';
    const matchesSearch = nameToSearch.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'video' && item.isVideo) ||
      (filterType === 'image' && item.isImage) ||
      (filterType === 'folder' && item.isFolder) ||
      (filterType === 'document' && item.isDocument) ||
      (filterType === 'audio' && item.isAudio) ||
      (filterType === 'code' && item.isCode) ||
      (filterType === 'archive' && item.isArchive) ||
      (filterType === 'spreadsheet' && item.isSpreadsheet);

    return matchesSearch && matchesFilter;
  });

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setSelectedItem(item);
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      item: item,
    });
  };

  const handleClickOutsideContextMenu = useCallback((event) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, []);

  useEffect(() => {
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutsideContextMenu);
      document.addEventListener('contextmenu', handleClickOutsideContextMenu);
    } else {
      document.removeEventListener('click', handleClickOutsideContextMenu);
      document.removeEventListener('contextmenu', handleClickOutsideContextMenu);
    }
    return () => {
      document.removeEventListener('click', handleClickOutsideContextMenu);
      document.removeEventListener('contextmenu', handleClickOutsideContextMenu);
    };
  }, [contextMenu.visible, handleClickOutsideContextMenu]);

const handleMouseEnterItem = (e, item) => {
  // Clear any existing timeout and abort any ongoing fetch
  clearTimeout(previewTimeoutRef.current);
  if (currentPreviewAbortController.current) {
    currentPreviewAbortController.current.abort();
  }
  setPreviewContent(null); // Clear previous preview content
  setPreviewLoading(false); // Reset loading state

  // Only show preview for files, not folders
  if (item.isFolder) {
    setHoveredItem(null); // Ensure no preview for folders
    return;
  }

  // Store a reference to the target element
  const targetElement = e.currentTarget; 

  previewTimeoutRef.current = setTimeout(async () => {
    // IMPORTANT: Check if the target element still exists in the DOM
    if (!targetElement || !document.body.contains(targetElement)) {
      console.log("Hover target element no longer in DOM, aborting preview.");
      setHoveredItem(null);
      setPreviewContent(null);
      setPreviewLoading(false);
      return;
    }

    const rect = targetElement.getBoundingClientRect(); // Use targetElement here
    const viewportWidth = window.innerWidth;
    const previewWidth = 300; // Increased preview width for text/PDF
    const previewHeight = 250; // Increased preview height for text/PDF

    let xPos = rect.right + 10;
    let yPos = rect.top;

    if (xPos + previewWidth > viewportWidth - 20) {
      xPos = rect.left - previewWidth - 10;
      if (xPos < 20) {
        xPos = rect.left;
        yPos = rect.bottom + 10;
      }
    }
    if (yPos + previewHeight > window.innerHeight - 20) {
      yPos = window.innerHeight - (previewHeight + 20);
      if (yPos < 0) yPos = 20;
    }

    setPreviewCoords({ x: xPos, y: yPos });
    setHoveredItem(item);
    setPreviewLoading(true);

    // Fetch preview content based on file type
    try {
      const controller = new AbortController();
      currentPreviewAbortController.current = controller; // Store controller to abort later
      const signal = controller.signal;

      if (item.isImage) {
        setPreviewContent({ type: 'image', url: item.downloadUrl });
        setPreviewLoading(false);
      } else if (item.isVideo) {
        setPreviewContent({ type: 'video', url: item.streamUrl });
        setPreviewLoading(false);
      } else if (item.isPdf || item.isHtml) {
        setPreviewContent({ type: item.isPdf ? 'pdf' : 'html', url: item.downloadUrl });
        setPreviewLoading(false);
      } else if (item.isCode || item.isDocument || item.isSpreadsheet || item.isAudio) {
        const headers = getAuthHeaders();
        const response = await fetch(item.downloadUrl, { headers, signal });
        if (!response.ok) throw new Error('Failed to fetch preview');
        const textContent = await response.text();
        setPreviewContent({ type: 'text', content: textContent.substring(0, 500) + (textContent.length > 500 ? '...' : '') });
        setPreviewLoading(false);
      } else {
        setPreviewContent({ type: 'none' });
        setPreviewLoading(false);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        addLog(`Preview fetch for ${item.name} aborted.`);
      } else {
        console.error('Failed to load preview:', error);
        setPreviewContent({ type: 'error', message: 'Failed to load preview.' });
      }
      setPreviewLoading(false);
    }
  }, 500);
};


  // UPDATED handleMouseLeaveItem to clear preview content immediately
  const handleMouseLeaveItem = () => {
    clearTimeout(previewTimeoutRef.current);
    if (currentPreviewAbortController.current) {
      currentPreviewAbortController.current.abort(); // Abort any ongoing fetch
      currentPreviewAbortController.current = null;
    }
    setHoveredItem(null);
    setPreviewContent(null); // Clear content immediately
    setPreviewLoading(false); // Reset loading state
  };


  // UPDATED FilePreview Component
  const FilePreview = ({ item, x, y, isLoading, content, fileType }) => {
    if (!item || !hoveredItem || hoveredItem.path !== item.path) return null; // Only show if this item is actively hovered

    const renderContent = () => {
      if (isLoading) {
        return (
          <div className="flex items-center justify-center h-full text-blue-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        );
      }

      if (content && content.type === 'image') {
        return (
          <img
            src={content.url}
            alt={item.name}
            className="w-full h-full object-contain"
            onError={(e) => { e.target.onerror = null; e.target.src = '/image-placeholder.png'; }}
          />
        );
      } else if (content && content.type === 'video') {
        return (
          <>
            <img
              src={'/video-thumbnail-placeholder.png'} // You'd ideally generate real thumbnails on backend
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.onerror = null; e.target.src = '/video-placeholder.png'; }}
            />
            <Play className="absolute w-10 h-10 text-white/80" />
          </>
        );
      } else if (content && (content.type === 'pdf' || content.type === 'html')) {
        // Embed PDF or HTML directly. This is highly dependent on server's X-Frame-Options and browser support.
        // For local testing or specific server configs, it might work.
        return (
          <iframe
            src={content.url}
            title={`${item.name} preview`}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin" // Add sandbox for security, adjust as needed
            onLoad={() => console.log('Iframe loaded')}
            onError={() => console.error('Iframe error')}
          />
        );
      } else if (content && content.type === 'text') {
        return (
          <pre className="w-full h-full text-xs text-gray-100 overflow-hidden whitespace-pre-wrap break-all px-2 py-1">
            {content.content}
          </pre>
        );
      } else if (content && content.type === 'error') {
        return (
          <div className="flex flex-col items-center justify-center h-full text-red-400 text-center text-sm p-2">
            <AlertCircle className="w-6 h-6 mb-2" />
            <p>{content.message}</p>
          </div>
        );
      } else {
        return (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center text-sm p-2">
            <Info className="w-6 h-6 mb-2" />
            <p>No preview available for this file type.</p>
          </div>
        );
      }
    };

    return (
      <div
        className="fixed z-50 bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-2 animate-fadeIn"
        style={{ left: x, top: y, width: '300px', height: '250px' }} // Increased size
      >
        <div className="w-full h-[calc(100%-20px)] flex items-center justify-center overflow-hidden rounded-md relative mb-1">
          {renderContent()}
        </div>
        <div className="text-white text-xs px-1.5 py-0.5 rounded-sm truncate w-full text-center">
          {item.name}
        </div>
      </div>
    );
  };


  const toggleNewMenu = useCallback(() => {
    console.log("Toggle New Menu clicked!");
    setShowNewMenu(prev => !prev);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (newButtonRef.current && !newButtonRef.current.contains(event.target) &&
          !event.target.closest('.new-menu-dropdown')) {
        console.log("Clicked outside new menu, closing.");
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, []);


  // --- Main Render Block ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
        <p className="ml-4 text-xl">Checking session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white font-sans">
        <div className="bg-gray-900 p-8 rounded-xl shadow-lg border border-gray-800 w-full max-w-md text-center">
          <Cloud className="w-16 h-16 text-blue-600 mx-auto mb-6" />
          <h2 className="text-2xl font-semibold mb-6 text-white">Access Your Vault</h2>
          {authError && (
            <div className="bg-rose-900 border border-rose-700 text-rose-200 p-3 rounded-md mb-4 text-sm">
              {authError}
            </div>
          )}
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Vault Number"
              value={vaultNumberInput}
              onChange={(e) => setVaultNumberInput(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
            <input
              type="password"
              placeholder="Passcode"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>
          <div className="mt-6 flex flex-col space-y-3">
            <button
              onClick={() => handleAuth('login')}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Login to Vault
            </button>
            <button
              onClick={() => handleAuth('register')}
              className="w-full px-4 py-2 bg-gray-700 text-gray-200 rounded-lg font-medium hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Create New Vault
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white font-sans">
      {/* Header (Top Nav Bar) */}
      <header className="bg-gray-900 shadow-lg border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-full">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-white">Drive</h1>
          </div>
          {/* Search Bar */}
          <div className="flex-1 max-w-lg mx-8 relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search in Drive"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-700 bg-gray-800 rounded-full text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 shadow-inner"
            />
          </div>
          <div className="flex items-center space-x-3">
            <button className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors">
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors flex items-center space-x-1"
              title="Logout / Switch Vault"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <button className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
              U1
            </button> {/* Placeholder for user initials */}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Left Sidebar */}
        <aside className="w-64 min-w-[16rem] mr-8 flex-shrink-0">
          <div className="bg-gray-900 rounded-xl shadow-lg border border-gray-800 p-4 sticky top-[80px]">
            {/* New Button with Dropdown */}
            <div className="relative mb-6">
              <button
                ref={newButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNewMenu();
                }}
                className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 w-full justify-center"
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium">New</span>
              </button>
              {showNewMenu && (
                <div className="absolute left-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-10 animate-fadeIn new-menu-dropdown">
                  <button
                    onClick={() => {
                      document.getElementById('file-input').click();
                      setShowNewMenu(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 rounded-t-lg"
                  >
                    <Upload className="w-4 h-4 mr-2" /> File upload
                  </button>
                  <button
                    onClick={() => {
                      createFolder();
                      setShowNewMenu(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 rounded-b-lg"
                  >
                    <FolderOpen className="w-4 h-4 mr-2" /> New folder
                  </button>
                </div>
              )}
            </div>
            <input
              id="file-input"
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isAnyUploading}
              multiple // Allow multiple file selection
            />

            {/* Main Navigation */}
            <nav className="space-y-1">
              <button
                onClick={() => navigateToFolder('')}
                className={`flex items-center w-full px-4 py-2 rounded-lg text-left text-sm font-medium transition-colors
                  ${currentPath === '' ? 'bg-blue-800 text-white' : 'text-gray-300 hover:bg-gray-800'}
                `}
              >
                <FolderOpen className="w-5 h-5 mr-3 text-blue-400" />
                <span>My Drive</span>
              </button>
              <button className="flex items-center w-full px-4 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors">
                <Share2 className="w-5 h-5 mr-3 text-gray-400" />
                <span>Shared with me</span>
              </button>
              <button className="flex items-center w-full px-4 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors">
                <Star className="w-5 h-5 mr-3 text-gray-400" />
                <span>Starred</span>
              </button>
              <button className="flex items-center w-full px-4 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors">
                <Clock className="w-5 h-5 mr-3 text-gray-400" />
                <span>Recent</span>
              </button>
              <div className="border-t border-gray-800 my-2 pt-2"></div>
              <button className="flex items-center w-full px-4 py-2 rounded-lg text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                onClick={() => navigateToFolder('Trash')}>
                <Trash2 className="w-5 h-5 mr-3 text-gray-400" />
                <span>Trash</span>
              </button>
            </nav>
          </div>
        </aside>

        {/* Main File Content Area */}
        <main className="flex-1 space-y-6">
          {/* Breadcrumbs and Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-900 rounded-xl shadow-lg border border-gray-800">
            {/* Breadcrumbs */}
            <nav className="flex items-center space-x-1 overflow-x-auto text-sm">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.path}>
                  {index > 0 && <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                  <button
                    onClick={() => navigateToFolder(crumb.path)}
                    className={`px-2 py-1 rounded text-sm hover:bg-gray-800 flex-shrink-0 whitespace-nowrap
                      ${index === breadcrumbs.length - 1 ? 'font-semibold text-white' : 'text-gray-400'}`
                    }
                  >
                    {crumb.name === 'My Drive' ? <span className="flex items-center"><Home className="w-4 h-4 mr-1 text-blue-400" /> My Drive</span> : crumb.name}
                  </button>
                </React.Fragment>
              ))}
              {currentPath && (
                <button
                  onClick={navigateUp}
                  className="ml-2 p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full"
                  title="Go up one level"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transform rotate-90" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </nav>

            {/* Toolbar Right Side */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-1.5 border border-gray-700 bg-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
              >
                <option value="all">All items</option>
                <option value="folder">Folders</option>
                <option value="video">Videos</option>
                <option value="image">Images</option>
                <option value="document">Documents</option>
                <option value="audio">Audio</option>
                <option value="code">Code</option>
                <option value="archive">Archives</option>
                <option value="spreadsheet">Spreadsheets</option>
              </select>
              {/* View Toggle */}
              <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all text-gray-400 ${viewMode === 'grid' ? 'bg-gray-700 text-blue-400 shadow-inner' : 'hover:bg-gray-700'}`}
                  title="Grid view"
                >
                  <Grid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all text-gray-400 ${viewMode === 'list' ? 'bg-gray-700 text-blue-400 shadow-inner' : 'hover:bg-gray-700'}`}
                  title="List view"
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Upload Progress/Status for Multiple Files */}
          {/* Now, the entire progress box only shows if any file is still being processed or pending (not completed/failed/aborted) */}
          {!areAllUploadsFinished && totalUploadsStarted > 0 && (
            <div className="bg-blue-900 border border-blue-700 rounded-xl p-4 flex flex-col space-y-3 shadow-lg animate-fadeIn">
              <div className="flex items-center space-x-4">
                {/* This loader now only shows if files are actively uploading (transferring bytes) */}
                {isAnyUploading ? (
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin flex-shrink-0" />
                ) : (
                  // If no files are actively uploading, but still being processed (file_sent), show a different icon or nothing
                  // For now, if all are 'file_sent', it will show CheckCircle.
                  // If you want a different indicator for 'file_sent' at the top, you'd add more logic here.
                  <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-200">
                    {/* The count will still be based on all uploads, but the percentage and speed only on actively uploading ones */}
                    {completedUploadsCount}/{totalUploadsStarted} files uploaded ({Math.round(overallProgress)}% Complete)
                  </p>
                  <div className="w-full bg-blue-700 rounded-full h-2 mt-1">
                    <div
                      className="h-2 bg-blue-400 rounded-full transition-all duration-300"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                  {isAnyUploading && overallSpeed > 0 && (
                    <p className="text-xs text-blue-300 mt-1">Overall Speed: {formatSpeed(overallSpeed)}</p>
                  )}
                  {!isAnyUploading && isAnyFileBeingProcessed && ( // New condition for server processing message
                    <p className="text-xs text-blue-300 mt-1">Server processing remaining files...</p>
                  )}
                </div>
              </div>
              {/* Individual file progress list - keep the spinner for 'file_sent' status here */}
              <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                {Object.values(activeUploads).map(upload => (
                  <div key={upload.name} className="flex items-center text-xs text-blue-200">
                    <span className="truncate flex-1 mr-2">{upload.name}</span>
                    <span className="w-16 text-right">
                      {upload.status === 'completed' || upload.status === 'file_sent' ? '100%' : `${Math.round(upload.progress)}%`}
                    </span>
                    {upload.status === 'failed' && <AlertCircle className="w-4 h-4 text-rose-400 ml-1" title={upload.message} />}
                    {upload.status === 'aborted' && <X className="w-4 h-4 text-gray-400 ml-1" title={upload.message} />}
                    {upload.status === 'completed' && <CheckCircle className="w-4 h-4 text-emerald-400 ml-1" />}
                    {upload.status === 'uploading' && <span className="ml-1 text-gray-400">{formatSpeed(upload.speed)}</span>}
                    {/* Keep the spinning loader for file_sent on individual files */}
                    {upload.status === 'file_sent' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin ml-1" title={upload.message} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary box for when all uploads are finished */}
          {areAllUploadsFinished && totalUploadsStarted > 0 && (
            <div className="bg-emerald-900 border border-emerald-700 rounded-xl p-4 animate-fadeIn shadow-lg">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-emerald-200">All uploads completed!</h3>
                  <p className="text-sm text-emerald-300 mt-1">
                    {completedUploadsCount} out of {totalUploadsStarted} files successfully uploaded.
                    {completedUploadsCount < totalUploadsStarted && ` (${totalUploadsStarted - completedUploadsCount} failed/aborted).`}
                  </p>
                </div>
                <button onClick={() => setActiveUploads({})} className="text-emerald-500 hover:text-emerald-300 p-1">
                  <X className="w-5 h-5" title="Clear upload history" />
                </button>
              </div>
            </div>
          )}

          {/* This 'link' success message might now be redundant or less important with the new 'areAllUploadsFinished' summary.
              Consider removing it or adjusting its condition if it creates double messages.
              For now, keeping it but note the potential overlap with the overall summary.
          */}
          {link && !totalUploadsStarted && (
            <div className="bg-emerald-900 border border-emerald-700 rounded-xl p-4 animate-fadeIn shadow-lg">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-emerald-200">Upload successful</h3>
                  <p className="text-sm text-emerald-300 mt-1">Your file is ready: <a href={link} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline hover:text-emerald-100 truncate">{link.split('/').pop()}</a></p>
                </div>
              </div>
            </div>
          )}
          {error && !totalUploadsStarted && (
            <div className="bg-rose-900 border border-rose-700 rounded-xl p-4 animate-fadeIn shadow-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-rose-200">Operation failed</h3>
                  <p className="text-sm text-rose-300 mt-1">{error}</p>
                </div>
                <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-300">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* File/Folder Listing */}
          <div className="bg-gray-900 rounded-xl shadow-lg border border-gray-800 overflow-hidden">
            {filteredItems.length === 0 ? (
              <div className="text-center py-20 flex flex-col items-center justify-center text-gray-500">
                <FolderOpen className="w-16 h-16 text-gray-700 mb-4" />
                <h3 className="text-xl font-medium text-gray-300 mb-2">No items found</h3>
                <p className="text-md text-gray-400">
                  {searchTerm ? 'No items match your search criteria in this folder.' : 'This folder is empty. Upload files or create new folders.'}
                </p>
              </div>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredItems.map((item) => (
                      <div
                        key={item.path}
                        className="group relative flex flex-col items-center bg-gray-800 rounded-lg border border-gray-700 p-3 pb-2 cursor-pointer hover:shadow-xl hover:border-blue-800 transition-all duration-200 min-h-[120px]"
                        onClick={() => item.isFolder ? navigateToFolder(item.path) : null}
                        onContextMenu={(e) => handleContextMenu(e, item)}
                        onMouseEnter={(e) => handleMouseEnterItem(e, item)}
                        onMouseLeave={handleMouseLeaveItem}
                      >
                        <div className={`flex-shrink-0 w-12 h-12 mb-2 ${item.isFolder ? 'text-blue-400' : 'text-gray-400'}`}>
                          {getFileIcon(item)}
                        </div>
                        <p className="text-sm font-medium text-white w-full truncate text-center px-1" title={item.name}>
                          {item.name}
                        </p>
                        {!item.isFolder && <p className="text-xs text-gray-400 text-center">{formatFileSize(item.size)}</p>}

                        {/* Hover Actions for Grid View */}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col space-y-0.5">
                          {!item.isFolder && (
                            <button
                              onClick={(e) => handleDownload(e, item)}
                              className="p-1 rounded-full bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-blue-400 shadow-md"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          {(item.isVideo || item.isImage) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); if(item.isVideo) openVideoModal(item); else viewItemProperties(item); }}
                              className="p-1 rounded-full bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-blue-400 shadow-md"
                              title={item.isVideo ? "Play" : "View Image"}
                            >
                              {item.isVideo ? <Play className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); viewItemProperties(item); }}
                            className="p-1 rounded-full bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-blue-400 shadow-md"
                            title="Properties"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-800">
                    <thead className="bg-gray-800">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Type
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Last Modified
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Size
                        </th>
                        <th scope="col" className="relative px-6 py-3">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-900 divide-y divide-gray-800">
                      {filteredItems.map((item) => (
                        <tr
                          key={item.path}
                          className="hover:bg-gray-800 cursor-pointer group"
                          onClick={() => item.isFolder ? navigateToFolder(item.path) : null}
                          onContextMenu={(e) => handleContextMenu(e, item)}
                          onMouseEnter={(e) => handleMouseEnterItem(e, item)}
                          onMouseLeave={handleMouseLeaveItem}
                        >
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-white font-medium">
                            <div className="flex items-center">
                              <div className={`flex-shrink-0 h-6 w-6 mr-3 ${item.isFolder ? 'text-blue-400' : 'text-gray-400'}`}>
                                {getFileIcon(item)}
                              </div>
                              <span className="truncate max-w-[200px]">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400">
                            {item.isFolder ? 'Folder' : (item.isVideo ? 'Video' : (item.isImage ? 'Image' : 'File'))}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400">
                            {item.modified ? new Date(item.modified).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400">
                            {item.isFolder ? '-' : formatFileSize(item.size)}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!item.isFolder && (
                                <>
                                  <button
                                    onClick={(e) => handleDownload(e, item)}
                                    className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-full"
                                    title="Download"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  {(item.isVideo || item.isImage) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); if(item.isVideo) openVideoModal(item); else viewItemProperties(item); }}
                                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-full"
                                      title={item.isVideo ? "Play Video" : "View Image"}
                                    >
                                      {item.isVideo ? <Play className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); viewItemProperties(item); }}
                                className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-full"
                                title="Properties"
                              >
                                <Info className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteItem(item); }}
                                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-full"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && selectedItem && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 bg-gray-800 rounded-lg shadow-xl py-2 w-48 border border-gray-700 animate-fadeIn text-gray-200"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
            {selectedItem.name}
          </div>
          <button
            className="flex items-center w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
            onClick={() => { viewItemProperties(selectedItem); setContextMenu({ ...contextMenu, visible: false }); }}
          >
            <Info className="w-4 h-4 mr-2" /> Details
          </button>
          {!selectedItem.isFolder && (
            <>
              <button
                onClick={(e) => { handleDownload(e, selectedItem); setContextMenu({ ...contextMenu, visible: false }); }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
              >
                <Download className="w-4 h-4 mr-2" /> Download
              </button>
              {selectedItem.isVideo && (
                <button
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                  onClick={() => { openVideoModal(selectedItem); setContextMenu({ ...contextMenu, visible: false }); }}
                >
                  <Play className="w-4 h-4 mr-2" /> Play
                </button>
              )}
            </>
          )}
          <button
            className="flex items-center w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
            onClick={() => {
              setRenamingItem(selectedItem);
              setNewItemName(selectedItem.name);
              setContextMenu({ ...contextMenu, visible: false });
              if (!showProperties) viewItemProperties(selectedItem);
            }}
          >
            <Edit3 className="w-4 h-4 mr-2" /> Rename
          </button>
          <button
            className="flex items-center w-full px-4 py-2 text-sm text-red-400 hover:bg-red-900"
            onClick={() => { deleteItem(selectedItem); setContextMenu({ ...contextMenu, visible: false }); }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </button>
        </div>
      )}

      {/* File Properties Modal */}
      {showProperties && selectedItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div
            className="relative w-full max-w-md bg-gray-900 rounded-lg p-6 shadow-xl border border-gray-800 text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowProperties(false)}
              className="absolute top-3 right-3 p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="space-y-4">
              <div className="text-center pb-3 border-b border-gray-800">
                <h2 className="text-lg font-medium text-white">Item Properties</h2>
                <p className="text-sm text-gray-400 mt-1">{selectedItem.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {!selectedItem.isFolder && (
                  <div className="bg-gray-800 rounded p-3 border border-gray-700">
                    <p className="text-gray-400 text-xs mb-1">File Size</p>
                    <p className="text-white text-sm font-medium">{selectedItem.sizeFormatted}</p>
                  </div>
                )}
                <div className="bg-gray-800 rounded p-3 border border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">Type</p>
                  <p className="text-white text-sm font-medium">
                    {selectedItem.isFolder ? 'Folder' : (selectedItem.isVideo ? 'Video' : (selectedItem.isImage ? 'Image' : 'File'))}
                  </p>
                </div>
                <div className="bg-gray-800 rounded p-3 border border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">Created</p>
                  <p className="text-white text-sm font-medium">{selectedItem.created ? new Date(selectedItem.created).toLocaleString() : 'N/A'}</p>
                </div>
                <div className="bg-gray-800 rounded p-3 border border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">Modified</p>
                  <p className="text-white text-sm font-medium">{selectedItem.lastModified ? new Date(selectedItem.lastModified).toLocaleString() : 'N/A'}</p>
                </div>
              </div>
              <div className="bg-gray-800 rounded p-3 border border-gray-700">
                <p className="text-gray-400 text-xs mb-2">Name</p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={renamingItem && renamingItem.path === selectedItem.path ? newItemName : selectedItem.name}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                    disabled={renamingItem?.path !== selectedItem.path}
                  />
                  {renamingItem?.path === selectedItem.path ? (
                    <div className="flex space-x-1">
                      <button
                        onClick={() => renameItem(selectedItem)}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setRenamingItem(null);
                          setNewItemName('');
                        }}
                        className="px-3 py-1.5 bg-gray-600 text-white text-xs font-medium rounded hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setRenamingItem(selectedItem);
                        setNewItemName(selectedItem.name);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
                      title="Rename Item"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-center space-x-3 pt-3 border-t border-gray-800">
                {!selectedItem.isFolder && (
                  <button
                    onClick={(e) => handleDownload(e, selectedItem)}
                    className="inline-flex items-center space-x-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                )}
                {selectedItem.isVideo && (
                  <button
                    onClick={() => {
                      setShowProperties(false);
                      openVideoModal(selectedItem);
                    }}
                    className="inline-flex items-center space-x-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
                  >
                    <Play className="w-4 h-4" />
                    <span>Play</span>
                  </button>
                )}
                <button
                  onClick={() => { deleteItem(selectedItem); setShowProperties(false); }}
                  className="inline-flex items-center space-x-1 bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Modal */}
      {videoModal.open && (
        <div
          id="video-modal"
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="relative w-full max-w-4xl">
            <button
              onClick={closeVideoModal}
              className="absolute -top-10 right-0 p-2 text-gray-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative bg-black rounded-lg overflow-hidden">
              {videoState.loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                  <div className="youtube-loader">
                    <div className="youtube-loader-red"></div>
                    <div className="youtube-loader-yellow"></div>
                    <div className="youtube-loader-green"></div>
                  </div>
                </div>
              )}
              <video
                ref={videoRef}
                src={videoModal.url}
                className="w-full h-auto max-h-[70vh] object-contain"
                onTimeUpdate={(e) => {
                  setVideoState(prev => ({
                    ...prev, currentTime: e.target.currentTime, buffered: e.target.buffered.length > 0 ? e.target.buffered.end(0) : 0
                  }));
                }}
                onLoadedMetadata={(e) => { setVideoState(prev => ({ ...prev, duration: e.target.duration })); }}
                onLoadedData={() => { setVideoState(prev => ({ ...prev, loading: false })); }}
                onPlay={() => setVideoState(prev => ({ ...prev, playing: true }))}
                onPause={() => setVideoState(prev => ({ ...prev, playing: false }))}
                onWaiting={() => setVideoState(prev => ({ ...prev, loading: true }))}
                onPlaying={() => setVideoState(prev => ({ ...prev, loading: false }))}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-transparent to-black/80 p-4">
                <div className="mb-3">
                  <input
                    type="range" min="0" max={videoState.duration || 0} value={videoState.currentTime} onChange={handleSeek}
                    className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{formatTime(videoState.currentTime)}</span>
                    <span>{formatTime(videoState.duration)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button onClick={() => skipTime(-10)} className="p-1.5 text-gray-300 hover:text-white"><SkipBack className="w-4 h-4" /></button>
                    <button onClick={togglePlay} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
                      {videoState.playing ? (<Pause className="w-5 h-5 text-white" />) : (<Play className="w-5 h-5 text-white" />)}
                    </button>
                    <button onClick={() => skipTime(10)} className="p-1.5 text-gray-300 hover:text-white"><SkipForward className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1">
                      <button onClick={toggleMute} className="p-1.5 text-gray-300 hover:text-white">
                        {videoState.muted ? (<VolumeX className="w-4 h-4" />) : (<Volume2 className="w-4 h-4" />)}
                      </button>
                      <input
                        type="range" min="0" max="1" step="0.1" value={videoState.volume} onChange={handleVolumeChange}
                        className="w-16 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer slider"
                      />
                    </div>
                    <button onClick={toggleFullscreen} className="p-1.5 text-gray-300 hover:text-white">
                      {videoState.fullscreen ? (<Minimize className="w-4 h-4" />) : (<Maximize className="w-4 h-4" />)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-xl font-bold text-white mb-1">{videoModal.item?.name}</h3>
              <p className="text-gray-400 text-sm">Streaming Video</p>
            </div>
          </div>
        </div>
      )}

      {/* Render the FilePreview component with new props */}
      {hoveredItem && (
        <FilePreview
          item={hoveredItem}
          x={previewCoords.x}
          y={previewCoords.y}
          isLoading={previewLoading}
          content={previewContent}
        />
      )}

      {/* Custom Styles - Embedded directly in the component */}
      <style>{`
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: #3b82f6; /* Tailwind blue-500 */
          border-radius: 50%;
          cursor: pointer;
          margin-top: -5px;
          box-shadow: 0 0 2px rgba(0,0,0,0.4);
        }
        .slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: #3b82f6; /* Tailwind blue-500 */
          border-radius: 50%;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 2px rgba(0,0,0,0.4);
        }
        .slider::-webkit-slider-runnable-track {
          width: 100%;
          height: 2px;
          background: #374151; /* gray-700 for dark theme track */
          border-radius: 2px;
        }
        .slider::-moz-range-track {
          width: 100%;
          height: 2px;
          background: #374151; /* gray-700 for dark theme track */
          border-radius: 2px;
        }

        .youtube-loader {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .youtube-loader-red,
        .youtube-loader-yellow,
        .youtube-loader-green {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin: 0 3px;
          animation: youtube-loader 1.5s infinite ease-in-out;
        }
        .youtube-loader-red { background-color: #ff0000; animation-delay: 0s; }
        .youtube-loader-yellow { background-color: #ffa700; animation-delay: 0.15s; }
        .youtube-loader-green { background-color: #3b82f6; animation-delay: 0.3s; }
        @keyframes youtube-loader {
          0%, 100% { transform: scale(0.6); opacity: 0.5; }
          50% { transform: scale(1); opacity: 1; }
        }

        /* Custom scrollbar for individual file progress list */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px; /* width of the scrollbar */
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #2D3748; /* bg-gray-800 */
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #4A5568; /* bg-gray-600 */
          border-radius: 4px;
          border: 2px solid #2D3748; /* border color matches track background */
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #616e80; /* bg-gray-500 on hover */
        }
      `}</style>
    </div>
  );
};

export default FileUploader;
