// Content script for capturing audio from a web page
console.log('Audio capture content script loaded');

// Prevent duplicate injections
if (window.audioCapturerInjected) {
  console.log('Audio capturer already injected, skipping');
} else {
  window.audioCapturerInjected = true;

  let stream = null;
  let audioContext = null;
  let analyser = null;
  let isCapturing = false;
  const GAIN = 50;

  function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  function dbToRGB(db) {
    const normalized = (db + 60) / 60;
    const hue = (1 - normalized) * 0.66;
    const brightness = 0.3 + 0.7 * normalized;
    const rgb = hsvToRgb(hue, 1, brightness);
    return { r: rgb.r, g: rgb.g, b: rgb.b };
  }

  function mapDbToColor(db) {
    const minDb = 57;
    const maxDb = 67.5;
    if (db <= minDb) return { r: 148, g: 0, b: 211 };
    if (db >= maxDb) return { r: 255, g: 255, b: 255 };

    const ratio = (db - minDb) / (maxDb - minDb);
    const t = Math.max(0, Math.min(1, ratio));

    const controlPoints = [
      { t: 0,    color: { r: 148, g: 0,   b: 211 } },
      { t: 1/15, color: { r: 128, g: 0,   b: 255 } },
      { t: 2/15, color: { r: 75,  g: 0,   b: 130 } },
      { t: 3/15, color: { r: 0,   g: 0,   b: 255 } },
      { t: 2/6,  color: { r: 0,   g: 130, b: 255 } },
      { t: 6/15, color: { r: 0,   g: 255, b: 255 } },
      { t: 8/15, color: { r: 0,   g: 220, b: 100 } },
      { t: 7/10, color: { r: 50,  g: 255, b: 0   } },
      { t: 8/10, color: { r: 255, g: 150, b: 0   } },
      { t: 9/10, color: { r: 255, g: 0,   b: 0   } },
      { t: 1,    color: { r: 255, g: 255, b: 255 } }
    ];

    for (let i = 0; i < controlPoints.length - 1; i++) {
      const start = controlPoints[i];
      const end = controlPoints[i + 1];
      if (t >= start.t && t <= end.t) {
        const dist = (t - start.t) / (end.t - start.t);
        const r = start.color.r + dist * (end.color.r - start.color.r);
        const g = start.color.g + dist * (end.color.g - start.color.g);
        const b = start.color.b + dist * (end.color.b - start.color.b);
        return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
      }
    }
    return controlPoints[controlPoints.length - 1].color;
  }

  function processAudioTimeData(analyser, gain = GAIN) {
    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    let decibel = rms > 0 ? 20 * Math.log10(rms * gain) : -100;
    decibel = Math.max(Math.min(decibel, 0), -60);
    return { decibel, rgb: dbToRGB(decibel) };
  }

  function processAudioFrequencyData(analyser, gain = 20) {
    const bufferLength = analyser.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(frequencyData);
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i] * frequencyData[i];
    }
    const rms = Math.sqrt(sum / frequencyData.length);
    const dB = rms > 0 ? 20 * Math.log10(rms * gain) : 0;
    return { decibel: dB, rgb: mapDbToColor(dB) };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message.action);
    switch (message.action) {
      case 'startCapture':
        setupAudioCapture()
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
      case 'stopCapture':
        stopCapture()
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
      case 'processAudio':
        const data = processAudio();
        if (data) {
          chrome.runtime.sendMessage({ action: 'audioData', data });
        }
        sendResponse({ success: true });
        break;
    }
  });

  async function setupAudioCapture() {
    try {
      console.log('Setting up audio capture');
      if (isCapturing) {
        await stopCapture();
      }
      const displayMediaOptions = {
        video: {
          displaySurface: 'browser',
          width: 1,
          height: 1,
          frameRate: 1
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        selfBrowserSurface: 'include',
        preferCurrentTab: true
      };
      stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      if (stream.getAudioTracks().length === 0) {
        throw new Error('No audio track available. Make sure "Share audio" is checked.');
      }
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      isCapturing = true;
      stream.getAudioTracks()[0].onended = () => {
        console.log('Audio track ended');
        stopCapture().then(() => {
          chrome.runtime.sendMessage({ action: 'captureEnded' });
        });
      };
      console.log('Audio capture set up successfully');
      return true;
    } catch (error) {
      console.error('Error setting up audio capture:', error);
      await stopCapture();
      throw error;
    }
  }

  async function stopCapture() {
    console.log('Stopping audio capture');
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      if (audioContext) {
        await audioContext.close();
        audioContext = null;
      }
      analyser = null;
      isCapturing = false;
      console.log('Audio capture stopped successfully');
      return true;
    } catch (error) {
      console.error('Error stopping audio capture:', error);
      throw error;
    }
  }

  function processAudio() {
    if (!isCapturing || !analyser || !audioContext) return null;
    try {
      const result = processAudioFrequencyData(analyser);
      return result;
    } catch (error) {
      console.error('Error processing audio:', error);
      return null;
    }
  }

  console.log('Audio capture content script initialization complete');
}
