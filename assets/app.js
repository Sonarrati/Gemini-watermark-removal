/* ============================================
   Gemini Watermark Remove — Shared Application JS
   Handles: theme toggle, mobile nav, file upload,
   IndexedDB storage, navigation
   ============================================ */

(function () {
  'use strict';

  // ============================================
  // Theme Management
  // ============================================

  /**
   * Get the current theme from localStorage or default to 'light'
   */
  function getTheme() {
    try {
      return localStorage.getItem('gwr-theme') || 'light';
    } catch (e) {
      return 'light';
    }
  }

  /**
   * Set the theme in localStorage and update the DOM
   */
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('gwr-theme', theme);
    } catch (e) {
      // localStorage may be unavailable
    }
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current === 'light' ? 'dark' : 'light');
  }

  /**
   * Initialize theme from localStorage
   */
  function initTheme() {
    setTheme(getTheme());
  }

  /**
   * Attach theme toggle event listeners
   */
  function initThemeToggles() {
    const desktopToggle = document.getElementById('desktop-theme-toggle');
    const mobileToggle = document.getElementById('mobile-theme-toggle');
    const editorToggle = document.getElementById('editor-theme-toggle');

    if (desktopToggle) {
      desktopToggle.addEventListener('click', toggleTheme);
    }
    if (mobileToggle) {
      mobileToggle.addEventListener('click', toggleTheme);
    }
    if (editorToggle) {
      editorToggle.addEventListener('click', toggleTheme);
    }
  }

  // ============================================
  // Mobile Navigation
  // ============================================

  /**
   * Initialize hamburger menu
   */
  function initMobileNav() {
    const hamburger = document.getElementById('hamburger-btn');
    const mobileNav = document.getElementById('mobile-nav');

    if (!hamburger || !mobileNav) return;

    hamburger.addEventListener('click', function () {
      const isOpen = mobileNav.classList.contains('open');
      mobileNav.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(!isOpen));
    });

    // Close menu after navigation
    mobileNav.querySelectorAll('a, button').forEach(function (el) {
      el.addEventListener('click', function () {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });

    // Close menu on outside click
    document.addEventListener('click', function (e) {
      if (!mobileNav.contains(e.target) && !hamburger.contains(e.target)) {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });

    // Close menu on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ============================================
  // IndexedDB Helper
  // ============================================

  const DB_NAME = 'gwr-media-storage';
  const DB_VERSION = 1;
  const STORE_NAME = 'media-files';

  /**
   * Open the IndexedDB database
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = function (e) {
        resolve(e.target.result);
      };

      request.onerror = function (e) {
        reject(new Error('IndexedDB error: ' + e.target.error));
      };
    });
  }

  /**
   * Store a file in IndexedDB
   * @param {string} id - Unique identifier
   * @param {Blob|File} blob - The file data
   * @param {object} metadata - File metadata
   * @returns {Promise<void>}
   */
  function storeFile(id, blob, metadata) {
    return new Promise(function (resolve, reject) {
      openDB().then(function (db) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put({
          id: id,
          blob: blob,
          metadata: metadata,
          timestamp: Date.now()
        });
        transaction.oncomplete = function () {
          db.close();
          resolve();
        };
        transaction.onerror = function (e) {
          db.close();
          reject(new Error('Failed to store file: ' + e.target.error));
        };
      }).catch(reject);
    });
  }

  /**
   * Retrieve a file from IndexedDB
   * @param {string} id - Unique identifier
   * @returns {Promise<{blob: Blob, metadata: object}>}
   */
  function retrieveFile(id) {
    return new Promise(function (resolve, reject) {
      openDB().then(function (db) {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = function () {
          db.close();
          if (request.result) {
            resolve(request.result);
          } else {
            reject(new Error('File not found in storage'));
          }
        };
        request.onerror = function (e) {
          db.close();
          reject(new Error('Failed to retrieve file: ' + e.target.error));
        };
      }).catch(reject);
    });
  }

  /**
   * Delete a file from IndexedDB
   * @param {string} id - Unique identifier
   * @returns {Promise<void>}
   */
  function deleteFile(id) {
    return new Promise(function (resolve, reject) {
      openDB().then(function (db) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
        transaction.oncomplete = function () {
          db.close();
          resolve();
        };
        transaction.onerror = function (e) {
          db.close();
          reject(new Error('Failed to delete file: ' + e.target.error));
        };
      }).catch(reject);
    });
  }

  /**
   * Clear all stored files
   * @returns {Promise<void>}
   */
  function clearAllFiles() {
    return new Promise(function (resolve, reject) {
      openDB().then(function (db) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        transaction.oncomplete = function () {
          db.close();
          resolve();
        };
        transaction.onerror = function (e) {
          db.close();
          reject(new Error('Failed to clear files: ' + e.target.error));
        };
      }).catch(reject);
    });
  }

  // ============================================
  // File Validation
  // ============================================

  const IMAGE_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
  const VIDEO_FORMATS = ['video/mp4', 'video/webm', 'video/quicktime'];
  const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

  /**
   * Check if a file is a supported image
   * @param {File} file
   * @returns {boolean}
   */
  function isImageFile(file) {
    return IMAGE_FORMATS.includes(file.type) ||
      IMAGE_EXTENSIONS.some(function (ext) {
        return file.name.toLowerCase().endsWith(ext);
      });
  }

  /**
   * Check if a file is a supported video
   * @param {File} file
   * @returns {boolean}
   */
  function isVideoFile(file) {
    return VIDEO_FORMATS.includes(file.type) ||
      VIDEO_EXTENSIONS.some(function (ext) {
        return file.name.toLowerCase().endsWith(ext);
      });
  }

  /**
   * Get formatted file size
   * @param {number} bytes
   * @returns {string}
   */
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================
  // Upload Flow
  // ============================================

  /**
   * Initialize file upload on the home page
   */
  function initUpload() {
    const imageTab = document.getElementById('tab-image');
    const videoTab = document.getElementById('tab-video');
    const imageUploadBtn = document.getElementById('image-upload-btn');
    const videoUploadBtn = document.getElementById('video-upload-btn');
    const imageFileInput = document.getElementById('image-file-input');
    const videoFileInput = document.getElementById('video-file-input');
    const formatsNote = document.getElementById('formats-note');

    if (!imageTab || !videoTab) return;

    // Tab switching
    imageTab.addEventListener('click', function () {
      imageTab.classList.add('active');
      videoTab.classList.remove('active');
      imageTab.setAttribute('aria-selected', 'true');
      videoTab.setAttribute('aria-selected', 'false');
      document.getElementById('panel-image').hidden = false;
      document.getElementById('panel-video').hidden = true;
      if (formatsNote) formatsNote.textContent = 'Accepted formats: JPG, JPEG, PNG, WEBP';
    });

    videoTab.addEventListener('click', function () {
      videoTab.classList.add('active');
      imageTab.classList.remove('active');
      videoTab.setAttribute('aria-selected', 'true');
      imageTab.setAttribute('aria-selected', 'false');
      document.getElementById('panel-video').hidden = false;
      document.getElementById('panel-image').hidden = true;
      if (formatsNote) formatsNote.textContent = 'Accepted formats: MP4, WEBM, MOV';
    });

    // Upload button triggers file input
    if (imageUploadBtn && imageFileInput) {
      imageUploadBtn.addEventListener('click', function () {
        imageFileInput.click();
      });
    }
    if (videoUploadBtn && videoFileInput) {
      videoUploadBtn.addEventListener('click', function () {
        videoFileInput.click();
      });
    }

    // File input change handlers
    if (imageFileInput) {
      imageFileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length > 0) {
          handleFileSelection(e.target.files[0], 'image');
        }
        e.target.value = '';
      });
    }
    if (videoFileInput) {
      videoFileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length > 0) {
          handleFileSelection(e.target.files[0], 'video');
        }
        e.target.value = '';
      });
    }

    // Drag and drop support
    const uploadCards = document.querySelectorAll('.upload-card');
    uploadCards.forEach(function (card) {
      card.addEventListener('dragover', function (e) {
        e.preventDefault();
        card.style.borderColor = 'var(--accent)';
        card.style.background = 'var(--accent-soft)';
      });
      card.addEventListener('dragleave', function () {
        card.style.borderColor = '';
        card.style.background = '';
      });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.style.borderColor = '';
        card.style.background = '';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const file = files[0];
          if (isImageFile(file)) {
            handleFileSelection(file, 'image');
          } else if (isVideoFile(file)) {
            handleFileSelection(file, 'video');
          } else {
            alert('Unsupported file format. Please upload a supported image or video.');
          }
        }
      });
    });
  }

  /**
   * Handle selected file: validate, store, navigate
   * @param {File} file
   * @param {'image'|'video'} mediaType
   */
  function handleFileSelection(file, mediaType) {
    // Validate file type
    if (mediaType === 'image' && !isImageFile(file)) {
      alert('Unsupported image format. Please upload JPG, PNG, or WEBP.');
      return;
    }
    if (mediaType === 'video' && !isVideoFile(file)) {
      alert('Unsupported video format. Please upload MP4, WEBM, or MOV.');
      return;
    }

    // Check file size (warn if very large)
    const maxRecommended = 50 * 1024 * 1024; // 50MB warning threshold
    if (file.size > maxRecommended) {
      const proceed = confirm(
        'This file is ' + formatFileSize(file.size) + '. ' +
        'Large files may be slow to process or exceed browser memory limits. ' +
        'Do you want to continue?'
      );
      if (!proceed) return;
    }

    // Generate a unique ID for this file
    const fileId = 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);

    // Store file metadata in sessionStorage (small, fast access)
    try {
      sessionStorage.setItem('gwr-upload-meta', JSON.stringify({
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        mediaType: mediaType,
        lastModified: file.lastModified
      }));
    } catch (e) {
      alert('Unable to store file metadata. Your browser storage may be full.');
      return;
    }

    // Store file in IndexedDB
    storeFile(fileId, file, {
      name: file.name,
      type: file.type,
      size: file.size,
      mediaType: mediaType
    }).then(function () {
      // Navigate to editor
      window.location.href = './editor.html';
    }).catch(function (err) {
      console.error('Failed to store file:', err);
      // Fallback: try sessionStorage for small files
      if (file.size < 5 * 1024 * 1024) {
        try {
          const reader = new FileReader();
          reader.onload = function (e) {
            try {
              sessionStorage.setItem('gwr-upload-data', e.target.result);
              sessionStorage.setItem('gwr-upload-media-type', mediaType);
              window.location.href = './editor.html';
            } catch (storageErr) {
              alert('Unable to store file in browser storage. Please try a smaller file.');
            }
          };
          reader.onerror = function () {
            alert('Failed to read file. The file may be corrupted.');
          };
          reader.readAsDataURL(file);
          return;
        } catch (readerErr) {
          alert('Unable to process file in this browser. Please try a smaller file.');
          return;
        }
      }
      alert('Unable to store file. Your browser may not support IndexedDB or the file is too large.');
    });
  }

  // ============================================
  // Editor Data Loading
  // ============================================

  /**
   * Load uploaded media data for the editor page
   * @returns {Promise<{id: string, name: string, type: string, size: number, mediaType: string, blob: Blob}>}
   */
  function loadEditorMedia() {
    return new Promise(function (resolve, reject) {
      // Try to get metadata from sessionStorage
      var meta;
      try {
        var metaStr = sessionStorage.getItem('gwr-upload-meta');
        if (metaStr) {
          meta = JSON.parse(metaStr);
        }
      } catch (e) {
        meta = null;
      }

      if (!meta) {
        // Fallback: try direct data URL from sessionStorage
        try {
          var dataUrl = sessionStorage.getItem('gwr-upload-data');
          var mediaType = sessionStorage.getItem('gwr-upload-media-type');
          if (dataUrl && mediaType) {
            // Convert data URL to blob
            fetch(dataUrl).then(function (res) {
              return res.blob();
            }).then(function (blob) {
              resolve({
                id: 'session_' + Date.now(),
                name: 'uploaded-file',
                type: blob.type,
                size: blob.size,
                mediaType: mediaType,
                blob: blob
              });
            }).catch(reject);
            return;
          }
        } catch (e) {
          // No fallback data
        }
        reject(new Error('No media data found. Please upload a file first.'));
        return;
      }

      // Retrieve from IndexedDB
      retrieveFile(meta.id).then(function (result) {
        resolve({
          id: meta.id,
          name: meta.name,
          type: meta.type,
          size: meta.size,
          mediaType: meta.mediaType,
          blob: result.blob
        });
      }).catch(function (err) {
        reject(new Error('Failed to retrieve media: ' + err.message));
      });
    });
  }

  // ============================================
  // Public API
  // ============================================

  window.GWR = {
    initTheme: initTheme,
    initThemeToggles: initThemeToggles,
    initMobileNav: initMobileNav,
    initUpload: initUpload,
    handleFileSelection: handleFileSelection,
    loadEditorMedia: loadEditorMedia,
    isImageFile: isImageFile,
    isVideoFile: isVideoFile,
    formatFileSize: formatFileSize,
    escapeHtml: escapeHtml,
    storeFile: storeFile,
    retrieveFile: retrieveFile,
    deleteFile: deleteFile,
    clearAllFiles: clearAllFiles
  };

  // ============================================
  // Auto-initialize on page load
  // ============================================

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initThemeToggles();
    initMobileNav();
  });

})();
