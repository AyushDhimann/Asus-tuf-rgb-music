// Background Service Worker for Audio-to-RGB Converter

// Global variables
let isCapturing = false;
let targetTabId = null;
let processingInterval = null;

// Listen for messages from popup or injected scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  switch(message.action) {
    case 'startCapture':
      startCapture(message.tabId)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep message channel open for async response
      
    case 'stopCapture':
      stopCapture()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    case 'getStatus':
      sendResponse({
        isCapturing,
        targetTabId
      });
      break;
      
    case 'audioData':
      // Forward audio data to the API
      if (message.data && isCapturing) {
        const { decibel, rgb } = message.data;
        sendRGBToLocalAPI(rgb.r, rgb.g, rgb.b);
        // Store the data for the popup to retrieve
        chrome.storage.local.set({
          currentDecibel: decibel,
          currentRGB: rgb,
          lastUpdated: Date.now()
        });
      }
      sendResponse({ success: true });
      break;
      
    case 'captureEnded':
      console.log('Capture ended in tab');
      stopCapture();
      sendResponse({ success: true });
      break;
  }
});

// Start audio capture
async function startCapture(tabId) {
  console.log('Starting capture on tab:', tabId);
  
  try {
    // If already capturing, stop first
    if (isCapturing) {
      await stopCapture();
    }
    
    // Store target tab ID
    targetTabId = tabId;
    
    // Inject the content script to capture audio
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
    
    console.log('Content script injected into tab', tabId);
    
    // Tell the content script to start capturing
    await chrome.tabs.sendMessage(tabId, { action: 'startCapture' });
    
    // Start monitoring for audio data
    startMonitoring();
    
    // Mark as capturing
    isCapturing = true;
    
    // Update badge to indicate active capture
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    // Store status
    chrome.storage.local.set({
      isCapturing,
      targetTabId,
      captureStartTime: Date.now()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error starting capture:', error);
    await stopCapture();
    return { success: false, error: error.message };
  }
}

// Stop audio capture
async function stopCapture() {
  console.log('Stopping capture');
  
  // Clear monitoring interval
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
  
  // Tell content script to stop if tab still exists
  if (targetTabId) {
    try {
      await chrome.tabs.sendMessage(targetTabId, { action: 'stopCapture' })
        .catch(() => console.log('Tab may be closed or unresponsive'));
    } catch (err) {
      console.log('Could not send stop message to tab:', err);
    }
  }
  
  // Reset state
  isCapturing = false;
  targetTabId = null;
  
  // Update badge
  chrome.action.setBadgeText({ text: '' });
  
  // Store status
  chrome.storage.local.set({
    isCapturing,
    targetTabId: null
  });
  
  // Send black RGB as final value
  sendRGBToLocalAPI(0, 0, 0);
  
  return { success: true };
}

// Start monitoring for audio data
function startMonitoring() {
  if (processingInterval) {
    clearInterval(processingInterval);
  }
  
  processingInterval = setInterval(() => {
    if (isCapturing && targetTabId) {
      try {
        // Request audio data from content script
        chrome.tabs.sendMessage(targetTabId, { action: 'processAudio' })
          .catch(err => {
            console.error('Error requesting audio data:', err);
            // Tab might be closed or navigated away
            if (err.message.includes('Could not establish connection') ||
                err.message.includes('The message port closed')) {
              stopCapture();
            }
          });
      } catch (err) {
        console.error('Error in monitoring interval:', err);
      }
    }
  }, 100); // Every 100ms
}

// Send RGB values to local API
async function sendRGBToLocalAPI(r, g, b) {
  try {
    const response = await fetch(`http://localhost:7890/set-rgb?r=${r}&g=${g}&b=${b}`);
    if (!response.ok) {
      console.warn(`API request failed: ${response.status}`);
    }
  } catch (error) {
    console.error("Error sending to API:", error);
  }
}

// Handle tab close events
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === targetTabId) {
    console.log('Target tab was closed');
    stopCapture();
  }
});

// Restore state on service worker startup
chrome.storage.local.get(['isCapturing', 'targetTabId'], async (data) => {
  if (data.isCapturing && data.targetTabId) {
    // Verify tab still exists
    try {
      const tab = await chrome.tabs.get(data.targetTabId);
      if (tab) {
        console.log('Restoring capture for tab:', tab.id);
        startCapture(tab.id);
      }
    } catch (err) {
      console.log('Previously captured tab no longer exists');
    }
  }
});