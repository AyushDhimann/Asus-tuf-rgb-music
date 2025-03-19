// Popup script for Audio-to-RGB Converter
document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const decibelValue = document.getElementById('decibelValue');
  const decibelIndicator = document.getElementById('decibelIndicator');
  const rgbValues = document.getElementById('rgbValues');
  const colorPreview = document.getElementById('colorPreview');
  const errorContainer = document.getElementById('errorContainer');
  const errorMessage = document.getElementById('errorMessage');

  // UI update interval
  let updateInterval = null;

  // Check current status
  checkCaptureStatus();

  // Set up button event listeners
  startBtn.addEventListener('click', startCapture);
  stopBtn.addEventListener('click', stopCapture);

  // Start update interval
  startUpdateInterval();

  // Check capture status from background script
  function checkCaptureStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (response) {
        updateUI(response.isCapturing);
      }
    });
  }

  // Start audio capture
  async function startCapture() {
    hideError();

    try {
      // Get the current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tabs || tabs.length === 0) {
        showError('No active tab found');
        return;
      }

      const activeTab = tabs[0];

      // Check if the tab has an actual URL (not a chrome:// or extension:// URL)
      if (activeTab.url.startsWith('chrome://') ||
          activeTab.url.startsWith('chrome-extension://') ||
          activeTab.url.startsWith('edge://')) {
        showError('Cannot capture audio from browser system pages. Please navigate to a website.');
        return;
      }

      // Request capture start
      chrome.runtime.sendMessage({
        action: 'startCapture',
        tabId: activeTab.id
      }, (response) => {
        if (response && response.success) {
          updateUI(true);
        } else {
          showError(response?.error || 'Failed to start capture');
        }
      });
    } catch (error) {
      showError(`Error: ${error.message}`);
    }
  }

  // Stop audio capture
  function stopCapture() {
    chrome.runtime.sendMessage({ action: 'stopCapture' }, (response) => {
      if (response && response.success) {
        updateUI(false);
      } else {
        showError(response?.error || 'Failed to stop capture');
      }
    });
  }

  // Update UI based on capture state
  function updateUI(isCapturing) {
    if (isCapturing) {
      statusIndicator.classList.add('active');
      statusText.textContent = 'Capturing (Background Mode Active)';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      statusIndicator.classList.remove('active');
      statusText.textContent = 'Not capturing';
      startBtn.disabled = false;
      stopBtn.disabled = true;

      // Reset display
      decibelValue.textContent = '-60 dB';
      decibelIndicator.style.left = '0';
      rgbValues.textContent = 'R: 0, G: 0, B: 0';
      colorPreview.style.backgroundColor = 'rgb(0, 0, 0)';
    }
  }

  // Start update interval for display
  function startUpdateInterval() {
    if (updateInterval) {
      clearInterval(updateInterval);
    }

    updateInterval = setInterval(() => {
      updateDisplay();
    }, 100);
  }

  // Update display from storage
  function updateDisplay() {
    chrome.storage.local.get(['currentDecibel', 'currentRGB', 'lastUpdated'], (data) => {
      if (data.lastUpdated && Date.now() - data.lastUpdated < 1000) {
        if (data.currentDecibel !== undefined) {
          decibelValue.textContent = `${data.currentDecibel.toFixed(1)} dB`;
          // Map from 57 to 67.5 dB to 0-100% of the meter width
          const percentage = ((data.currentDecibel - 57) / (67.5 - 57)) * 100;
          decibelIndicator.style.left = `${Math.min(Math.max(percentage, 0), 100)}%`;
        }
        if (data.currentRGB) {
          const rgb = data.currentRGB;
          rgbValues.textContent = `R: ${rgb.r}, G: ${rgb.g}, B: ${rgb.b}`;
          colorPreview.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        }
      }
    });
  }


  // Show error message
  function showError(message) {
    errorMessage.textContent = message;
    errorContainer.classList.add('visible');
  }

  // Hide error message
  function hideError() {
    errorContainer.classList.remove('visible');
  }

  // Clean up on unload
  window.addEventListener('unload', () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
});
