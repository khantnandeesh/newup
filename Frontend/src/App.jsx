import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';

// Assumed Tailwind CSS is available in the environment.
// For a standalone HTML file, you would include the script tag:
// <script src="https://cdn.tailwindcss.com"></script>

const API_BASE_URL = 'https://newup-4g3z.onrender.com'; // Match your backend port and URL
axios.defaults.baseURL = API_BASE_URL;

// Helper function to get the authentication token
const getToken = () => localStorage.getItem('token');

// Axios interceptor to add the authorization header to every request
axios.interceptors.request.use(config => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, error => {
  return Promise.reject(error);
});

// A simple Modal for showing messages
const MessageBox = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
  return (
    <div className={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg text-white ${bgColor}`}>
      {message}
    </div>
  );
};

// Icon components for files and folders
const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0015.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const ImageFileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const VideoFileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const App = () => {
  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isMessageBoxVisible, setIsMessageBoxVisible] = useState(false);
  const [messageBoxContent, setMessageBoxContent] = useState('');
  const [messageBoxType, setMessageBoxType] = useState('success');
  const [isLoggedIn, setIsLoggedIn] = useState(!!getToken());
  const [vaultNumber, setVaultNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewContent, setPreviewContent] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);


  const showMessageBox = (content, type = 'success') => {
    setMessageBoxContent(content);
    setMessageBoxType(type);
    setIsMessageBoxVisible(true);
  };

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/list', {
        params: { prefix: currentPath }
      });
      setItems(response.data.items);
      setCurrentPath(response.data.currentPath);
      setParentPath(response.data.parentPath);
    } catch (error) {
      console.error('Error fetching files:', error);
      showMessageBox('Failed to fetch files.', 'error');
      // If token is invalid, log out
      if (error.response?.status === 401 || error.response?.status === 403) {
        handleLogout();
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchFiles();
    }
  }, [isLoggedIn, fetchFiles]);

  const handleAuth = async (isRegister) => {
    try {
      const endpoint = isRegister ? '/vault/register' : '/vault/login';
      const response = await axios.post(endpoint, { vaultNumber, passcode });
      localStorage.setItem('token', response.data.token);
      setIsLoggedIn(true);
      showMessageBox(response.data.message);
    } catch (error) {
      console.error('Authentication error:', error);
      showMessageBox(error.response?.data?.error || 'Authentication failed.', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setVaultNumber('');
    setPasscode('');
    setCurrentPath('');
    setParentPath(null);
    setItems([]);
  };

  const handleUpload = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    setIsUploading(true);
    const fileToUpload = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('folderPath', currentPath);

    try {
      await axios.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      showMessageBox('File uploaded successfully!');
      fetchFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
      showMessageBox('Failed to upload file.', 'error');
    } finally {
      setIsUploading(false);
    }
  }, [currentPath, fetchFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: handleUpload });

  const handleCreateFolder = async () => {
    const folderName = window.prompt('Enter folder name:');
    if (folderName) {
      try {
        await axios.post('/folder', { path: `${currentPath}/${folderName}` });
        showMessageBox('Folder created successfully!');
        fetchFiles();
      } catch (error) {
        console.error('Error creating folder:', error);
        showMessageBox(error.response?.data?.error || 'Failed to create folder.', 'error');
      }
    }
  };

  const handleNavigation = (path) => {
    setCurrentPath(path);
  };
  
  const handleItemClick = (item) => {
    if (item.isFolder) {
      handleNavigation(item.path.split('/').slice(0, -1).join('/'));
    } else {
      setSelectedFile(item);
      fetchPreview(item);
    }
  };

  const handleDelete = async (item) => {
    if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      try {
        await axios.delete(`/file/${encodeURIComponent(item.path)}`);
        showMessageBox('Item deleted successfully!');
        fetchFiles();
      } catch (error) {
        console.error('Error deleting item:', error);
        showMessageBox(error.response?.data?.error || 'Failed to delete item.', 'error');
      }
    }
  };
  
  const handleRename = async (item) => {
    const newName = window.prompt(`Rename "${item.name}" to:`, item.name);
    if (newName && newName !== item.name) {
      try {
        await axios.put(`/file/${encodeURIComponent(item.path)}/rename`, { newName, isFolder: item.isFolder });
        showMessageBox('Item renamed successfully!');
        fetchFiles();
      } catch (error) {
        console.error('Error renaming item:', error);
        showMessageBox(error.response?.data?.error || 'Failed to rename item.', 'error');
      }
    }
  };

  // UPDATED: This function now uses axios to download the file with the auth token.
  const handleDownload = async (item) => {
    try {
      const response = await axios.get(`/f/${encodeURIComponent(item.path)}`, {
        responseType: 'blob' // Important: treat the response as a binary blob
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', item.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      showMessageBox('Download started!');
    } catch (error) {
      console.error('Error downloading file:', error);
      showMessageBox('Failed to download file.', 'error');
    }
  };
  
  const fetchPreview = async (item) => {
    try {
      const response = await axios.get(`/preview/${encodeURIComponent(item.path)}`);
      setPreviewContent(response.data);
    } catch (error) {
      console.error('Error fetching preview:', error);
      setPreviewContent({ type: 'error', message: error.response?.data?.error || 'Failed to load preview.' });
    }
  };

  // Drag and drop logic
  const handleDragStart = (e, item) => {
    e.dataTransfer.setData('source', JSON.stringify(item));
  };

  const handleDragOver = (e, targetItem) => {
    e.preventDefault();
    if (targetItem?.isFolder && targetItem.path !== dragOverItem) {
      setDragOverItem(targetItem.path);
    } else if (!targetItem?.isFolder && dragOverItem) {
      setDragOverItem(null);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };
  
  const handleDrop = async (e, targetItem) => {
    e.preventDefault();
    setDragOverItem(null);

    const sourceItem = JSON.parse(e.dataTransfer.getData('source'));
    
    let newParentPath = targetItem?.isFolder ? targetItem.path : currentPath;
    let oldKey = sourceItem.path;
    let newKey = `${newParentPath}/${sourceItem.name}`;
    if (sourceItem.isFolder) {
      // Append a slash to the folder keys
      oldKey = oldKey.endsWith('/') ? oldKey : oldKey + '/';
      newKey = newKey.endsWith('/') ? newKey : newKey + '/';
    }

    // Prevent moving an item into itself or its direct parent
    if (newKey === oldKey || newKey.startsWith(oldKey)) {
      showMessageBox('Cannot move an item into itself or a subdirectory.', 'error');
      return;
    }

    try {
      const response = await axios.put(`/file/${encodeURIComponent(oldKey)}/rename`, {
        newName: newKey.split('/').pop().replace('/', ''),
        isFolder: sourceItem.isFolder
      });
      showMessageBox('Item moved successfully!');
      fetchFiles();
    } catch (error) {
      console.error('Error moving item:', error);
      showMessageBox(error.response?.data?.error || 'Failed to move item.', 'error');
    }
  };

  // Auth UI
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold text-center mb-6">{isRegistering ? 'Register a New Vault' : 'Login to Your Vault'}</h2>
          <form onSubmit={(e) => { e.preventDefault(); handleAuth(isRegistering); }}>
            <div className="mb-4">
              <label className="block text-gray-700 mb-2">Vault Number</label>
              <input
                type="text"
                value={vaultNumber}
                onChange={(e) => setVaultNumber(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 mb-2">Passcode</label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition-colors"
            >
              {isRegistering ? 'Register Vault' : 'Login'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-blue-500 hover:underline"
            >
              {isRegistering ? 'Already have a vault? Login here.' : 'Need to create a new vault? Register here.'}
            </button>
          </div>
        </div>
        {isMessageBoxVisible && <MessageBox message={messageBoxContent} type={messageBoxType} onClose={() => setIsMessageBoxVisible(false)} />}
      </div>
    );
  }

  // Main App UI
  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      {isMessageBoxVisible && <MessageBox message={messageBoxContent} type={messageBoxType} onClose={() => setIsMessageBoxVisible(false)} />}

      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
          <h1 className="text-3xl font-bold text-gray-800">My Storj Vault</h1>
          <div className="flex space-x-4">
            <button
              onClick={handleCreateFolder}
              className="px-4 py-2 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600 transition duration-200"
            >
              Create Folder
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white rounded-md shadow-md hover:bg-red-600 transition duration-200"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="flex items-center mt-4 space-x-2 text-gray-500">
          <button onClick={() => setCurrentPath('')} className="hover:text-blue-500">
            Home
          </button>
          {currentPath.split('/').filter(Boolean).map((part, index, arr) => (
            <React.Fragment key={index}>
              <span>/</span>
              <button
                onClick={() => handleNavigation(arr.slice(0, index + 1).join('/'))}
                className={`hover:text-blue-500 ${index === arr.length - 1 ? 'font-bold text-blue-600' : ''}`}
              >
                {part}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* File and Folder Explorer */}
        <div 
          className="bg-white p-6 rounded-lg shadow-md lg:col-span-2 min-h-[70vh] relative"
          onDrop={(e) => handleDrop(e, null)}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={handleDragLeave}
        >
          {isDragActive && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-green-200 bg-opacity-75 text-green-800 rounded-md text-2xl font-bold">
              Drop file here
            </div>
          )}
          <div {...getRootProps({ className: "w-full" })}>
            <input {...getInputProps()} />
            <div className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:bg-gray-50 transition mb-4">
              <p className="text-gray-500">Drag 'n' drop files here, or click to select files</p>
            </div>
          </div>
          
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-center text-gray-500">Loading files...</p>
            ) : items.length === 0 ? (
              <p className="text-center text-gray-500 py-8">This folder is empty.</p>
            ) : (
              items.map(item => (
                <div
                  key={item.path}
                  className={`flex items-center justify-between p-4 bg-gray-50 rounded-lg shadow-sm cursor-pointer hover:bg-gray-100 transition duration-150 border-2 ${dragOverItem === item.path ? 'border-blue-500' : 'border-transparent'}`}
                  onClick={() => handleItemClick(item)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  onDragOver={(e) => handleDragOver(e, item)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, item)}
                >
                  <div className="flex items-center space-x-3 truncate">
                    {item.isFolder ? <FolderIcon /> : item.isImage ? <ImageFileIcon /> : item.isVideo ? <VideoFileIcon /> : <FileIcon />}
                    <span className="text-gray-800 font-medium truncate">{item.name}</span>
                  </div>
                  <div className="flex-shrink-0 flex space-x-2">
                    {!item.isFolder && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                          className="p-1 text-gray-400 hover:text-blue-500 transition duration-150"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRename(item); }}
                        className="p-1 text-gray-400 hover:text-yellow-500 transition duration-150"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                        className="p-1 text-gray-400 hover:text-red-500 transition duration-150"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.035 21H7.965a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Preview Pane */}
        <div className="bg-white p-6 rounded-lg shadow-md lg:col-span-1">
          <h3 className="text-xl font-bold text-gray-800 mb-4">File Preview</h3>
          {selectedFile ? (
            <div className="space-y-4">
              <p className="font-semibold text-lg">{selectedFile.name}</p>
              {previewContent?.type === 'url' && selectedFile.isImage && (
                <img src={`${API_BASE_URL}${previewContent.url}`} alt="File preview" className="max-w-full h-auto rounded-md shadow-sm" />
              )}
              {previewContent?.type === 'url' && selectedFile.isVideo && (
                <video controls className="w-full rounded-md shadow-sm">
                  <source src={`${API_BASE_URL}/stream/${encodeURIComponent(selectedFile.path)}`} />
                  Your browser does not support the video tag.
                </video>
              )}
              {previewContent?.type === 'url' && selectedFile.isDocument && selectedFile.name.toLowerCase().endsWith('.pdf') && (
                <iframe src={`${API_BASE_URL}${previewContent.url}`} className="w-full h-96 rounded-md shadow-sm"></iframe>
              )}
              {previewContent?.type === 'text' && (
                <pre className="p-4 bg-gray-100 rounded-md text-sm whitespace-pre-wrap overflow-auto h-96">{previewContent.content}</pre>
              )}
              {(previewContent?.type === 'none' || previewContent?.type === 'error') && (
                <p className="text-gray-500">{previewContent.message || 'Preview not available.'}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Select a file to see a preview.
            </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;
