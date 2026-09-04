/* ============================================
   Gemini Watermark Remove — Editor Application JS
   Handles: canvas rendering, mask drawing,
   image inpainting, video processing, export
   ============================================ */

(function () {
  'use strict';

  // ============================================
  // Constants & Configuration
  // ============================================

  var TOOL_BRUSH = 'brush';
  var TOOL_RECTANGLE = 'rectangle';
  var TOOL_ERASER = 'eraser';
  var TOOL_CLEAR = 'clear';

  var MAX_UNDO_STEPS = 20;
  var INPAINT_PASSES = 5;
  var INPAINT_MAX_RADIUS = 12;

  // ============================================
  // State
  // ============================================

  var state = {
    mediaType: null,          // 'image' | 'video'
    fileName: '',
    fileSize: 0,
    originalBlob: null,       // Original file blob
    blobUrl: null,            // Object URL for original media

    // Image state
    originalImage: null,      // Image element
    originalCanvas: null,     // Original image canvas (for before view)
    originalCtx: null,
    resultCanvas: null,       // Processed result canvas
    resultCtx: null,
    displayCanvas: null,      // What's currently shown
    displayCtx: null,

    // Mask state
    maskCanvas: null,
    maskCtx: null,
    maskImageData: null,      // Current mask pixel data
    maskInitialized: false,

    // Drawing state
    currentTool: TOOL_BRUSH,
    brushSize: 20,
    strength: 0.8,
    isDrawing: false,
    drawStartX: 0,
    drawStartY: 0,
    lastX: 0,
    lastY: 0,
    rectangleStart: null,
    rectangleEnd: null,
    tempMaskSnapshot: null,

    // Undo/Redo
    undoStack: [],
    redoStack: [],

    // Zoom
    zoomLevel: 1,
    fitToScreen: true,

    // Video state
    videoElement: null,
    videoLoaded: false,
    videoDuration: 0,
    videoCurrentTime: 0,
    videoIsPlaying: false,

    // Before/After
    showingBefore: false,

    // Processing
    isProcessing: false,
    processedBlob: null,
    processedUrl: null,

    // Canvas dimensions
    displayWidth: 0,
    displayHeight: 0,
    naturalWidth: 0,
    naturalHeight: 0
  };

  // ============================================
  // DOM Element References
  // ============================================

  var elements = {};

  // ============================================
  // Initialization
  // ============================================

  /**
   * Initialize the editor
   */
  function initEditor() {
    cacheElements();
    bindEvents();
    loadMedia();
  }

  /**
   * Cache DOM element references
   */
  function cacheElements() {
    elements.fileName = document.getElementById('editor-file-name');
    elements.fileType = document.getElementById('editor-file-type');
    elements.canvasArea = document.getElementById('editor-canvas-area');
    elements.canvasContainer = document.getElementById('canvas-container');
    elements.mediaCanvas = document.getElementById('media-canvas');
    elements.maskCanvas = document.getElementById('mask-canvas');
    elements.noMediaMessage = document.getElementById('no-media-message');
    elements.loadingIndicator = document.getElementById('loading-indicator');
    elements.zoomLevel = document.getElementById('zoom-level');
    elements.brushSize = document.getElementById('brush-size');
    elements.brushSizeValue = document.getElementById('brush-size-value');
    elements.strength = document.getElementById('strength');
    elements.strengthValue = document.getElementById('strength-value');
    elements.beforeAfterLabel = document.getElementById('before-after-label');
    elements.videoControls = document.getElementById('video-controls');
    elements.videoWarning = document.getElementById('video-warning');
    elements.videoTimeDisplay = document.getElementById('video-time-display');
    elements.videoTimeSlider = document.getElementById('video-current-time');
    elements.videoPlayLabel = document.getElementById('video-play-label');

    // Tool buttons
    elements.toolBrush = document.getElementById('tool-brush');
    elements.toolRectangle = document.getElementById('tool-rectangle');
    elements.toolEraser = document.getElementById('tool-eraser');
    elements.toolClear = document.getElementById('tool-clear');
    elements.btnUndo = document.getElementById('btn-undo');
    elements.btnRedo = document.getElementById('btn-redo');
    elements.btnBeforeAfter = document.getElementById('btn-before-after');
    elements.btnReset = document.getElementById('btn-reset');
    elements.btnAutoDetect = document.getElementById('btn-auto-detect');
    elements.btnProcess = document.getElementById('btn-process');
    elements.btnDownload = document.getElementById('btn-download');
    elements.zoomIn = document.getElementById('zoom-in');
    elements.zoomOut = document.getElementById('zoom-out');
    elements.zoomFit = document.getElementById('zoom-fit');
    elements.videoPlayPause = document.getElementById('video-play-pause');
    elements.videoSeekBack = document.getElementById('video-seek-back');
    elements.videoSeekForward = document.getElementById('video-seek-forward');
  }

  /**
   * Bind all event listeners
   */
  function bindEvents() {
    // Tool selection
    if (elements.toolBrush) {
      elements.toolBrush.addEventListener('click', function () { setTool(TOOL_BRUSH); });
    }
    if (elements.toolRectangle) {
      elements.toolRectangle.addEventListener('click', function () { setTool(TOOL_RECTANGLE); });
    }
    if (elements.toolEraser) {
      elements.toolEraser.addEventListener('click', function () { setTool(TOOL_ERASER); });
    }
    if (elements.toolClear) {
      elements.toolClear.addEventListener('click', clearMask);
    }

    // Undo / Redo
    if (elements.btnUndo) {
      elements.btnUndo.addEventListener('click', undo);
    }
    if (elements.btnRedo) {
      elements.btnRedo.addEventListener('click', redo);
    }

    // Before / After
    if (elements.btnBeforeAfter) {
      elements.btnBeforeAfter.addEventListener('click', toggleBeforeAfter);
    }

    // Reset
    if (elements.btnReset) {
      elements.btnReset.addEventListener('click', resetAll);
    }

    // Auto detect
    if (elements.btnAutoDetect) {
      elements.btnAutoDetect.addEventListener('click', autoDetectRegions);
    }

    // Process / Download
    if (elements.btnProcess) {
      elements.btnProcess.addEventListener('click', processMedia);
    }
    if (elements.btnDownload) {
      elements.btnDownload.addEventListener('click', downloadResult);
    }

    // Brush size
    if (elements.brushSize) {
      elements.brushSize.addEventListener('input', function () {
        state.brushSize = parseInt(this.value, 10);
        if (elements.brushSizeValue) {
          elements.brushSizeValue.textContent = state.brushSize;
        }
      });
    }

    // Strength
    if (elements.strength) {
      elements.strength.addEventListener('input', function () {
        state.strength = parseInt(this.value, 10) / 100;
        if (elements.strengthValue) {
          elements.strengthValue.textContent = this.value;
        }
      });
    }

    // Zoom
    if (elements.zoomIn) {
      elements.zoomIn.addEventListener('click', function () {
        setZoom(state.zoomLevel * 1.25);
      });
    }
    if (elements.zoomOut) {
      elements.zoomOut.addEventListener('click', function () {
        setZoom(state.zoomLevel / 1.25);
      });
    }
    if (elements.zoomFit) {
      elements.zoomFit.addEventListener('click', fitToScreen);
    }

    // Mask canvas drawing events
    if (elements.maskCanvas) {
      elements.maskCanvas.addEventListener('pointerdown', onPointerDown);
      elements.maskCanvas.addEventListener('pointermove', onPointerMove);
      elements.maskCanvas.addEventListener('pointerup', onPointerUp);
      elements.maskCanvas.addEventListener('pointercancel', onPointerUp);
      elements.maskCanvas.addEventListener('pointerleave', onPointerLeave);
    }

    // Video controls
    if (elements.videoPlayPause) {
      elements.videoPlayPause.addEventListener('click', toggleVideoPlayback);
    }
    if (elements.videoSeekBack) {
      elements.videoSeekBack.addEventListener('click', function () {
        seekVideo(-1);
      });
    }
    if (elements.videoSeekForward) {
      elements.videoSeekForward.addEventListener('click', function () {
        seekVideo(1);
      });
    }
    if (elements.videoTimeSlider) {
      elements.videoTimeSlider.addEventListener('input', function () {
        if (state.videoElement && state.videoDuration > 0) {
          var time = (parseFloat(this.value) / 100) * state.videoDuration;
          state.videoElement.currentTime = time;
          updateVideoTimeDisplay();
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.key === 'b' && !e.ctrlKey && !e.metaKey) {
        setTool(TOOL_BRUSH);
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        setTool(TOOL_RECTANGLE);
      } else if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
        setTool(TOOL_ERASER);
      }
    });

    // Window resize
    window.addEventListener('resize', function () {
      if (state.fitToScreen) {
        fitToScreen();
      }
    });
  }

  // ============================================
  // Media Loading
  // ============================================

  /**
   * Load media from IndexedDB or sessionStorage
   */
  function loadMedia() {
    showLoading(true);
    hideNoMedia();

    if (!window.GWR || !window.GWR.loadEditorMedia) {
      showNoMedia('Application error: storage module not available.');
      return;
    }

    window.GWR.loadEditorMedia().then(function (media) {
      state.mediaType = media.mediaType;
      state.fileName = media.name;
      state.fileSize = media.size;
      state.originalBlob = media.blob;
      state.blobUrl = URL.createObjectURL(media.blob);

      // Update UI
      if (elements.fileName) {
        elements.fileName.textContent = window.GWR.escapeHtml(state.fileName);
      }
      if (elements.fileType) {
        elements.fileType.textContent = state.mediaType === 'image' ? 'Image' : 'Video';
      }

      if (state.mediaType === 'image') {
        loadImage(media.blob);
      } else if (state.mediaType === 'video') {
        loadVideo(media.blob);
      } else {
        showNoMedia('Unsupported media type.');
      }
    }).catch(function (err) {
      console.error('Error loading media:', err);
      showNoMedia('Unable to load media. Please go back and upload a file. ' + err.message);
    });
  }

  /**
   * Load image from blob
   * @param {Blob} blob
   */
  function loadImage(blob) {
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      state.originalImage = img;
      state.naturalWidth = img.naturalWidth;
      state.naturalHeight = img.naturalHeight;
      setupImageCanvas();
      showLoading(false);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showLoading(false);
      showNoMedia('Failed to decode image. The file may be corrupted.');
    };
    img.src = url;
  }

  /**
   * Load video from blob
   * @param {Blob} blob
   */
  function loadVideo(blob) {
    var url = URL.createObjectURL(blob);
    var video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;

    video.onloadedmetadata = function () {
      state.videoElement = video;
      state.videoDuration = video.duration || 0;
      state.naturalWidth = video.videoWidth || 640;
      state.naturalHeight = video.videoHeight || 360;
      setupVideoCanvas();
      showLoading(false);

      // Show video controls
      if (elements.videoControls) {
        elements.videoControls.hidden = false;
      }
      if (elements.videoWarning) {
        elements.videoWarning.hidden = false;
      }
      // Hide auto-detect for video (only available for images)
      if (elements.btnAutoDetect) {
        elements.btnAutoDetect.style.display = 'none';
      }
    };
    video.onerror = function () {
      URL.revokeObjectURL(url);
      showLoading(false);
      showNoMedia('Failed to decode video. The file may be corrupted or unsupported in this browser.');
    };
    video.src = url;

    // Set up time update
    video.addEventListener('timeupdate', function () {
      state.videoCurrentTime = video.currentTime;
      updateVideoTimeDisplay();
    });
    video.addEventListener('play', function () {
      state.videoIsPlaying = true;
      if (elements.videoPlayLabel) {
        elements.videoPlayLabel.textContent = 'Pause';
      }
    });
    video.addEventListener('pause', function () {
      state.videoIsPlaying = false;
      if (elements.videoPlayLabel) {
        elements.videoPlayLabel.textContent = 'Play';
      }
    });
    video.addEventListener('ended', function () {
      state.videoIsPlaying = false;
      if (elements.videoPlayLabel) {
        elements.videoPlayLabel.textContent = 'Play';
      }
    });
  }

  // ============================================
  // Canvas Setup
  // ============================================

  /**
   * Set up canvases for image editing
   */
  function setupImageCanvas() {
    // Original canvas (for before view)
    state.originalCanvas = document.createElement('canvas');
    state.originalCanvas.width = state.naturalWidth;
    state.originalCanvas.height = state.naturalHeight;
    state.originalCtx = state.originalCanvas.getContext('2d');
    state.originalCtx.drawImage(state.originalImage, 0, 0);

    // Result canvas (for processing)
    state.resultCanvas = document.createElement('canvas');
    state.resultCanvas.width = state.naturalWidth;
    state.resultCanvas.height = state.naturalHeight;
    state.resultCtx = state.resultCanvas.getContext('2d');
    state.resultCtx.drawImage(state.originalImage, 0, 0);

    // Display canvas
    state.displayCanvas = state.resultCanvas;
    state.displayCtx = state.resultCtx;

    // Initialize mask canvas
    initializeMaskCanvas();

    // Set canvas display
    updateCanvasDisplay();
    fitToScreen();
  }

  /**
   * Set up canvases for video editing
   */
  function setupVideoCanvas() {
    // For video, use a single canvas for display
    state.originalCanvas = document.createElement('canvas');
    state.originalCanvas.width = state.naturalWidth;
    state.originalCanvas.height = state.naturalHeight;
    state.originalCtx = state.originalCanvas.getContext('2d');

    state.resultCanvas = document.createElement('canvas');
    state.resultCanvas.width = state.naturalWidth;
    state.resultCanvas.height = state.naturalHeight;
    state.resultCtx = state.resultCanvas.getContext('2d');

    state.displayCanvas = state.resultCanvas;
    state.displayCtx = state.resultCtx;

    initializeMaskCanvas();
    updateCanvasDisplay();
    fitToScreen();

    // Draw first frame
    drawVideoFrameToCanvas();
  }

  /**
   * Initialize the mask canvas
   */
  function initializeMaskCanvas() {
    state.maskCanvas = elements.maskCanvas;
    state.maskCanvas.width = state.naturalWidth;
    state.maskCanvas.height = state.naturalHeight;
    state.maskCtx = state.maskCanvas.getContext('2d');
    state.maskCtx.fillStyle = 'rgba(0,0,0,0)';
    state.maskCtx.fillRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.maskImageData = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.maskInitialized = true;
    saveUndoState();
  }

  /**
   * Update canvas display (apply zoom)
   */
  function updateCanvasDisplay() {
    if (!elements.mediaCanvas || !elements.maskCanvas) return;

    var displayW = state.naturalWidth * state.zoomLevel;
    var displayH = state.naturalHeight * state.zoomLevel;

    state.displayWidth = displayW;
    state.displayHeight = displayH;

    elements.mediaCanvas.width = state.naturalWidth;
    elements.mediaCanvas.height = state.naturalHeight;
    elements.mediaCanvas.style.width = displayW + 'px';
    elements.mediaCanvas.style.height = displayH + 'px';

    elements.maskCanvas.width = state.naturalWidth;
    elements.maskCanvas.height = state.naturalHeight;
    elements.maskCanvas.style.width = displayW + 'px';
    elements.maskCanvas.style.height = displayH + 'px';

    // Draw content to media canvas
    var mediaCtx = elements.mediaCanvas.getContext('2d');
    if (state.mediaType === 'image' && state.originalImage) {
      if (state.showingBefore) {
        mediaCtx.drawImage(state.originalImage, 0, 0);
      } else if (state.processedBlob) {
        var processedImg = new Image();
        processedImg.onload = function () {
          mediaCtx.clearRect(0, 0, state.naturalWidth, state.naturalHeight);
          mediaCtx.drawImage(processedImg, 0, 0);
        };
        processedImg.src = state.processedUrl;
      } else {
        mediaCtx.drawImage(state.originalImage, 0, 0);
      }
    } else if (state.mediaType === 'video' && state.videoElement) {
      drawVideoFrameToCanvas();
    }

    if (elements.zoomLevel) {
      elements.zoomLevel.textContent = Math.round(state.zoomLevel * 100) + '%';
    }
  }

  /**
   * Draw current video frame to canvas
   */
  function drawVideoFrameToCanvas() {
    if (!state.videoElement || !state.originalCtx || !state.resultCtx) return;

    try {
      state.originalCtx.drawImage(state.videoElement, 0, 0, state.naturalWidth, state.naturalHeight);
      state.resultCtx.clearRect(0, 0, state.naturalWidth, state.naturalHeight);
      state.resultCtx.drawImage(state.videoElement, 0, 0, state.naturalWidth, state.naturalHeight);

      var mediaCtx = elements.mediaCanvas.getContext('2d');
      if (mediaCtx) {
        mediaCtx.clearRect(0, 0, state.naturalWidth, state.naturalHeight);
        mediaCtx.drawImage(state.showingBefore ? state.originalCanvas : state.resultCanvas, 0, 0);
      }
    } catch (e) {
      // Canvas tainting or video not ready
      console.warn('Unable to draw video frame:', e);
    }
  }

  /**
   * Fit canvas to available screen space
   */
  function fitToScreen() {
    if (!state.naturalWidth || !state.naturalHeight || !elements.canvasArea) return;

    var areaRect = elements.canvasArea.getBoundingClientRect();
    var padding = 40;
    var availableW = areaRect.width - padding;
    var availableH = areaRect.height - padding;

    if (availableW <= 0 || availableH <= 0) return;

    var scaleX = availableW / state.naturalWidth;
    var scaleY = availableH / state.naturalHeight;
    var fitScale = Math.min(scaleX, scaleY, 1); // Don't upscale beyond 100%

    state.zoomLevel = fitScale;
    state.fitToScreen = true;
    updateCanvasDisplay();
  }

  /**
   * Set a specific zoom level
   * @param {number} level
   */
  function setZoom(level) {
    level = Math.max(0.1, Math.min(level, 5));
    state.zoomLevel = level;
    state.fitToScreen = false;
    updateCanvasDisplay();
  }

  // ============================================
  // Tool Management
  // ============================================

  /**
   * Set the active tool
   * @param {string} tool
   */
  function setTool(tool) {
    state.currentTool = tool;

    // Update button states
    var toolButtons = [
      { el: elements.toolBrush, tool: TOOL_BRUSH },
      { el: elements.toolRectangle, tool: TOOL_RECTANGLE },
      { el: elements.toolEraser, tool: TOOL_ERASER }
    ];

    toolButtons.forEach(function (item) {
      if (item.el) {
        item.el.classList.toggle('active', item.tool === tool);
      }
    });

    // Update cursor
    if (elements.maskCanvas) {
      if (tool === TOOL_BRUSH || tool === TOOL_ERASER) {
        elements.maskCanvas.style.cursor = 'crosshair';
      } else if (tool === TOOL_RECTANGLE) {
        elements.maskCanvas.style.cursor = 'crosshair';
      } else {
        elements.maskCanvas.style.cursor = 'default';
      }
    }
  }

  // ============================================
  // Drawing Handlers (Pointer Events)
  // ============================================

  /**
   * Get canvas coordinates from pointer event
   * @param {PointerEvent} e
   * @returns {{x: number, y: number}}
   */
  function getCanvasCoords(e) {
    var rect = elements.maskCanvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (state.naturalWidth / rect.width);
    var y = (e.clientY - rect.top) * (state.naturalHeight / rect.height);
    x = Math.max(0, Math.min(state.naturalWidth - 1, x));
    y = Math.max(0, Math.min(state.naturalHeight - 1, y));
    return { x: Math.round(x), y: Math.round(y) };
  }

  /**
   * Handle pointer down on mask canvas
   * @param {PointerEvent} e
   */
  function onPointerDown(e) {
    if (!state.maskInitialized || state.isProcessing) return;
    e.preventDefault();
    elements.maskCanvas.setPointerCapture(e.pointerId);

    var coords = getCanvasCoords(e);
    state.isDrawing = true;
    state.drawStartX = coords.x;
    state.drawStartY = coords.y;
    state.lastX = coords.x;
    state.lastY = coords.y;
    state.rectangleStart = { x: coords.x, y: coords.y };
    state.rectangleEnd = { x: coords.x, y: coords.y };

    // Save state for undo before starting a new stroke
    saveUndoState();

    if (state.currentTool === TOOL_BRUSH || state.currentTool === TOOL_ERASER) {
      drawBrushAt(coords.x, coords.y);
    } else if (state.currentTool === TOOL_RECTANGLE) {
      // Draw a single pixel rectangle initially
      drawRectangle(coords.x, coords.y, coords.x, coords.y);
    }
  }

  /**
   * Handle pointer move on mask canvas
   * @param {PointerEvent} e
   */
  function onPointerMove(e) {
    if (!state.isDrawing || !state.maskInitialized || state.isProcessing) return;
    e.preventDefault();

    var coords = getCanvasCoords(e);
    state.lastX = coords.x;
    state.lastY = coords.y;
    state.rectangleEnd = { x: coords.x, y: coords.y };

    if (state.currentTool === TOOL_BRUSH || state.currentTool === TOOL_ERASER) {
      drawBrushLine(state.lastX, state.lastY, coords.x, coords.y);
    } else if (state.currentTool === TOOL_RECTANGLE) {
      // Redraw rectangle with current mask state
      redrawRectangle();
    }
  }

  /**
   * Handle pointer up on mask canvas
   * @param {PointerEvent} e
   */
  function onPointerUp(e) {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    state.lastX = 0;
    state.lastY = 0;
    state.rectangleStart = null;
    state.rectangleEnd = null;
  }

  /**
   * Handle pointer leave (cancel drawing)
   * @param {PointerEvent} e
   */
  function onPointerLeave(e) {
    if (state.isDrawing) {
      state.isDrawing = false;
      state.lastX = 0;
      state.lastY = 0;
      state.rectangleStart = null;
      state.rectangleEnd = null;
    }
  }

  /**
   * Draw a brush mark at a specific point
   * @param {number} x
   * @param {number} y
   */
  function drawBrushAt(x, y) {
    var ctx = state.maskCtx;
    var radius = Math.max(1, state.brushSize / 2);

    if (state.currentTool === TOOL_ERASER) {
      // Erase from mask (clear to transparent)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // Draw mask (semi-transparent)
      ctx.fillStyle = 'rgba(255,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Update mask data
    state.maskImageData = ctx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    renderMaskOverlay();
  }

  /**
   * Draw a line between two points using brush
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   */
  function drawBrushLine(fromX, fromY, toX, toY) {
    var ctx = state.maskCtx;
    var radius = Math.max(1, state.brushSize / 2);
    var dist = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
    var steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));

    if (state.currentTool === TOOL_ERASER) {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.fillStyle = 'rgba(255,0,0,0.4)';
    }

    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var x = fromX + (toX - fromX) * t;
      var y = fromY + (toY - fromY) * t;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    state.maskImageData = ctx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    renderMaskOverlay();
  }

  /**
   * Draw a rectangle on the mask
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   */
  function drawRectangle(x1, y1, x2, y2) {
    var ctx = state.maskCtx;
    var left = Math.min(x1, x2);
    var top = Math.min(y1, y2);
    var right = Math.max(x1, x2);
    var bottom = Math.max(y1, y2);

    ctx.fillStyle = 'rgba(255,0,0,0.4)';
    ctx.fillRect(left, top, right - left + 1, bottom - top + 1);
    state.maskImageData = ctx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    renderMaskOverlay();
  }

  /**
   * Redraw rectangle (clear temp and redraw)
   */
  function redrawRectangle() {
    // This is simplified - we'll just draw the rectangle from start to end
    if (state.rectangleStart && state.rectangleEnd) {
      drawRectangle(
        state.rectangleStart.x,
        state.rectangleStart.y,
        state.rectangleEnd.x,
        state.rectangleEnd.y
      );
    }
  }

  /**
   * Render the mask overlay on the mask canvas
   */
  function renderMaskOverlay() {
    if (!state.maskCtx) return;
    // The mask is already drawn on the mask canvas
    // No additional rendering needed as the mask canvas is overlaid on the media canvas
  }

  /**
   * Clear the entire mask
   */
  function clearMask() {
    if (!state.maskCtx || state.isProcessing) return;
    saveUndoState();
    state.maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.maskCtx.fillStyle = 'rgba(0,0,0,0)';
    state.maskCtx.fillRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.maskImageData = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    renderMaskOverlay();
    updateUndoRedoButtons();
  }

  // ============================================
  // Undo / Redo System
  // ============================================

  /**
   * Save current mask state to undo stack
   */
  function saveUndoState() {
    if (!state.maskCtx || !state.maskCanvas) return;
    var snapshot = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.undoStack.push(snapshot);
    if (state.undoStack.length > MAX_UNDO_STEPS) {
      state.undoStack.shift();
    }
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  /**
   * Undo last mask change
   */
  function undo() {
    if (state.undoStack.length === 0 || state.isProcessing) return;
    var current = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.redoStack.push(current);
    var previous = state.undoStack.pop();
    state.maskCtx.putImageData(previous, 0, 0);
    state.maskImageData = previous;
    renderMaskOverlay();
    updateUndoRedoButtons();
  }

  /**
   * Redo last undone change
   */
  function redo() {
    if (state.redoStack.length === 0 || state.isProcessing) return;
    var current = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.undoStack.push(current);
    var next = state.redoStack.pop();
    state.maskCtx.putImageData(next, 0, 0);
    state.maskImageData = next;
    renderMaskOverlay();
    updateUndoRedoButtons();
  }

  /**
   * Update undo/redo button enabled states
   */
  function updateUndoRedoButtons() {
    if (elements.btnUndo) {
      elements.btnUndo.disabled = state.undoStack.length === 0;
    }
    if (elements.btnRedo) {
      elements.btnRedo.disabled = state.redoStack.length === 0;
    }
  }

  // ============================================
  // Before / After Toggle
  // ============================================

  /**
   * Toggle before/after view
   */
  function toggleBeforeAfter() {
    state.showingBefore = !state.showingBefore;
    if (elements.beforeAfterLabel) {
      elements.beforeAfterLabel.textContent = state.showingBefore ? 'Before' : 'After';
    }
    updateCanvasDisplay();
  }

  // ============================================
  // Reset
  // ============================================

  /**
   * Reset all edits
   */
  function resetAll() {
    if (state.isProcessing) return;
    clearMask();
    state.processedBlob = null;
    state.processedUrl = null;
    state.showingBefore = false;
    if (elements.beforeAfterLabel) {
      elements.beforeAfterLabel.textContent = 'Before';
    }
    if (elements.btnDownload) {
      elements.btnDownload.disabled = true;
    }
    updateCanvasDisplay();
  }

  // ============================================
  // Auto Detection (Generic Visual Helper)
  // ============================================

  /**
   * Auto-detect potential overlay regions in an image
   * Looks for high-contrast rectangular areas that might be watermarks
   */
  function autoDetectRegions() {
    if (state.mediaType !== 'image' || !state.originalCanvas || state.isProcessing) return;

    var ctx = state.originalCtx;
    var imgData = ctx.getImageData(0, 0, state.naturalWidth, state.naturalHeight);
    var data = imgData.data;
    var width = state.naturalWidth;
    var height = state.naturalHeight;

    // Analyze image for potential overlay regions
    // Look for areas with unusual edge density or semi-transparent overlays
    var candidates = [];
    var blockSize = 32; // Analyze in 32x32 blocks

    for (var by = 0; by < height; by += blockSize) {
      for (var bx = 0; bx < width; bx += blockSize) {
        var blockW = Math.min(blockSize, width - bx);
        var blockH = Math.min(blockSize, height - by);

        // Calculate variance and edge density in this block
        var variance = 0;
        var mean = 0;
        var count = 0;

        for (var py = by; py < by + blockH; py += 2) {
          for (var px = bx; px < bx + blockW; px += 2) {
            var idx = (py * width + px) * 4;
            var gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            mean += gray;
            count++;
          }
        }
        mean /= count;

        for (var py2 = by; py2 < by + blockH; py2 += 2) {
          for (var px2 = bx; px2 < bx + blockW; px2 += 2) {
            var idx2 = (py2 * width + px2) * 4;
            var gray2 = (data[idx2] + data[idx2 + 1] + data[idx2 + 2]) / 3;
            variance += Math.pow(gray2 - mean, 2);
          }
        }
        variance /= count;

        // High variance blocks might contain text or watermarks
        if (variance > 1000) {
          candidates.push({ x: bx, y: by, w: blockW, h: blockH, variance: variance });
        }
      }
    }

    // Sort by variance (highest first) and take top 3
    candidates.sort(function (a, b) { return b.variance - a.variance; });
    candidates = candidates.slice(0, 3);

    if (candidates.length === 0) {
      alert('No high-contrast overlay regions detected. You can manually select areas instead.');
      return;
    }

    // Ask user if they want to apply detections
    var message = 'Detected ' + candidates.length + ' potential overlay region(s). ' +
      'Do you want to mark them for cleanup? You can adjust them afterward.';

    if (confirm(message)) {
      saveUndoState();
      candidates.forEach(function (c) {
        state.maskCtx.fillStyle = 'rgba(255,0,0,0.4)';
        state.maskCtx.fillRect(c.x, c.y, c.w, c.h);
      });
      state.maskImageData = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
      renderMaskOverlay();
      updateUndoRedoButtons();
    }
  }

  // ============================================
  // Image Inpainting (Best Effort Cleanup)
  // ============================================

  /**
   * Perform best-effort inpainting on the image
   * Uses multi-pass neighbor sampling with distance weighting
   * @param {ImageData} imageData - Original image data
   * @param {ImageData} maskData - Mask data (alpha > 0 = masked)
   * @param {number} strength - Cleanup strength (0-1)
   * @returns {ImageData} Processed image data
   */
  function inpaintImage(imageData, maskData, strength) {
    var width = imageData.width;
    var height = imageData.height;
    var srcData = imageData.data;
    var mskData = maskData.data;
    var resultData = new Uint8ClampedArray(srcData);

    // Create a working copy of mask (alpha channel > 0 = masked)
    var maskPixels = new Uint8Array(width * height);
    for (var i = 0; i < mskData.length; i += 4) {
      if (mskData[i + 3] > 10) {
        maskPixels[i / 4] = 1;
      }
    }

    // Multi-pass approach: process from edges inward
    for (var pass = 0; pass < INPAINT_PASSES; pass++) {
      var radius = Math.min(pass + 2, INPAINT_MAX_RADIUS);
      var tempData = new Uint8ClampedArray(resultData);
      var newMaskPixels = new Uint8Array(maskPixels);

      for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
          var pixelIdx = y * width + x;
          if (maskPixels[pixelIdx] !== 1) continue;

          var idx4 = pixelIdx * 4;
          var r = 0, g = 0, b = 0, totalWeight = 0;

          // Sample surrounding pixels
          for (var dy = -radius; dy <= radius; dy++) {
            for (var dx = -radius; dx <= radius; dx++) {
              if (dx === 0 && dy === 0) continue;
              var nx = x + dx;
              var ny = y + dy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

              var nIdx = ny * width + nx;
              if (maskPixels[nIdx] === 1) continue; // Skip masked pixels

              var nIdx4 = nIdx * 4;
              var dist = Math.sqrt(dx * dx + dy * dy);
              var weight = 1 / (1 + dist * dist);

              r += tempData[nIdx4] * weight;
              g += tempData[nIdx4 + 1] * weight;
              b += tempData[nIdx4 + 2] * weight;
              totalWeight += weight;
            }
          }

          if (totalWeight > 0) {
            var newR = r / totalWeight;
            var newG = g / totalWeight;
            var newB = b / totalWeight;

            // Blend with original based on strength
            resultData[idx4] = newR * strength + srcData[idx4] * (1 - strength);
            resultData[idx4 + 1] = newG * strength + srcData[idx4 + 1] * (1 - strength);
            resultData[idx4 + 2] = newB * strength + srcData[idx4 + 2] * (1 - strength);

            // Mark this pixel as processed
            newMaskPixels[pixelIdx] = 0;
          }
        }
      }

      maskPixels = newMaskPixels;
    }

    // Add subtle noise to processed areas to avoid flat appearance
    for (var y2 = 0; y2 < height; y2++) {
      for (var x2 = 0; x2 < width; x2++) {
        var pi2 = y2 * width + x2;
        var i4 = pi2 * 4;
        if (mskData[i4 + 3] > 10) {
          var noise = (Math.random() - 0.5) * 4;
          resultData[i4] = Math.max(0, Math.min(255, resultData[i4] + noise));
          resultData[i4 + 1] = Math.max(0, Math.min(255, resultData[i4 + 1] + noise));
          resultData[i4 + 2] = Math.max(0, Math.min(255, resultData[i4 + 2] + noise));
        }
      }
    }

    return new ImageData(resultData, width, height);
  }

  // ============================================
  // Processing
  // ============================================

  /**
   * Process the media with the current mask
   */
  function processMedia() {
    if (state.isProcessing) return;

    if (state.mediaType === 'image') {
      processImage();
    } else if (state.mediaType === 'video') {
      processVideo();
    }
  }

  /**
   * Process image with inpainting
   */
  function processImage() {
    if (!state.originalCanvas || !state.maskCtx) return;

    state.isProcessing = true;
    if (elements.btnProcess) {
      elements.btnProcess.disabled = true;
      elements.btnProcess.textContent = 'Processing...';
    }

    // Use setTimeout to allow UI to update
    setTimeout(function () {
      try {
        var imageData = state.originalCtx.getImageData(0, 0, state.naturalWidth, state.naturalHeight);
        var maskData = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);

        // Check if mask has any content
        var hasMaskContent = false;
        for (var i = 0; i < maskData.data.length; i += 4) {
          if (maskData.data[i + 3] > 10) {
            hasMaskContent = true;
            break;
          }
        }

        if (!hasMaskContent) {
          alert('No areas selected. Please use the brush or rectangle tool to select areas to clean up.');
          state.isProcessing = false;
          if (elements.btnProcess) {
            elements.btnProcess.disabled = false;
            elements.btnProcess.textContent = 'Process';
          }
          return;
        }

        var resultImageData = inpaintImage(imageData, maskData, state.strength);

        // Draw result to result canvas
        state.resultCtx.putImageData(resultImageData, 0, 0);

        // Create processed blob
        var mimeType = determineExportMimeType();
        var quality = 0.85;
        state.resultCanvas.toBlob(function (blob) {
          if (blob) {
            if (state.processedUrl) {
              URL.revokeObjectURL(state.processedUrl);
            }
            state.processedBlob = blob;
            state.processedUrl = URL.createObjectURL(blob);
            if (elements.btnDownload) {
              elements.btnDownload.disabled = false;
            }
          }
          state.isProcessing = false;
          if (elements.btnProcess) {
            elements.btnProcess.disabled = false;
            elements.btnProcess.textContent = 'Process';
          }
          updateCanvasDisplay();
        }, mimeType, quality);
      } catch (err) {
        console.error('Processing error:', err);
        alert('An error occurred during processing: ' + err.message);
        state.isProcessing = false;
        if (elements.btnProcess) {
          elements.btnProcess.disabled = false;
          elements.btnProcess.textContent = 'Process';
        }
      }
    }, 50);
  }

  /**
   * Process video with mask overlay
   */
  function processVideo() {
    if (!state.videoElement || !state.maskCtx) {
      alert('Video is not fully loaded yet.');
      return;
    }

    // Check if mask has content
    var maskData = state.maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    var hasMaskContent = false;
    for (var i = 0; i < maskData.data.length; i += 4) {
      if (maskData.data[i + 3] > 10) {
        hasMaskContent = true;
        break;
      }
    }

    if (!hasMaskContent) {
      alert('No areas selected. Please use the brush tool to select areas to clean up.');
      return;
    }

    if (state.videoDuration > 30) {
      var proceed = confirm(
        'This video is ' + Math.round(state.videoDuration) + ' seconds long. ' +
        'Video processing is computationally intensive and may be slow on mobile devices. ' +
        'Do you want to continue?'
      );
      if (!proceed) return;
    }

    state.isProcessing = true;
    if (elements.btnProcess) {
      elements.btnProcess.disabled = true;
      elements.btnProcess.textContent = 'Processing...';
    }

    // Use Canvas API and MediaRecorder for video processing
    var canvas = document.createElement('canvas');
    canvas.width = state.naturalWidth;
    canvas.height = state.naturalHeight;
    var ctx = canvas.getContext('2d');

    var stream = canvas.captureStream(30);
    var mimeType = 'video/webm;codecs=vp9';
    if (typeof MediaRecorder === 'undefined') {
      alert('Your browser does not support video recording. Video export is not available.');
      state.isProcessing = false;
      if (elements.btnProcess) {
        elements.btnProcess.disabled = false;
        elements.btnProcess.textContent = 'Process';
      }
      return;
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    var recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mimeType });
    } catch (e) {
      alert('Unable to create video recorder: ' + e.message);
      state.isProcessing = false;
      if (elements.btnProcess) {
        elements.btnProcess.disabled = false;
        elements.btnProcess.textContent = 'Process';
      }
      return;
    }

    var chunks = [];
    recorder.ondataavailable = function (e) {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    recorder.onstop = function () {
      var blob = new Blob(chunks, { type: mimeType });
      if (state.processedUrl) {
        URL.revokeObjectURL(state.processedUrl);
      }
      state.processedBlob = blob;
      state.processedUrl = URL.createObjectURL(blob);
      if (elements.btnDownload) {
        elements.btnDownload.disabled = false;
      }
      state.isProcessing = false;
      if (elements.btnProcess) {
        elements.btnProcess.disabled = false;
        elements.btnProcess.textContent = 'Process';
      }
      alert('Video processing complete. Click Download to save the result.');
    };

    // Draw function for each frame
    var drawFrame = function () {
      if (state.videoElement.ended || state.videoElement.paused) return;

      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(state.videoElement, 0, 0, canvas.width, canvas.height);

        // Apply mask inpainting to this frame (simplified - fill with surrounding)
        var frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var processedData = inpaintImage(frameData, maskData, state.strength);
        ctx.putImageData(processedData, 0, 0);
      } catch (e) {
        console.warn('Frame processing error:', e);
      }

      if (!state.videoElement.ended && !state.videoElement.paused) {
        requestAnimationFrame(drawFrame);
      }
    };

    // Start recording
    recorder.start(100);
    state.videoElement.currentTime = 0;
    state.videoElement.play();
    drawFrame();

    // Stop recording when video ends
    state.videoElement.addEventListener('ended', function () {
      setTimeout(function () {
        recorder.stop();
        state.videoElement.pause();
      }, 500);
    }, { once: true });
  }

  /**
   * Determine export MIME type based on original file
   * @returns {string}
   */
  function determineExportMimeType() {
    if (state.originalBlob && state.originalBlob.type) {
      if (state.originalBlob.type === 'image/png') return 'image/png';
      if (state.originalBlob.type === 'image/webp') return 'image/webp';
      if (state.originalBlob.type === 'image/jpeg') return 'image/jpeg';
    }
    // Default
    return 'image/png';
  }

  // ============================================
  // Download
  // ============================================

  /**
   * Download the processed result
   */
  function downloadResult() {
    if (!state.processedBlob || !state.processedUrl) {
      alert('No processed media available. Please process the media first.');
      return;
    }

    var extension = '';
    if (state.mediaType === 'image') {
      var mimeType = determineExportMimeType();
      if (mimeType === 'image/png') extension = '.png';
      else if (mimeType === 'image/webp') extension = '.webp';
      else if (mimeType === 'image/jpeg') extension = '.jpg';
      else extension = '.png';
    } else {
      extension = '.webm';
    }

    var baseName = state.fileName.replace(/\.[^.]+$/, '') || 'processed';
    var downloadName = baseName + '_cleaned' + extension;

    var a = document.createElement('a');
    a.href = state.processedUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ============================================
  // Video Playback Controls
  // ============================================

  /**
   * Toggle video play/pause
   */
  function toggleVideoPlayback() {
    if (!state.videoElement) return;
    if (state.videoIsPlaying) {
      state.videoElement.pause();
    } else {
      state.videoElement.play();
    }
  }

  /**
   * Seek video by delta seconds
   * @param {number} delta
   */
  function seekVideo(delta) {
    if (!state.videoElement || !state.videoDuration) return;
    var newTime = Math.max(0, Math.min(state.videoDuration, state.videoElement.currentTime + delta));
    state.videoElement.currentTime = newTime;
    updateVideoTimeDisplay();
  }

  /**
   * Update video time display and slider
   */
  function updateVideoTimeDisplay() {
    if (!state.videoElement || !elements.videoTimeDisplay || !elements.videoTimeSlider) return;
    var current = state.videoElement.currentTime;
    var duration = state.videoDuration;

    var formatTime = function (seconds) {
      var mins = Math.floor(seconds / 60);
      var secs = Math.floor(seconds % 60);
      return mins + ':' + (secs < 10 ? '0' : '') + secs;
    };

    elements.videoTimeDisplay.textContent = formatTime(current) + ' / ' + formatTime(duration);
    elements.videoTimeSlider.value = duration > 0 ? (current / duration) * 100 : 0;

    // Draw current frame to canvas
    drawVideoFrameToCanvas();
  }

  // ============================================
  // UI Helpers
  // ============================================

  /**
   * Show loading indicator
   * @param {boolean} show
   */
  function showLoading(show) {
    if (elements.loadingIndicator) {
      elements.loadingIndicator.hidden = !show;
    }
    if (elements.canvasContainer) {
      elements.canvasContainer.style.display = show ? 'none' : '';
    }
  }

  /**
   * Show no media message
   * @param {string} message
   */
  function showNoMedia(message) {
    showLoading(false);
    if (elements.noMediaMessage) {
      elements.noMediaMessage.hidden = false;
      var p = elements.noMediaMessage.querySelector('p');
      if (p && message) {
        p.textContent = message;
      }
    }
    if (elements.canvasContainer) {
      elements.canvasContainer.style.display = 'none';
    }
  }

  /**
   * Hide no media message
   */
  function hideNoMedia() {
    if (elements.noMediaMessage) {
      elements.noMediaMessage.hidden = true;
    }
  }

  // ============================================
  // Cleanup (on page unload)
  // ============================================

  window.addEventListener('beforeunload', function () {
    if (state.blobUrl) {
      URL.revokeObjectURL(state.blobUrl);
    }
    if (state.processedUrl) {
      URL.revokeObjectURL(state.processedUrl);
    }
    // Clean up IndexedDB data
    if (window.GWR && window.GWR.clearAllFiles) {
      window.GWR.clearAllFiles().catch(function () {});
    }
  });

  // ============================================
  // Public API
  // ============================================

  window.GWR = window.GWR || {};
  window.GWR.initEditor = initEditor;

})();
