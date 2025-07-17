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

    // Preview-related state
    const [hoveredItem, setHoveredItem] = useState(null);
    const [previewCoords, setPreviewCoords] = useState({ x: 0, y: 0 });
    const previewTimeoutRef = useRef(null);
    const activePreviewRequest = useRef(null); // To track the item path being fetched

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

    const getFileExtension = (filename) => filename ? filename.toLowerCase().split('.').pop() : '';
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
        if (!bytes || bytes === 0) return '0 Bytes';
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
        if (Object.keys(headers).length === 0) return;

        try {
            const res = await fetch(`${BACKEND_URL}/list?prefix=${encodeURIComponent(path)}`, { headers });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    Cookies.remove(VAULT_TOKEN_COOKIE_NAME);
                    setIsAuthenticated(false);
                    setAuthError('Session expired or unauthorized. Please log in again.');
                    return;
                }
                throw new Error(data.error || `Server error: ${res.status}`);
            }

            if (data && Array.isArray(data.items)) {
                const formattedItems = data.items.map(item => {
                    const displayName = item.name || (item.path ? item.path.split('/').filter(Boolean).pop() : 'Unknown');
                    return { ...item, name: displayName };
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
                        newBreadcrumbs.push({ name: part, path: parts.slice(0, index + 1).join('/') });
                    });
                }
                setBreadcrumbs(newBreadcrumbs);
            }
        } catch (e) {
            console.error('Failed to fetch items:', e);
            addLog('Failed to fetch items: ' + e.message);
        }
    }, [getAuthHeaders]);

    const setAuthenticatedSession = useCallback((authenticated, token = null) => {
        setIsAuthenticated(authenticated);
        if (authenticated && token) {
            Cookies.set(VAULT_TOKEN_COOKIE_NAME, token, { expires: 3650, secure: false, sameSite: 'Lax' });
        } else if (!authenticated) {
            Cookies.remove(VAULT_TOKEN_COOKIE_NAME);
        }
        if (authenticated) {
            setFetchTrigger(prev => prev + 1);
            setFetchPath('');
        }
    }, []);

    const checkAuthStatus = useCallback(async () => {
        setAuthLoading(true);
        const token = Cookies.get(VAULT_TOKEN_COOKIE_NAME);
        if (token) {
            try {
                const response = await fetch(`${BACKEND_URL}/vault/check-auth`, { headers: { 'Authorization': `Bearer ${token}` } });
                setAuthenticatedSession(response.ok);
            } catch (err) {
                setAuthenticatedSession(false);
            }
        } else {
            setAuthenticatedSession(false);
        }
        setAuthLoading(false);
    }, [setAuthenticatedSession]);

    useEffect(() => { checkAuthStatus(); }, [checkAuthStatus]);

    useEffect(() => {
        if (isAuthenticated && !authLoading) {
            performFetchItems(fetchPath);
        }
    }, [isAuthenticated, authLoading, fetchTrigger, fetchPath, performFetchItems]);

    useEffect(() => {
        const activeTimeouts = uploadCleanupTimeouts.current;
        Object.keys(activeUploads).forEach(fileId => {
            const upload = activeUploads[fileId];
            const isFinished = ['completed', 'failed', 'aborted'].includes(upload.status);
            if (isFinished && !activeTimeouts[fileId]) {
                activeTimeouts[fileId] = setTimeout(() => {
                    setActiveUploads(prev => { const newState = { ...prev }; delete newState[fileId]; return newState; });
                    delete activeTimeouts[fileId];
                }, 5000);
            } else if (!isFinished && activeTimeouts[fileId]) {
                clearTimeout(activeTimeouts[fileId]);
                delete activeTimeouts[fileId];
            }
        });
        return () => Object.values(activeTimeouts).forEach(clearTimeout);
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
            } else {
                setAuthError(data.error || 'Authentication failed.');
                setAuthenticatedSession(false);
            }
        } catch (err) {
            setAuthError('Network error or server unreachable.');
            setAuthenticatedSession(false);
        }
        setAuthLoading(false);
    };

    const handleLogout = () => {
        setAuthenticatedSession(false);
        setVaultNumberInput('');
        setPasscodeInput('');
    };

    const navigateToFolder = (path) => {
        if (['Trash', 'Recent', 'Starred'].includes(path)) {
            addLog(`Navigation to system folder "${path}" is not yet implemented.`);
            setItems([]);
            setCurrentPath(path);
            setBreadcrumbs([{ name: 'My Drive', path: '' }, { name: path, path: path }]);
            return;
        }
        setSearchTerm('');
        setFetchPath(path);
    };

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e) => {
        e.preventDefault(); e.stopPropagation(); setDragActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) files.forEach(upload);
    };
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) files.forEach(upload);
        e.target.value = '';
    };

    const upload = useCallback((file) => {
        const fileId = `${file.name}-${Date.now()}`;
        setActiveUploads(prev => ({ ...prev, [fileId]: { name: file.name, progress: 0, speed: 0, status: 'pending' } }));
        const formData = new FormData();
        formData.append('file', file);
        if (currentPath) formData.append('folderPath', currentPath);

        const xhr = new XMLHttpRequest();
        uploadXHRs.current[fileId] = xhr;
        let lastLoaded = 0, lastTime = Date.now();

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                const speed = (e.loaded - lastLoaded) / ((Date.now() - lastTime) / 1000);
                lastLoaded = e.loaded; lastTime = Date.now();
                setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], progress, speed, status: 'uploading' } }));
            }
        };
        xhr.onload = () => {
            try {
                if (xhr.status === 200) {
                    const res = JSON.parse(xhr.responseText);
                    if (res.success) {
                        setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'completed' } }));
                        setFetchTrigger(t => t + 1);
                    } else throw new Error(res.error);
                } else throw new Error(`Server error: ${xhr.status}`);
            } catch (err) {
                setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'failed', message: err.message } }));
            }
        };
        xhr.onerror = () => setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'failed', message: 'Network error' } }));
        xhr.onabort = () => setActiveUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], status: 'aborted' } }));

        xhr.open('POST', `${BACKEND_URL}/upload`);
        xhr.setRequestHeader('Authorization', getAuthHeaders().Authorization || '');
        xhr.send(formData);
    }, [currentPath, getAuthHeaders]);

    const viewItemProperties = useCallback(async (item) => {
        try {
            const res = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(item.path)}/properties`, { headers: getAuthHeaders() });
            if (!res.ok) throw new Error((await res.json()).error);
            const properties = await res.json();
            setSelectedItem({ ...properties, sizeFormatted: formatFileSize(properties.size) });
            setShowProperties(true);
        } catch (error) {
            addLog('Failed to get item properties: ' + error.message);
        }
    }, [getAuthHeaders]);

    const handleDownload = useCallback(async (e, item) => {
        e.stopPropagation();
        if (!item.path) return;
        try {
            const res = await fetch(`${BACKEND_URL}/f/${encodeURIComponent(item.path)}`, { headers: getAuthHeaders() });
            if (!res.ok) throw new Error(`Server responded with ${res.status}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = item.name;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            addLog(`Download failed: ${err.message}`);
        }
    }, [getAuthHeaders]);

    const deleteItem = useCallback(async (item) => {
        if (!item || !window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(item.path)}${item.isFolder ? '/' : ''}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (!res.ok) throw new Error((await res.json()).error);
            setFetchTrigger(t => t + 1);
        } catch (error) {
            addLog(`Failed to delete: ${error.message}`);
        }
    }, [getAuthHeaders]);

    const renameItem = useCallback(async (itemToRename) => {
        if (!newItemName.trim() || newItemName.trim() === itemToRename.name) return;
        try {
            const res = await fetch(`${BACKEND_URL}/file/${encodeURIComponent(itemToRename.path)}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ newName: newItemName.trim(), isFolder: itemToRename.isFolder })
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setRenamingItem(null); setNewItemName(''); setShowProperties(false);
            setFetchTrigger(t => t + 1);
        } catch (error) {
            addLog('Failed to rename: ' + error.message);
        }
    }, [getAuthHeaders, newItemName]);

    const createFolder = useCallback(async () => {
        const folderName = prompt('Enter new folder name:');
        if (!folderName || !folderName.trim()) return;
        try {
            const path = currentPath ? `${currentPath}/${folderName.trim()}` : folderName.trim();
            const res = await fetch(`${BACKEND_URL}/folder`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ path })
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setFetchTrigger(t => t + 1);
        } catch (error) {
            addLog('Failed to create folder: ' + error.message);
        }
    }, [currentPath, getAuthHeaders]);

    const openVideoModal = (item) => {
        if (!item.path) return;
        setVideoModal({ open: true, item, url: `${BACKEND_URL}/stream/${encodeURIComponent(item.path)}` });
    };
    const closeVideoModal = () => {
        if (videoRef.current) videoRef.current.pause();
        setVideoModal({ open: false, item: null, url: '' });
    };
    const togglePlay = () => videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause();
    const handleSeek = (e) => { if (videoRef.current) videoRef.current.currentTime = e.target.value; };
    const toggleFullscreen = () => {
        const modal = document.getElementById('video-modal');
        if (!document.fullscreenElement) modal?.requestFullscreen().catch(err => console.error(err));
        else document.exitFullscreen();
    };
    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const date = new Date(seconds * 1000);
        const hh = date.getUTCHours();
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds().toString().padStart(2, '0');
        return hh > 0 ? `${hh}:${mm.toString().padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
    };

    const getFileIcon = (item) => {
        if (item.isFolder) return <Folder className="w-full h-full" />;
        if (isImageFile(item.name)) return <FileImage className="w-full h-full" />;
        if (isVideoFile(item.name)) return <FileVideo className="w-full h-full" />;
        if (isAudioFile(item.name)) return <FileMusic className="w-full h-full" />;
        if (isSpreadsheetFile(item.name)) return <FileSpreadsheet className="w-full h-full" />;
        if (isCodeFile(item.name) || isHtmlFile(item.name)) return <FileCode className="w-full h-full" />;
        if (isArchiveFile(item.name)) return <FileArchive className="w-full h-full" />;
        if (isPdfFile(item.name)) return <FileText className="w-full h-full text-red-400" />;
        return <FileText className="w-full h-full" />;
    };

    const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

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
        if (hoveredItem?.path === item.path || activePreviewRequest.current === item.path) {
            return;
        }

        clearTimeout(previewTimeoutRef.current);
        if (item.isFolder) { setHoveredItem(null); return; }

        const targetElement = e.currentTarget;
        previewTimeoutRef.current = setTimeout(() => {
            if (!document.body.contains(targetElement)) return;
            const rect = targetElement.getBoundingClientRect();
            setPreviewCoords({ x: rect.right + 10, y: rect.top });
            setHoveredItem(item);
        }, 500);
    };

    const handleMouseLeaveItem = () => {
        clearTimeout(previewTimeoutRef.current);
        setHoveredItem(null);
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
                else if (isVideoFile(item.name)) openVideoModal(item);
                else viewItemProperties(item);
                break;
            case 'download': handleDownload(event, item); break;
            case 'properties': viewItemProperties(item); break;
            case 'rename':
                setRenamingItem(item);
                setNewItemName(item.name);
                if (!showProperties || selectedItem?.path !== item.path) viewItemProperties(item);
                break;
            case 'delete': deleteItem(item); break;
            default: break;
        }
    };

    const AuthScreen = () => (
        <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-white font-sans">
            <div className="w-full max-w-sm p-8 space-y-6 bg-[#111111] border border-[#222] rounded-lg shadow-2xl">
                <div className="text-center">
                    <Key className="w-10 h-10 mx-auto mb-4 text-gray-400" />
                    <h1 className="text-2xl font-semibold">Secure Vault</h1>
                    <p className="text-sm text-gray-500">Enter your credentials to continue</p>
                </div>
                {authError && <div className="p-3 text-center text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded-md">{authError}</div>}
                <div className="space-y-4">
                    <input type="text" placeholder="Vault Number" value={vaultNumberInput} onChange={(e) => setVaultNumberInput(e.target.value)} className="w-full px-4 py-2 bg-[#0a0a0a] border border-[#333] rounded-md placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white transition" />
                    <input type="password" placeholder="Passcode" value={passcodeInput} onChange={(e) => setPasscodeInput(e.target.value)} className="w-full px-4 py-2 bg-[#0a0a0a] border border-[#333] rounded-md placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white transition" />
                </div>
                <div className="space-y-3">
                    <button onClick={() => handleAuth('login')} className="w-full py-2 font-semibold text-black bg-white rounded-md hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#111]">{authLoading ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : "Unlock"}</button>
                    <button onClick={() => handleAuth('register')} className="w-full py-2 font-semibold text-gray-300 bg-transparent border border-[#333] rounded-md hover:bg-[#222] hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#111]">{authLoading ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : "Create New Vault"}</button>
                </div>
            </div>
        </div>
    );

    const ItemCard = ({ item }) => (
        <div className="group relative flex flex-col bg-[#111111] border border-[#222] rounded-lg p-3 cursor-pointer transition-all duration-200 hover:bg-[#1a1a1a] hover:border-[#444] hover:shadow-lg"
            onClick={() => handleItemAction('open', item)} onContextMenu={(e) => handleContextMenu(e, item)} onMouseEnter={(e) => handleMouseEnterItem(e, item)} onMouseLeave={handleMouseLeaveItem}>
            <div className="flex-grow flex items-center justify-center mb-3"><div className="w-16 h-16 text-gray-400">{getFileIcon(item)}</div></div>
            <div className="text-center">
                <p className="text-sm font-medium text-white w-full truncate" title={item.name}>{item.name}</p>
                {!item.isFolder && <p className="text-xs text-gray-500">{formatFileSize(item.size)}</p>}
            </div>
            <button onClick={(e) => handleContextMenu(e, item)} className="absolute top-2 right-2 p-1.5 text-gray-500 rounded-full hover:bg-[#333] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-4 h-4" /></button>
        </div>
    );

    const ItemRow = ({ item }) => (
        <tr className="group border-b border-[#222] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
            onClick={() => handleItemAction('open', item)} onContextMenu={(e) => handleContextMenu(e, item)} onMouseEnter={(e) => handleMouseEnterItem(e, item)} onMouseLeave={handleMouseLeaveItem}>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-white font-medium"><div className="flex items-center"><div className="flex-shrink-0 h-5 w-5 mr-3 text-gray-400">{getFileIcon(item)}</div><span className="truncate max-w-xs">{item.name}</span></div></td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400">{item.modified ? new Date(item.modified).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400">{item.isFolder ? 'Folder' : (item.name.split('.').pop() || 'File').toUpperCase()}</td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-400 text-right">{item.isFolder ? '—' : formatFileSize(item.size)}</td>
            <td className="px-6 py-3 text-right"><button onClick={(e) => handleContextMenu(e, item)} className="p-1.5 text-gray-500 rounded-full hover:bg-[#333] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-4 h-4" /></button></td>
        </tr>
    );

    const AppLayout = () => (
        <div className="flex h-screen bg-[#0a0a0a] text-white font-sans">
            <aside className="w-64 flex-shrink-0 bg-[#111111] border-r border-[#222] flex flex-col p-4">
                <div className="flex items-center space-x-2 mb-8"><div className="p-2 bg-white rounded-md"><Cloud className="w-5 h-5 text-black" /></div><h1 className="text-xl font-bold">DataVault</h1></div>
                <div className="relative mb-6">
                    <button ref={newButtonRef} onClick={toggleNewMenu} className="flex items-center justify-center w-full space-x-2 px-4 py-2 bg-white text-black rounded-md font-semibold hover:bg-gray-200 transition"><Plus className="w-5 h-5" /><span>New</span></button>
                    {showNewMenu && (<div className="absolute left-0 mt-2 w-full bg-[#222] rounded-md shadow-2xl border border-[#333] z-20 new-menu-dropdown">
                        <button onClick={() => { document.getElementById('file-input').click(); setShowNewMenu(false); }} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-200 hover:bg-[#333]"><Upload className="w-4 h-4 mr-3" /> File Upload</button>
                        <button onClick={() => { createFolder(); setShowNewMenu(false); }} className="flex items-center w-full px-4 py-2.5 text-sm text-gray-200 hover:bg-[#333]"><Folder className="w-4 h-4 mr-3" /> New Folder</button>
                    </div>)}
                </div>
                <input id="file-input" type="file" className="hidden" onChange={handleFileSelect} disabled={isAnyUploading} multiple />
                <nav className="space-y-1 flex-grow">
                    {[{ name: 'My Drive', icon: Home, path: '' }, { name: 'Starred', icon: Star, path: 'Starred' }, { name: 'Recent', icon: Clock, path: 'Recent' }, { name: 'Trash', icon: Trash2, path: 'Trash' }].map(navItem => (
                        <button key={navItem.name} onClick={() => navigateToFolder(navItem.path)} className={`flex items-center w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentPath === navItem.path ? 'bg-[#222] text-white' : 'text-gray-400 hover:bg-[#222] hover:text-white'}`}><navItem.icon className="w-5 h-5 mr-3" /><span>{navItem.name}</span></button>
                    ))}
                </nav>
                <div className="mt-auto"><button onClick={handleLogout} className="flex items-center w-full px-3 py-2 rounded-md text-sm font-medium text-gray-400 hover:bg-[#222] hover:text-white transition-colors"><LogOut className="w-5 h-5 mr-3" /><span>Logout & Switch Vault</span></button></div>
            </aside>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex-shrink-0 h-20 flex items-center justify-between px-8 border-b border-[#222]">
                    <nav className="flex items-center text-sm">
                        {breadcrumbs.map((crumb, index) => (<React.Fragment key={crumb.path}>
                            <button onClick={() => navigateToFolder(crumb.path)} className={`px-2 py-1 rounded-md transition-colors ${index === breadcrumbs.length - 1 ? 'font-semibold text-white' : 'text-gray-500 hover:text-white'}`}>{crumb.name}</button>
                            {index < breadcrumbs.length - 1 && <ChevronRight className="w-4 h-4 text-gray-600 mx-1" />}
                        </React.Fragment>))}
                    </nav>
                    <div className="flex items-center space-x-4">
                        <div className="relative w-72"><Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-[#111] border border-[#222] rounded-md text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-white/50" /></div>
                        <div className="flex items-center bg-[#111] border border-[#222] rounded-md p-0.5">
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-[#333]' : 'text-gray-500 hover:text-white'}`}><Grid className="w-5 h-5" /></button>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-[#333]' : 'text-gray-500 hover:text-white'}`}><List className="w-5 h-5" /></button>
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-8" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
                    {dragActive && (<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center pointer-events-none"><div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-white rounded-2xl"><Upload className="w-16 h-16 text-white mb-4" /><p className="text-xl font-semibold">Drop files to upload</p></div></div>)}
                    {Object.keys(activeUploads).length > 0 && <UploadStatusPanel />}
                    {filteredItems.length === 0 ? (<div className="text-center py-20 flex flex-col items-center justify-center text-gray-500"><FolderOpen className="w-20 h-20 mb-4 text-gray-800" /><h3 className="text-xl font-medium text-gray-400">This folder is empty</h3><p className="text-gray-600">Drop files here or use the 'New' button to upload.</p></div>
                    ) : viewMode === 'grid' ? (<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">{filteredItems.map(item => <ItemCard key={item.path} item={item} />)}</div>
                    ) : (<table className="min-w-full">
                        <thead><tr className="border-b border-[#222]"><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Modified</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th><th className="relative px-6 py-3"><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>{filteredItems.map(item => <ItemRow key={item.path} item={item} />)}</tbody>
                    </table>)}
                </main>
            </div>
            {contextMenu.visible && <ContextMenu />}
            {showProperties && <PropertiesModal />}
            {videoModal.open && <VideoPlayerModal />}
            {hoveredItem && <FilePreview item={hoveredItem} x={previewCoords.x} y={previewCoords.y} activePreviewRequest={activePreviewRequest} />}
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
                <div className="w-full bg-[#222] rounded-full h-1.5"><div className="h-1.5 bg-white rounded-full transition-all duration-300" style={{ width: `${overallProgress}%` }} /></div>
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
                <button key={index} onClick={(e) => handleItemAction(menuItem.action, selectedItem, e)} className={`flex items-center w-full px-3 py-2 text-sm transition-colors ${menuItem.isDestructive ? 'text-red-400 hover:bg-red-900/40' : 'text-gray-200 hover:bg-[#333]'}`}><menuItem.icon className="w-4 h-4 mr-3" />{menuItem.label}</button>
            ))}
        </div>
    );

    const PropertiesModal = () => (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={() => setShowProperties(false)}>
            <div className="w-full max-w-md bg-[#111111] border border-[#222] rounded-lg shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4"><h2 className="text-xl font-semibold">Properties</h2><button onClick={() => setShowProperties(false)} className="p-1 rounded-full text-gray-500 hover:bg-[#333] hover:text-white"><X className="w-5 h-5" /></button></div>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center"><span className="text-gray-400">Name</span><span className="text-white font-medium truncate max-w-[60%]">{selectedItem.name}</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-400">Type</span><span className="text-white font-medium">{selectedItem.isFolder ? 'Folder' : 'File'}</span></div>
                    {!selectedItem.isFolder && <div className="flex justify-between items-center"><span className="text-gray-400">Size</span><span className="text-white font-medium">{selectedItem.sizeFormatted}</span></div>}
                    <div className="flex justify-between items-center"><span className="text-gray-400">Created</span><span className="text-white font-medium">{selectedItem.created ? new Date(selectedItem.created).toLocaleString() : 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-400">Modified</span><span className="text-white font-medium">{selectedItem.lastModified ? new Date(selectedItem.lastModified).toLocaleString() : 'N/A'}</span></div>
                </div>
                {renamingItem && renamingItem.path === selectedItem.path && (<div className="mt-6 pt-4 border-t border-[#222]">
                    <p className="text-sm font-medium mb-2">Rename Item</p>
                    <div className="flex items-center space-x-2">
                        <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="flex-1 bg-[#0a0a0a] border border-[#333] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50" />
                        <button onClick={() => renameItem(selectedItem)} className="px-3 py-1.5 bg-white text-black text-sm font-semibold rounded-md hover:bg-gray-200">Save</button>
                        <button onClick={() => setRenamingItem(null)} className="px-3 py-1.5 bg-[#333] text-white text-sm font-semibold rounded-md hover:bg-[#444]">Cancel</button>
                    </div>
                </div>)}
            </div>
        </div>
    );

    const FilePreview = ({ item, x, y, activePreviewRequest }) => {
        if (!item) return null;

        const [isLoading, setIsLoading] = useState(true);
        const [previewData, setPreviewData] = useState(null);
        const [objectUrl, setObjectUrl] = useState(null);

        useEffect(() => {
            setIsLoading(true);
            setObjectUrl(null);
            activePreviewRequest.current = item.path;
            const controller = new AbortController();

            const fetchPreview = async () => {
                try {
                    const metaResponse = await fetch(`${BACKEND_URL}/preview/${encodeURIComponent(item.path)}`, {
                        headers: getAuthHeaders(), signal: controller.signal
                    });
                    if (!metaResponse.ok) throw new Error('Could not get preview metadata');
                    const metaData = await metaResponse.json();
                    setPreviewData(metaData);

                    if (metaData.type === 'url') {
                        const contentResponse = await fetch(`${BACKEND_URL}${metaData.url}`, {
                            headers: getAuthHeaders(), signal: controller.signal
                        });
                        if (!contentResponse.ok) throw new Error('Could not fetch preview content');
                        const blob = await contentResponse.blob();
                        const objUrl = URL.createObjectURL(blob);
                        setObjectUrl(objUrl);
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') setPreviewData({ type: 'error', message: 'Preview unavailable' });
                } finally {
                    if (!controller.signal.aborted) {
                        setIsLoading(false);
                        activePreviewRequest.current = null;
                    }
                }
            };

            fetchPreview();

            return () => {
                controller.abort();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                activePreviewRequest.current = null;
            };
        }, [item, getAuthHeaders, activePreviewRequest]);

        const renderContent = () => {
            if (isLoading) return <Loader2 className="w-8 h-8 animate-spin text-white/50" />;
            if (!previewData || previewData.type === 'error' || previewData.type === 'none') return <div className="text-center text-gray-500"><Info className="w-6 h-6 mx-auto mb-2" /><p className="text-sm">{previewData?.message || 'No preview'}</p></div>;
            if (previewData.type === 'url' && objectUrl) {
                if (isImageFile(item.name)) return <img src={objectUrl} alt={item.name} className="w-full h-full object-contain" />;
                if (isVideoFile(item.name)) {
                    return (
                        <div className="w-full h-full flex items-center justify-center bg-black">
                            <video src={objectUrl} className="w-full h-full object-contain" muted playsInline />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                <Play className="w-12 h-12 text-white/70" />
                            </div>
                        </div>
                    );
                }
                if (isPdfFile(item.name) || isHtmlFile(item.name)) return <iframe src={objectUrl} title={`${item.name} preview`} className="w-full h-full border-0 bg-white" sandbox="allow-scripts allow-same-origin" />;
            }
            if (previewData.type === 'text') return <pre className="w-full h-full text-xs text-gray-300 overflow-auto p-2 whitespace-pre-wrap break-all">{previewData.content}</pre>;
            return <div className="text-center text-gray-500"><Info className="w-6 h-6 mx-auto mb-2" /><p className="text-sm">Preview not supported</p></div>;
        };

        return (
            <div className="fixed z-50 bg-[#1a1a1a] rounded-lg shadow-xl border border-[#333] p-2 animate-fadeIn" style={{ left: x, top: y, width: '300px', height: '250px' }}>
                <div className="w-full h-[calc(100%-30px)] flex items-center justify-center overflow-hidden rounded-md relative mb-1 bg-[#111]">{renderContent()}</div>
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
                    autoPlay controls
                />
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
