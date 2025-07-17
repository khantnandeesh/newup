import React, { useState, useRef, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import {
    Upload, Download, FileText, CheckCircle, AlertCircle, Loader2, X,
    Cloud, Play, Pause, Maximize, Minimize,
    SkipBack, SkipForward, Eye, Trash2, Edit3, Folder,
    Settings, Search, Grid, List, ChevronRight, Home, Plus, Info, Star, Clock, LogOut, Key, FolderOpen,
    FileImage, FileVideo, FileJson, FileCode, FileSpreadsheet, FileArchive, FileMusic, MoreVertical
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
        fullscreen: false,
        loading: false,
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

    const [previewContent, setPreviewContent] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const currentPreviewAbortController = useRef(null);

    const [fetchTrigger, setFetchTrigger] = useState(0);
    const [fetchPath, setFetchPath] = useState('');

    const [showNewMenu, setShowNewMenu] = useState(false);
    const newButtonRef = useRef(null);

    const [activeUploads, setActiveUploads] = useState({});
    const uploadXHRs = useRef({});
    const uploadCleanupTimeouts = useRef({});

    // --- DERIVED STATE ---
    const uploadingFiles = Object.values(activeUploads).filter(u => u.status === 'uploading');
    const isAnyUploading = uploadingFiles.length > 0;
    const isAnyFileBeingProcessed = Object.values(activeUploads).some(u => u.status === 'uploading' || u.status === 'file_sent');

    const overallProgress = isAnyUploading
        ? (uploadingFiles.reduce((sum, upload) => sum + upload.progress, 0) / uploadingFiles.length)
        : 0;

    const overallSpeed = isAnyUploading
        ? uploadingFiles.reduce((sum, upload) => sum + upload.speed, 0)
        : 0;

    const completedUploadsCount = Object.values(activeUploads).filter(u => u.status === 'completed').length;
    const totalUploadsStarted = Object.keys(activeUploads).length;
    const areAllUploadsFinished = totalUploadsStarted > 0 && Object.values(activeUploads).every(u => u.status === 'completed' || u.status === 'failed' || u.status === 'aborted');

    const videoRef = useRef(null);
    const contextMenuRef = useRef(null);

    // --- Constant Data / Helper Functions ---
    const videoFormats = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'];
    const imageFormats = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.tiff'];
    const documentFormats = ['.pdf', '.doc', '.docx', '.txt', '.xlsx', '.xls', '.ppt', '.pptx'];
    const audioFormats = ['.mp3', '.wav', '.aac', '.flac'];
    const codeFormats = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json', '.xml'];
    const archiveFormats = ['.zip', '.rar', '.7z', '.tar', '.gz'];
    const spreadsheetFormats = ['.xls', '.xlsx', '.csv'];
    const pdfFormats = ['.pdf'];
    const htmlFormats = ['.html', '.htm'];

    const getFileExtension = (filename) => filename.toLowerCase().split('.').pop();
    const isVideoFile = (filename) => videoFormats.includes('.' + getFileExtension(filename));
    const isImageFile = (filename) => imageFormats.includes('.' + getFileExtension(filename));
    const isDocumentFile = (filename) => documentFormats.includes('.' + getFileExtension(filename));
    const isAudioFile = (filename) => audioFormats.includes('.' + getFileExtension(filename));
    const isCodeFile = (filename) => codeFormats.includes('.' + getFileExtension(filename));
    const isArchiveFile = (filename) => archiveFormats.includes('.' + getFileExtension(filename));
    const isSpreadsheetFile = (filename) => spreadsheetFormats.includes('.' + getFileExtension(filename));
    const isPdfFile = (filename) => pdfFormats.includes('.' + getFileExtension(filename));
    const isHtmlFile = (filename) => htmlFormats.includes('.' + getFileExtension(filename));

    const addLog = (msg) => {
        setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    const formatSpeed = (bytesPerSecond) => {
        if (bytesPerSecond >= 1024 * 1024) { return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`; }
        else if (bytesPerSecond >= 1024) { return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`; }
        else { return `${bytesPerSecond.toFixed(0)} B/s`; }
    };
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // --- Callback Functions ---
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
                        isPdf: isFile ? isPdfFile(displayName) : false,
                        isHtml: isFile ? isHtmlFile(displayName) : false,
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
        if (isAuthenticated && !authLoading) {
            performFetchItems(fetchPath);
        }
    }, [isAuthenticated, authLoading, fetchTrigger, fetchPath, performFetchItems]);

    useEffect(() => {
        const activeTimeouts = uploadCleanupTimeouts.current;

        Object.keys(activeUploads).forEach(fileId => {
            const upload = activeUploads[fileId];
            if ((upload.status === 'completed' || upload.status === 'failed' || upload.status === 'aborted') && !activeTimeouts[fileId]) {
                activeTimeouts[fileId] = setTimeout(() => {
                    setActiveUploads(prev => {
                        const newState = { ...prev };
                        delete newState[fileId];
                        return newState;
                    });
                    delete activeTimeouts[fileId];
                }, 5000);
            } else if (['pending', 'uploading', 'file_sent'].includes(upload.status)) {
                if (activeTimeouts[fileId]) {
                    clearTimeout(activeTimeouts[fileId]);
                    delete activeTimeouts[fileId];
                }
            }
        });

        return () => {
            Object.values(activeTimeouts).forEach(clearTimeout);
            uploadCleanupTimeouts.current = {};
        };
    }, [activeUploads]);


    const handleAuth = async (endpoint) => {
        setAuthError('');
        setAuthLoading(true);
        try {
            const response = await fetch(`${BACKEND_URL}/vault/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        if (path === 'Trash' || path === 'Recent' || path === 'Starred') {
            addLog(`Navigation to system folder "${path}" is not yet implemented.`);
            // In a real app, you would handle this differently, maybe fetching from a different endpoint.
            // For now, we just clear the view or show a message.
            setItems([]);
            setCurrentPath(path);
            setBreadcrumbs([{ name: 'My Drive', path: '' }, { name: path, path: path }]);
            return;
        }
        setSearchTerm('');
        setFilterType('all');
        setFetchPath(path);
        setFetchTrigger(prev => prev + 1);
    };

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

    const handleDrop = (e) => {
        e.preventDefault(); e.stopPropagation(); setDragActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            files.forEach(file => upload(file));
        }
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            files.forEach(file => upload(file));
        }
        e.target.value = '';
    };


    const upload = async (file) => {
        const fileId = `${file.name}-${Date.now()}`;
        setActiveUploads(prev => ({
            ...prev,
            [fileId]: { name: file.name, progress: 0, speed: 0, status: 'pending', message: 'Waiting...' }
        }));

        try {
            addLog(`Starting upload: ${file.name}`);
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
                        [fileId]: { ...prev[fileId], progress, speed, status: 'uploading' }
                    }));
                    lastLoaded = e.loaded;
                    lastTime = currentTime;
                }
            });

            xhr.addEventListener('load', () => {
                setActiveUploads(prev => ({
                    ...prev,
                    [fileId]: { ...prev[fileId], progress: 100, speed: 0, status: 'file_sent' }
                }));
            });

            xhr.addEventListener('readystatechange', () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    try {
                        if (xhr.status === 200) {
                            const response = JSON.parse(xhr.responseText);
                            if (response.success) {
                                setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'completed' } }));
                                addLog(`Upload of ${file.name} completed.`);
                                setFetchTrigger(prev => prev + 1);
                            } else {
                                throw new Error(response.error || 'Server processing failed');
                            }
                        } else {
                            throw new Error(`Server error: ${xhr.status}`);
                        }
                    } catch (err) {
                        setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'failed', message: err.message } }));
                        addLog(`Upload of ${file.name} failed: ${err.message}`);
                    }
                    delete uploadXHRs.current[fileId];
                }
            });

            xhr.addEventListener('error', () => {
                setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'failed', message: 'Network error' } }));
                delete uploadXHRs.current[fileId];
            });
            xhr.addEventListener('abort', () => {
                setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'aborted', message: 'Cancelled' } }));
                delete uploadXHRs.current[fileId];
            });

            xhr.open('POST', `${BACKEND_URL}/upload`);
            xhr.setRequestHeader('Authorization', getAuthHeaders().Authorization || '');
            xhr.send(formData);
        } catch (err) {
            setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'failed', message: err.message } }));
            delete uploadXHRs.current[fileId];
        }
    };

    const viewItemProperties = async (item) => {
        try {
            if (item.isFolder) {
                setSelectedItem({
                    ...item,
                    sizeFormatted: '—',
                    lastModified: item.modified,
                });
            } else {
                const response = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(item.path)}/properties`, { headers: getAuthHeaders() });
                const properties = await response.json();
                if (!response.ok) throw new Error(properties.error || 'Failed to get properties');
                setSelectedItem({
                    ...properties,
                    sizeFormatted: formatFileSize(properties.size)
                });
            }
            setShowProperties(true);
        } catch (error) {
            addLog('Failed to get item properties: ' + error.message);
        }
    };

    const handleDownload = async (e, item) => {
        e.stopPropagation();
        if (!item.downloadUrl) return;
        addLog(`Initiating download for ${item.name}...`);
        try {
            const response = await fetch(item.downloadUrl, { headers: getAuthHeaders() });
            if (!response.ok) throw new Error(`Server responded with ${response.status}`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            addLog(`Download started for ${item.name}`);
        } catch (err) {
            addLog(`Download failed for ${item.name}: ${err.message}`);
        }
    };

    const deleteItem = async (item) => {
        if (!item || !item.path) return;
        if (!window.confirm(`Delete "${item.name}"? This action cannot be undone.`)) return;

        try {
            const response = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(item.path)}${item.isFolder ? '/' : ''}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (response.ok) {
                addLog(`Deleted: ${item.name}`);
                setFetchTrigger(prev => prev + 1);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Unknown error');
            }
        } catch (error) {
            addLog(`Failed to delete: ${error.message}`);
        }
    };

    const renameItem = async (itemToRename) => {
        if (!newItemName.trim() || newItemName.trim() === itemToRename.name) return;
        try {
            const response = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(itemToRename.path)}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ newName: newItemName.trim(), isFolder: itemToRename.isFolder })
            });
            if (response.ok) {
                addLog(`Renamed to ${newItemName.trim()}`);
                setRenamingItem(null);
                setNewItemName('');
                setShowProperties(false);
                setFetchTrigger(prev => prev + 1);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error);
            }
        } catch (error) {
            addLog('Failed to rename: ' + error.message);
        }
    };

    const createFolder = async () => {
        const folderName = prompt('Enter new folder name:');
        if (!folderName || !folderName.trim()) return;
        try {
            const folderPath = currentPath ? `${currentPath}/${folderName.trim()}` : folderName.trim();
            const response = await fetch(`${BACKEND_URL}/folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ path: folderPath })
            });
            if (response.ok) {
                addLog(`Folder created: ${folderName.trim()}`);
                setFetchTrigger(prev => prev + 1);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error);
            }
        } catch (error) {
            addLog('Failed to create folder: ' + error.message);
        }
    };

    const openVideoModal = (item) => {
        if (!item.streamUrl) return;
        setVideoModal({ open: true, item, url: item.streamUrl });
    };
    const closeVideoModal = () => {
        if (videoRef.current) videoRef.current.pause();
        setVideoModal({ open: false, item: null, url: '' });
        setVideoState(prev => ({ ...prev, playing: false, fullscreen: false }));
    };
    const togglePlay = () => videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause();
    const handleSeek = (e) => { if (videoRef.current) videoRef.current.currentTime = e.target.value; };
    const toggleFullscreen = () => {
        const modal = document.getElementById('video-modal');
        if (!document.fullscreenElement) {
            modal?.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
        setVideoState(p => ({ ...p, fullscreen: !p.fullscreen }));
    };

    const formatTime = (seconds) => {
        const date = new Date(seconds * 1000);
        const hh = date.getUTCHours();
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds().toString().padStart(2, '0');
        if (hh > 0) return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
        return `${mm}:${ss}`;
    };

    const getFileIcon = (item) => {
        if (item.isFolder) return <Folder className="w-full h-full" />;
        if (item.isImage) return <FileImage className="w-full h-full" />;
        if (item.isVideo) return <FileVideo className="w-full h-full" />;
        if (item.isAudio) return <FileMusic className="w-full h-full" />;
        if (item.isSpreadsheet) return <FileSpreadsheet className="w-full h-full" />;
        if (item.isCode || item.isHtml) return <FileCode className="w-full h-full" />;
        if (item.isArchive) return <FileArchive className="w-full h-full" />;
        if (item.isPdf) return <FileText className="w-full h-full text-red-400" />;
        return <FileText className="w-full h-full" />;
    };

    const filteredItems = items.filter(item => {
        const nameToSearch = item.name || '';
        return nameToSearch.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const handleContextMenu = (e, item) => {
        e.preventDefault();
        setSelectedItem(item);
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, item: item });
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
        }
        return () => {
            document.removeEventListener('click', handleClickOutsideContextMenu);
            document.removeEventListener('contextmenu', handleClickOutsideContextMenu);
        };
    }, [contextMenu.visible, handleClickOutsideContextMenu]);

    const handleMouseEnterItem = (e, item) => {
        clearTimeout(previewTimeoutRef.current);
        if (currentPreviewAbortController.current) currentPreviewAbortController.current.abort();
        setPreviewContent(null);
        setPreviewLoading(false);
        if (item.isFolder) { setHoveredItem(null); return; }

        const targetElement = e.currentTarget;
        previewTimeoutRef.current = setTimeout(async () => {
            if (!document.body.contains(targetElement)) return;

            const rect = targetElement.getBoundingClientRect();
            const xPos = rect.right + 10;
            const yPos = rect.top;
            setPreviewCoords({ x: xPos, y: yPos });
            setHoveredItem(item);
            setPreviewLoading(true);

            try {
                const controller = new AbortController();
                currentPreviewAbortController.current = controller;
                const response = await fetch(`${BACKEND_URL}/preview/${encodeURIComponent(item.path)}`, { headers: getAuthHeaders(), signal: controller.signal });
                if (!response.ok) throw new Error('Failed to fetch preview');
                const data = await response.json();
                setPreviewContent(data);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setPreviewContent({ type: 'error', message: 'Preview unavailable' });
                }
            } finally {
                setPreviewLoading(false);
                currentPreviewAbortController.current = null;
            }
        }, 500);
    };

    const handleMouseLeaveItem = () => {
        clearTimeout(previewTimeoutRef.current);
        if (currentPreviewAbortController.current) currentPreviewAbortController.current.abort();
        setHoveredItem(null);
        setPreviewContent(null);
        setPreviewLoading(false);
    };

    const toggleNewMenu = useCallback(() => setShowNewMenu(prev => !prev), []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (newButtonRef.current && !newButtonRef.current.contains(event.target) && !event.target.closest('.new-menu-dropdown')) {
                setShowNewMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleItemAction = (action, item, event) => {
        if (event) event.stopPropagation();
        setContextMenu({ visible: false });

        switch (action) {
            case 'open':
                if (item.isFolder) navigateToFolder(item.path);
                else if (item.isVideo) openVideoModal(item);
                else viewItemProperties(item);
                break;
            case 'download': handleDownload(event, item); break;
            case 'properties': viewItemProperties(item); break;
            case 'rename':
                setRenamingItem(item);
                setNewItemName(item.name);
                if (!showProperties || selectedItem?.path !== item.path) {
                    viewItemProperties(item);
                }
                break;
            case 'delete': deleteItem(item); break;
            default: break;
        }
    };

    // --- UI Components (Revamped for the new design) ---

    const AuthScreen = () => (
        <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-white font-sans">
            <div className="w-full max-w-sm p-8 space-y-6 bg-[#111111] border border-[#222] rounded-lg shadow-2xl">
                <div className="text-center">
                    <Key className="w-10 h-10 mx-auto mb-4 text-gray-400" />
                    <h1 className="text-2xl font-semibold">Secure Vault</h1>
                    <p className="text-sm text-gray-500">Enter your credentials to continue</p>
                </div>

                {authError && (
                    <div className="p-3 text-center text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded-md">
                        {authError}
                    </div>
                )}

                <div className="space-y-4">
                    <input
                        type="text" placeholder="Vault Number" value={vaultNumberInput} onChange={(e) => setVaultNumberInput(e.target.value)}
                        className="w-full px-4 py-2 bg-[#0a0a0a] border border-[#333] rounded-md placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white transition"
                    />
                    <input
                        type="password" placeholder="Passcode" value={passcodeInput} onChange={(e) => setPasscodeInput(e.target.value)}
                        className="w-full px-4 py-2 bg-[#0a0a0a] border border-[#333] rounded-md placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white transition"
                    />
                </div>

                <div className="space-y-3">
                    <button onClick={() => handleAuth('login')} className="w-full py-2 font-semibold text-black bg-white rounded-md hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#111]">
                        {authLoading ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : "Unlock"}
                    </button>
                    <button onClick={() => handleAuth('register')} className="w-full py-2 font-semibold text-gray-300 bg-transparent border border-[#333] rounded-md hover:bg-[#222] hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#111]">
                        {authLoading ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : "Create New Vault"}
                    </button>
                </div>
            </div>
        </div>
    );

    const ItemCard = ({ item }) => (
        <div
            className="group relative flex flex-col bg-[#111111] border border-[#222] rounded-lg p-3 cursor-pointer transition-all duration-200 hover:bg-[#1a1a1a] hover:border-[#444] hover:shadow-lg"
            onClick={() => handleItemAction('open', item)}
            onContextMenu={(e) => handleContextMenu(e, item)}
            onMouseEnter={(e) => handleMouseEnterItem(e, item)}
            onMouseLeave={handleMouseLeaveItem}
        >
            <div className="flex-grow flex items-center justify-center mb-3">
                <div className="w-16 h-16 text-gray-400">{getFileIcon(item)}</div>
            </div>
            <div className="text-center">
                <p className="text-sm font-medium text-white w-full truncate" title={item.name}>{item.name}</p>
                {!item.isFolder && <p className="text-xs text-gray-500">{formatFileSize(item.size)}</p>}
            </div>
            <button onClick={(e) => handleContextMenu(e, item)} className="absolute top-2 right-2 p-1.5 text-gray-500 rounded-full hover:bg-[#333] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-4 h-4" />
            </button>
        </div>
    );

    const ItemRow = ({ item }) => (
        <tr
            className="group border-b border-[#222] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
            onClick={() => handleItemAction('open', item)}
            onContextMenu={(e) => handleContextMenu(e, item)}
            onMouseEnter={(e) => handleMouseEnterItem(e, item)}
            onMouseLeave={handleMouseLeaveItem}
        >
            <td className="px-6 py-3 whitespace-nowrap text-sm text-white font-medium">
                <div className="flex items-center">
                    <div className="flex-shrink-0 h-5 w-5 mr-3 text-gray-400">{getFileIcon(item)}</div>
                    <span className="truncate max-w-xs">{item.name}</span>
                </div>
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400">
                {item.modified ? new Date(item.modified).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400">
                {item.isFolder ? 'Folder' : (item.name.split('.').pop() || 'File').toUpperCase()}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400 text-right">{item.isFolder ? '—' : formatFileSize(item.size)}</td>
            <td className="px-6 py-3 text-right">
                <button onClick={(e) => handleContextMenu(e, item)} className="p-1.5 text-gray-500 rounded-full hover:bg-[#333] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );

    const AppLayout = () => (
        <div className="flex h-screen bg-[#0a0a0a] text-white font-sans">
            <aside className="w-64 flex-shrink-0 bg-[#111111] border-r border-[#222] flex flex-col p-4">
                <div className="flex items-center space-x-2 mb-8">
                    <div className="p-2 bg-white rounded-md"><Cloud className="w-5 h-5 text-black" /></div>
                    <h1 className="text-xl font-bold">DataVault</h1>
                </div>
                <div className="relative mb-6">
                    <button ref={newButtonRef} onClick={toggleNewMenu} className="flex items-center justify-center w-full space-x-2 px-4 py-2 bg-white text-black rounded-md font-semibold hover:bg-gray-200 transition">
                        <Plus className="w-5 h-5" /><span>New</span>
                    </button>
                    {showNewMenu && (
                        <div className="absolute left-0 mt-2 w-full bg-[#222] rounded-md shadow-2xl border border-[#333] z-20 new-menu-dropdown">
                            <button onClick={() => { document.getElementById('file-input').click(); setShowNewMenu(false); }} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-200 hover:bg-[#333]">
                                <Upload className="w-4 h-4 mr-3" /> File Upload
                            </button>
                            <button onClick={() => { createFolder(); setShowNewMenu(false); }} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-200 hover:bg-[#333]">
                                <Folder className="w-4 h-4 mr-3" /> New Folder
                            </button>
                        </div>
                    )}
                </div>
                <input id="file-input" type="file" className="hidden" onChange={handleFileSelect} disabled={isAnyUploading} multiple />
                <nav className="space-y-1 flex-grow">
                    {[
                        { name: 'My Drive', icon: Home, path: '' }, { name: 'Starred', icon: Star, path: 'Starred' },
                        { name: 'Recent', icon: Clock, path: 'Recent' }, { name: 'Trash', icon: Trash2, path: 'Trash' },
                    ].map(navItem => (
                        <button key={navItem.name} onClick={() => navigateToFolder(navItem.path)}
                            className={`flex items-center w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentPath === navItem.path ? 'bg-[#222] text-white' : 'text-gray-400 hover:bg-[#222] hover:text-white'}`}>
                            <navItem.icon className="w-5 h-5 mr-3" /><span>{navItem.name}</span>
                        </button>
                    ))}
                </nav>
                <div className="mt-auto">
                    <button onClick={handleLogout} className="flex items-center w-full px-3 py-2 rounded-md text-sm font-medium text-gray-400 hover:bg-[#222] hover:text-white transition-colors">
                        <LogOut className="w-5 h-5 mr-3" /><span>Logout & Switch Vault</span>
                    </button>
                </div>
            </aside>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex-shrink-0 h-20 flex items-center justify-between px-8 border-b border-[#222]">
                    <nav className="flex items-center text-sm">
                        {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={crumb.path}>
                                <button onClick={() => navigateToFolder(crumb.path)} className={`px-2 py-1 rounded-md transition-colors ${index === breadcrumbs.length - 1 ? 'font-semibold text-white' : 'text-gray-500 hover:text-white'}`}>
                                    {crumb.name}
                                </button>
                                {index < breadcrumbs.length - 1 && <ChevronRight className="w-4 h-4 text-gray-600 mx-1" />}
                            </React.Fragment>
                        ))}
                    </nav>
                    <div className="flex items-center space-x-4">
                        <div className="relative w-72">
                            <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-[#111] border border-[#222] rounded-md text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-white/50" />
                        </div>
                        <div className="flex items-center bg-[#111] border border-[#222] rounded-md p-0.5">
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-[#333]' : 'text-gray-500 hover:text-white'}`}><Grid className="w-5 h-5" /></button>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-[#333]' : 'text-gray-500 hover:text-white'}`}><List className="w-5 h-5" /></button>
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-8" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
                    {dragActive && (
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center pointer-events-none">
                            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-white rounded-2xl">
                                <Upload className="w-16 h-16 text-white mb-4" />
                                <p className="text-xl font-semibold">Drop files to upload</p>
                            </div>
                        </div>
                    )}
                    {Object.keys(activeUploads).length > 0 && <UploadStatusPanel />}
                    {filteredItems.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center justify-center text-gray-500">
                            <FolderOpen className="w-20 h-20 mb-4 text-gray-800" />
                            <h3 className="text-xl font-medium text-gray-400">This folder is empty</h3>
                            <p className="text-gray-600">Drop files here or use the 'New' button to upload.</p>
                        </div>
                    ) : (
                        viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                                {filteredItems.map(item => <ItemCard key={item.path} item={item} />)}
                            </div>
                        ) : (
                            <table className="min-w-full">
                                <thead>
                                    <tr className="border-b border-[#222]">
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Modified</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                                        <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>{filteredItems.map(item => <ItemRow key={item.path} item={item} />)}</tbody>
                            </table>
                        )
                    )}
                </main>
            </div>
            {contextMenu.visible && <ContextMenu />}
            {showProperties && <PropertiesModal />}
            {videoModal.open && <VideoPlayerModal />}
            {hoveredItem && <FilePreview item={hoveredItem} x={previewCoords.x} y={previewCoords.y} isLoading={previewLoading} content={previewContent} />}
            <style>{`
                ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #111111; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; } ::-webkit-scrollbar-thumb:hover { background: #444; }
                .animate-fadeIn { animation: fadeIn 0.15s ease-out forwards; } @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                .video-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: white; border-radius: 50%; cursor: pointer; margin-top: -6px; }
            `}</style>
        </div>
    );

    const UploadStatusPanel = () => (
        <div className="mb-8 p-4 bg-[#111] border border-[#222] rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold">{isAnyUploading ? 'Uploading...' : 'Uploads Complete'}</h3>
                {areAllUploadsFinished && <button onClick={() => setActiveUploads({})} className="text-gray-500 hover:text-white p-1 rounded-full"><X className="w-4 h-4" /></button>}
            </div>
            <div className="flex items-center space-x-4 mb-3">
                <div className="w-full bg-[#222] rounded-full h-1.5">
                    <div className="h-1.5 bg-white rounded-full transition-all duration-300" style={{ width: `${overallProgress}%` }} />
                </div>
                <span className="text-sm font-mono text-gray-400">{Math.round(overallProgress)}%</span>
            </div>
            <div className="text-xs text-gray-500 flex justify-between">
                <span>{completedUploadsCount} / {totalUploadsStarted} files</span>
                {isAnyUploading && <span>{formatSpeed(overallSpeed)}</span>}
            </div>
        </div>
    );

    const ContextMenu = () => (
        <div ref={contextMenuRef} className="absolute z-50 bg-[#1a1a1a] rounded-md shadow-2xl py-1.5 w-52 border border-[#333] animate-fadeIn" style={{ top: contextMenu.y, left: contextMenu.x }}>
            {[
                !selectedItem.isFolder && { label: 'Preview', icon: Eye, action: 'open' },
                !selectedItem.isFolder && { label: 'Download', icon: Download, action: 'download' },
                { label: 'Details', icon: Info, action: 'properties' }, { label: 'Rename', icon: Edit3, action: 'rename' },
                { label: 'Delete', icon: Trash2, action: 'delete', isDestructive: true },
            ].filter(Boolean).map((menuItem, index) => (
                <button key={index} onClick={(e) => handleItemAction(menuItem.action, selectedItem, e)}
                    className={`flex items-center w-full px-3 py-2 text-sm transition-colors ${menuItem.isDestructive ? 'text-red-400 hover:bg-red-900/40' : 'text-gray-200 hover:bg-[#333]'}`}>
                    <menuItem.icon className="w-4 h-4 mr-3" />{menuItem.label}
                </button>
            ))}
        </div>
    );

    const PropertiesModal = () => (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={() => setShowProperties(false)}>
            <div className="w-full max-w-md bg-[#111111] border border-[#222] rounded-lg shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-semibold">Properties</h2>
                    <button onClick={() => setShowProperties(false)} className="p-1 rounded-full text-gray-500 hover:bg-[#333] hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center"><span className="text-gray-400">Name</span><span className="text-white font-medium truncate max-w-[60%]">{selectedItem.name}</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-400">Type</span><span className="text-white font-medium">{selectedItem.isFolder ? 'Folder' : 'File'}</span></div>
                    {!selectedItem.isFolder && <div className="flex justify-between items-center"><span className="text-gray-400">Size</span><span className="text-white font-medium">{selectedItem.sizeFormatted}</span></div>}
                    <div className="flex justify-between items-center"><span className="text-gray-400">Created</span><span className="text-white font-medium">{selectedItem.created ? new Date(selectedItem.created).toLocaleString() : 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-400">Modified</span><span className="text-white font-medium">{selectedItem.lastModified ? new Date(selectedItem.lastModified).toLocaleString() : 'N/A'}</span></div>
                </div>
                {renamingItem && renamingItem.path === selectedItem.path && (
                    <div className="mt-6 pt-4 border-t border-[#222]">
                        <p className="text-sm font-medium mb-2">Rename Item</p>
                        <div className="flex items-center space-x-2">
                            <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="flex-1 bg-[#0a0a0a] border border-[#333] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50" />
                            <button onClick={() => renameItem(selectedItem)} className="px-3 py-1.5 bg-white text-black text-sm font-semibold rounded-md hover:bg-gray-200">Save</button>
                            <button onClick={() => setRenamingItem(null)} className="px-3 py-1.5 bg-[#333] text-white text-sm font-semibold rounded-md hover:bg-[#444]">Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const FilePreview = ({ item, x, y, isLoading, content }) => {
        if (!item) return null;
        return (
            <div className="fixed z-50 bg-[#1a1a1a] rounded-lg shadow-xl border border-[#333] p-2 animate-fadeIn" style={{ left: x, top: y, width: '300px', height: '250px' }}>
                <div className="w-full h-[calc(100%-30px)] flex items-center justify-center overflow-hidden rounded-md relative mb-1 bg-[#111]">
                    {isLoading ? <Loader2 className="w-8 h-8 animate-spin text-white/50" /> :
                        !content || content.type === 'error' ? <div className="text-center text-gray-500"><Info className="w-6 h-6 mx-auto mb-2" /><p className="text-sm">{content?.message || 'No preview'}</p></div> :
                        content.type === 'url' && item.isImage ? <img src={content.url} alt={item.name} className="w-full h-full object-contain" /> :
                        content.type === 'text' ? <pre className="w-full h-full text-xs text-gray-300 overflow-auto p-2 whitespace-pre-wrap break-all">{content.content}</pre> :
                        <div className="text-center text-gray-500"><Info className="w-6 h-6 mx-auto mb-2" /><p className="text-sm">Preview not supported</p></div>
                    }
                </div>
                <div className="text-white text-xs px-1.5 py-0.5 rounded-sm truncate w-full text-center">{item.name}</div>
            </div>
        );
    };

    const VideoPlayerModal = () => (
        <div id="video-modal" className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4 animate-fadeIn">
            <button onClick={closeVideoModal} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white z-10"><X className="w-7 h-7" /></button>
            <div className="w-full max-w-5xl aspect-video bg-black flex items-center justify-center relative group">
                <video ref={videoRef} src={videoModal.url} className="w-full h-full object-contain"
                    onTimeUpdate={(e) => setVideoState(prev => ({ ...prev, currentTime: e.target.currentTime }))}
                    onLoadedMetadata={(e) => setVideoState(prev => ({ ...prev, duration: e.target.duration }))}
                    onPlay={() => setVideoState(prev => ({ ...prev, playing: true }))}
                    onPause={() => setVideoState(prev => ({ ...prev, playing: false }))}
                    autoPlay
                />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-full relative h-4 mb-2">
                        <input type="range" min="0" max={videoState.duration || 0} value={videoState.currentTime} onChange={handleSeek}
                            className="w-full absolute top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full appearance-none cursor-pointer video-slider" />
                    </div>
                    <div className="flex items-center justify-between text-white">
                        <div className="flex items-center space-x-4">
                            <button onClick={togglePlay} className="p-2">{videoState.playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}</button>
                            <span className="text-xs font-mono">{formatTime(videoState.currentTime)} / {formatTime(videoState.duration)}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button onClick={toggleFullscreen} className="p-2">{videoState.fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}</button>
                        </div>
                    </div>
                </div>
            </div>
            <h3 className="text-lg font-semibold text-white mt-4">{videoModal.item?.name}</h3>
        </div>
    );

    if (authLoading) {
        return <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-white"><Loader2 className="w-10 h-10 animate-spin" /></div>;
    }

    return isAuthenticated ? <AppLayout /> : <AuthScreen />;
};

export default FileUploader;
